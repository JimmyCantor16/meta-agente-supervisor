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

logger = logging.getLogger(__name__)

# Errores de consola que no impiden usar la página: no bloquean la entrega.
_RUIDO = ("favicon", "manifest", "sourcemap", "source map")


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
        # Sin Playwright instalado el sistema sigue funcionando, pero avisa:
        # está entregando URLs sin la garantía de render.
        logger.warning(
            "Playwright no está disponible: la URL se entrega SIN validar el "
            "render (instala playwright + chromium en la imagen para el gate)."
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
