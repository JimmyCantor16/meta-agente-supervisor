"""Adaptador de despliegue: publica un proyecto generado como URL pública en Render.

Es el porte a la arquitectura del deploy manual ya probado (scratch_mvp/
deploy_render.mjs, que puso https://bitacora-de-catas.onrender.com en vivo):

  1. Copia el proyecto a una carpeta temporal FUERA de cualquier árbol git
     (un `git init` dentro de `generated/` agarraría el repo del Meta-Agente).
  2. Detecta el stack (FastAPI por regex, o un server Node) y escribe un
     Dockerfile genérico.
  3. Crea (o reutiliza) el repositorio en GitHub vía API REST y hace push
     --force. Nada de CLI `gh`: no existe en el contenedor.
  4. Crea (o redespliega, idempotente) un web service Docker plan free en
     Render vía api.render.com.
  5. Hace poll cada 15 s hasta que el deploy queda "live" (tope ~15 min).

Credenciales SOLO del entorno: RENDER_API_KEY, GITHUB_TOKEN, GITHUB_OWNER
(mismo patrón que `entrega_en_rama.py`). Ningún secreto se loguea ni viaja en
los mensajes de error: las URLs con token se redactan antes de reportar.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import stat
import subprocess
import tempfile
import time
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

import httpx

from src.domain.entities import InfoDespliegue
from src.domain.ports import DespliegueError, DesplieguePort

logger = logging.getLogger(__name__)

_RENDER_API = "https://api.render.com/v1"
_GITHUB_API = "https://api.github.com"

# Lo que NUNCA viaja al repositorio público: basura de build, credenciales del
# usuario (generated/<slug>/secretos y .env) y bases con datos locales (*.db;
# los proyectos generados crean su esquema y siembran al arrancar, así que no
# pierden nada).
_OMITIR = (
    "node_modules", ".git", "__pycache__", "venv", ".venv", ".pytest_cache",
    "secretos", ".env", "*.db",
)

# Estados de deploy de Render que significan "esto ya no va a salir".
_ESTADOS_FATALES = {
    "build_failed", "update_failed", "canceled", "deactivated", "pre_deploy_failed",
}

_POLL_CADA_S = 15
_POLL_MAX_INTENTOS = 60  # 60 × 15 s ≈ 15 minutos
_HTTP_TIMEOUT_S = 30


def _ahora_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sin_secretos(texto: str) -> str:
    """Redacta credenciales embebidas en URLs (https://TOKEN@github.com/...)."""
    return re.sub(r"https://[^@\s/]+@", "https://***@", texto or "")


def _nombre_servicio(nombre: str) -> str:
    """Normaliza el nombre a lo que Render acepta (minúsculas, guiones, ≤40)."""
    limpio = re.sub(r"[^a-z0-9-]", "-", (nombre or "").lower())
    limpio = re.sub(r"-+", "-", limpio).strip("-")
    return limpio[:40] or "proyecto-generado"


def _borrar_arbol(ruta: Path) -> None:
    """rmtree tolerante: en Windows los objetos de .git quedan de solo lectura."""

    def _quitar_solo_lectura(func, p, _exc) -> None:
        try:
            os.chmod(p, stat.S_IWRITE)
            func(p)
        except OSError:
            pass

    if ruta.exists():
        shutil.rmtree(ruta, onerror=_quitar_solo_lectura)


class RenderDeployAdapter(DesplieguePort):
    """Publica un proyecto generado en Render, con progreso hito a hito."""

    def __init__(
        self,
        render_api_key: str | None = None,
        github_token: str | None = None,
        github_owner: str | None = None,
    ) -> None:
        # Se guardan solo si se inyectan (tests); en producción se leen del
        # entorno EN CADA publicación, para que una clave rotada aplique sin
        # reiniciar el proceso.
        self._render_api_key = render_api_key
        self._github_token = github_token
        self._github_owner = github_owner

    # ------------------------------------------------------------------
    # Contrato DesplieguePort
    # ------------------------------------------------------------------
    def publicar(
        self,
        ruta_proyecto: Path,
        nombre: str,
        al_avanzar: Callable[[str], None] | None = None,
    ) -> InfoDespliegue:
        api_key = (self._render_api_key or os.environ.get("RENDER_API_KEY", "")).strip()
        token = (self._github_token or os.environ.get("GITHUB_TOKEN", "")).strip()
        owner = (self._github_owner or os.environ.get("GITHUB_OWNER", "")).strip()
        if not api_key or not token or not owner:
            raise DespliegueError(
                "Faltan credenciales de publicación: define RENDER_API_KEY, "
                "GITHUB_TOKEN y GITHUB_OWNER en el entorno."
            )

        origen = Path(ruta_proyecto)
        if not origen.is_dir():
            raise DespliegueError(f"El proyecto no existe en disco: {origen.name}")

        servicio = _nombre_servicio(nombre)

        self._avisar(al_avanzar, "📦 Preparando una copia limpia del proyecto…")
        copia = self._copiar_aislado(origen, servicio)
        try:
            stack, dockerfile = self._detectar_stack(copia)
            (copia / "Dockerfile").write_text(dockerfile, encoding="utf-8")
            (copia / ".dockerignore").write_text(
                "node_modules\n.git\n__pycache__\n*.db\nvenv\n.venv\nsecretos\n.env\n",
                encoding="utf-8",
            )
            self._avisar(al_avanzar, f"🧬 Stack detectado: {stack}")

            repo_url = self._subir_a_github(copia, servicio, token, owner, al_avanzar)

            service_id, url, nombre_real = self._asegurar_servicio_render(
                api_key, servicio, repo_url, al_avanzar
            )
            self._avisar(al_avanzar, "⏳ Esperando el build en Render (puede tardar varios minutos)…")
            self._esperar_live(api_key, service_id, al_avanzar)
        finally:
            _borrar_arbol(copia)

        logger.info("Despliegue VIVO: %s -> %s", servicio, url)
        return InfoDespliegue(
            slug=nombre,
            nombre_servicio=nombre_real,
            url=url,
            repo=repo_url,
            estado="vivo",
            detalle=f"Desplegado en Render ({stack}).",
            actualizado_en=_ahora_iso(),
            ultimo_chequeo=None,
        )

    # ------------------------------------------------------------------
    # Progreso
    # ------------------------------------------------------------------
    @staticmethod
    def _avisar(al_avanzar: Callable[[str], None] | None, mensaje: str) -> None:
        """El progreso jamás tumba el despliegue: si el aviso falla, se sigue."""
        if al_avanzar is None:
            return
        try:
            al_avanzar(mensaje)
        except Exception:  # noqa: BLE001
            pass

    # ------------------------------------------------------------------
    # 1) Copia aislada
    # ------------------------------------------------------------------
    def _copiar_aislado(self, origen: Path, servicio: str) -> Path:
        destino = Path(tempfile.gettempdir()) / f"deploy-{servicio}"
        _borrar_arbol(destino)
        shutil.copytree(origen, destino, ignore=shutil.ignore_patterns(*_OMITIR))
        return destino

    # ------------------------------------------------------------------
    # 2) Detección de stack + Dockerfile
    # ------------------------------------------------------------------
    def _detectar_stack(self, raiz: Path) -> tuple[str, str]:
        """Devuelve (descripción del stack, contenido del Dockerfile)."""
        asgi = self._entry_fastapi(raiz)
        if asgi:
            requisitos = self._ruta_relativa(raiz, "requirements.txt")
            install = (
                f"RUN pip install --no-cache-dir -r {requisitos} && pip install --no-cache-dir uvicorn"
                if requisitos
                else "RUN pip install --no-cache-dir fastapi uvicorn"
            )
            dockerfile = (
                "FROM python:3.11-slim\n"
                "WORKDIR /app\n"
                "COPY . .\n"
                f"{install}\n"
                "ENV PORT=10000\n"
                f"CMD uvicorn {asgi} --host 0.0.0.0 --port $PORT\n"
            )
            return f"python ({asgi})", dockerfile

        entry = self._entry_node(raiz)
        if entry:
            dockerfile = (
                "FROM node:20-slim\n"
                "WORKDIR /app\n"
                "COPY . .\n"
                "RUN npm install --omit=dev || npm install\n"
                "ENV PORT=10000\n"
                f"CMD node {entry}\n"
            )
            return f"node ({entry})", dockerfile

        raise DespliegueError(
            "No detecté FastAPI ni un server Node desplegable en el proyecto."
        )

    @staticmethod
    def _visible(ruta: Path, raiz: Path) -> bool:
        return not any(p in _OMITIR for p in ruta.relative_to(raiz).parts)

    def _entry_fastapi(self, raiz: Path) -> str | None:
        """Busca el módulo con `app = FastAPI(...)` y lo devuelve como 'mod:app'."""
        for p in sorted(raiz.rglob("*.py")):
            if not self._visible(p, raiz):
                continue
            try:
                fuente = p.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            if re.search(r"FastAPI\(", fuente) and re.search(r"^\s*app\s*=", fuente, re.M):
                modulo = p.relative_to(raiz).as_posix()[:-3].replace("/", ".")
                return f"{modulo}:app"
        return None

    def _entry_node(self, raiz: Path) -> str | None:
        """Primer server Node plausible (server/index/app/main.js fuera de frontend/)."""
        candidatos = []
        for p in sorted(raiz.rglob("*.js")):
            if not self._visible(p, raiz):
                continue
            rel = p.relative_to(raiz).as_posix()
            if re.search(r"(server|index|app|main)\.js$", rel) and "frontend" not in rel:
                candidatos.append(rel)
        return candidatos[0] if candidatos else None

    def _ruta_relativa(self, raiz: Path, nombre: str) -> str | None:
        for p in sorted(raiz.rglob(nombre)):
            if self._visible(p, raiz):
                return p.relative_to(raiz).as_posix()
        return None

    # ------------------------------------------------------------------
    # 3) GitHub: repo + push
    # ------------------------------------------------------------------
    def _subir_a_github(
        self,
        copia: Path,
        servicio: str,
        token: str,
        owner: str,
        al_avanzar: Callable[[str], None] | None,
    ) -> str:
        repo_url = f"https://github.com/{owner}/{servicio}"
        cabeceras = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "MetaAgente-Deploy/1.0",
        }
        try:
            with httpx.Client(timeout=_HTTP_TIMEOUT_S) as cliente:
                r = cliente.get(f"{_GITHUB_API}/repos/{owner}/{servicio}", headers=cabeceras)
                if r.status_code == 404:
                    self._avisar(al_avanzar, "📚 Creando el repositorio en GitHub…")
                    # GITHUB_OWNER es el usuario dueño del token (mismo supuesto
                    # que entrega_en_rama): el repo se crea bajo su cuenta.
                    r = cliente.post(
                        f"{_GITHUB_API}/user/repos",
                        headers=cabeceras,
                        json={"name": servicio, "private": False},
                    )
                    if r.status_code not in (200, 201):
                        raise DespliegueError(
                            f"GitHub no dejó crear el repositorio ({r.status_code}): "
                            f"{_sin_secretos(r.text)[:200]}"
                        )
                elif r.status_code in (401, 403):
                    raise DespliegueError(
                        f"GitHub rechazó la credencial ({r.status_code}). Revisa GITHUB_TOKEN."
                    )
                else:
                    self._avisar(al_avanzar, "📚 El repositorio ya existía: se reutiliza.")
        except httpx.HTTPError as exc:
            raise DespliegueError(f"No pude hablar con GitHub: {type(exc).__name__}") from exc

        # Repo git AISLADO en la copia temporal; el push manda (--force) porque
        # cada publicación es la verdad completa del proyecto.
        self._git(copia, "init", "-b", "main")
        self._git(copia, "add", "-A")
        self._git(
            copia,
            "-c", "user.email=agente@metaagente.local",
            "-c", "user.name=Agente Meta",
            "commit", "-m", "MVP generado por el Meta-Agente",
        )
        self._git(copia, "remote", "add", "origin",
                  f"https://{token}@github.com/{owner}/{servicio}.git")
        self._avisar(al_avanzar, "⬆️ Subiendo el código a GitHub…")
        self._git(copia, "push", "-u", "origin", "main", "--force")
        return repo_url

    @staticmethod
    def _git(cwd: Path, *args: str) -> str:
        """git por argv en lista (sin shell). El error nunca expone el token."""
        try:
            proc = subprocess.run(
                ["git", *args],
                cwd=str(cwd),
                capture_output=True,
                text=True,
                timeout=180,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise DespliegueError(f"git no se pudo ejecutar: {exc}") from exc
        if proc.returncode != 0:
            salida = _sin_secretos((proc.stderr or proc.stdout or "").strip())
            raise DespliegueError(f"git {args[0]} falló: {salida[:300]}")
        return (proc.stdout or "").strip()

    # ------------------------------------------------------------------
    # 4) Render: crear o redesplegar (idempotente)
    # ------------------------------------------------------------------
    def _asegurar_servicio_render(
        self,
        api_key: str,
        servicio: str,
        repo_url: str,
        al_avanzar: Callable[[str], None] | None,
    ) -> tuple[str, str, str]:
        """Devuelve (service_id, url REAL, nombre real del servicio).

        Si el nombre estaba tomado, Render asigna otra URL: por eso la URL se
        toma SIEMPRE de la respuesta de la API, nunca se arma a mano salvo
        último recurso.
        """
        cabeceras = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        try:
            with httpx.Client(timeout=_HTTP_TIMEOUT_S) as cliente:
                r = cliente.get(f"{_RENDER_API}/owners", headers=cabeceras)
                duenos = self._json_o_vacio(r)
                owner_id = None
                if isinstance(duenos, list) and duenos:
                    owner_id = (duenos[0].get("owner") or {}).get("id")
                if not owner_id:
                    raise DespliegueError(
                        f"Render no devolvió un dueño de cuenta ({r.status_code}). "
                        "¿La RENDER_API_KEY es válida?"
                    )

                # ¿Ya existe el servicio? Entonces esto es un REDEPLOY.
                r = cliente.get(
                    f"{_RENDER_API}/services",
                    headers=cabeceras,
                    params={"name": servicio, "limit": 5},
                )
                lista = self._json_o_vacio(r)
                existente = None
                if isinstance(lista, list):
                    for item in lista:
                        srv = item.get("service") if isinstance(item, dict) else None
                        if srv and srv.get("name") == servicio:
                            existente = srv
                            break

                if existente:
                    service_id = existente["id"]
                    url = (existente.get("serviceDetails") or {}).get("url") or (
                        f"https://{servicio}.onrender.com"
                    )
                    self._avisar(al_avanzar, "♻️ El servicio ya existía: redesplegando la versión nueva…")
                    cliente.post(
                        f"{_RENDER_API}/services/{service_id}/deploys",
                        headers=cabeceras,
                        json={"clearCache": "do_not_clear"},
                    )
                    return service_id, url, existente.get("name") or servicio

                self._avisar(al_avanzar, "🛠️ Creando el servicio en Render…")
                cuerpo = {
                    "type": "web_service",
                    "name": servicio,
                    "ownerId": owner_id,
                    "repo": repo_url,
                    "branch": "main",
                    "autoDeploy": "yes",
                    "serviceDetails": {
                        "runtime": "docker",
                        "plan": "free",
                        "region": "oregon",
                        "envSpecificDetails": {"dockerfilePath": "./Dockerfile"},
                    },
                }
                r = cliente.post(f"{_RENDER_API}/services", headers=cabeceras, json=cuerpo)
                creado = self._json_o_vacio(r)
                if r.status_code not in (200, 201):
                    raise DespliegueError(
                        f"Render no pudo crear el servicio ({r.status_code}): "
                        f"{_sin_secretos(str(creado))[:300]}"
                    )
                srv = (creado.get("service") or creado) if isinstance(creado, dict) else {}
                service_id = srv.get("id")
                if not service_id:
                    raise DespliegueError("Render no devolvió el id del servicio creado.")
                url = (srv.get("serviceDetails") or {}).get("url") or (
                    f"https://{servicio}.onrender.com"
                )
                return service_id, url, srv.get("name") or servicio
        except httpx.HTTPError as exc:
            raise DespliegueError(f"No pude hablar con Render: {type(exc).__name__}") from exc

    @staticmethod
    def _json_o_vacio(respuesta: httpx.Response):
        try:
            return respuesta.json()
        except ValueError:
            return {}

    # ------------------------------------------------------------------
    # 5) Poll hasta "live"
    # ------------------------------------------------------------------
    def _esperar_live(
        self,
        api_key: str,
        service_id: str,
        al_avanzar: Callable[[str], None] | None,
    ) -> None:
        cabeceras = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}
        inicio = time.monotonic()
        ultimo_estado = ""
        ultimo_aviso = 0.0
        with httpx.Client(timeout=_HTTP_TIMEOUT_S) as cliente:
            for _ in range(_POLL_MAX_INTENTOS):
                time.sleep(_POLL_CADA_S)
                try:
                    r = cliente.get(
                        f"{_RENDER_API}/services/{service_id}/deploys",
                        headers=cabeceras,
                        params={"limit": 1},
                    )
                    datos = self._json_o_vacio(r)
                except httpx.HTTPError:
                    continue  # un tropiezo de red no cancela el build
                estado = "desconocido"
                if isinstance(datos, list) and datos:
                    estado = ((datos[0].get("deploy") or {}).get("status")) or "desconocido"

                transcurrido = time.monotonic() - inicio
                # Se avisa cuando el estado cambia (y como mínimo cada minuto).
                if estado != ultimo_estado or transcurrido - ultimo_aviso >= 60:
                    self._avisar(
                        al_avanzar,
                        f"⏳ Render: {estado} ({transcurrido / 60:.1f} min)",
                    )
                    ultimo_estado = estado
                    ultimo_aviso = transcurrido

                if estado == "live":
                    return
                if estado in _ESTADOS_FATALES:
                    raise DespliegueError(
                        f"El build en Render terminó en '{estado}'. "
                        "Revisa los logs del servicio en el dashboard."
                    )
        raise DespliegueError("El despliegue no llegó a 'live' en ~15 minutos.")
