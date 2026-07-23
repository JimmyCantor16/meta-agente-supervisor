"""Instanciador de Sistemas Base: la IA decide y rellena, la base ejecuta.

La tesis (documentada en docs/vision-meta-agente.html): un modelo débil con un
sistema fuerte supera a un modelo caro improvisando. Aquí el LLM ya no escribe
45 archivos — escribe UN manifiesto de dominio (entidades, semillas, textos,
tema) y el sistema instancia una base dorada construida y verificada a mano,
con todas las lecciones de producción cocinadas dentro.

Arquetipos: gestion · catalogo · reservas · educativo · contenido · landing.
Lo que no calce -> generación libre de siempre (y la bitácora lo registra
para decidir el próximo arquetipo).
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from src.domain.entities import GeneratedFile, GeneratedProject, slugify

logger = logging.getLogger(__name__)

_BASES_DIR = Path(__file__).resolve().parents[3] / "bases"

_TEMAS = ("calido", "oscuro", "vidrio")
_TIPOS_CAMPO = ("texto", "textolargo", "numero", "precio", "fecha",
                "booleano", "opcion", "email", "url")

_USUARIOS_DEFECTO = [
    {"email": "admin@example.com", "password": "admin123", "nombre": "Admin", "rol": "admin"},
    {"email": "user@example.com", "password": "user123", "nombre": "Usuario", "rol": "usuario"},
]

ARQUETIPO_SYS = """\
Eres el clasificador de arquetipos del Meta-Agente. Dada una idea de software,
decides si calza en un SISTEMA BASE ya construido y, si calza, escribes su
manifiesto de dominio. Si no calza con claridad, respondes "libre".

Arquetipos disponibles:
- "gestion": panel administrativo CRUD (inventarios, clientes, colegios, gimnasios).
- "catalogo": catálogo público + carrito + pedidos (tiendas, restaurantes, domicilios).
- "reservas": agenda de citas/turnos por recurso y hora (barberías, canchas, consultorios).
- "educativo": quiz/juego de preguntas con puntaje y progreso.
- "contenido": publicaciones de lectura pública administradas por el dueño (blog, noticias, recetas).
- "landing": página de presentación de marca/persona/negocio SIN sistema detrás.
- "libre": nada de lo anterior encaja sin forzarlo.

Devuelve EXCLUSIVAMENTE un JSON válido:
{
  "arquetipo": "gestion|catalogo|reservas|educativo|contenido|landing|libre",
  "confianza": "alta|media|baja",
  "manifiesto": { ... }   // vacío {} si arquetipo es "libre"
}

Forma del manifiesto (arquetipos con sistema):
{
  "nombre": "Nombre real del negocio (de la idea; si no hay, uno digno)",
  "slug": "nombre-en-kebab-case",
  "descripcion": "1-2 frases vendedoras para el hero, en el idioma pedido",
  "tema": "calido|oscuro|vidrio",  // calido: artesanal/comida; oscuro: tech/gamer; vidrio: profesional/moderno
  "moneda": "$",
  "entidades": [
    {
      "nombre": "producto", "plural": "productos",
      "etiqueta": "Producto", "etiquetaPlural": "Productos",
      "icono": "🧁", "publico": true,
      "campos": [
        {"nombre": "nombre", "etiqueta": "Nombre", "tipo": "texto", "requerido": true, "enLista": true},
        {"nombre": "precio", "etiqueta": "Precio", "tipo": "precio", "requerido": true, "enLista": true},
        {"nombre": "stock", "etiqueta": "Stock", "tipo": "numero", "enLista": true},
        {"nombre": "descripcion", "etiqueta": "Descripción", "tipo": "textolargo"}
      ],
      "semillas": [ {"nombre": "…", "precio": 12.5, "stock": 10, "descripcion": "…"} ]
    }
  ],
  "modulos": {
    "tienda": {"entidad": "producto"},     // solo arquetipo catalogo
    "reservas": {"recursos": ["Silla 1"], "horarios": ["09:00","10:00"]},  // solo reservas
    "quiz": {"titulo": "…", "preguntas": [{"pregunta": "…", "opciones": ["a","b","c"], "correcta": 0}]},
    "blog": true                            // solo contenido
  }
}

