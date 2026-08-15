"""Ensambla la TIENDA completa: backend, escaparate y carrito.

Reutiliza del esqueleto por dominio todo lo que no es específico de una tienda
—la paleta y el CSS base, el manifest, el service worker, el icono, el compose
y los documentos de despliegue— y las dos pantallas de cuenta (entrar y crear
cuenta), que son las mismas de siempre y ya están probadas.

Lo propio de la tienda es lo que se añade encima: la rejilla del escaparate, el
carrito y el panel del dueño.
"""

from __future__ import annotations

import html
import json
import secrets

from src.domain.dominio_tienda import DominioTienda
from src.domain.entities import GeneratedFile, GeneratedProject
from src.infrastructure.adapters import skeleton_tienda as be
from src.infrastructure.adapters import skeleton_tienda_front as fe
from src.infrastructure.adapters import skeleton_dominio_front as fe_comun
from src.infrastructure.adapters.skeleton_dominio_armar import (
    _compose,
    _configure,
    _deploy,
    _env_example,
    _icono,
    _manifest,
    _styles,
    _sw,
)
from src.infrastructure.adapters.skeleton_fullstack import MARCADOR, _infra_security


def _index_html(d: DominioTienda) -> str:
    datos = json.dumps(
        {
            "name": d.app_name,
            "rubro": d.rubro,
            "moneda": d.moneda,
            "envio": d.envio,
            "categorias": d.categorias,
            # Las pantallas de cuenta reutilizadas leen `plural` para sus textos
            # («Regístrate para gestionar tus …»). En una tienda, lo que el
            # usuario gestiona son sus pedidos.
            "plural": "pedidos",
            "demo": {"usuario": be.USUARIO_DEMO, "clave": be.CLAVE_DEMO},
        },
        ensure_ascii=False,
    ).replace("</", "<\\/")
    from src.infrastructure.adapters.skeleton_dominio_armar import _PALETAS

    acento = _PALETAS.get((d.tono or "vivo").lower(), _PALETAS["neutro"])[2]
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
    window.__TIENDA__ = {datos};
    // Las pantallas de entrar y crear cuenta se comparten con el otro
    // esqueleto y leen `window.__APP__`: se les da el mismo objeto.
    window.__APP__ = window.__TIENDA__;
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {{}});
  </script>
  <script type="module" src="static/js/app.js"></script>
