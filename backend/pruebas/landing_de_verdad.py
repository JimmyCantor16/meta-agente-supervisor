"""Prueba de que la LANDING sale con la forma del negocio y con un contacto que funciona.

Sin red y sin gastar cupo: el contenido lo dicta la prueba.

QUÉ DEMUESTRA
-------------
1. El contenido del modelo DEGRADA en lo accesorio (icono inventado, testimonio
   sin autor, un plan suelto) y RECHAZA lo sustancial (sin hero, < 3 servicios).
2. La página no tiene botones muertos (`href="#"`), cada enlace del menú lleva
   a una sección que existe, el WhatsApp se puede pulsar y solo se citan
   componentes DIXEL que viajan en el perfil `sitio`.
3. Las secciones salen del negocio: sin planes no hay tabla de precios, sin
   horarios no hay horarios.
4. El backend de la landing guarda el mensaje del formulario, rechaza lo
   inválido (422), ignora a los robots (campo trampa) y solo enseña los
   mensajes con la clave del dueño.
5. La forma estática (base dorada) usa el mismo diseño, sin backend.
6. El generador usa la llamada de diseño y, si falla, arma igual una landing
   con lo del clasificador — nunca se cae.

POR QUÉ EXISTE
--------------
Toda landing salía igual: hero centrado + tres párrafos numerados + un botón a
`#` cuyo texto se cortaba («Reserva tu cita ahora por What»). El usuario lo
llamó «ese modelo básico». Esta prueba impide que vuelva en silencio.

    cd backend
    python pruebas/landing_de_verdad.py
"""

from __future__ import annotations

import importlib.util
import os
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.domain.dominio_landing import DominioLanding  # noqa: E402
from src.infrastructure.adapters import dixel_assets  # noqa: E402
from src.infrastructure.adapters.skeleton_landing import (  # noqa: E402
    MARCADOR,
    archivos_landing_estatica,
    construir_landing,
    construir_landing_desde,
)

BARBERIA = {
    "nombre": "Barbería El Faro",
    "rubro": "barbería",
    "ciudad": "Medellín",
    "tono": "cálido",
    "acento": "#F2C94C",  # amarillo de marca: debe oscurecerse para leerse
    "hero": {"eyebrow": "Barbería en Laureles", "titulo": "Tu corte, a tu hora",
             "subtitulo": "Cortes clásicos y degradados con cita por WhatsApp.",
             "cta": "Reservar por WhatsApp"},
    "destacados": [{"valor": "+8", "etiqueta": "años"}, {"valor": "4.9/5", "etiqueta": "en Google"}],
    "servicios": [
        {"nombre": "Corte clásico", "descripcion": "Tijera y máquina.", "precio": 30000, "icono": "tijeras"},
        {"nombre": "Barba", "descripcion": "Toalla caliente.", "precio": "25000", "icono": "unicornio"},
        {"nombre": "Combo", "precio": "Desde 50.000"},
        {"descripcion": "sin nombre: se descarta"},
    ],
    "planes": [{"nombre": "Mensual", "precio": 90000, "incluye": ["4 cortes"]}],
    "horarios": [{"dia": "Lunes a sábado", "horas": "9:00 – 20:00"}],
    "testimonios": [{"texto": "Excelente", "autor": "Juan P."}, {"texto": "sin autor"}],
    "faq": [{"pregunta": "¿Hay parqueadero?", "respuesta": "Sí, en la esquina."}],
    "contacto": {"whatsapp": "311 555 1234", "email": "hola@elfaro.co", "direccion": "Cra 70 #44-20"},
    "cta_final": {"titulo": "¿Te agendamos?", "texto": "Escríbenos y listo."},
}


def _html_de(proyecto) -> str:
    return next(f.content for f in proyecto.files if f.path == "frontend/index.html")


