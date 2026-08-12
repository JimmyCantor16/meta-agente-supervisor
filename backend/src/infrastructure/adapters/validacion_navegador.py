"""Validación de RENDER con un navegador real, antes de entregar la URL.

La lección que obligó a esto ('multiplicando-aventuras'): el proyecto compilaba,
el servidor respondía 200 y aun así el usuario final veía una PÁGINA EN BLANCO
(React #31). El usuario del Meta-Agente no sabe programar: si la página no se
ve, para él el sistema mintió. Ningún chequeo HTTP detecta esa clase de fallo;
solo un navegador ejecutando el JavaScript de verdad.

Regla: URL que no renderiza NO se entrega.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

# Errores de consola que no impiden usar la página: no bloquean la entrega.
_RUIDO = ("favicon", "manifest", "sourcemap", "source map")


def playwright_disponible() -> bool:
    """True si el paquete `playwright` está importable en este entorno."""
    try:
        import playwright.sync_api  # noqa: F401
    except ImportError:
        return False
    return True


def healthcheck_navegador(timeout_s: int = 20) -> str | None:
    """Comprueba que el gate de render PUEDE funcionar en este entorno.

    Pensada para que el arranque (o un endpoint de salud) la consulte y un
    entorno mal configurado se vea ANTES de la primera entrega, no cuando ya
    se coló una página en blanco. Cubre los dos fallos de imagen reales: falta
    el paquete `playwright`, o el paquete está pero Chromium no se descargó
    (una imagen Docker reconstruida sin `playwright install`).

    Returns:
        None si Playwright y su Chromium están listos; si no, una descripción
        del fallo de configuración lista para loguear o exponer en /health.
    """
    if not playwright_disponible():
        return (
            "falta el paquete 'playwright': el gate de render está desactivado "
            "(instálalo con `pip install playwright && playwright install "
            "--with-deps chromium`)"
        )

    # La sonda corre en un hilo propio: la API síncrona de Playwright se niega
    # a ejecutarse en un hilo con event loop activo, y este healthcheck debe
    # poder llamarse también desde el arranque async de FastAPI.
    resultado: list[str | None] = [None]

    def _sonda() -> None:
        try:
            from playwright.sync_api import sync_playwright

            with sync_playwright() as p:
                ejecutable = Path(p.chromium.executable_path)
            if not ejecutable.exists():
                resultado[0] = (
                    "playwright está instalado pero su Chromium NO "
                    f"({ejecutable} no existe): el gate de render está "
                    "desactivado. Ejecuta `playwright install --with-deps "
                    "chromium` en la imagen."
                )
        except Exception as exc:  # noqa: BLE001 - un healthcheck reporta, no revienta
            resultado[0] = f"el driver de Playwright no arranca: {exc}"

    hilo = threading.Thread(target=_sonda, name="healthcheck-navegador", daemon=True)
    hilo.start()
    hilo.join(timeout=timeout_s)
    if hilo.is_alive():
        return f"el driver de Playwright no respondió en {timeout_s} s"
    return resultado[0]


def validar_render(url: str, timeout_s: int = 30) -> str | None:
    """Abre la URL en Chromium headless y comprueba que la página SE VE.

    Returns:
        None si renderiza sin errores de JavaScript; si no, una descripción
        del fallo pensada para alimentar la reparación (o para negarse
        honestamente a entregar la URL).
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        # Esto NO es un estado normal: es la ÚNICA defensa contra entregar una
        # página en blanco, y aquí está desactivada. Se grita a nivel ERROR
        # (inconfundible en cualquier monitor de logs) pero no se retiene la
        # URL: en desarrollo local sin Chromium el flujo debe seguir andando.
        # El arranque puede detectar este estado ANTES con healthcheck_navegador().
        logger.error(
            "ENTORNO MAL CONFIGURADO: falta Playwright, así que la URL se "
            "entrega SIN el gate de render (riesgo de página en blanco sin que "
            "nadie lo note). Reconstruye la imagen con `pip install playwright "
            "&& playwright install --with-deps chromium`."
        )
        return None

    errores: list[str] = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.on(
                "console",
                lambda m: errores.append(m.text) if m.type == "error" else None,
            )
            page.on("pageerror", lambda e: errores.append(str(e)))
            page.goto(url, wait_until="networkidle", timeout=timeout_s * 1000)

            # Se ESPERA a que la página se pinte, en vez de mirar una sola vez
            # tras una pausa fija. Con una pausa fija, una app recién arrancada
            # (servidor frío, contenedor ocupado) podía declararse «en blanco»
            # estando perfectamente bien, y el usuario se quedaba sin su URL por
            # una carrera de tiempos. Ahora se comprueba varias veces y solo se
            # declara vacía si sigue vacía al agotar el plazo.
            def _vacio_ahora() -> bool:
                raiz = page.locator("#root, #app")
                if raiz.count() > 0:
                    return len((raiz.first.inner_html() or "").strip()) < 40
                return len((page.inner_text("body") or "").strip()) < 20

            vacio = True
            for _ in range(12):  # hasta ~6 s, comprobando cada 500 ms
                if not _vacio_ahora():
                    vacio = False
                    break
                page.wait_for_timeout(500)
            browser.close()
    except Exception as exc:  # noqa: BLE001 - el gate no debe tumbar la generación
        return f"El navegador no pudo cargar la página: {exc}"

    graves = [e for e in errores if not any(r in e.lower() for r in _RUIDO)]
    if not graves and not vacio:
        return None

    partes: list[str] = []
    if vacio:
        partes.append(
            "La página carga (HTTP 200) pero SE VE EN BLANCO: el usuario "
            "final no vería nada."
        )
    if graves:
        partes.append(
            "Errores de JavaScript al renderizar en el navegador:\n- "
            + "\n- ".join(g[:400] for g in graves[:5])
        )
    return "\n".join(partes)