Manifiesto del arquetipo "landing":
{
  "nombre": "…", "slug": "…", "descripcion": "…", "tema": "calido|oscuro|vidrio",
  "hero": {"titulo": "…", "subtitulo": "…", "cta": "Texto del botón"},
  "caracteristicas": [{"icono": "✨", "titulo": "…", "texto": "…"}],  // 3-6
  "sobre": "párrafo con personalidad",
  "contacto": {"email": "…", "telefono": "…", "whatsapp": "…"}
}

Reglas:
- USA LOS DATOS REALES de la idea (nombres, productos, precios, respuestas del
  usuario). Inventa solo semillas de relleno CREÍBLES del rubro (4-8 por entidad).
- Los campos usan SOLO estos tipos: texto, textolargo, numero, precio, fecha,
  booleano, opcion, email, url. Nombres de campo/entidad en minúsculas, sin
  espacios ni acentos (snake simple), NUNCA palabras reservadas (id, creado_en).
- "catalogo" exige una entidad con un campo tipo "precio" y otro "stock".
- "educativo": 6-10 preguntas del tema pedido con exactamente una correcta.
- "contenido": la entidad pública lleva un campo texto (título) y un textolargo.
- Si la idea trae requisitos que la base NO cubre (pagos reales, mapas, chat,
  roles complejos), baja la confianza o responde "libre". Sé honesto.
