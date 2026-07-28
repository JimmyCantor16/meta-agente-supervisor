"""Esqueleto de LANDING PAGE — sitio profesional, limpio y correcto por construcción.

El caso que el usuario probó (una landing) caía en generación libre y salía con
rutas a localhost y estructura desordenada. Este esqueleto lo resuelve: una landing
por SECCIONES que sigue la doctrina de diseño (iconos SVG en vez de emojis, reveals
al hacer scroll con IntersectionObserver respetando prefers-reduced-motion,
gradientes con criterio, contraste, responsividad, tema claro/oscuro). Assets con
rutas RELATIVAS. Un mini backend FastAPI la sirve, así verifica y despliega igual
que el resto (un solo servicio).

El LLM solo aporta los TEXTOS (título, lema, secciones). El código es fijo.
"""

from __future__ import annotations

import html

from src.domain.entities import GeneratedFile, GeneratedProject

MARCADOR = "backend/.esqueleto"


def _requirements() -> str:
    return "fastapi==0.111.0\nuvicorn==0.30.1\n"


def _main() -> str:
    return '''"""Sirve la landing estática (un solo servicio, rutas relativas)."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Landing")
_FRONT = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(_FRONT)), name="static")


@app.get("/")
def index():
    return FileResponse(str(_FRONT / "index.html"))
'''


def _index_html(title: str, tagline: str, cta: str, secciones: list[dict]) -> str:
    def esc(s: str) -> str:
        return html.escape(str(s or ""))

    # Numeración de secciones (estructura que encoda orden real).
    bloques = []
    for i, s in enumerate(secciones, 1):
        bloques.append(f'''    <section class="seccion reveal">
      <p class="n">{i:02d}</p>
      <div class="seccion-cuerpo">
        <h2>{esc(s.get("heading"))}</h2>
        <p>{esc(s.get("text"))}</p>
      </div>
    </section>''')
    secciones_html = "\n".join(bloques)

    return f'''<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(tagline)}">
  <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
  <header class="hero">
    <div class="hero-inner reveal">
      <p class="eyebrow">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6L5.7 21 8 14 2 9.6h7.6z"/></svg>
        {esc(title)}
      </p>
      <h1>{esc(tagline)}</h1>
      <a class="cta" href="#empezar">
        {esc(cta)}
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </a>
    </div>
  </header>

  <main>
{secciones_html}
    <section class="cierre reveal" id="empezar">
      <h2>{esc(cta)}</h2>
      <a class="cta" href="#">{esc(cta)}</a>
    </section>
  </main>

  <footer class="pie">
    <span>{esc(title)}</span>
  </footer>

  <script src="/static/app.js"></script>
</body>
</html>
'''


