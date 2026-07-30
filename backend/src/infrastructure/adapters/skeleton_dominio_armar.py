"""Ensambla el proyecto completo a partir del dominio descrito.

Junta las tres piezas: el backend generado por dominio, el frontend que se
dibuja solo, y lo que no cambia nunca (login, seguridad, dependencias).
"""

from __future__ import annotations

import html
import json
import secrets

from src.domain.dominio_app import DominioApp
from src.domain.entities import GeneratedFile, GeneratedProject
from src.infrastructure.adapters import skeleton_dominio as be
from src.infrastructure.adapters.skeleton_dominio import _CLAVE_DEMO, _USUARIO_DEMO
from src.infrastructure.adapters import skeleton_dominio_front as fe
from src.infrastructure.adapters.skeleton_fullstack import (
    MARCADOR,
    _infra_security,
    _requirements,
)

#: Paletas por tono: el diseño también responde al dominio, no es una sola
#: plantilla para todo. (fondo, papel, acento, tinta, tinta suave, línea)
_PALETAS = {
    "cálido": ("#2A1D16", "#F3EADE", "#B4682B", "#2B211B", "#6B5647", "#D6C4AE"),
    "calido": ("#2A1D16", "#F3EADE", "#B4682B", "#2B211B", "#6B5647", "#D6C4AE"),
    "frío": ("#0C1622", "#EEF3F7", "#1C6E8C", "#16232E", "#5A6B78", "#CBD8E2"),
    "frio": ("#0C1622", "#EEF3F7", "#1C6E8C", "#16232E", "#5A6B78", "#CBD8E2"),
    "sobrio": ("#1A1A1A", "#F4F4F2", "#4A4A48", "#1F1F1E", "#63635F", "#D8D8D3"),
    "vivo": ("#1A0F2E", "#F6F1FB", "#7A3FBF", "#241635", "#6B5E7D", "#DCCFE9"),
    "neutro": ("#111827", "#F7F8FA", "#3B4CCA", "#16202B", "#55636F", "#DDE3EA"),
}


def _campos_js(d: DominioApp) -> str:
    """Descripción de los campos que consume el frontend para dibujarse."""
    salida = [
        {
            "nombre": c.nombre,
            "etiqueta": c.etiqueta,
            "tipo": c.tipo,
            "obligatorio": c.obligatorio,
            "opciones": c.opciones,
            "minimo": c.minimo,
            "maximo": c.maximo,
            "ayuda": c.ayuda,
        }
        for c in d.campos
    ]
    return json.dumps(salida, ensure_ascii=False).replace("</", "<\\/")


def _index_html(d: DominioApp) -> str:
    # La cuenta de demostración solo se ofrece si hay datos que mostrar: un
    # «Ver una demostración» que lleva a una lista vacía es peor que no tenerlo.
    demo = (
        {"usuario": _USUARIO_DEMO, "clave": _CLAVE_DEMO} if d.ejemplos else {}
    )
    datos = json.dumps(
        {
            "name": d.app_name,
            "entidad": d.entidad,
            "plural": d.entidad_plural,
            "demo": demo,
        },
        ensure_ascii=False,
    ).replace("</", "<\\/")
    return f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(d.app_name)}</title>
  <link rel="stylesheet" href="static/styles.css">
</head>
<body>
  <main id="app" class="wrap"></main>
  <script type="module">
    window.__APP__ = {datos};
    window.__CAMPOS__ = {_campos_js(d)};
  </script>
  <script type="module" src="static/js/app.js"></script>