- Todos los textos en el idioma que se te indique.
"""


# ---------------------------------------------------------------------------
def decidir_arquetipo(llm, prompt: str, language: str) -> dict | None:
    """Pregunta al clasificador. Devuelve el manifiesto validado, o None (libre)."""
    try:
        idioma = "español" if language == "es" else "inglés"
        data = llm.chat_json(
            ARQUETIPO_SYS,
            f"[Responde los textos en {idioma}]\n\nIDEA DEL USUARIO:\n{prompt}",
            temperature=0.2,
        )
    except Exception as exc:  # noqa: BLE001 - el clasificador nunca bloquea
        logger.warning("Clasificador de arquetipos falló (%s): ruta libre.", exc)
        return None

    arquetipo = str(data.get("arquetipo", "libre")).lower()
    confianza = str(data.get("confianza", "baja")).lower()
    manifiesto = data.get("manifiesto") or {}

    if arquetipo in ("libre", "") or confianza == "baja" or not manifiesto:
        _registrar_sin_arquetipo(prompt, arquetipo, confianza)
        return None

    manifiesto["arquetipo"] = arquetipo
    try:
        return _sanear_manifiesto(manifiesto)
    except ValueError as exc:
        logger.warning("Manifiesto inválido (%s): ruta libre.", exc)
        _registrar_sin_arquetipo(prompt, arquetipo, f"manifiesto inválido: {exc}")
        return None


def _sanear_manifiesto(m: dict) -> dict:
    """Valida y normaliza el manifiesto. Lanza ValueError si no es usable."""
    m["nombre"] = str(m.get("nombre") or "Mi Sistema").strip()[:60]
    m["slug"] = slugify(str(m.get("slug") or m["nombre"]))
    m["descripcion"] = str(m.get("descripcion") or "").strip()[:280] or (
        f"{m['nombre']}, construido con Meta-Agente."
    )
    if m.get("tema") not in _TEMAS:
        m["tema"] = "calido"
    m.setdefault("moneda", "$")
    m["usuarios"] = _USUARIOS_DEFECTO

    if m["arquetipo"] == "landing":
        if not (m.get("hero") or {}).get("titulo"):
            raise ValueError("landing sin hero")
        m["caracteristicas"] = (m.get("caracteristicas") or [])[:6]
        return m

    entidades = m.get("entidades") or []
    if not entidades:
        raise ValueError("sin entidades")
    reservado = {"id", "creado_en", "usuarios", "pedidos", "reservas"}
    for e in entidades:
        e["nombre"] = re.sub(r"\W", "_", str(e.get("nombre", "item")).lower())[:30] or "item"
        e["plural"] = re.sub(r"\W", "_", str(e.get("plural", e["nombre"] + "s")).lower())[:30]
        if e["plural"] in reservado or e["nombre"] in reservado:
            raise ValueError(f"nombre reservado: {e['nombre']}")
        e.setdefault("etiqueta", e["nombre"].title())
        e.setdefault("etiquetaPlural", e["plural"].title())
        e.setdefault("icono", "📦")
        e["publico"] = bool(e.get("publico"))
        campos = e.get("campos") or []
        if not campos:
            raise ValueError(f"entidad {e['nombre']} sin campos")
        for c in campos:
            c["nombre"] = re.sub(r"\W", "_", str(c.get("nombre", "campo")).lower())[:30]
            if c["nombre"] in ("id", "creado_en"):
                raise ValueError(f"campo reservado en {e['nombre']}")
            c.setdefault("etiqueta", c["nombre"].title())
            if c.get("tipo") not in _TIPOS_CAMPO:
                c["tipo"] = "texto"
        e["semillas"] = (e.get("semillas") or [])[:12]

    modulos = m.get("modulos") or {}
    arquetipo = m["arquetipo"]
    m["modulos"] = {
        "tienda": modulos.get("tienda") if arquetipo == "catalogo" else None,
        "reservas": modulos.get("reservas") if arquetipo == "reservas" else None,
        "quiz": modulos.get("quiz") if arquetipo == "educativo" else None,
        "blog": bool(modulos.get("blog")) if arquetipo == "contenido" else False,
    }
    if arquetipo == "catalogo":
        tienda = m["modulos"]["tienda"] or {}
        tienda.setdefault("entidad", entidades[0]["nombre"])
        m["modulos"]["tienda"] = tienda
        vendible = next((e for e in entidades if e["nombre"] == tienda["entidad"]), entidades[0])
        vendible["publico"] = True
        if not any(c["tipo"] == "precio" for c in vendible["campos"]):
            raise ValueError("catalogo sin campo precio")
    if arquetipo == "reservas" and not (m["modulos"]["reservas"] or {}).get("recursos"):
        raise ValueError("reservas sin recursos")
    if arquetipo == "educativo":
        preguntas = (m["modulos"]["quiz"] or {}).get("preguntas") or []
        if len(preguntas) < 3:
            raise ValueError("quiz con menos de 3 preguntas")
    if arquetipo == "contenido":
        m["modulos"]["blog"] = True
        entidades[0]["publico"] = True
    return m


# ---------------------------------------------------------------------------
def instanciar(manifiesto: dict) -> GeneratedProject:
    """Convierte el manifiesto en un proyecto completo desde la base dorada."""
    if manifiesto["arquetipo"] == "landing":
        files = _instanciar_landing(manifiesto)
    else:
        files = _instanciar_nucleo(manifiesto)
    return GeneratedProject(
        name=manifiesto["nombre"],
        summary=manifiesto["descripcion"],
        files=files,
        run_instructions="Instanciado desde un Sistema Base verificado. "
                         "Backend: npm install && npm start (sirve también el frontend).",
    )


def _leer_base(nombre: str) -> dict[str, str]:
    base = _BASES_DIR / nombre
    archivos: dict[str, str] = {}
    for f in base.rglob("*"):
        if f.is_file():
            rel = str(f.relative_to(base)).replace("\\", "/")
            archivos[rel] = f.read_text(encoding="utf-8")
    if not archivos:
        raise FileNotFoundError(f"Base '{nombre}' vacía o inexistente en {base}")
    return archivos


_PALETAS = {
    "calido": ("#e2725b", "#f0a04b"),
    "oscuro": ("#7c6cff", "#2dd4bf"),
    "vidrio": ("#4f6df5", "#b44df0"),
}

_LOGO = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/>
  </linearGradient></defs>
  <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#g)"/>
  <text x="32" y="43" text-anchor="middle" font-family="Segoe UI, system-ui, sans-serif"
        font-size="30" font-weight="800" fill="#fff">{inicial}</text>
</svg>
"""