</body>
</html>
"""


def _styles_tienda(d: DominioTienda) -> str:
    """El CSS base del sistema de diseño MÁS lo propio de una tienda."""
    return _styles(d.app_name, d.tono) + (
        "\n/* ---- Tienda: escaparate, carrito y panel ---- */\n"
        # Dar `display` a una clase ANULA el atributo `hidden`, que es solo una
        # regla del navegador con la misma especificidad. Sin esto, ocultar algo
        # con `.hidden = true` no lo oculta: el bloque de totales del carrito se
        # quedaba en pantalla, vacío, debajo de «tu carrito está vacío».
        "[hidden]{display:none !important}\n"
        # El ancho de la entrada (460px) es correcto para un formulario, pero
        # asfixia una rejilla de productos. Con la barra de tienda presente, la
        # página usa el ancho de verdad.
        "body:has(.barra-top) .wrap{max-width:1200px;padding-block:0}\n"
        ".barra-top{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;\n"
        "  padding:.85rem clamp(.9rem,2vw,1.4rem);margin-bottom:1.2rem;\n"
        "  background:var(--papel);border-radius:var(--r-g);box-shadow:var(--sombra);\n"
        "  position:sticky;top:0;z-index:30}\n"
        ".barra-top .marca{appearance:none;background:none;border:0;font:inherit;\n"
        "  font-size:1.15rem;font-weight:700;letter-spacing:-.015em;color:var(--tinta);\n"
        "  cursor:pointer;padding:0;flex:1;text-align:left;min-width:0}\n"
        ".barra-top nav{display:flex;gap:.15rem}\n"
        ".barra-top nav button,.barra-top .derecha button{appearance:none;background:none;\n"
        "  border:0;font:inherit;font-size:.92rem;font-weight:600;color:var(--tinta-2);\n"
        "  cursor:pointer;padding:.55rem .8rem;min-height:var(--toque);border-radius:var(--r)}\n"
        ".barra-top nav button:hover{color:var(--tinta);background:color-mix(in srgb,var(--acento) 8%,transparent)}\n"
        ".barra-top .derecha{display:flex;align-items:center;gap:.35rem}\n"
        ".barra-top .ir-carrito{color:var(--tinta);position:relative}\n"
        ".barra-top .cuenta{display:inline-grid;place-items:center;min-width:20px;height:20px;\n"
        "  padding:0 .35rem;margin-left:.35rem;border-radius:999px;background:var(--acento);\n"
        "  color:var(--papel);font-size:.72rem;font-weight:700;font-variant-numeric:tabular-nums}\n"
        ".barra-top .cuenta[hidden]{display:none}\n"
        # --- escaparate ---
        ".portada{margin:0 0 1.1rem}\n"
        ".portada h1{margin:0;font-size:clamp(1.5rem,3.5vw,2.1rem);line-height:1.15;\n"
        "  letter-spacing:-.02em;font-weight:680;color:var(--papel)}\n"
        ".portada .sub{margin:.3rem 0 0;color:color-mix(in srgb,var(--papel) 72%,transparent);\n"
        "  font-size:.95rem}\n"
        ".filtros{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin-bottom:1.1rem}\n"
        ".filtros .buscar{flex:1;min-width:200px;min-height:var(--toque);padding:.55rem .8rem;\n"
        "  border:1px solid var(--borde);border-radius:var(--r);background:var(--papel);\n"
        "  color:var(--tinta);font:inherit}\n"
        ".chips{display:flex;gap:.35rem;flex-wrap:wrap}\n"
        ".chip{appearance:none;border:1px solid var(--borde);background:var(--papel);\n"
        "  color:var(--tinta-2);border-radius:999px;padding:.4rem .85rem;min-height:36px;\n"
        "  font:inherit;font-size:.85rem;font-weight:600;cursor:pointer}\n"
        ".chip.activo{background:var(--acento);border-color:var(--acento);color:var(--papel)}\n"
        ".rejilla{display:grid;gap:.9rem;\n"
        "  grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}\n"
        ".producto{display:flex;flex-direction:column;background:var(--papel);\n"
        "  border-radius:var(--r-g);box-shadow:var(--sombra);padding:.9rem;gap:.4rem}\n"
        ".producto.agotado{opacity:.62}\n"
        # La "foto" es la inicial sobre un bloque de color: sin imágenes reales,
        # un cuadro gris vacío se lee como imagen ROTA, y esto no.
        ".producto .foto{height:120px;border-radius:var(--r);display:grid;place-items:center;\n"
        "  background:color-mix(in srgb,var(--acento) 12%,transparent);\n"
        "  color:var(--acento);font-size:2.4rem;font-weight:700}\n"
        ".producto h3{margin:.25rem 0 0;font-size:1rem;line-height:1.25;font-weight:640}\n"
        ".producto .desc{margin:0;font-size:.85rem;color:var(--tinta-2);\n"
        "  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n"
        # `margin-top:auto` pega el pie al fondo de la tarjeta; como es el
        # ultimo elemento, la fila del precio queda a la MISMA altura en toda la
        # fila de la rejilla aunque las descripciones ocupen distintas lineas.
        ".producto .pie{display:flex;align-items:center;gap:.5rem;margin-top:auto;padding-top:.5rem}\n"
        ".producto .precio{font-size:1.1rem;font-weight:700;color:var(--acento);\n"
        "  font-variant-numeric:tabular-nums;flex:1}\n"
        ".producto .add{min-height:38px;padding:.4rem .9rem;border-radius:var(--r);border:0;\n"
        "  background:var(--acento);color:var(--papel);font:inherit;font-weight:640;cursor:pointer}\n"
        ".producto .add:disabled{background:var(--linea);color:var(--tinta-2);cursor:default}\n"
        ".producto .add.hecho{background:var(--ok)}\n"
        ".producto .quedan{margin:0;font-size:.76rem;color:var(--alerta);min-height:1.1em}\n"
        ".estado{color:color-mix(in srgb,var(--papel) 78%,transparent);font-size:.95rem}\n"
        ".card .estado{color:var(--tinta-2)}\n"
        # --- carrito ---
        ".linea{display:grid;grid-template-columns:1fr auto auto auto;gap:.7rem;\n"
        "  align-items:center;padding:.7rem 0;border-bottom:1px solid var(--linea)}\n"
        ".linea .quien{display:flex;flex-direction:column;min-width:0}\n"
        ".linea .quien strong{font-weight:640;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n"
        ".linea .unit{font-size:.8rem;color:var(--tinta-2)}\n"
        ".cantidad{display:flex;align-items:center;gap:.2rem}\n"
        ".cantidad button{appearance:none;width:32px;height:32px;border:1px solid var(--borde);\n"
        "  background:var(--papel);border-radius:var(--r);font:inherit;font-size:1.1rem;\n"
        "  color:var(--tinta);cursor:pointer;line-height:1}\n"
        ".cantidad button:disabled{opacity:.4;cursor:default}\n"
        ".cantidad .n{min-width:2ch;text-align:center;font-variant-numeric:tabular-nums;\n"
        "  font-weight:640}\n"
        ".linea .importe{font-weight:700;font-variant-numeric:tabular-nums;min-width:6ch;\n"
        "  text-align:right}\n"
        ".linea .quitar{appearance:none;background:none;border:0;color:var(--tinta-2);\n"
        "  font-size:1rem;cursor:pointer;padding:.3rem}\n"
        ".linea .quitar:hover{color:var(--alerta)}\n"
        ".cuentas{margin-top:1rem;display:grid;gap:.35rem}\n"
        ".cuentas .fila{display:flex;justify-content:space-between;font-size:.95rem;\n"
        "  color:var(--tinta-2)}\n"
        ".cuentas .fila.total{margin-top:.35rem;padding-top:.6rem;border-top:1px solid var(--linea);\n"
        "  font-size:1.25rem;font-weight:700;color:var(--tinta)}\n"
        ".cuentas .fila span:last-child{font-variant-numeric:tabular-nums}\n"
        ".acciones{display:flex;gap:.6rem;margin-top:1.1rem;flex-wrap:wrap}\n"
        ".acciones .pagar{flex:1;min-height:var(--toque);border:0;border-radius:var(--r);\n"
        "  background:var(--acento);color:var(--papel);font:inherit;font-weight:660;\n"
        "  font-size:1rem;cursor:pointer}\n"
        ".acciones .pagar:disabled{opacity:.6;cursor:default}\n"
        ".vacio{color:var(--tinta-2);margin:1.2rem 0 .8rem}\n"
        ".confirmado{text-align:center;padding:1.4rem 0}\n"
        ".confirmado h2{margin:0 0 .4rem;color:var(--ok)}\n"
        ".confirmado .numero{margin:.2rem 0;color:var(--tinta-2)}\n"
        ".confirmado .cobrado{margin:.2rem 0 1rem;font-size:1.1rem;font-weight:640}\n"
        # --- pedidos ---
        ".pedido{border:1px solid var(--linea);border-radius:var(--r);padding:.85rem;\n"
        "  margin-bottom:.7rem}\n"
        ".pedido header{display:flex;gap:.7rem;align-items:baseline;flex-wrap:wrap;\n"
        "  margin-bottom:.5rem}\n"
        ".pedido header strong{font-weight:660}\n"
        ".pedido .fecha{color:var(--tinta-2);font-size:.85rem;flex:1}\n"
        ".pedido .total{font-weight:700;font-variant-numeric:tabular-nums;color:var(--acento)}\n"
        ".pedido .detalle{margin:0;padding-left:1.1rem;color:var(--tinta-2);font-size:.9rem}\n"
        ".pedido .detalle li{margin:.15rem 0}\n"
        # --- panel del dueño ---
        ".cifras{display:grid;gap:.7rem;margin:1rem 0 1.4rem;\n"
        "  grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}\n"
        ".cifra{border:1px solid var(--linea);border-radius:var(--r);padding:.7rem .9rem;\n"
        "  background:color-mix(in srgb,var(--acento) 5%,transparent)}\n"
        ".cifra .n{display:block;font-size:1.4rem;font-weight:700;color:var(--acento);\n"
        "  font-variant-numeric:tabular-nums}\n"
        ".cifra .e{display:block;font-size:.72rem;color:var(--tinta-2);\n"
        "  text-transform:uppercase;letter-spacing:.06em}\n"
        ".barra{display:flex;align-items:center;gap:.8rem;margin:1.2rem 0 .6rem}\n"
        ".barra h2{margin:0;font-size:1.05rem;flex:1}\n"
        ".barra .nuevo{min-height:38px;padding:.4rem .9rem;border:0;border-radius:var(--r);\n"
        "  background:var(--acento);color:var(--papel);font:inherit;font-weight:640;cursor:pointer}\n"
        ".fila-producto{display:grid;gap:.6rem;align-items:center;padding:.6rem 0;\n"
        "  border-bottom:1px solid var(--linea);\n"
        "  grid-template-columns:1fr auto auto auto auto}\n"
        ".fila-producto .cat,.fila-producto .stk{color:var(--tinta-2);font-size:.85rem}\n"
        ".fila-producto .pre{font-weight:640;font-variant-numeric:tabular-nums}\n"
        ".fila-producto .acc{display:flex;gap:.3rem}\n"
        ".venta{display:flex;gap:.7rem;padding:.5rem 0;border-bottom:1px solid var(--linea);\n"
        "  font-size:.9rem}\n"
        ".venta .id{font-weight:640}\n"
        ".venta .f{flex:1;color:var(--tinta-2)}\n"
        ".venta .t{font-weight:700;font-variant-numeric:tabular-nums}\n"
        ".editor{border:0;border-radius:var(--r-g);padding:1.2rem;max-width:420px;width:92vw;\n"
        "  background:var(--papel);color:var(--tinta);box-shadow:var(--sombra)}\n"
        ".editor::backdrop{background:rgba(0,0,0,.45)}\n"
        ".editor h3{margin:0 0 .8rem}\n"
        ".editor label{display:block;margin-bottom:.6rem;font-size:.85rem;font-weight:600;\n"
        "  color:var(--tinta-2)}\n"
        ".editor input{display:block;width:100%;margin-top:.25rem;min-height:var(--toque);\n"
        "  padding:.5rem .7rem;border:1px solid var(--borde);border-radius:var(--r);\n"
        "  background:var(--papel);color:var(--tinta);font:inherit}\n"
        ".editor .row{display:flex;gap:.5rem;justify-content:flex-end;margin-top:.9rem}\n"
        ".editor .guardar{min-height:var(--toque);padding:.5rem 1.1rem;border:0;\n"
        "  border-radius:var(--r);background:var(--acento);color:var(--papel);\n"
        "  font:inherit;font-weight:640;cursor:pointer}\n"
        # En pantalla estrecha la fila del panel y la del carrito se apilan: en
        # una rejilla de cinco columnas a 360px no se lee ni el nombre.
        "@media (max-width:640px){\n"
        "  .fila-producto{grid-template-columns:1fr auto}\n"
        "  .fila-producto .acc{grid-column:1/-1;justify-content:flex-end}\n"
        "  .linea{grid-template-columns:1fr auto;row-gap:.4rem}\n"
        "  .linea .importe{text-align:left}\n"
        "  .barra-top{gap:.5rem}\n"
        "  .barra-top .marca{flex:1 0 100%}\n"
        "}\n"
    )


def _dinero(moneda: str, valor: float) -> str:
    """Un importe como lo escribe la propia tienda en pantalla.

    Python agrupa los miles con coma («8,000»), que en español se lee como ocho
    con tres decimales. La aplicación ya muestra «$ 8.000»; que el manual diga
    otra cosa distinta para la MISMA cifra es justo lo que hace dudar de si el
    envío son ocho mil pesos u ocho.
    """
    return f"{moneda} {valor:,.0f}".replace(",", ".")


def _readme(d: DominioTienda) -> str:
    return (
        f"# {d.app_name}\n\n"
        f"Tienda en línea con catálogo, carrito y pedidos. "
        f"{len(d.productos)} productos en {len(d.categorias)} categoría(s).\n\n"
        "## Arrancar\n\n"
        "```bash\n"
        "pip install -r backend/requirements.txt\n"
        "uvicorn backend.main:app --reload\n"
        "```\n\n"
        "Abre http://localhost:8000\n\n"
        "## Cómo está hecho\n\n"
        "Arquitectura hexagonal: `domain/` (entidades y puertos) no sabe nada de\n"
        "FastAPI ni de SQLAlchemy; `application/` son los casos de uso; \n"
        "`infrastructure/` es lo que se puede cambiar sin tocar las reglas.\n\n"
        "**La regla que sostiene la tienda**: el precio y el total los calcula el\n"
        "servidor leyéndolos de su base de datos. El navegador solo dice qué\n"
        "producto y cuántas unidades. Un carrito que acepta el precio que le manda\n"
        "el cliente deja comprar por lo que uno quiera.\n\n"
        "El esquema se crea al arrancar y el catálogo se siembra solo la primera vez.\n"
    )


def _manual(d: DominioTienda) -> str:
    envio = _dinero(d.moneda, d.envio) if d.envio > 0 else "gratis"
    return (
        f"# Manual de {d.app_name}\n\n"
        "## Para quien compra\n\n"
        "1. Abre la dirección de la tienda. **El catálogo se ve sin registrarse.**\n"
        "2. Filtra por categoría o busca por nombre.\n"
        "3. Pulsa **Añadir** en lo que quieras. El carrito se guarda aunque\n"
        "   cierres la pestaña.\n"
        "4. En **Carrito** ajusta las cantidades y pulsa **Confirmar compra**.\n"
        "   Ahí es donde se pide la cuenta, no antes.\n"
        f"5. El envío de esta tienda es **{envio}**.\n"
        "6. En **Mis pedidos** queda el historial con lo que se pagó.\n\n"
        "## Para el dueño\n\n"
        f"Entra con el usuario `{be.ADMIN_USUARIO}` y la contraseña "
        f"`{be.ADMIN_CLAVE}`.\n\n"
        "> **Lo primero que debes hacer es cambiar esa contraseña.** Viene puesta\n"
        "> para que puedas entrar el primer día y está escrita en este manual, así\n"
        "> que cualquiera que lo lea la conoce.\n\n"
        "En **Panel** tienes:\n\n"
        "- Las cifras del negocio: pedidos, artículos vendidos, ingresos y ticket medio.\n"
        "- El catálogo completo, para añadir, editar o retirar productos y ajustar stock.\n"
        "- Las últimas ventas.\n\n"
        "## Cuenta de demostración\n\n"
        f"`{be.USUARIO_DEMO}` / `{be.CLAVE_DEMO}` es un cliente con pedidos ya hechos.\n"
        "Sirve para enseñar la tienda funcionando sin tocar las cuentas reales.\n"
    )


def construir_desde_tienda(d: DominioTienda) -> GeneratedProject:
    """Arma la tienda completa a partir del catálogo descrito."""
    d = d.sanear()
    archivos = {
        "backend/requirements.txt": be._requirements(d.motor),
        "backend/__init__.py": "",
        "backend/domain/__init__.py": "",
        "backend/domain/entities.py": be._entities(),
        "backend/domain/ports.py": be._ports(),
        "backend/application/__init__.py": "",
        "backend/application/services.py": be._services(d),
        "backend/infrastructure/__init__.py": "",
        "backend/infrastructure/db.py": be._db(),
        "backend/infrastructure/semilla.py": be._semilla(d),
        "backend/infrastructure/repositories.py": be._repositories(),
        # Clave de firma ÚNICA de esta tienda: si fuera compartida, quien viera
        # otro proyecto generado podría firmarse un token y entrar aquí.
        "backend/infrastructure/security.py": _infra_security(secrets.token_urlsafe(48)),
        "backend/infrastructure/web.py": be._web(),
        "backend/main.py": be._main(),
        "frontend/index.html": _index_html(d),
        "frontend/styles.css": _styles_tienda(d),
        "frontend/js/app.js": fe.js_app(),
        "frontend/js/api.js": fe.js_api(),
        "frontend/js/carrito.js": fe.js_carrito_estado(),
        "frontend/js/dinero.js": fe.js_dinero(),
        # Compartidas con el otro esqueleto: el token de sesión y la validación
        # de formularios no cambian porque lo que se venda sea distinto.
        "frontend/js/state.js": fe_comun.js_state(),
        "frontend/js/validacion.js": fe_comun.js_validacion(),
        "frontend/js/components/login.js": fe_comun.js_login(),
        "frontend/js/components/registro.js": fe_comun.js_registro(),
        "frontend/js/components/catalogo.js": fe.js_catalogo(),
        "frontend/js/components/carrito.js": fe.js_carrito_vista(),
        "frontend/js/components/pedidos.js": fe.js_pedidos(),
        "frontend/js/components/admin.js": fe.js_admin(),
        "README.md": _readme(d),
        "MANUAL.md": _manual(d),
        "CONFIGURE.md": _configure(d.app_name, d.motor),
        "DEPLOY.md": _deploy(d.app_name, d.motor),
        ".env.example": _env_example(d.motor, d.tabla),
        "frontend/manifest.json": _manifest(d.app_name, d.tono),
        "frontend/sw.js": _sw(),
        "frontend/icon.svg": _icono(d.app_name, d.tono),
        MARCADOR: "esqueleto de tienda v1",
    }
    if d.motor != "sqlite":
        archivos["docker-compose.yml"] = _compose(d.motor, d.tabla)

    envio = "envío gratis" if d.envio <= 0 else "envío " + _dinero(d.moneda, d.envio)
    return GeneratedProject(
        name=d.app_name,
        summary=(
            f"Tienda en línea con catálogo de {len(d.productos)} productos, "
            f"carrito, checkout y panel del dueño ({envio}). "
            "El total lo calcula el servidor. Backend hexagonal."
        ),
        files=[GeneratedFile(path=p, content=c) for p, c in archivos.items()],
        run_instructions="pip install -r backend/requirements.txt && uvicorn backend.main:app",
    )
