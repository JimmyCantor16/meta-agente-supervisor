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
#: plantilla para todo.
#:
#: (fondo, papel, acento, tinta, tinta suave, línea, borde)
#:
#: `línea` y `borde` son DOS cosas distintas, y confundirlas era un defecto real:
#:   · `línea` separa bloques. Es decorativa, así que puede ser sutil.
#:   · `borde` dibuja el contorno de un CONTROL (un campo, un select). La norma
#:     de accesibilidad exige 3:1 contra el fondo, porque si no se ve el borde
#:     no se sabe dónde se puede escribir.
#: Antes ambos usaban el mismo gris clarísimo (1,22:1 a 1,43:1): los campos no
#: tenían contorno visible y la interfaz entera se veía plana y sin estructura.
#:
#: El acento de «cálido» también estaba por debajo de AA como color de texto
#: (3,56:1); se oscureció hasta 4,52:1 conservando el mismo tono de terracota.
_PALETAS = {
    "cálido": ("#2A1D16", "#F3EADE", "#9A5B28", "#2B211B", "#6B5647", "#D6C4AE", "#938475"),
    "calido": ("#2A1D16", "#F3EADE", "#9A5B28", "#2B211B", "#6B5647", "#D6C4AE", "#938475"),
    "frío": ("#0C1622", "#EEF3F7", "#1C6E8C", "#16232E", "#5A6B78", "#CBD8E2", "#818E98"),
    "frio": ("#0C1622", "#EEF3F7", "#1C6E8C", "#16232E", "#5A6B78", "#CBD8E2", "#818E98"),
    "sobrio": ("#1A1A1A", "#F4F4F2", "#4A4A48", "#1F1F1E", "#63635F", "#D8D8D3", "#8C8C89"),
    "vivo": ("#1A0F2E", "#F6F1FB", "#7A3FBF", "#241635", "#6B5E7D", "#DCCFE9", "#9487A3"),
    "neutro": ("#111827", "#F7F8FA", "#3B4CCA", "#16202B", "#55636F", "#DDE3EA", "#89919A"),
}


def _campos_js(d: DominioApp) -> str:
    """Descripción de los campos que consume el frontend para dibujarse."""
    salida = []
    for c in d.campos:
        cat = d.catalogo_de(c)
        salida.append({
            "nombre": c.nombre,
            "etiqueta": c.etiqueta,
            "tipo": c.tipo,
            "obligatorio": c.obligatorio,
            "opciones": c.opciones,
            "minimo": c.minimo,
            "maximo": c.maximo,
            "ayuda": c.ayuda,
            # El frontend referencia los catálogos por slug (así llegan de la API).
            "catalogo": cat.slug if cat else "",
        })
    return json.dumps(salida, ensure_ascii=False).replace("</", "<\\/")


def _catalogos_js(d: DominioApp) -> str:
    """Definición de los catálogos: alimenta el panel del administrador."""
    salida = [
        {
            "nombre": cat.nombre,
            "plural": cat.plural,
            "slug": cat.slug,
            # La columna que hace de nombre visible en los desplegables.
            "visible": cat.campos[0].nombre,
            "campos": [
                {
                    "nombre": c.nombre,
                    "etiqueta": c.etiqueta,
                    "tipo": c.tipo,
                    "obligatorio": c.obligatorio,
                }
                for c in cat.campos
            ],
        }
        for cat in d.catalogos
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
    acento = _PALETAS.get((d.tono or "neutro").lower(), _PALETAS["neutro"])[2]
    return f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(d.app_name)}</title>
  <link rel="stylesheet" href="static/styles.css">
  <link rel="manifest" href="manifest.json">
  <link rel="icon" type="image/svg+xml" href="static/icon.svg">
  <meta name="theme-color" content="{acento}">
</head>
<body>
  <main id="app" class="wrap"></main>
  <script type="module">
    window.__APP__ = {datos};
    window.__CAMPOS__ = {_campos_js(d)};
    window.__CATALOGOS__ = {_catalogos_js(d)};
    // La aplicación es instalable (PWA): en el teléfono queda con su icono,
    // como una app. La ruta es RELATIVA para funcionar también bajo /preview/.
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {{}});
  </script>
  <script type="module" src="static/js/app.js"></script>