def _instanciar_nucleo(m: dict) -> list[GeneratedFile]:
    plantilla = _leer_base("nucleo")
    c1, c2 = _PALETAS[m["tema"]]
    inicial = next((ch for ch in m["nombre"].upper() if ch.isalnum()), "A")

    archivos: dict[str, str] = {}
    for rel, contenido in plantilla.items():
        if rel == "dominio.json":
            continue  # se escribe abajo con el manifiesto real
        archivos[rel] = contenido

    archivos["dominio.json"] = json.dumps(m, ensure_ascii=False, indent=2)
    archivos["backend/package.json"] = archivos["backend/package.json"].replace(
        '"name": "sistema-base"', f'"name": "{m["slug"]}"'
    )
    archivos["frontend/logo.svg"] = _LOGO.format(c1=c1, c2=c2, inicial=inicial)
    archivos["MANUAL.md"] = _manual(m)
    archivos["README.md"] = (
        f"# {m['nombre']}\n\n{m['descripcion']}\n\n"
        "Instanciado por Meta-Agente desde un Sistema Base verificado "
        f"(arquetipo **{m['arquetipo']}**).\n\n"
        "## Ejecutar\n\n```bash\ncd backend\nnpm install\nnpm start\n```\n\n"
        "El servidor sirve también el frontend en el mismo puerto.\n"
    )
    archivos[".env.example"] = "PORT=3000\nJWT_SECRET=cambia_esto_en_produccion\n"
    return [GeneratedFile(path=p, content=c) for p, c in sorted(archivos.items())]


def _manual(m: dict) -> str:
    lineas = [
        f"# Manual de {m['nombre']}",
        "",
        m["descripcion"],
        "",
        "## Usuarios de prueba",
        "",
        "| Rol | Correo | Contraseña |",
        "|---|---|---|",
    ]
    for u in m["usuarios"]:
        lineas.append(f"| {u['rol']} | {u['email']} | {u['password']} |")
    lineas += ["", "## Qué puedes hacer", ""]
    if m["arquetipo"] == "catalogo":
        lineas += ["- Mirar el catálogo sin registrarte y llenar el carrito.",
                   "- Crear tu cuenta (o entrar) para confirmar el pedido.",
                   "- Como admin: gestionar el catálogo y el estado de los pedidos."]
    elif m["arquetipo"] == "reservas":
        lineas += ["- Elegir día, recurso y hora libres, y reservar.",
                   "- Ver y cancelar tus reservas.",
                   "- Como admin: ver la agenda completa."]
    elif m["arquetipo"] == "educativo":
        lineas += ["- Jugar el quiz y guardar tu puntaje.",
                   "- Seguir tu progreso partida a partida."]
    elif m["arquetipo"] == "contenido":
        lineas += ["- Leer las publicaciones sin registrarte.",
                   "- Como admin: crear, editar y borrar publicaciones."]
    else:
        lineas += ["- Entrar con tu usuario y gestionar cada módulo desde el panel.",
                   "- Crear, editar, buscar y borrar registros con confirmación."]
    lineas += ["", "_Generado por Meta-Agente — sistema base verificado._", ""]
    return "\n".join(lineas)


# ---------------------------------------------------------------------------
def _instanciar_landing(m: dict) -> list[GeneratedFile]:
    c1, c2 = _PALETAS[m["tema"]]
    oscuro = m["tema"] == "oscuro"
    hero = m.get("hero") or {}
    contacto = m.get("contacto") or {}
    inicial = next((ch for ch in m["nombre"].upper() if ch.isalnum()), "A")

    caracteristicas = "".join(
        f'<article class="rasgo"><span class="rasgo-icono">{c.get("icono", "✨")}</span>'
        f'<h3>{c.get("titulo", "")}</h3><p>{c.get("texto", "")}</p></article>'
        for c in (m.get("caracteristicas") or [])
    )
    lineas_contacto = "".join(
        f'<a class="contacto-linea" href="{href}">{icono} {texto}</a>'
        for icono, texto, href in [
            ("✉️", contacto.get("email", ""), f"mailto:{contacto.get('email', '')}"),
            ("📱", contacto.get("telefono", ""), f"tel:{contacto.get('telefono', '')}"),
            ("💬", "WhatsApp", "https://wa.me/" + re.sub(r"\D", "", contacto.get("whatsapp", ""))
             if contacto.get("whatsapp") else ""),
        ] if texto and href
    )

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{m['nombre']}</title>
<meta name="description" content="{m['descripcion']}">
<link rel="icon" href="logo.svg" type="image/svg+xml">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<nav class="barra"><a class="marca" href="#inicio"><img src="logo.svg" alt="">{m['nombre']}</a>
<div class="enlaces"><a href="#rasgos">Qué ofrecemos</a><a href="#sobre">Sobre nosotros</a>
<a class="btn-nav" href="#contacto">Contacto</a></div></nav>

