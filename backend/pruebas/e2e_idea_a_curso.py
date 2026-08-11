"""Prueba END TO END: de una idea en español a un curso sobre el sistema generado.

Recorre el camino COMPLETO del usuario contra el backend que esté corriendo, y
falla con ruido si alguno de los eslabones no cumple su promesa:

    idea → evaluar → generar → URL viva → API que responde datos
         → diagnóstico honesto → curso → primera clase abierta

POR QUÉ EXISTE
--------------
Los guiones de `pruebas/` cubren piezas sueltas (git del alumno, datos de
ejemplo, experto). No había ninguno que recorriera el circuito entero, y los
registros de `data/*.log` muestran el precio de esa ausencia: dos generaciones
terminaron con `URL ENTREGADA: None` y aun así el arnés de entonces imprimió
`=== FIN OK ===`. Un verde así es peor que un rojo, porque nadie lo mira.

Aquí una URL vacía es FALLO. Y "el servidor arranca" tampoco basta: se pide de
verdad la portada y las rutas `/api/*`, porque un sistema que levanta pero
devuelve 500 en sus datos es, para el usuario, un sistema roto.

USO
---
    cd backend
    python pruebas/e2e_idea_a_curso.py                    # circuito completo
    python pruebas/e2e_idea_a_curso.py --proyecto tal     # salta la generación
    python pruebas/e2e_idea_a_curso.py --idea "una web de X"
    python pruebas/e2e_idea_a_curso.py --api http://localhost:8000

Requisitos: el backend en marcha y, para no tener que iniciar sesión con Google,
`AUTH_DEV_BYPASS=1` en `backend/.env` (solo se activa en local; ver
`_bypass_local_activo` en api.py).

Genera además `data/e2e_reporte.json` con los tiempos y el veredicto de cada
paso, para poder comparar entre ejecuciones si se toca un prompt.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]

IDEA_POR_DEFECTO = (
    "Una agenda para una peluquería: que el cliente pida cita eligiendo día y "
    "hora, y que la dueña vea las citas del día y pueda cancelarlas."
)

# Un paso puede terminar de tres formas. `AVISO` no tumba la prueba pero queda
# anotado: son promesas del prompt que el modelo incumple sin romper nada.
OK, AVISO, FALLO = "OK", "AVISO", "FALLO"


@dataclass
class Paso:
    nombre: str
    estado: str = OK
    detalle: str = ""
    segundos: float = 0.0
    datos: dict = field(default_factory=dict)


class Circuito:
    def __init__(self, api: str, idioma: str, token: str = "dev-local") -> None:
        self.api = api.rstrip("/")
        self.idioma = idioma
        # `dev-local` solo abre la puerta en local (ver `_bypass_local_activo`).
        # Contra producción hay que pasar una sesión de verdad con `--token`, o
        # el paso de generar corta con un 401 y la prueba no dice nada útil.
        self.token = token
        self.pasos: list[Paso] = []

    # ------------------------------------------------------------------ HTTP
    def _pedir(
        self, ruta: str, cuerpo: dict | None = None, timeout: float = 60.0
    ) -> tuple[int, object]:
        """Llama al backend. El cuerpo va en UTF-8 explícito.

        Sin el encoding explícito, una idea con acentos o eñe llega mal
        codificada y el backend responde 400 "error parsing the body" — un
        fallo que parece del modelo y en realidad es del cliente.
        """
        url = ruta if ruta.startswith("http") else f"{self.api}{ruta}"
        datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8") if cuerpo is not None else None
        req = urllib.request.Request(url, data=datos, method="POST" if datos else "GET")
        req.add_header("Authorization", f"Bearer {self.token}")
        if datos:
            req.add_header("Content-Type", "application/json; charset=utf-8")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                crudo = r.read().decode("utf-8", "replace")
                try:
                    return r.status, json.loads(crudo)
                except json.JSONDecodeError:
                    return r.status, crudo
        except urllib.error.HTTPError as exc:
            crudo = exc.read().decode("utf-8", "replace")
            try:
                return exc.code, json.loads(crudo)
            except json.JSONDecodeError:
                return exc.code, crudo
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return 0, str(exc)

    def paso(self, nombre: str) -> Paso:
        p = Paso(nombre)
        self.pasos.append(p)
        print(f"\n[{len(self.pasos)}] {nombre}")
        return p

    # ----------------------------------------------------------------- pasos
    def salud(self) -> bool:
        p = self.paso("El backend responde")
        t0 = time.monotonic()
        codigo, cuerpo = self._pedir("/health", timeout=10)
        p.segundos = time.monotonic() - t0
        if codigo != 200:
            p.estado, p.detalle = FALLO, f"/health devolvió {codigo}: {cuerpo}"
            return False
        p.detalle = "ok"
        print("    ok")
        return True

    def evaluar(self, idea: str) -> str | None:
        """El agente crítico convierte la idea en un prompt de ingeniería."""
        p = self.paso("Evaluar la idea (agente crítico)")
        t0 = time.monotonic()
        codigo, cuerpo = self._pedir(
            "/api/v1/agent/evaluate", {"prompt": idea, "language": self.idioma}, timeout=180
        )
        p.segundos = time.monotonic() - t0
        if codigo != 200 or not isinstance(cuerpo, dict):
            p.estado, p.detalle = FALLO, f"HTTP {codigo}: {str(cuerpo)[:300]}"
            return None

        final = (cuerpo.get("prompt_final_optimizado") or "").strip()
        p.datos = {
            "status": cuerpo.get("status"),
            "sugerencias": len(cuerpo.get("sugerencias_mejora") or []),
            "preguntas": len(cuerpo.get("preguntas_para_el_usuario") or []),
            "largo_prompt_final": len(final),
        }
        if not final:
            p.estado, p.detalle = FALLO, "no devolvió prompt_final_optimizado"
            return None
        # Si el prompt final no es más rico que la idea, el agente no aportó.
        if len(final) <= len(idea):
            p.estado = AVISO
            p.detalle = f"el prompt final ({len(final)} car.) no supera a la idea ({len(idea)})"
        else:
            p.detalle = f"prompt final de {len(final)} caracteres"
        print(f"    {p.detalle}")
        return final

    def generar(self, prompt: str) -> dict | None:
        """El agente constructor escribe, verifica y arranca el proyecto."""
        p = self.paso("Generar el sistema (puede tardar varios minutos)")
        t0 = time.monotonic()
        codigo, cuerpo = self._pedir(
            "/api/v1/agent/generate", {"prompt": prompt, "language": self.idioma}, timeout=1800
        )
        p.segundos = time.monotonic() - t0
        if codigo != 200 or not isinstance(cuerpo, dict):
            p.estado, p.detalle = FALLO, f"HTTP {codigo}: {str(cuerpo)[:300]}"
            return None

        archivos = cuerpo.get("files") or []
        url = cuerpo.get("url")
        p.datos = {
            "proyecto": cuerpo.get("name"),
            "archivos": len(archivos),
            "url": url,
            "manual": bool(cuerpo.get("manual")),
        }
        # LA regla de esta prueba: sin URL no hay entrega. El arnés anterior
        # daba esto por bueno y por eso nadie vio los dos fallos de julio.
        if not url:
            p.estado = FALLO
            p.detalle = f"{len(archivos)} archivos pero URL vacía: el usuario no recibe nada que abrir"
            print(f"    FALLO: {p.detalle}")
            return cuerpo
        p.detalle = f"{cuerpo.get('name')} · {len(archivos)} archivos · {url}"
        print(f"    {p.detalle} ({p.segundos:.0f}s)")
        return cuerpo

    def revisar_promesas_del_prompt(self, proyecto: str, output_path: str = "") -> None:
        """Comprueba en disco lo que el prompt del planificador exige SIEMPRE.

        No tumba la prueba: mide la obediencia del modelo, que es justo lo que
        hoy no se mide en ningún sitio.

        La carpeta se toma de `output_path`, no del `name`: el nombre es el de
        lucir ("Lavanda & Tijeras") y en disco manda el slug ("lavanda-tijeras").
        """
        p = self.paso("Obediencia al prompt (archivos obligatorios)")
        candidatas = []
        if output_path:
            candidatas.append(Path(output_path))
            candidatas.append(RAIZ / "generated" / Path(output_path).name)
        candidatas.append(RAIZ / "generated" / proyecto)
        carpeta = next((c for c in candidatas if c.is_dir()), None)
        if carpeta is None:
            p.estado, p.detalle = AVISO, f"no encuentro la carpeta de '{proyecto}'"
            print(f"    {p.detalle}")
            return
        presentes = {f.name for f in carpeta.rglob("*") if f.is_file()}
        exigidos = ["README.md", "MANUAL.md", "DEPLOY.md", "CONFIGURE.md", ".env.example"]
        faltan = [n for n in exigidos if n not in presentes]
        tiene_deps = bool({"requirements.txt", "package.json"} & presentes)
        p.datos = {"faltan": faltan, "declara_dependencias": tiene_deps}
        if faltan or not tiene_deps:
            p.estado = AVISO
            p.detalle = "faltan: " + ", ".join(faltan or []) + ("" if tiene_deps else " · sin archivo de dependencias")
        else:
            p.detalle = "cumple los obligatorios"
        print(f"    {p.detalle}")

    def servir(self, url: str) -> None:
        """La URL entregada tiene que devolver una página y datos, no solo existir."""
        p = self.paso("La URL entregada sirve de verdad")
        t0 = time.monotonic()
        codigo, cuerpo = self._pedir(url, timeout=45)
        p.segundos = time.monotonic() - t0
        if codigo != 200:
            p.estado, p.detalle = FALLO, f"la portada devolvió {codigo}"
            print(f"    FALLO: {p.detalle}")
            return
        html = cuerpo if isinstance(cuerpo, str) else json.dumps(cuerpo)
        p.datos = {"bytes_portada": len(html)}
        # Una portada de 4 líneas es un esqueleto vacío, no un sistema.
        if len(html) < 300:
            p.estado, p.detalle = FALLO, f"la portada son {len(html)} bytes: está vacía"
        else:
            p.detalle = f"portada de {len(html)} bytes"
        print(f"    {p.detalle}")

    def diagnosticar(self, proyecto: str, url: str | None) -> None:
        """El profesor juzga si lo entregado se ve y sirve."""
        p = self.paso("Diagnóstico honesto del MVP")
        t0 = time.monotonic()
        codigo, cuerpo = self._pedir(
            "/api/v1/agent/curso/diagnostico",
            {"project_name": proyecto, "url": url or "", "language": self.idioma},
            timeout=300,
        )
        p.segundos = time.monotonic() - t0
        if codigo != 200 or not isinstance(cuerpo, dict):
            p.estado, p.detalle = FALLO, f"HTTP {codigo}: {str(cuerpo)[:300]}"
            return
        estado = cuerpo.get("estado")
        p.datos = {
            "estado": estado,
            "problemas": len(cuerpo.get("problemas") or []),
            "veredicto": (cuerpo.get("veredicto") or "")[:160],
        }
        p.detalle = f"{estado} · {p.datos['problemas']} problema(s)"
        # Que diga "vacio" no es un fallo DE LA PRUEBA: es el diagnóstico
        # haciendo su trabajo. Se marca como aviso para que salte a la vista.
        if estado == "vacio":
            p.estado = AVISO
        print(f"    {p.detalle}")

    def curso(self, proyecto: str) -> dict | None:
        p = self.paso("Generar el curso sobre el proyecto")
        t0 = time.monotonic()
        codigo, cuerpo = self._pedir(
            "/api/v1/agent/curso/iniciar",
            {"project_name": proyecto, "language": self.idioma, "nivel": "medio"},
            timeout=600,
        )
        p.segundos = time.monotonic() - t0
        if codigo != 200 or not isinstance(cuerpo, dict):
            p.estado, p.detalle = FALLO, f"HTTP {codigo}: {str(cuerpo)[:300]}"
            return None
        clases = cuerpo.get("clases") or []
        p.datos = {"titulo": cuerpo.get("titulo_curso"), "clases": len(clases)}
        if not clases:
            p.estado, p.detalle = FALLO, "el curso salió sin clases"
            return cuerpo
        # Un curso debe hablar del proyecto del alumno; si ninguna clase tiene
        # criterio de superación, es un temario decorativo.
        con_criterio = sum(1 for c in clases if (c.get("criterio") or {}).get("descripcion"))
        p.detalle = f"{len(clases)} clases · {con_criterio} con criterio de superación"
        if con_criterio < len(clases):
            p.estado = AVISO
        print(f"    {p.detalle}")
        return cuerpo

    def primera_clase(self, curso_id: str) -> None:
        p = self.paso("Abrir la primera clase (chat del profesor)")
        t0 = time.monotonic()
        codigo, cuerpo = self._pedir(
            "/api/v1/agent/curso/chat",
            {"curso_id": curso_id, "numero_clase": 1, "abrir": True, "language": self.idioma},
            timeout=300,
        )
        p.segundos = time.monotonic() - t0
        if codigo != 200 or not isinstance(cuerpo, dict):
            p.estado, p.detalle = FALLO, f"HTTP {codigo}: {str(cuerpo)[:300]}"
            return
        mensajes = cuerpo.get("mensajes") or []
        texto = " ".join(m.get("texto", "") for m in mensajes)
        p.datos = {"mensajes": len(mensajes), "caracteres": len(texto)}
        if not mensajes:
            p.estado, p.detalle = FALLO, "la clase abrió sin un solo mensaje"
        else:
            p.detalle = f"{len(mensajes)} mensaje(s), {len(texto)} caracteres"
        print(f"    {p.detalle}")

    # ---------------------------------------------------------------- salida
    def informe(self) -> int:
        ancho = max(len(p.nombre) for p in self.pasos) + 2
        print("\n" + "=" * (ancho + 30))
        print("RESULTADO END TO END")
        print("=" * (ancho + 30))
        for p in self.pasos:
            print(f"  {p.estado:<6} {p.nombre:<{ancho}} {p.segundos:6.1f}s  {p.detalle}")

        fallos = [p for p in self.pasos if p.estado == FALLO]
        avisos = [p for p in self.pasos if p.estado == AVISO]
        total = sum(p.segundos for p in self.pasos)
        print("-" * (ancho + 30))
        print(f"  {len(self.pasos)} pasos · {len(fallos)} fallo(s) · {len(avisos)} aviso(s) · {total:.0f}s")

        destino = RAIZ / "data" / "e2e_reporte.json"
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(
            json.dumps(
                {
                    "segundos_total": round(total, 1),
                    "fallos": len(fallos),
                    "avisos": len(avisos),
                    "pasos": [
                        {
                            "nombre": p.nombre,
                            "estado": p.estado,
                            "segundos": round(p.segundos, 1),
                            "detalle": p.detalle,
                            "datos": p.datos,
                        }
                        for p in self.pasos
                    ],
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"  informe: {destino}")
        return 1 if fallos else 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Prueba end to end del circuito completo.")
    ap.add_argument("--api", default="http://localhost:8000", help="URL del backend.")
    ap.add_argument("--idea", default=IDEA_POR_DEFECTO, help="La idea del usuario, en su idioma.")
    ap.add_argument("--idioma", default="es")
    ap.add_argument(
        "--proyecto",
        default="",
        help="Salta evaluar+generar y usa un proyecto ya existente (prueba solo la mitad docente).",
    )
    ap.add_argument(
        "--token",
        default=os.environ.get("E2E_TOKEN", "dev-local"),
        help="Sesión real (ID token de Google). Obligatorio contra producción.",
    )
    args = ap.parse_args()

    c = Circuito(args.api, args.idioma, args.token)
    print(f"Backend : {c.api}")
    print(f"Idea    : {args.idea if not args.proyecto else '(saltada)'}")

    if not c.salud():
        return c.informe()

    proyecto, url = args.proyecto, None

    if not args.proyecto:
        prompt = c.evaluar(args.idea)
        if prompt is None:
            return c.informe()
        generado = c.generar(prompt)
        if generado is None:
            return c.informe()
        proyecto = generado.get("name") or ""
        url = generado.get("url")
        if proyecto:
            c.revisar_promesas_del_prompt(proyecto, generado.get("output_path") or "")
        if url:
            c.servir(url)

    if not proyecto:
        return c.informe()

    c.diagnosticar(proyecto, url)
    curso = c.curso(proyecto)
    if curso:
        curso_id = (curso.get("progreso") or {}).get("curso_id") or ""
        if curso_id:
            c.primera_clase(curso_id)

    return c.informe()


if __name__ == "__main__":
    raise SystemExit(main())