def comprobar_pagina(html: str, *, con_planes: bool) -> None:
    assert 'href="#"' not in html, "hay un botón que no lleva a ninguna parte"
    ids = set(re.findall(r'\bid="([^"]+)"', html))
    for destino in re.findall(r'href="#([^"]+)"', html):
        assert destino in ids, f"el enlace #{destino} no tiene sección"
    citadas = set(re.findall(r'data-dx="(\w+)"', html))
    sobran = citadas - dixel_assets.clases_disponibles(dixel_assets.PERFIL_SITIO)
    assert citadas and not sobran, f"componentes DIXEL que no viajan: {sobran}"
    assert ("id=\"planes\"" in html) == con_planes
    assert "<script" in html and "app.js" in html


def main() -> int:
    # 1) Degrada lo accesorio, rechaza lo sustancial
    d = DominioLanding.model_validate(BARBERIA)
    assert [s.nombre for s in d.servicios] == ["Corte clásico", "Barba", "Combo", "Mensual"], d.servicios
    assert d.servicios[0].precio == "$30.000" and d.servicios[2].precio == "Desde 50.000"
    assert d.servicios[1].icono == "estrella", "un icono inventado debe caer a 'estrella'"
    assert not d.planes, "un solo plan no es tabla de precios: pasa a servicio"
    assert len(d.testimonios) == 1, "el testimonio sin autor se descarta"
    assert d.whatsapp_digitos == "573115551234"
    assert d.construible and d.faltante() is None
    assert DominioLanding.model_validate({"nombre": "X", "servicios": BARBERIA["servicios"]}).faltante()
    assert DominioLanding.model_validate({**BARBERIA, "planes": [], "servicios": BARBERIA["servicios"][:2]}).faltante()
    largo = DominioLanding.model_validate({**BARBERIA, "hero": {"titulo": "t", "cta": "Reserva tu cita ahora por WhatsApp hoy mismo"}})
    assert not largo.hero.cta.endswith("What"), "el CTA se corta en una palabra entera"
    print("1. lo accesorio degrada y lo sustancial se rechaza ✓")

    # 2-3) La página
    proyecto = construir_landing_desde(d)
    rutas = {f.path for f in proyecto.files}
    for r in ("backend/main.py", "frontend/index.html", "frontend/styles.css", "frontend/app.js",
              "frontend/vendor/dixel.js", MARCADOR):
        assert r in rutas, f"falta {r}"
    html = _html_de(proyecto)
    comprobar_pagina(html, con_planes=False)
    assert "https://wa.me/573115551234" in html, "el WhatsApp debe poderse pulsar"
    assert 'data-endpoint="api/contacto"' in html, "el formulario debe ir al backend"
    assert 'id="horarios"' in html and 'id="preguntas"' in html and 'id="opiniones"' in html
    assert "Barbería El Faro" in html and "$30.000" in html
    css = next(f.content for f in proyecto.files if f.path == "frontend/styles.css")
    assert "--acc:#F2C94C" not in css, "un acento claro debe oscurecerse para leerse"
    con_planes = construir_landing_desde(DominioLanding.model_validate({
        **BARBERIA, "planes": [{"nombre": "Básico", "precio": 1}, {"nombre": "Pro", "precio": 2}]}))
    comprobar_pagina(_html_de(con_planes), con_planes=True)
    sin_horarios = _html_de(construir_landing_desde(DominioLanding.model_validate({**BARBERIA, "horarios": []})))
    assert 'id="horarios"' not in sin_horarios
    print("2-3. sin botones muertos, menú coherente, DIXEL válido y secciones del negocio ✓")

    # 4) El backend recibe el formulario de verdad
    with tempfile.TemporaryDirectory() as tmp:
        for f in proyecto.files:
            destino = Path(tmp) / f.path
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(f.content, encoding="utf-8")
        os.environ["CONTACTO_DB"] = str(Path(tmp) / "data" / "c.db")
        os.environ.pop("CLAVE_ADMIN", None)
        spec = importlib.util.spec_from_file_location("landing_main", Path(tmp) / "backend" / "main.py")
        modulo = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(modulo)
        from fastapi.testclient import TestClient

        c = TestClient(modulo.app)
        assert c.get("/").status_code == 200
        assert c.get("/static/app.js").status_code == 200
        bueno = {"nombre": "Laura", "contacto": "laura@correo.co", "mensaje": "¿Tienen cupo el sábado?"}
        assert c.post("/api/contacto", json=bueno).status_code == 201
        assert c.post("/api/contacto", json={**bueno, "contacto": "laura@"}).status_code == 422
        assert c.post("/api/contacto", json={**bueno, "mensaje": "hola"}).status_code == 422
        assert c.post("/api/contacto", json={**bueno, "web": "spam.example"}).status_code == 201
        assert c.get("/api/mensajes").status_code == 404, "sin CLAVE_ADMIN la lista no existe"
        os.environ["CLAVE_ADMIN"] = "secreta"
        assert c.get("/api/mensajes", headers={"X-Clave-Admin": "otra"}).status_code == 401
        datos = c.get("/api/mensajes", headers={"X-Clave-Admin": "secreta"}).json()
        assert datos["total"] == 1, f"se esperaba 1 mensaje (el robot no cuenta): {datos}"
        os.environ.pop("CLAVE_ADMIN", None)
        os.environ.pop("CONTACTO_DB", None)
    print("4. el formulario guarda, valida, ignora robots y protege la lista ✓")

    # 5) Forma estática (base dorada)
    estatica = archivos_landing_estatica(d)
    assert "index.html" in estatica and "vendor/dixel.js" in estatica
    assert "data-endpoint" not in estatica["index.html"] and 'data-whatsapp="573115551234"' in estatica["index.html"]
    from src.infrastructure.adapters.instanciador_bases import _instanciar_landing

    base = _instanciar_landing({
        "nombre": "Yoga Luna", "descripcion": "Yoga en Chapinero.", "tema": "calido",
        "hero": {"titulo": "Respira", "cta": "Reserva"},
        "caracteristicas": [{"icono": "🧘", "titulo": "Hatha", "texto": "Suave"}],
        "contacto": {"email": "hola@luna.co"},
    })
    html_base = next(f.content for f in base if f.path == "index.html")
    assert 'class="tarjeta"' in html_base and "🧘" not in html_base and 'href="#"' not in html_base
    print("5. la base dorada estática usa el mismo diseño ✓")

    # 6) El generador: diseño dedicado, y red de seguridad si falla
    from src.infrastructure.adapters import skeleton_generator as sg

    class LLMFalso:
        def __init__(self, respuestas):
            self.respuestas = list(respuestas)

        def chat_json(self, system, user, temperature=0.2, validar=None):
            r = self.respuestas.pop(0)
            if isinstance(r, Exception):
                raise r
            if validar:
                validar(r)
            return r

    gen = sg.SkeletonProjectGenerator.__new__(sg.SkeletonProjectGenerator)
    gen._fallback = None
    gen._llm = LLMFalso([{"tipo": "landing", "title": "Clasif"}, BARBERIA])
    p = gen.generate("Landing para una barbería en Medellín")
    assert p.name == "Barbería El Faro" and "id=\"horarios\"" in _html_de(p)
    gen._llm = LLMFalso([{"tipo": "landing", "title": "Café Sol", "tagline": "Café de origen",
                          "sections": [{"heading": "Tostión", "text": "Propia"}]}, RuntimeError("sin cupo")])
    p = gen.generate("Landing para un café")
    html = _html_de(p)
    assert p.name == "Café Sol" and "Tostión" in html and 'href="#"' not in html
    assert construir_landing("", "", "", []).name, "la red de seguridad nunca se cae"
    print("6. el generador diseña la landing y, si falla, no se cae ✓")

    print("\nTODO CORRECTO: la landing sale con la forma del negocio y su contacto funciona.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