<header class="hero" id="inicio"><div class="hero-inner">
<h1>{hero.get('titulo', m['nombre'])}</h1>
<p>{hero.get('subtitulo', m['descripcion'])}</p>
<a class="cta" href="#contacto">{hero.get('cta', 'Contáctanos')}</a>
</div><div class="baja" aria-hidden="true">⌄</div></header>

<main>
<section id="rasgos" class="seccion"><h2>Qué ofrecemos</h2>
<div class="rasgos">{caracteristicas}</div></section>

<section id="sobre" class="seccion alterna"><h2>Sobre nosotros</h2>
<p class="texto-sobre">{m.get('sobre', m['descripcion'])}</p></section>

<section id="contacto" class="seccion"><h2>Hablemos</h2>
<div class="contacto">{lineas_contacto or '<p>Escríbenos y te respondemos pronto.</p>'}</div></section>
</main>

<footer>© {m['nombre']} — hecho con Meta-Agente.</footer>
<script src="script.js"></script>
</body>
</html>
"""

    css = f""":root {{
  --acento: {c1}; --acento-2: {c2};
  --fondo: {'#0f1120' if oscuro else '#faf8f4'}; --superficie: {'#191c30' if oscuro else '#ffffff'};
  --tinta: {'#e9ebf7' if oscuro else '#22242e'}; --suave: {'#98a0c4' if oscuro else '#6b7080'};
  --linea: {'rgba(160,168,210,.16)' if oscuro else 'rgba(60,64,90,.13)'};
}}
* {{ box-sizing: border-box; }}
html {{ scroll-behavior: smooth; }}
body {{ margin: 0; background: var(--fondo); color: var(--tinta);
  font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.65; }}
h1, h2, h3 {{ line-height: 1.2; text-wrap: balance; }}
.barra {{ position: sticky; top: 0; z-index: 50; display: flex; align-items: center;
  justify-content: space-between; gap: 1rem; padding: .7rem clamp(1rem, 4vw, 2.5rem);
  background: color-mix(in srgb, var(--fondo) 82%, transparent);
  backdrop-filter: blur(12px); border-bottom: 1px solid var(--linea); }}
.marca {{ display: flex; align-items: center; gap: .6rem; font-weight: 800;
  color: var(--tinta); text-decoration: none; }}
.marca img {{ width: 34px; height: 34px; border-radius: 10px; }}
.enlaces {{ display: flex; gap: .3rem; align-items: center; flex-wrap: wrap; }}
.enlaces a {{ color: var(--suave); text-decoration: none; font-weight: 600;
  padding: .45rem .8rem; border-radius: 10px; }}