</body>
</html>
"""


def _styles(d: DominioApp) -> str:
    """Todo el CSS de la aplicación generada.

    Las decisiones vienen de una revisión con jueces enfrentados, no de gusto:

    · MARCO, NO SANGRE COMPLETA. El papel flota sobre el degradado del tono. Es
      el único activo visual que el producto ya tenía; estirarlo a pantalla
      completa lo perdía y dejaba tres cremas casi iguales, sin sombra ni marco.
    · TOPE DE MEDIDA. Sin tope, en 1920 una tabla de 4 columnas reparte 400px
      por celda y el ojo pierde la fila: se lee PEOR que la columna de 680.
    · PESTAÑAS, NO BARRA LATERAL. Una barra lateral fija de 216px que para un
      usuario normal contiene UN enlace son 216px de vacío que gritan «sin
      terminar» más fuerte que el problema que venían a resolver.
    · SCROLL DEL DOCUMENTO. Nada de `height:100dvh;overflow:hidden`: eso impide
      que el navegador del móvil recoja su barra, mata el scroll de recuperación
      y encadena cuatro reglas que se rompen sin aviso si se pierde un
      `min-height:0` en cualquier punto.
    · UN SOLO SEPARADOR DE FILA. Cebra + hover + borde a la vez es la firma
      visual de phpMyAdmin. Se elige el borde y ya.
    · CABECERA PEGAJOSA CON `border-collapse:separate`. Con `collapse` el borde
      pertenece a la tabla y no a la celda: al desplazar, la línea del
      encabezado se despega y las filas pasan por debajo de una cabecera sin raya.
    """
    fondo, papel, acento, tinta, tinta2, linea, borde = _PALETAS.get(
        (d.tono or "neutro").lower(), _PALETAS["neutro"]
    )
    return (
        f"/* {d.app_name} — la paleta responde al dominio, no es una plantilla unica. */\n"
        "*{box-sizing:border-box}\n"
        ":root{\n"
        f"  --fondo:{fondo}; --papel:{papel}; --acento:{acento};\n"
        f"  --tinta:{tinta}; --tinta-2:{tinta2}; --linea:{linea}; --borde:{borde};\n"
        "  --ok:#2F7D51; --alerta:#B4541F;\n"
        "  --r:6px; --r-g:10px;\n"
        "  /* Altura minima de todo lo que se toca. 44px es el suelo tactil. */\n"
        "  --toque:44px;\n"
        "  --sombra:0 1px 2px rgba(0,0,0,.06), 0 12px 32px -12px rgba(0,0,0,.28);\n"
        "}\n"
        "html{-webkit-text-size-adjust:100%}\n"
        "body{margin:0;min-height:100vh;padding:clamp(.75rem,2.5vw,2rem);\n"
        "  background:linear-gradient(165deg,var(--fondo),#0B0B0F);\n"
        "  background-attachment:fixed;color:var(--tinta);\n"
        '  font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif;line-height:1.55;\n'
        "  -webkit-font-smoothing:antialiased}\n"
        "/* La entrada (login/registro) se queda estrecha: un formulario de dos\n"
        "   campos a 1360px seria absurdo. El panel si usa el ancho de verdad. */\n"
        ".wrap{width:100%;max-width:460px;margin:0 auto;padding-block:clamp(1rem,6vh,4rem)}\n"
        "body:has(.app) .wrap{max-width:1360px;padding-block:0}\n"
        ".app{background:var(--papel);border-radius:var(--r-g);box-shadow:var(--sombra);\n"
        "  overflow:hidden}\n"
        ".barra{display:flex;align-items:center;gap:.85rem;padding:.9rem clamp(1rem,2.5vw,1.75rem);\n"
        "  border-bottom:1px solid var(--linea);background:var(--papel);\n"
        "  position:sticky;top:0;z-index:20}\n"
        ".marca{display:flex;align-items:center;gap:.6rem;min-width:0;flex:1}\n"
        ".logo{width:30px;height:30px;flex:none;border-radius:var(--r);background:var(--acento);\n"
        "  color:var(--papel);display:grid;place-items:center;font-weight:700;font-size:.95rem}\n"
        "/* Jerarquia: el nombre del producto MANDA sobre cualquier cifra. */\n"
        ".barra h1{margin:0;font-size:1.3rem;line-height:1.2;letter-spacing:-.015em;\n"
        "  font-weight:660;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n"
        "/* Las pestanas se ocultan solas cuando solo hay una: una pestana suelta\n"
        "   es peor que ninguna. */\n"
        ".nav{display:flex;gap:.15rem;padding:0 clamp(1rem,2.5vw,1.75rem);\n"
        "  border-bottom:1px solid var(--linea);overflow-x:auto;scrollbar-width:none}\n"
        ".nav::-webkit-scrollbar{display:none}\n"
        ".nav:has(button:only-child){display:none}\n"
        ".nav-b{appearance:none;background:none;border:0;border-bottom:2px solid transparent;\n"
        "  padding:.7rem .9rem;min-height:var(--toque);font:inherit;font-size:.92rem;\n"
        "  font-weight:600;color:var(--tinta-2);cursor:pointer;white-space:nowrap}\n"
        '.nav-b[aria-current="page"]{color:var(--acento);border-bottom-color:var(--acento)}\n'
        ".nav-b:hover{color:var(--tinta)}\n"
        ".lienzo{padding:clamp(1rem,2.5vw,1.75rem)}\n"
        ".seccion[hidden]{display:none}\n"
        ".resumen{display:grid;gap:.7rem;margin-bottom:1.1rem;\n"
        "  grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}\n"
        ".dato{border:1px solid var(--linea);border-radius:var(--r);padding:.7rem .9rem;\n"
        "  background:color-mix(in srgb,var(--acento) 5%,transparent)}\n"
        ".dato .v{font-size:1.5rem;line-height:1.15;font-weight:700;\n"
        "  font-variant-numeric:tabular-nums;color:var(--acento)}\n"
        ".dato .e{font-size:.72rem;color:var(--tinta-2);text-transform:uppercase;letter-spacing:.06em}\n"
        ".herramientas{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin-bottom:.9rem}\n"
        ".buscar{position:relative;flex:1;min-width:180px}\n"
        ".buscar svg{position:absolute;left:.6rem;top:50%;transform:translateY(-50%);\n"
        "  width:16px;height:16px;color:var(--tinta-2);pointer-events:none}\n"
        ".buscar input{padding-left:2.1rem}\n"
        ".cuenta{font-size:.82rem;color:var(--tinta-2);font-variant-numeric:tabular-nums}\n"
        "/* `separate` y no `collapse`: con collapse el borde es de la TABLA y la\n"
        "   cabecera pegajosa lo pierde al desplazar. */\n"
        ".tabla-caja{overflow-x:auto;border:1px solid var(--linea);border-radius:var(--r)}\n"
        ".tabla{width:100%;border-collapse:separate;border-spacing:0;font-size:.9rem}\n"
        ".tabla th{position:sticky;top:0;z-index:5;background:var(--papel);\n"
        "  box-shadow:inset 0 -1px 0 var(--linea);text-align:left;\n"
        "  padding:.6rem .8rem;font-size:.72rem;text-transform:uppercase;\n"
        "  letter-spacing:.05em;color:var(--tinta-2);white-space:nowrap}\n"
        ".tabla th button{appearance:none;background:none;border:0;padding:0;font:inherit;\n"
        "  color:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:.3rem;\n"
        "  min-height:0;border-radius:0}\n"
        ".tabla th button:hover{color:var(--tinta);filter:none}\n"
        "/* `padding-block` y no `height`: en una celda, height es una sugerencia y\n"
        "   un valor que envuelve deja las filas desiguales. */\n"
        ".tabla td{padding:.62rem .8rem;border-top:1px solid var(--linea);\n"
        "  vertical-align:top;max-width:32ch;overflow-wrap:anywhere}\n"
        ".tabla tbody tr:first-child td{border-top:0}\n"
        ".tabla tbody tr:hover{background:color-mix(in srgb,var(--acento) 4%,transparent)}\n"
        ".tabla .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}\n"
        ".tabla .acc{width:1%;white-space:nowrap;text-align:right}\n"
        "/* `flex:none` no es adorno: en la ficha del movil la celda de acciones\n"
        "   es flex, y sin esto los botones se aplastan a 17px — la mitad del\n"
        "   suelo tactil. */\n"
        ".icono{appearance:none;background:none;border:0;cursor:pointer;color:var(--tinta-2);\n"
        "  border-radius:var(--r);width:34px;height:34px;min-height:0;padding:0;flex:none;\n"
        "  display:inline-grid;place-items:center}\n"
        ".icono:hover{background:color-mix(in srgb,var(--tinta) 8%,transparent);color:var(--tinta);\n"
        "  filter:none}\n"
        ".icono.borrar:hover{color:var(--alerta);background:color-mix(in srgb,var(--alerta) 10%,transparent)}\n"
        ".dueno{display:inline-block;font-size:.7rem;font-weight:600;padding:.1rem .45rem;\n"
        "  border-radius:20px;background:color-mix(in srgb,var(--acento) 12%,transparent);\n"
        "  color:var(--acento);white-space:nowrap}\n"
        ".badge{display:inline-block;font-size:.68rem;font-weight:700;text-transform:uppercase;\n"
        "  letter-spacing:.06em;padding:.15rem .6rem;border-radius:20px;\n"
        "  background:color-mix(in srgb,var(--acento) 12%,transparent);color:var(--acento);\n"
        "  border:1px solid color-mix(in srgb,var(--acento) 30%,transparent);white-space:nowrap}\n"
        "label{display:block;font-size:.82rem;font-weight:600;color:var(--tinta);margin:.7rem 0 .25rem}\n"
        "label .req{color:var(--alerta)}\n"
        "input,select,textarea{width:100%;min-height:var(--toque);\n"
        "  padding:.6rem .75rem;border:1px solid var(--borde);\n"
        "  border-radius:var(--r);background:#fff;color:var(--tinta);font-size:1rem;\n"
        "  font-family:inherit}\n"
        "textarea{min-height:88px;resize:vertical}\n"
        "input[type=checkbox]{width:auto;min-height:0;margin:.1rem .5rem .4rem 0;display:inline-block}\n"
        "input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--acento);\n"
        "  outline-offset:1px;border-color:var(--acento)}\n"
        ".ayuda{font-size:.76rem;color:var(--tinta-2);margin:.2rem 0 0}\n"
        ".ayuda a{color:var(--acento);font-weight:600}\n"
        ".error-campo{font-size:.78rem;color:var(--alerta);margin:.25rem 0 0;min-height:1em}\n"
        ".error-campo:empty{min-height:0;margin:0}\n"
        "input.malo,select.malo,textarea.malo{border-color:var(--alerta)}\n"
        "button{min-height:var(--toque);padding:.6rem 1.15rem;border:0;border-radius:var(--r);\n"
        "  background:var(--acento);color:#fff;font-weight:600;font-size:.95rem;\n"
        "  cursor:pointer;font-family:inherit}\n"
        "button:hover{filter:brightness(1.08)}\n"
        "button:disabled{opacity:.45;cursor:not-allowed;filter:none}\n"
        "button.ghost{background:transparent;border:1px solid var(--borde);color:var(--tinta)}\n"
        "button.small{min-height:36px;padding:.35rem .7rem;font-size:.82rem}\n"
        ".row{display:flex;gap:.6rem;margin-top:1rem}\n"
        ".row button{flex:1}\n"
        ".msg{font-size:.88rem;margin:.9rem 0 0;min-height:1.1em;color:var(--tinta-2)}\n"
        ".msg.ok{color:var(--ok)}\n"
        ".msg.error{color:var(--alerta)}\n"
        "/* Hoja lateral para crear y editar: deslizante en escritorio, hoja\n"
        "   inferior en el telefono (ahi llega el pulgar). */\n"
        ".velo{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:40;\n"
        "  opacity:0;pointer-events:none;transition:opacity .18s}\n"
        ".velo.abierto{opacity:1;pointer-events:auto}\n"
        ".hoja{position:fixed;z-index:41;background:var(--papel);display:flex;\n"
        "  flex-direction:column;box-shadow:var(--sombra);\n"
        "  top:0;right:0;height:100%;width:min(430px,100%);\n"
        "  transform:translateX(101%);transition:transform .2s ease-out}\n"
        ".hoja.abierta{transform:none}\n"
        ".hoja-cab{display:flex;align-items:center;justify-content:space-between;gap:1rem;\n"
        "  padding:1rem 1.25rem;border-bottom:1px solid var(--linea)}\n"
        ".hoja-cab h2{margin:0;font-size:1.05rem;letter-spacing:-.01em}\n"
        ".hoja-cuerpo{padding:0 1.25rem 1.25rem;overflow-y:auto;flex:1}\n"
        ".cat{border:1px solid var(--linea);border-radius:var(--r);padding:1rem;margin-bottom:1rem;\n"
        "  background:color-mix(in srgb,var(--acento) 4%,transparent)}\n"
        ".cat h2{margin:0 0 .6rem;font-size:1rem;letter-spacing:-.01em}\n"
        ".cat-lista{list-style:none;margin:0 0 .7rem;padding:0;display:grid;gap:.35rem}\n"
        ".cat-lista li{display:flex;justify-content:space-between;align-items:center;gap:.6rem;\n"
        "  font-size:.9rem;padding:.4rem .6rem;background:#fff;border:1px solid var(--linea);\n"
        "  border-radius:var(--r)}\n"
        ".cat-alta{display:flex;flex-wrap:wrap;gap:.45rem}\n"
        ".cat-alta input{flex:1;min-width:130px;width:auto}\n"
        ".cat-alta button{flex:none}\n"
        "/* El vacio es EL estado del dia de la entrega: la app se abre casi sin\n"
        "   datos. Merece tanto cuidado como la tabla llena. */\n"
        ".vacio{text-align:center;padding:2.6rem 1.25rem;color:var(--tinta-2);\n"
        "  border:1px dashed var(--borde);border-radius:var(--r)}\n"
        ".vacio h3{margin:0 0 .3rem;color:var(--tinta);font-size:1.05rem;letter-spacing:-.01em}\n"
        ".vacio p{margin:0 0 1rem;font-size:.9rem}\n"
        ".vacio button{min-width:190px}\n"
        "/* En el telefono la tabla se convierte en fichas: una tabla de 6\n"
        "   columnas a 390px no se lee, se adivina. */\n"
        "@media (max-width:720px){\n"
        "  .barra{padding:.75rem 1rem}\n"
        "  .barra h1{font-size:1.1rem}\n"
        "  .lienzo{padding:1rem}\n"
        "  .tabla-caja{border:0;border-radius:0;overflow-x:visible}\n"
        "  .tabla,.tabla tbody,.tabla tr,.tabla td{display:block;width:100%}\n"
        "  .tabla thead{display:none}\n"
        "  .tabla tbody tr{border:1px solid var(--linea);border-radius:var(--r);\n"
        "    padding:.6rem .75rem;margin-bottom:.6rem}\n"
        "  .tabla tbody tr:first-child td{border-top:0}\n"
        "  .tabla td{border:0;padding:.2rem 0;max-width:none;display:flex;gap:.6rem;\n"
        "    justify-content:space-between;align-items:baseline}\n"
        "  .tabla td::before{content:attr(data-col);font-size:.7rem;text-transform:uppercase;\n"
        "    letter-spacing:.05em;color:var(--tinta-2);flex:none}\n"
        "  .tabla td.num{text-align:left}\n"
        "  /* En el telefono los iconos crecen al suelo tactil completo. */\n"
        "  .tabla td.acc{justify-content:flex-end;gap:.4rem;padding-top:.5rem;\n"
        "    margin-top:.4rem;border-top:1px solid var(--linea)}\n"
        "  .tabla td.acc::before{display:none}\n"
        "  .icono{width:var(--toque);height:var(--toque)}\n"
        "  /* Ni los botones secundarios bajan del suelo tactil en el telefono. */\n"
        "  button.small{min-height:40px}\n"
        "  .hoja{top:auto;bottom:0;right:0;width:100%;height:min(86vh,100%);\n"
        "    border-radius:var(--r-g) var(--r-g) 0 0;transform:translateY(101%)}\n"
        "  .hoja.abierta{transform:none}\n"
        "}\n"
        "@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}\n"
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


_URL_POR_MOTOR = {
    "sqlite": "sqlite:///./app.db",
    "mysql": "mysql+pymysql://usuario:clave@localhost:3306/{base}",
    "postgres": "postgresql://usuario:clave@localhost:5432/{base}",
}


def _env_example(d: DominioApp) -> str:
    """Las variables que el proyecto lee, con un ejemplo de cada una."""
    url = _URL_POR_MOTOR[d.motor].format(base=d.tabla)
    return (
        "# Copia este archivo a `.env` y ajusta los valores.\n\n"
        "# Conexión a la base de datos. El código la lee de aquí: no hay ninguna\n"
        "# cadena escrita a mano dentro del programa.\n"
        f"DATABASE_URL={url}\n\n"
        "# Clave con la que se firman las sesiones. CÁMBIALA en producción:\n"
        "# quien la tenga puede entrar como cualquier usuario.\n"
        "SECRET_KEY=cambia-esta-clave-por-una-larga-y-aleatoria\n"
    )


def _compose(d: DominioApp) -> str:
    """Solo tiene sentido si hay un motor que levantar aparte."""
    if d.motor == "mysql":
        servicio = (
            "  base:\n"
            "    image: mysql:8.4\n"
            "    environment:\n"
            "      MYSQL_ROOT_PASSWORD: clave\n"
            "      MYSQL_USER: usuario\n"
            "      MYSQL_PASSWORD: clave\n"
            f"      MYSQL_DATABASE: {d.tabla}\n"
            "    ports: ['3306:3306']\n"
        )
        url = f"mysql+pymysql://usuario:clave@base:3306/{d.tabla}"
    else:
        servicio = (
            "  base:\n"
            "    image: postgres:16-alpine\n"
            "    environment:\n"
            "      POSTGRES_USER: usuario\n"
            "      POSTGRES_PASSWORD: clave\n"
            f"      POSTGRES_DB: {d.tabla}\n"
            "    ports: ['5432:5432']\n"
        )
        url = f"postgresql://usuario:clave@base:5432/{d.tabla}"
    return (
        "services:\n"
        "  app:\n"
        "    build: .\n"
        "    ports: ['8000:8000']\n"
        f"    environment:\n      DATABASE_URL: {url}\n"
        "    depends_on: [base]\n"
        + servicio
    )


def _configure(d: DominioApp) -> str:
    motor_legible = {"sqlite": "SQLite", "mysql": "MySQL", "postgres": "PostgreSQL"}[d.motor]
    pasos = (
        "No hay que instalar ninguna base de datos: SQLite es un archivo\n"
        "(`app.db`) que se crea solo la primera vez que arrancas.\n"
        if d.motor == "sqlite"
        else
        f"Necesitas un {motor_legible} en marcha. La forma más rápida es\n"
        "`docker compose up`, que levanta la base y la app juntas.\n\n"
        "Si ya tienes tu propio servidor, pon su dirección en `DATABASE_URL`\n"
        "dentro de `.env`. Las tablas se crean solas al arrancar.\n"
    )
    return (
        f"# Configurar {d.app_name}\n\n"
        "## 1. Las variables\n\n"
        "Copia `.env.example` a `.env`:\n\n"
        "```\ncp .env.example .env\n```\n\n"
        "- `DATABASE_URL`: dónde está la base de datos.\n"
        "- `SECRET_KEY`: **cámbiala**. Con la de ejemplo, cualquiera que la\n"
        "  conozca podría entrar como cualquier usuario.\n\n"
        f"## 2. La base de datos ({motor_legible})\n\n"
        f"{pasos}\n"
        "## 3. Arrancar\n\n"
        "```\npip install -r backend/requirements.txt\nuvicorn backend.main:app\n```\n\n"
        "Abre http://localhost:8000\n"
    )


def _deploy(d: DominioApp) -> str:
    return (
        f"# Publicar {d.app_name} en internet\n\n"
        "Pensado para alguien que no lo ha hecho nunca. Render tiene plan gratis\n"
        "y es lo más corto.\n\n"
        "## 1. Sube el código a GitHub\n\n"
        "```\ngit init -b main\ngit add .\ngit commit -m \"mi aplicación\"\n```\n\n"
        "Crea un repositorio en github.com y sigue las dos líneas que te muestra\n"
        "para enlazarlo y subirlo.\n\n"
        "## 2. Crea el servicio\n\n"
        "En https://dashboard.render.com elige **New → Web Service** y conecta tu\n"
        "repositorio. Rellena:\n\n"
        "| Campo | Valor |\n|---|---|\n"
        "| Build Command | `pip install -r backend/requirements.txt` |\n"
        "| Start Command | `uvicorn backend.main:app --host 0.0.0.0 --port $PORT` |\n\n"
        + (
            "## 3. La base de datos\n\n"
            "En Render, **New → PostgreSQL**. Copia su *Internal Database URL* y\n"
            "pégala como variable `DATABASE_URL` en tu servicio.\n\n"
            if d.motor != "sqlite"
            else
            "## 3. La base de datos\n\n"
            "No hace falta nada: SQLite viaja con la aplicación. Ten en cuenta que\n"
            "en el plan gratis el disco se borra en cada despliegue; cuando quieras\n"
            "que los datos duren, crea un PostgreSQL en Render y pon su dirección\n"
            "en `DATABASE_URL` (el código ya lo admite sin cambiar nada).\n\n"
        )
        + "## 4. La clave\n\n"
        "Añade también `SECRET_KEY` con un valor largo y aleatorio.\n\n"
        "## 5. Comprueba\n\n"
        "Abre la URL que te da Render. Debe salir la pantalla de entrar.\n"
    )


def _manifest(d: DominioApp) -> str:
    """La app es INSTALABLE (PWA): en el teléfono queda con icono propio.

    Rutas y alcance RELATIVOS a propósito: así la instalación funciona igual
    servida en la raíz que bajo el proxy `/preview/<slug>/`.
    """
    fondo, _, acento, *_ = _PALETAS.get((d.tono or "neutro").lower(), _PALETAS["neutro"])
    return json.dumps(
        {
            "name": d.app_name,
            "short_name": d.app_name[:12].strip(),
            "start_url": "./",
            "scope": "./",
            "display": "standalone",
            "background_color": fondo,
            "theme_color": acento,
            "icons": [
                # SVG: un solo icono nítido a cualquier tamaño. Chrome y Android
                # lo aceptan; es el público de la instalación.
                {"src": "static/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"},
            ],
        },
        ensure_ascii=False,
        indent=2,
    )


def _sw() -> str:
    return r'''// Service worker MINIMO: lo justo para instalar y abrir sin red.
// Los datos (/api/) van SIEMPRE a la red: una agenda vieja es peor que
// una pantalla de "sin conexion".
const CACHE = "app-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || Response.error()))
  );
});
'''


def _icono(d: DominioApp) -> str:
    """Isotipo simple: la inicial del sistema sobre su color de acento."""
    fondo, _, acento, *_ = _PALETAS.get((d.tono or "neutro").lower(), _PALETAS["neutro"])
    inicial = html.escape((d.app_name.strip() or "A")[0].upper())
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<rect width="64" height="64" rx="14" fill="{acento}"/>'
        f'<text x="32" y="43" font-family="Segoe UI,system-ui,sans-serif" font-size="34" '
        f'font-weight="700" fill="{fondo}" text-anchor="middle">{inicial}</text>'
        "</svg>"
    )


def _manual(d: DominioApp) -> str:
    campos = "\n".join(f"- **{c.etiqueta}**" for c in d.campos[:8])
    bloque_admin = ""
    if d.catalogos:
        lista_cat = "\n".join(f"- **{c.plural}**" for c in d.catalogos)
        bloque_admin = (
            "## La cuenta del dueño (administración)\n\n"
            "| Usuario | Contraseña |\n|---|---|\n| `admin` | `admin1234` |\n\n"
            "**Cámbiale la contraseña cuanto antes**: es la cuenta que manda.\n\n"
            "Al entrar como administrador ves, además de lo normal:\n\n"
            f"- Todos los {d.entidad_plural.lower()} de todos los usuarios, con el\n"
            "  nombre de quién hizo cada uno, y puedes cancelarlos.\n"
            f"- La gestión de los catálogos del negocio:\n\n{lista_cat}\n\n"
            "Lo que des de alta ahí aparece al instante en los desplegables del\n"
            "formulario. Lo que borres, deja de ofrecerse.\n\n"
        )
    else:
        # Sin catálogos también existe el admin: ve y cancela lo de todos.
        bloque_admin = (
            "## La cuenta del dueño (administración)\n\n"
            "| Usuario | Contraseña |\n|---|---|\n| `admin` | `admin1234` |\n\n"
            "**Cámbiale la contraseña cuanto antes.** Al entrar con ella ves los\n"
            f"{d.entidad_plural.lower()} de todos los usuarios y puedes cancelarlos.\n\n"
        )
    return (
        f"# Manual de {d.app_name}\n\n"
        f"Para qué sirve: llevar el registro de tus {d.entidad_plural.lower()}.\n\n"
        "## Entrar\n\n"
        "Hay dos pantallas separadas:\n\n"
        "- **Entrar** — si ya tienes cuenta.\n"
        "- **Crear cuenta** — el enlace está debajo del formulario de entrar.\n\n"
        "### Usuario de prueba\n\n"
        "| Usuario | Contraseña |\n|---|---|\n| `demo` | `demo1234` |\n\n"
        "Esa cuenta ya viene con ejemplos dentro, para que veas el sistema en uso\n"
        "sin tener que registrarte. También hay un botón **Ver una demostración**\n"
        "en la pantalla de entrar que hace lo mismo en un clic.\n\n"
        + bloque_admin +
        "## Crear tu cuenta\n\n"
        "El usuario necesita 3 caracteres o más. La contraseña, 8 o más con letras\n"
        "y números, y hay que repetirla. Si algo no cuadra, el aviso sale justo\n"
        "debajo del campo que hay que corregir y el botón no se activa hasta que\n"
        "todo esté bien.\n\n"
        f"## Registrar {d.entidad_plural.lower()}\n\n"
        f"Una vez dentro, el formulario pide:\n\n{campos}\n\n"
        "Se guardan al pulsar el botón y aparecen en la lista de abajo, con el\n"
        "resumen recalculado. Cada registro se puede borrar desde la lista.\n\n"
        "## Llévala en el teléfono\n\n"
        "La aplicación es instalable: en Chrome (computador o Android), menú →\n"
        "**Instalar aplicación**. Queda con su icono, a pantalla completa.\n\n"
        "## Tus datos son tuyos\n\n"
        f"Cada cuenta ve SOLO sus {d.entidad_plural.lower()} (salvo el administrador,\n"
        "que es el dueño del sistema).\n"
    )


def construir_desde_dominio(d: DominioApp) -> GeneratedProject:
    """Arma el proyecto completo a partir del dominio descrito."""
    d = d.sanear()
    archivos = {
        "backend/requirements.txt": _requirements(d.motor),
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
        "frontend/js/validacion.js": fe.js_validacion(),
        # Entrar y registrarse son dos pantallas separadas, cada una en su
        # archivo y con su propia dirección (#/login, #/registro).
        "frontend/js/components/login.js": fe.js_login(),
        "frontend/js/components/registro.js": fe.js_registro(),
        "frontend/js/components/board.js": fe.js_board(),
        "README.md": _readme(d),
        "MANUAL.md": _manual(d),
        "CONFIGURE.md": _configure(d),
        "DEPLOY.md": _deploy(d),
        ".env.example": _env_example(d),
        # PWA: instalable en el teléfono, con su icono. manifest y sw viven en
        # la RAÍZ (los sirve main.py) para que su alcance cubra la página.
        "frontend/manifest.json": _manifest(d),
        "frontend/sw.js": _sw(),
        "frontend/icon.svg": _icono(d),
        MARCADOR: "esqueleto por dominio v4",
    }
    # El compose solo tiene sentido si hay un motor que levantar aparte.
    if d.motor != "sqlite":
        archivos["docker-compose.yml"] = _compose(d)
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