</body>
</html>
"""


def _styles(d: DominioApp) -> str:
    fondo, papel, acento, tinta, tinta2, linea = _PALETAS.get(
        (d.tono or "neutro").lower(), _PALETAS["neutro"]
    )
    return (
        f"/* {d.app_name} — la paleta responde al dominio, no es una plantilla unica. */\n"
        "*{box-sizing:border-box}\n"
        ":root{\n"
        f"  --fondo:{fondo}; --papel:{papel}; --acento:{acento};\n"
        f"  --tinta:{tinta}; --tinta-2:{tinta2}; --linea:{linea};\n"
        "  --ok:#2F7D51; --alerta:#B4541F;\n"
        "}\n"
        "body{margin:0;min-height:100vh;display:grid;place-items:start center;padding:1.5rem;\n"
        "  background:linear-gradient(165deg,var(--fondo),#0B0B0F);color:var(--tinta);\n"
        '  font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif;line-height:1.6}\n'
        ".wrap{width:100%;max-width:680px;padding-block:1.5rem}\n"
        ".card{background:var(--papel);border-radius:6px;padding:1.9rem;\n"
        "  box-shadow:0 24px 56px -22px rgba(0,0,0,.6)}\n"
        "h1{margin:0 0 .2rem;font-size:1.6rem;letter-spacing:-.01em;text-wrap:balance}\n"
        ".sub{margin:0 0 1.4rem;color:var(--tinta-2);font-size:.94rem}\n"
        "label{display:block;font-size:.82rem;font-weight:600;color:var(--tinta);margin:.7rem 0 .25rem}\n"
        "label .req{color:var(--alerta)}\n"
        "input,select,textarea{width:100%;padding:.65rem .8rem;border:1px solid var(--linea);\n"
        "  border-radius:4px;background:#fff;color:var(--tinta);font-size:.98rem;font-family:inherit}\n"
        "textarea{min-height:80px;resize:vertical}\n"
        # Una casilla no ocupa toda la fila, pero tampoco debe dejar que el
        # botón se le suba al lado: se aísla en su propia línea.
        "input[type=checkbox]{width:auto;margin:.1rem .5rem .4rem 0;display:inline-block}\n"
        "form.alta>button[type=submit]{display:block;width:100%;clear:both}\n"
        "input:focus,select:focus,textarea:focus{outline:none;border-color:var(--acento);\n"
        "  box-shadow:0 0 0 3px color-mix(in srgb,var(--acento) 18%,transparent)}\n"
        ".ayuda{font-size:.76rem;color:var(--tinta-2);margin:.2rem 0 0}\n"
        "button{padding:.68rem 1.15rem;border:0;border-radius:4px;background:var(--acento);\n"
        "  color:#fff;font-weight:600;font-size:.95rem;cursor:pointer;font-family:inherit}\n"
        "button:hover{filter:brightness(1.08)}\n"
        "button.ghost{background:transparent;border:1px solid var(--linea);color:var(--tinta-2)}\n"
        "button.small{padding:.35rem .7rem;font-size:.82rem}\n"
        ".row{display:flex;gap:.6rem;margin-top:1rem}\n"
        ".row button{flex:1}\n"
        ".msg{font-size:.88rem;margin:.9rem 0 0;min-height:1.1em;color:var(--tinta-2)}\n"
        ".msg.ok{color:var(--ok)}\n"
        ".msg.error{color:var(--alerta)}\n"
        ".cab{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;\n"
        "  margin-bottom:1.1rem;padding-bottom:.8rem;border-bottom:2px solid var(--tinta)}\n"
        "/* Los calculos: lo que convierte una lista en un sistema de informacion */\n"
        ".resumen{display:flex;flex-wrap:wrap;gap:.7rem;margin-bottom:1.2rem}\n"
        ".dato{flex:1;min-width:120px;background:color-mix(in srgb,var(--acento) 8%,transparent);\n"
        "  border:1px solid var(--linea);border-radius:4px;padding:.6rem .8rem}\n"
        ".dato .v{font-size:1.3rem;font-weight:700;font-variant-numeric:tabular-nums;color:var(--acento)}\n"
        ".dato .e{font-size:.72rem;color:var(--tinta-2);text-transform:uppercase;letter-spacing:.06em}\n"
        ".lista{list-style:none;margin:1.2rem 0 0;padding:0;display:flex;flex-direction:column;gap:.6rem}\n"
        ".item{background:#fff;border:1px solid var(--linea);border-left:3px solid var(--acento);\n"
        "  border-radius:4px;padding:.8rem .9rem;display:flex;gap:.8rem;align-items:flex-start}\n"
        ".item .datos{flex:1;display:grid;gap:.15rem;min-width:0}\n"
        ".item .par{font-size:.9rem;margin:0}\n"
        ".item .par b{color:var(--tinta-2);font-weight:600;font-size:.78rem;\n"
        "  text-transform:uppercase;letter-spacing:.04em;margin-right:.4rem}\n"
        ".item .num{font-variant-numeric:tabular-nums}\n"
        ".item .del{background:transparent;border:0;color:var(--tinta-2);font-size:1.05rem;\n"
        "  cursor:pointer;padding:.1rem .35rem;border-radius:3px}\n"
        ".item .del:hover{color:var(--alerta);background:color-mix(in srgb,var(--alerta) 10%,transparent)}\n"
        ".vacio{text-align:center;padding:1.8rem 1rem;color:var(--tinta-2);font-size:.92rem;\n"
        "  border:1px dashed var(--linea);border-radius:4px}\n"
        "@media (max-width:480px){\n"
        "  .card{padding:1.4rem 1.15rem}\n"
        "  .row{flex-direction:column}\n"
        "}\n"
        "@media (prefers-reduced-motion:reduce){*{transition:none!important}}\n"
    )


def _readme(d: DominioApp) -> str:
    campos = "\n".join(f"- **{c.etiqueta}** ({c.tipo})" for c in d.campos)
    return (
        f"# {d.app_name}\n\n"
        f"Aplicación para gestionar {d.entidad_plural.lower()}, con cuenta propia.\n"
        "Backend **hexagonal** (dominio / aplicación / infraestructura) y frontend por\n"
        "componentes que se dibuja a partir del dominio.\n\n"
        f"## Qué guarda cada {d.entidad.lower()}\n\n{campos}\n\n"
        + (
            "## Para enseñárselo a alguien\n\n"
            f"La aplicación arranca con **{len(d.ejemplos)} {d.entidad_plural.lower()} de "
            "ejemplo** ya dentro, para que quien abra el enlace vea un sistema en uso en "
            "vez de una pantalla en blanco.\n\n"
            "En la pantalla de entrada hay un botón **«Ver una demostración»**: entra sin "
            "registrarse y puede mirar todo. Los datos son inventados.\n\n"
            f"| | |\n|---|---|\n| Usuario | `{_USUARIO_DEMO}` |\n"
            f"| Contraseña | `{_CLAVE_DEMO}` |\n\n"
            "Quien quiera guardar lo suyo crea su cuenta: cada usuario ve solo sus "
            f"{d.entidad_plural.lower()}, nunca los de otro.\n\n"
            if d.ejemplos
            else ""
        )
        + "## Correr\n\n"
        "```\npip install -r backend/requirements.txt\nuvicorn backend.main:app\n```\n\n"
        "Abre http://localhost:8000\n"
    )


def construir_desde_dominio(d: DominioApp) -> GeneratedProject:
    """Arma el proyecto completo a partir del dominio descrito."""
    d = d.sanear()
    archivos = {
        "backend/requirements.txt": _requirements(),
        "backend/__init__.py": "",
        "backend/domain/__init__.py": "",
        "backend/domain/entities.py": be._entities(d),
        "backend/domain/ports.py": be._ports(d),
        "backend/application/__init__.py": "",
        "backend/application/services.py": be._services(d),
        "backend/infrastructure/__init__.py": "",
        "backend/infrastructure/db.py": be._db(d),
        "backend/infrastructure/repositories.py": be._repositories(d),
        "backend/infrastructure/security.py": _infra_security(secrets.token_urlsafe(48)),
        "backend/infrastructure/web.py": be._web(d),
        "backend/main.py": be._main(),
        "frontend/index.html": _index_html(d),
        "frontend/styles.css": _styles(d),
        "frontend/js/app.js": fe.js_app(),
        "frontend/js/api.js": fe.js_api(),
        "frontend/js/state.js": fe.js_state(),
        "frontend/js/campos.js": fe.js_campos(),
        "frontend/js/components/auth.js": fe.js_auth(),
        "frontend/js/components/board.js": fe.js_board(),
        "README.md": _readme(d),
        MARCADOR: "esqueleto por dominio v3",
    }
    return GeneratedProject(
        name=d.app_name,
        summary=(
            f"Aplicación de {d.entidad_plural.lower()} con login. "
            f"{len(d.campos)} campos y {len(d.calculos)} cálculo(s). "
            "Backend hexagonal, frontend por componentes."
        ),
        files=[GeneratedFile(path=p, content=c) for p, c in archivos.items()],
        run_instructions="pip install -r backend/requirements.txt && uvicorn backend.main:app",
    )