.enlaces a:hover {{ color: var(--tinta); background: var(--superficie); }}
.btn-nav {{ background: linear-gradient(115deg, var(--acento), var(--acento-2)) !important;
  color: #fff !important; }}
.hero {{ min-height: 82vh; display: grid; place-items: center; text-align: center;
  padding: 4rem 1.5rem; position: relative; overflow: hidden;
  background: radial-gradient(50% 45% at 30% 15%, color-mix(in srgb, var(--acento) 20%, transparent), transparent 70%),
              radial-gradient(45% 40% at 80% 70%, color-mix(in srgb, var(--acento-2) 16%, transparent), transparent 70%); }}
.hero-inner {{ max-width: 700px; display: grid; gap: 1rem; justify-items: center; }}
.hero h1 {{ font-size: clamp(2.2rem, 7vw, 3.8rem); font-weight: 800; letter-spacing: -.02em; margin: 0;
  background: linear-gradient(115deg, var(--acento), var(--acento-2));
  -webkit-background-clip: text; background-clip: text; color: transparent; }}
.hero p {{ font-size: clamp(1.05rem, 2.5vw, 1.25rem); color: var(--suave); margin: 0; max-width: 44rem; }}
.cta {{ display: inline-block; margin-top: .8rem; padding: .95rem 1.9rem; border-radius: 14px;
  background: linear-gradient(115deg, var(--acento), var(--acento-2)); color: #fff;
  font-weight: 800; font-size: 1.05rem; text-decoration: none;
  box-shadow: 0 14px 30px -14px var(--acento); transition: transform .15s; }}
.cta:hover {{ transform: translateY(-2px); }}
.baja {{ position: absolute; bottom: 1rem; left: 50%; transform: translateX(-50%);
  color: var(--suave); font-size: 1.4rem; animation: bob 2s ease-in-out infinite; }}
@keyframes bob {{ 50% {{ transform: translate(-50%, 8px); }} }}
.seccion {{ max-width: 1050px; margin: 0 auto; padding: clamp(3rem, 8vw, 5rem) 1.5rem; }}
.seccion h2 {{ font-size: clamp(1.6rem, 4vw, 2.2rem); margin: 0 0 1.6rem; }}
.alterna {{ background: var(--superficie); border-block: 1px solid var(--linea);
  max-width: none; }}
.alterna h2, .texto-sobre {{ max-width: 1050px; margin-inline: auto; }}
.texto-sobre {{ color: var(--suave); font-size: 1.08rem; max-width: 46rem; }}
.rasgos {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.2rem; }}
.rasgo {{ background: var(--superficie); border: 1px solid var(--linea); border-radius: 18px;
  padding: 1.5rem; transition: transform .16s; }}
.rasgo:hover {{ transform: translateY(-4px); }}
.rasgo-icono {{ font-size: 2rem; }}
.rasgo h3 {{ margin: .5rem 0 .3rem; }}
.rasgo p {{ margin: 0; color: var(--suave); font-size: .95rem; }}
.contacto {{ display: flex; gap: 1.4rem; flex-wrap: wrap; }}
.contacto-linea {{ color: var(--tinta); text-decoration: none; font-weight: 700;
  padding: .8rem 1.2rem; border: 1.5px solid var(--linea); border-radius: 14px;
  transition: border-color .15s, transform .15s; }}
.contacto-linea:hover {{ border-color: var(--acento); transform: translateY(-2px); }}
footer {{ text-align: center; color: var(--suave); padding: 2rem 1.5rem;
  border-top: 1px solid var(--linea); }}
@media (prefers-reduced-motion: reduce) {{ * {{ animation: none !important; transition: none !important; }} }}
"""

    js = """document.querySelectorAll('a[href^="#"]').forEach(function (a) {
  a.addEventListener('click', function (e) {
    var destino = document.querySelector(a.getAttribute('href'));
    if (destino) { e.preventDefault(); destino.scrollIntoView({ behavior: 'smooth' }); }
  });
});
"""

    return [
        GeneratedFile(path="index.html", content=html),
        GeneratedFile(path="styles.css", content=css),
        GeneratedFile(path="script.js", content=js),
        GeneratedFile(path="logo.svg", content=_LOGO.format(c1=c1, c2=c2, inicial=inicial)),
        GeneratedFile(path="MANUAL.md", content=_manual({**m, "arquetipo": "landing", "usuarios": []})
                      .replace("## Usuarios de prueba\n\n| Rol | Correo | Contraseña |\n|---|---|---|\n", "")),
        GeneratedFile(path="README.md", content=f"# {m['nombre']}\n\nLanding instanciada por "
                      "Meta-Agente. Ábrela con cualquier servidor estático.\n"),
    ]


# ---------------------------------------------------------------------------
def _registrar_sin_arquetipo(prompt: str, arquetipo: str, motivo: str) -> None:
    """Bitácora del círculo virtuoso: qué ideas NO calzaron y por qué."""
    try:
        ruta = _BASES_DIR.parent / "data" / "ideas_sin_arquetipo.jsonl"
        ruta.parent.mkdir(parents=True, exist_ok=True)
        with ruta.open("a", encoding="utf-8") as f:
            f.write(json.dumps({
                "fecha": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "arquetipo_sugerido": arquetipo,
                "motivo": motivo,
                "idea": prompt[:400],
            }, ensure_ascii=False) + "\n")
    except OSError:
        logger.debug("No se pudo escribir ideas_sin_arquetipo.jsonl", exc_info=True)