def _styles() -> str:
    return '''*{box-sizing:border-box}
:root{
  --ground:#F7F8FA; --surface:#FFFFFF; --ink:#141A22; --ink-2:#5A6673; --ink-3:#8A96A3;
  --line:#E4E9EF; --acc:#3B4CCA; --acc-2:#7A5CF0; --acc-soft:rgba(59,76,202,.08);
}
@media (prefers-color-scheme:dark){:root{
  --ground:#0C1016; --surface:#141A22; --ink:#EAF0F6; --ink-2:#9FB0BF; --ink-3:#6E7E8D;
  --line:#232D38; --acc:#8CA0FF; --acc-2:#B39BFF; --acc-soft:rgba(140,160,255,.12);
}}
html{scroll-behavior:smooth}
body{margin:0;background:var(--ground);color:var(--ink);
  font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif;line-height:1.6;
  -webkit-font-smoothing:antialiased}
::selection{background:var(--acc-soft)}
::-webkit-scrollbar{width:11px}
::-webkit-scrollbar-thumb{background:var(--line);border-radius:6px;border:3px solid var(--ground)}
html{scrollbar-width:thin;scrollbar-color:var(--line) var(--ground)}

.hero{min-height:78vh;display:grid;place-items:center;padding:4rem 1.5rem;text-align:center;
  background:radial-gradient(120% 90% at 50% -10%,var(--acc-soft),transparent 60%)}
.hero-inner{max-width:56ch;display:grid;gap:1.4rem;justify-items:center}
.eyebrow{display:inline-flex;align-items:center;gap:.5rem;font-size:.8rem;font-weight:600;
  letter-spacing:.14em;text-transform:uppercase;color:var(--acc);margin:0}
h1{font-size:clamp(2.2rem,6vw,4rem);line-height:1.08;letter-spacing:-.02em;margin:0;
  text-wrap:balance;background:linear-gradient(120deg,var(--ink),var(--acc));
  -webkit-background-clip:text;background-clip:text;color:transparent}
.cta{display:inline-flex;align-items:center;gap:.55rem;background:var(--acc);color:#fff;
  text-decoration:none;font-weight:600;padding:.85rem 1.6rem;border-radius:999px;
  box-shadow:0 12px 30px -10px var(--acc);transition:transform .15s ease,filter .15s ease}
.cta:hover{transform:translateY(-2px);filter:brightness(1.06)}

main{max-width:72ch;margin-inline:auto;padding:2rem 1.5rem 4rem;display:grid;gap:clamp(2.5rem,7vh,5rem)}
.seccion{display:grid;grid-template-columns:auto 1fr;gap:1.4rem;align-items:start}
.seccion .n{font-variant-numeric:tabular-nums;font-weight:700;font-size:1.1rem;color:var(--acc);
  border:1px solid var(--line);border-radius:10px;padding:.4rem .6rem;margin:0}
.seccion h2{font-size:clamp(1.3rem,3vw,1.8rem);margin:0 0 .5rem;letter-spacing:-.01em}
.seccion p{margin:0;color:var(--ink-2);max-width:60ch}
.cierre{text-align:center;display:grid;gap:1.2rem;justify-items:center;padding:2rem 0;
  border-top:1px solid var(--line)}
.cierre h2{font-size:clamp(1.6rem,4vw,2.4rem);margin:0}

.pie{border-top:1px solid var(--line);padding:1.6rem;text-align:center;color:var(--ink-3);font-size:.85rem}

.reveal{opacity:0;transform:translateY(22px);transition:opacity .6s ease,transform .6s ease}
.reveal.visible{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .reveal{opacity:1;transform:none;transition:none}
  .cta{transition:none}
}
@media (max-width:520px){.seccion{grid-template-columns:1fr;gap:.6rem}}
'''


def _app_js() -> str:
    return r'''// Reveals al hacer scroll: solo anima lo que entra al viewport (rendimiento),
// y respeta a quien pidió menos movimiento.
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const items = document.querySelectorAll(".reveal");

if (reduce || !("IntersectionObserver" in window)) {
  items.forEach((el) => el.classList.add("visible"));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.15 }
  );
  items.forEach((el) => io.observe(el));
}
'''


def _readme(title: str) -> str:
    return (
        f"# {title}\n\nLanding page profesional (HTML/CSS/JS) servida por un mini backend "
        "FastAPI. Reveals al scroll con IntersectionObserver, respeta prefers-reduced-motion, "
        "responsiva y con rutas relativas.\n\n## Correr\n\n"
        "```\npip install -r backend/requirements.txt\nuvicorn backend.main:app\n```\n"
    )


def construir_landing(title: str, tagline: str, cta: str, secciones: list[dict]) -> GeneratedProject:
    """Landing por secciones. `secciones` = [{heading, text}, ...]."""
    title = (title or "Mi Producto").strip()[:60]
    tagline = (tagline or "Algo simple y bien hecho.").strip()[:140]
    cta = (cta or "Empezar").strip()[:30]
    if not secciones:
        secciones = [
            {"heading": "Simple", "text": "Pensado para que cualquiera lo entienda a la primera."},
            {"heading": "Rápido", "text": "Carga al instante y funciona en cualquier dispositivo."},
            {"heading": "Confiable", "text": "Hecho con cuidado, listo para crecer contigo."},
        ]
    secciones = secciones[:6]

    archivos = {
        "backend/requirements.txt": _requirements(),
        "backend/__init__.py": "",
        "backend/main.py": _main(),
        "frontend/index.html": _index_html(title, tagline, cta, secciones),
        "frontend/styles.css": _styles(),
        "frontend/app.js": _app_js(),
        "README.md": _readme(title),
        MARCADOR: "esqueleto landing v1",
    }
    files = [GeneratedFile(path=p, content=c) for p, c in archivos.items()]
    return GeneratedProject(
        name=title,
        summary=f"Landing page profesional: {tagline}",
        files=files,
        run_instructions="pip install -r backend/requirements.txt && uvicorn backend.main:app",
    )
