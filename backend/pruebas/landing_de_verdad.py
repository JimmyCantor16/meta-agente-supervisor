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

    # 7) Reservas en línea: huecos reales, sin doble reserva, cancelación y agenda del dueño
    from datetime import date, timedelta

    con_agenda = DominioLanding.model_validate({
        **BARBERIA, "reservas": True, "planes": [],
        "servicios": [{"nombre": "Corte", "precio": 30000, "duracion": 45},
                      {"nombre": "Barba", "precio": 25000, "duracion": "30 min"},
                      {"nombre": "Combo", "precio": 50000}],
        "profesionales": [{"nombre": "Julián Prada", "especialidad": "Fades"},
                          {"nombre": "Camilo Ruiz", "especialidad": "Barba"}],
        "agenda": {"dias": [0, 1, 2, 3, 4, 5, 6], "apertura": "9:00", "cierre": "12:00", "intervalo": 30},
    })
    assert [s.duracion for s in con_agenda.servicios] == [45, 30, 30], "sin duración = 30 min"
    p_agenda = construir_landing_desde(con_agenda)
    rutas = {f.path for f in p_agenda.files}
    for r in ("frontend/reservar.html", "frontend/reservar.js", "frontend/reservar.css", "backend/negocio.json"):
        assert r in rutas, f"falta {r}"
    html_ag = _html_de(p_agenda)
    assert 'href="reservar"' in html_ag and 'href="reservar?servicio=s1"' in html_ag, "el CTA y cada servicio llevan a reservar"
    assert "reservar.html" not in str(archivos_landing_estatica(con_agenda).keys()), "sin backend no hay agenda"
    assert "frontend/reservar.html" not in {f.path for f in proyecto.files}, "sin 'reservas' no hay agenda"
    with tempfile.TemporaryDirectory() as tmp:
        for f in p_agenda.files:
            destino = Path(tmp) / f.path
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(f.content, encoding="utf-8")
        os.environ["CONTACTO_DB"] = str(Path(tmp) / "data" / "c.db")
        os.environ["RESERVAS_EJEMPLO"] = "no"  # esta parte cuenta huecos: agenda vacía
        for k in ("CLAVE_ADMIN", "GOOGLE_CLIENT_ID", "SMTP_USER", "SMTP_PASSWORD"):
            os.environ.pop(k, None)
        spec = importlib.util.spec_from_file_location("landing_agenda", Path(tmp) / "backend" / "main.py")
        modulo = importlib.util.module_from_spec(spec)
        sys.modules["landing_agenda"] = modulo  # como al arrancar con uvicorn: los tipos se resuelven
        spec.loader.exec_module(modulo)
        from fastapi.testclient import TestClient

        c = TestClient(modulo.app)
        assert c.get("/reservar").status_code == 200 and c.get("/static/reservar.js").status_code == 200
        n = c.get("/api/negocio").json()
        assert len(n["servicios"]) == 3 and len(n["profesionales"]) == 2 and n["google_client_id"] == ""
        manana = (date.today() + timedelta(days=2)).isoformat()
        horas = c.get("/api/disponibilidad", params={"servicio": "s1", "fecha": manana, "profesional": "p1"}).json()["horas"]
        assert horas == ["09:00", "09:30", "10:00", "10:30", "11:00"], horas  # 45 min deben caber antes de las 12
        cita = {"servicio": "s1", "profesional": "p1", "fecha": manana, "hora": "09:00",
                "nombre": "Laura Gómez", "email": "laura@correo.co", "telefono": "3001234567"}
        r = c.post("/api/reservas", json=cita)
        assert r.status_code == 201, r.text
        hecha = r.json()
        assert hecha["codigo"].startswith("R-") and hecha["profesional"] == "Julián Prada"
        assert hecha["correo"] == "sin_configurar" and "calendar.google.com" in hecha["calendario"]
        assert c.post("/api/reservas", json=cita).status_code == 409, "la misma hora no se reserva dos veces"
        assert c.post("/api/reservas", json={**cita, "hora": "09:30"}).status_code == 409, "se solapa con la de 9:00 (45 min)"
        libres = c.get("/api/disponibilidad", params={"servicio": "s1", "fecha": manana, "profesional": "p1"}).json()["horas"]
        assert "09:00" not in libres and "09:30" not in libres and "10:00" in libres
        cualquiera = c.post("/api/reservas", json={**cita, "profesional": ""}).json()
        assert cualquiera["profesional"] == "Camilo Ruiz", "«cualquiera» asigna al que esté libre"
        assert c.post("/api/reservas", json={**cita, "email": "malo"}).status_code == 422
        assert c.post("/api/reservas", json={**cita, "servicio": "s9"}).status_code == 404
        pasado = (date.today() - timedelta(days=1)).isoformat()
        assert c.post("/api/reservas", json={**cita, "fecha": pasado}).status_code == 409, "no se reserva en el pasado"
        assert c.post("/api/reservas", json={**cita, "credencial_google": "x"}).status_code == 400, "Google apagado = 400"
        assert c.post(f"/api/reservas/{hecha['codigo']}/cancelar", json={"email": "otro@x.co"}).status_code == 404
        assert c.post(f"/api/reservas/{hecha['codigo']}/cancelar", json={"email": "LAURA@correo.co"}).status_code == 200
        assert c.post("/api/reservas", json=cita).status_code == 201, "la hora cancelada se libera"
        assert c.get("/api/reservas").status_code == 404
        os.environ["CLAVE_ADMIN"] = "secreta"
        agenda = c.get("/api/reservas", headers={"X-Clave-Admin": "secreta"}).json()
        assert agenda["total"] == 3 and {x["estado"] for x in agenda["reservas"]} == {"confirmada", "cancelada"}
        os.environ.pop("CLAVE_ADMIN", None)
        os.environ.pop("CONTACTO_DB", None)
        os.environ.pop("RESERVAS_EJEMPLO", None)
    print("7. reservas: huecos reales, sin doble cita, «cualquiera», cancelación y agenda del dueño ✓")

    # 8) Panel del dueño: clave, agenda, cobros, resumen, clientes y ejemplos
    for r in ("frontend/panel.html", "frontend/panel.js", "frontend/panel.css"):
        assert r in rutas, f"falta {r}"
    assert 'href="panel"' in html_ag, "el pie lleva al panel del negocio"
    with tempfile.TemporaryDirectory() as tmp:
        for f in p_agenda.files:
            destino = Path(tmp) / f.path
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(f.content, encoding="utf-8")
        os.environ["CONTACTO_DB"] = str(Path(tmp) / "data" / "c.db")
        for k in ("CLAVE_ADMIN", "RESERVAS_EJEMPLO"):
            os.environ.pop(k, None)

        def arrancar(nombre):
            spec = importlib.util.spec_from_file_location(nombre, Path(tmp) / "backend" / "main.py")
            mod = importlib.util.module_from_spec(spec)
            sys.modules[nombre] = mod
            spec.loader.exec_module(mod)
            return TestClient(mod.app)

        c = arrancar("landing_panel")
        assert c.get("/panel").status_code == 200 and c.get("/static/panel.js").status_code == 200
        assert c.get("/api/panel/agenda").status_code == 401, "sin sesión no se ve la agenda"
        assert c.get("/api/panel/estado").json()["configurado"] is False
        assert c.post("/api/panel/crear", json={"clave": "corta"}).status_code == 422
        token = c.post("/api/panel/crear", json={"clave": "barberia2026"}).json()["token"]
        assert c.post("/api/panel/crear", json={"clave": "otraclave99"}).status_code == 409, "la clave se fija UNA vez"
        assert c.post("/api/panel/entrar", json={"clave": "mala-clave"}).status_code == 401
        assert c.post("/api/panel/entrar", json={"clave": "barberia2026"}).status_code == 200
        H = {"Authorization": f"Bearer {token}"}
        assert c.get("/api/panel/agenda", headers={"Authorization": "Bearer inventado"}).status_code == 401

        res = c.get("/api/panel/resumen", headers=H).json()
        assert res["hay_ejemplos"] and res["ingresos_mes"] >= 0 and len(res["serie"]) == 14
        clientes = c.get("/api/panel/clientes", headers=H).json()
        assert clientes["total"] >= 5, "la agenda arranca con clientes de ejemplo"
        assert c.get("/api/panel/clientes", params={"q": "zzz-nadie"}, headers=H).json()["total"] == 0

        manana = (date.today() + timedelta(days=3)).isoformat()
        cita = {"servicio": "s1", "profesional": "p2", "fecha": manana, "hora": "11:00",
                "nombre": "Pedro Páramo", "email": "pedro@correo.co", "telefono": "3015550000"}
        hecha = c.post("/api/reservas", json=cita)
        assert hecha.status_code == 201, hecha.text
        codigo = hecha.json()["codigo"]
        dia = c.get("/api/panel/agenda", params={"fecha": manana}, headers=H).json()
        mia = next(x for x in dia["citas"] if x["codigo"] == codigo)
        assert mia["estado"] == "confirmada" and mia["precio"] == 30000 and dia["esperado"] >= 30000
        url = f"/api/panel/reservas/{codigo}/estado"
        assert c.post(url, json={"estado": "volando"}, headers=H).status_code == 422
        assert c.post(url, json={"estado": "atendida", "pago": "bitcoin"}, headers=H).status_code == 422
        hecho = c.post(url, json={"estado": "atendida", "pago": "nequi"}, headers=H).json()
        assert hecho["cobrado"] == 30000 and hecho["pago"] == "nequi", "atendida cobra el precio del SERVIDOR"
        assert c.post("/api/reservas", json={**cita, "email": "otra@x.co"}).status_code == 409, "atendida sigue ocupando"
        assert c.post(url, json={"estado": "cancelada"}, headers=H).json()["cobrado"] == 0
        otra = c.post("/api/reservas", json={**cita, "email": "otra@x.co"})
        assert otra.status_code == 201, "cancelar desde el panel libera la hora"
        assert c.post(url, json={"estado": "confirmada"}, headers=H).status_code == 409, "reactivar no pisa otra cita"
        assert c.post("/api/panel/ejemplos/borrar", headers=H).json()["borradas"] > 0
        assert c.get("/api/panel/resumen", headers=H).json()["hay_ejemplos"] is False

        c2 = arrancar("landing_panel_2")  # reinicio del proceso con la MISMA base
        assert not c2.get("/api/panel/resumen", headers=H).json()["hay_ejemplos"], "los ejemplos borrados no vuelven"
        os.environ["CLAVE_ADMIN"] = "clave-fija-123"
        assert c2.post("/api/panel/entrar", json={"clave": "clave-fija-123"}).status_code == 200, "CLAVE_ADMIN manda"
        assert c2.post("/api/panel/entrar", json={"clave": "barberia2026"}).status_code == 401
        os.environ.pop("CLAVE_ADMIN", None)
        os.environ.pop("CONTACTO_DB", None)

    # El generador: un negocio con CITA sale con web + reservas + panel, no con una tabla
    assert sg.es_negocio_con_cita({"dominio": {"entidad": "Cita"}},
                                  "sistema de información para una barbería al estilo weibook")
    assert sg.es_negocio_con_cita({}, "app para reservar turnos en mi spa")
    assert not sg.es_negocio_con_cita({"dominio": {"entidad": "Gasto"}}, "control de gastos de mi barbería")
    assert not sg.es_negocio_con_cita({"dominio": {"entidad": "Cita"}},
                                      "citas de mi consultorio, solo para uso interno")
    assert not sg.es_negocio_con_cita({"dominio": {"entidad": "Cita"}}, "agenda de citas de mis clientes de abogacía")
    clasif = {"tipo": "crud_login", "dominio": {
        "app_name": "Naudi", "entidad": "Cita", "entidad_plural": "Citas",
        "campos": [{"nombre": "cliente", "etiqueta": "Cliente", "tipo": "texto", "obligatorio": True},
                   {"nombre": "fecha", "etiqueta": "Fecha", "tipo": "fecha", "obligatorio": True}],
        "catalogos": [{"nombre": "Barbero", "plural": "Barberos",
                       "campos": [{"nombre": "nombre", "etiqueta": "Nombre", "tipo": "texto", "obligatorio": True},
                                  {"nombre": "especialidades", "etiqueta": "Especialidades", "tipo": "texto"}],
                       "ejemplos": [{"nombre": "Naudi Peña", "especialidades": "Fades"}, {"nombre": "Kevin Muñoz"}]},
                      {"nombre": "Servicio", "plural": "Servicios",
                       "campos": [{"nombre": "nombre", "etiqueta": "Servicio", "tipo": "texto", "obligatorio": True}],
                       "ejemplos": [{"nombre": "Corte"}, {"nombre": "Barba"}]}]}}
    sin_pros = {k: v for k, v in BARBERIA.items() if k != "profesionales"}
    gen._llm = LLMFalso([clasif, sin_pros])
    p = gen.generate("Sistema completo para una barbería con reservas como weibook")
    rutas_gen = {f.path for f in p.files}
    assert "frontend/panel.html" in rutas_gen and "frontend/reservar.html" in rutas_gen, sorted(rutas_gen)
    negocio = next(f.content for f in p.files if f.path == "backend/negocio.json")
    assert "Naudi Peña" in negocio and "Fades" in negocio, "los profesionales salen del catálogo del clasificador"
    from src.domain.entities import slugify
    from src.infrastructure.adapters.render_deploy import _nombre_servicio

    assert slugify("Barbería Urban Style") == "barberia-urban-style", "sin «barber-a» en la URL"
    assert _nombre_servicio("Ñandú Spa") == "nandu-spa"
    print("8. panel del dueño (clave, agenda, cobros, resumen, clientes) y negocio con cita = web + panel ✓")

    print("\nTODO CORRECTO: la landing sale con la forma del negocio y su contacto funciona.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
