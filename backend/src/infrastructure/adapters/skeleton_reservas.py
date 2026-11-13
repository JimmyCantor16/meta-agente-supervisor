"""Reservas en línea para la landing de un negocio que trabaja con CITA.

Por qué existe
--------------
Para una barbería, un spa o un consultorio, «escríbenos por WhatsApp» no es
una landing profesional: el cliente quiere ver los servicios con su precio y
duración, elegir con quién, ver los huecos REALES de un día y salir con la cita
confirmada (como Zyncra o Weibook). Eso es lo que arma este módulo:

- `negocio.json`: servicios (con duración), profesionales y agenda.
- Bloque de backend (se inserta en el `main.py` de la landing):
  `GET /api/negocio`, `GET /api/disponibilidad`, `POST /api/reservas`,
  `POST /api/reservas/{codigo}/cancelar`, `GET /api/reservas` (dueño) y la
  página `/reservar`.
- `reservar.html` + `reservar.js` + `reservar.css`: asistente de 4 pasos
  (servicio → profesional → fecha y hora → tus datos) y la confirmación.

Reglas que no se negocian
-------------------------
- **El hueco lo decide el SERVIDOR**, bajo candado y releyendo la base: dos
  personas que pulsan la misma hora a la vez no quedan las dos citadas (la
  segunda recibe 409 y elige otra). El navegador solo propone.
- **Google y Gmail se encienden por entorno** (`GOOGLE_CLIENT_ID`,
  `SMTP_USER` + `SMTP_PASSWORD`). Sin ellos la reserva funciona igual con
  nombre y correo, y el aviso queda registrado en el log en vez de enviarse:
  nunca se rompe una cita porque falte una credencial.
- El token de Google se verifica en el servidor contra `GOOGLE_CLIENT_ID`
  (audiencia y correo verificado); el nombre y el correo salen de Google, no
  de lo que mande el navegador.
"""

from __future__ import annotations

import html
import json

from src.domain.dominio_landing import DominioLanding

_UI = {
    "es": {
        "titulo": "Reserva tu cita", "abierta": "Agenda abierta · Confirmación inmediata",
        "volver": "Volver al inicio", "paso": "Paso {n} de {t}",
        "p1": "Servicio", "p2": "Profesional", "p3": "Fecha y hora", "p4": "Tus datos",
        "q1": "¿Qué servicio necesitas?", "buscar": "Buscar servicio…",
        "q2": "¿Con quién quieres tu cita?", "cualquiera": "Cualquiera disponible",
        "cualquiera_sub": "Te asignamos a quien esté libre a esa hora",
        "q3": "Elige el día y la hora", "manana": "Mañana", "tarde": "Tarde", "noche": "Noche",
        "sin_huecos": "No quedan horarios este día. Prueba con otro.", "cargando": "Buscando horarios…",
        "cerrado": "Cerrado",
        "q4": "Confirma tus datos", "google_o": "o con tus datos",
        "conectado": "Conectado con Google como", "cambiar": "Usar otros datos",
        "nombre": "Nombre completo", "email": "Correo electrónico", "telefono": "Celular (opcional)",
        "nota": "¿Algo que debamos saber? (opcional)",
        "e_nombre": "Escribe tu nombre (mínimo 2 letras).", "e_email": "Escribe un correo válido.",
        "e_telefono": "El celular debe tener al menos 7 dígitos.",
        "continuar": "Continuar", "confirmar": "Confirmar reserva", "confirmando": "Confirmando…",
        "atras": "Atrás", "resumen_servicio": "Servicio", "resumen_vacio": "Elige un servicio",
        "listo": "¡Tu cita está confirmada!", "codigo": "Código de reserva",
        "correo_ok": "Te enviamos la confirmación a", "correo_no": "Guarda este código: lo necesitas para cambiar o cancelar.",
        "calendario": "Añadir a Google Calendar", "whatsapp": "Escribir al negocio",
        "otra": "Hacer otra reserva", "cancelar": "Cancelar esta cita", "cancelada": "Tu cita quedó cancelada.",
        "inicio": "Volver al inicio",
        "ocupado": "Esa hora se acaba de ocupar. Elige otra, por favor.",
        "fallo": "No pudimos confirmar la reserva. Inténtalo de nuevo.",
        "min": "min", "con": "con", "equipo": "Nuestro equipo",
    },
    "en": {
        "titulo": "Book your appointment", "abierta": "Open schedule · Instant confirmation",
        "volver": "Back to home", "paso": "Step {n} of {t}",
        "p1": "Service", "p2": "Professional", "p3": "Date & time", "p4": "Your details",
        "q1": "What service do you need?", "buscar": "Search service…",
        "q2": "Who would you like to book with?", "cualquiera": "Anyone available",
        "cualquiera_sub": "We'll assign whoever is free at that time",
        "q3": "Pick a day and time", "manana": "Morning", "tarde": "Afternoon", "noche": "Evening",
        "sin_huecos": "No times left on this day. Try another one.", "cargando": "Looking for times…",
        "cerrado": "Closed",
        "q4": "Confirm your details", "google_o": "or with your details",
        "conectado": "Signed in with Google as", "cambiar": "Use other details",
        "nombre": "Full name", "email": "Email", "telefono": "Mobile (optional)",
        "nota": "Anything we should know? (optional)",
        "e_nombre": "Enter your name (at least 2 letters).", "e_email": "Enter a valid email.",
        "e_telefono": "The phone must have at least 7 digits.",
        "continuar": "Continue", "confirmar": "Confirm booking", "confirmando": "Confirming…",
        "atras": "Back", "resumen_servicio": "Service", "resumen_vacio": "Pick a service",
        "listo": "Your appointment is confirmed!", "codigo": "Booking code",
        "correo_ok": "We sent the confirmation to", "correo_no": "Keep this code: you need it to change or cancel.",
        "calendario": "Add to Google Calendar", "whatsapp": "Message the business",
        "otra": "Book another", "cancelar": "Cancel this appointment", "cancelada": "Your appointment was cancelled.",
        "inicio": "Back to home",
        "ocupado": "That time was just taken. Please pick another.",
        "fallo": "We couldn't confirm the booking. Please try again.",
        "min": "min", "con": "with", "equipo": "Our team",
    },
}


def textos(idioma: str) -> dict:
    return _UI.get(idioma, _UI["es"])


def _e(texto: str) -> str:
    return html.escape(str(texto or ""), quote=True)


# ---------------------------------------------------------------------------
# Datos del negocio (lo que lee el backend)
# ---------------------------------------------------------------------------
def negocio_json(d: DominioLanding, idioma: str = "es") -> str:
    t = textos(idioma)
    servicios = [
        {"id": f"s{i}", "nombre": s.nombre, "descripcion": s.descripcion, "precio": s.precio,
         "duracion": s.duracion or 30}
        for i, s in enumerate(d.servicios, 1)
    ]
    pros = [{"id": f"p{i}", "nombre": p.nombre, "especialidad": p.especialidad}
            for i, p in enumerate(d.profesionales, 1)]
    if not pros:
        pros = [{"id": "p1", "nombre": t["equipo"], "especialidad": d.nombre}]
    return json.dumps({
        "nombre": d.nombre,
        "email": d.contacto.email,
        "whatsapp": d.whatsapp_digitos,
        "direccion": ", ".join(x for x in (d.contacto.direccion, d.ciudad) if x),
        # Colombia no cambia de hora; otro país se ajusta con ZONA_HORARIA_HORAS.
        "zona_horas": -5,
        "dias_adelante": 30,
        "servicios": servicios,
        "profesionales": pros,
        "agenda": d.agenda.model_dump(),
    }, ensure_ascii=False, indent=2) + "\n"


# ---------------------------------------------------------------------------
# Backend: se inserta en main.py antes de montar los estáticos
# ---------------------------------------------------------------------------
BACKEND = r'''

# ===========================================================================
# Reservas en línea
# ===========================================================================
import json as _json
import logging
import smtplib
import urllib.parse
import urllib.request
from datetime import date as _date, timedelta
from email.message import EmailMessage
from typing import Optional

_log = logging.getLogger("reservas")
_NEGOCIO = _json.loads((Path(__file__).resolve().parent / "negocio.json").read_text(encoding="utf-8"))
_SERVICIOS = {s["id"]: s for s in _NEGOCIO["servicios"]}
_PROS = {p["id"]: p for p in _NEGOCIO["profesionales"]}
_AG = _NEGOCIO["agenda"]
_HORA = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _zona() -> timezone:
    horas = float(os.environ.get("ZONA_HORARIA_HORAS", _NEGOCIO.get("zona_horas", -5)))
    return timezone(timedelta(hours=horas))


def _min(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _hhmm(minutos: int) -> str:
    return f"{minutos // 60:02d}:{minutos % 60:02d}"


@contextmanager
def _agenda():
    with _conexion() as con:
        con.execute(
            "CREATE TABLE IF NOT EXISTS reservas ("
            " id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE NOT NULL,"
            " servicio TEXT NOT NULL, profesional TEXT NOT NULL, fecha TEXT NOT NULL,"
            " inicio INTEGER NOT NULL, fin INTEGER NOT NULL, nombre TEXT NOT NULL,"
            " email TEXT NOT NULL, telefono TEXT NOT NULL DEFAULT '', nota TEXT NOT NULL DEFAULT '',"
            " con_google INTEGER NOT NULL DEFAULT 0, estado TEXT NOT NULL DEFAULT 'confirmada',"
            " creado_en TEXT NOT NULL, pago TEXT NOT NULL DEFAULT '', cobrado INTEGER NOT NULL DEFAULT 0,"
            " ejemplo INTEGER NOT NULL DEFAULT 0)"
        )
        yield con


def _huecos(con, fecha: _date, servicio: dict, pro: str) -> dict:
    """{hora: [profesionales libres]} de ese día. Lo calcula SIEMPRE el servidor."""
    ahora = datetime.now(_zona())
    tope = ahora.date() + timedelta(days=int(_NEGOCIO.get("dias_adelante", 30)))
    if fecha.weekday() not in _AG["dias"] or fecha < ahora.date() or fecha > tope:
        return {}
    candidatos = [pro] if pro in _PROS else list(_PROS)
    ocupado = {p: con.execute(
        "SELECT inicio, fin FROM reservas WHERE fecha = ? AND profesional = ?"
        " AND estado IN ('confirmada', 'atendida')",
        (fecha.isoformat(), p)).fetchall() for p in candidatos}
    # Hoy no se ofrece lo que ya pasó, ni lo que empieza en menos de 30 minutos.
    minimo = ahora.hour * 60 + ahora.minute + 30 if fecha == ahora.date() else -1
    dura, salida = int(servicio["duracion"]), {}
    m = _min(_AG["apertura"])
    while m + dura <= _min(_AG["cierre"]):
        if m >= minimo:
            libres = [p for p in candidatos if all(m + dura <= a or m >= b for a, b in ocupado[p])]
            if libres:
                salida[_hhmm(m)] = libres
        m += int(_AG["intervalo"])
    return salida


def _google(credencial: str) -> tuple:
    """Verifica el token de Google EN EL SERVIDOR y devuelve (nombre, correo)."""
    cliente = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    if not cliente:
        raise HTTPException(400, "El acceso con Google no está activo en esta página.")
    url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + urllib.parse.quote(credencial)
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            datos = _json.loads(r.read().decode("utf-8"))
    except Exception:
        raise HTTPException(401, "Google no confirmó tu identidad. Inténtalo de nuevo.")
    if (datos.get("aud") != cliente or str(datos.get("email_verified")).lower() != "true"
            or datos.get("iss") not in ("accounts.google.com", "https://accounts.google.com")):
        raise HTTPException(401, "Google no confirmó tu identidad. Inténtalo de nuevo.")
    return (datos.get("name") or datos["email"].split("@")[0])[:80], datos["email"][:120]


def _correo_activo() -> bool:
    return bool(os.environ.get("SMTP_USER") and os.environ.get("SMTP_PASSWORD"))


def _enlace_calendario(r: dict) -> str:
    zona = _zona()
    dia = _date.fromisoformat(r["fecha"])
    def utc(minutos: int) -> str:
        local = datetime(dia.year, dia.month, dia.day, minutos // 60, minutos % 60, tzinfo=zona)
        return local.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    detalles = f"{r['servicio']} con {r['profesional']}. Código {r['codigo']}."
    return "https://calendar.google.com/calendar/render?" + urllib.parse.urlencode({
        "action": "TEMPLATE", "text": f"{r['servicio']} · {_NEGOCIO['nombre']}",
        "dates": f"{utc(r['inicio'])}/{utc(r['fin'])}", "details": detalles,
        "location": _NEGOCIO.get("direccion", ""),
    })


def _enviar(para: str, asunto: str, texto: str, cuerpo_html: str) -> None:
    usuario = os.environ["SMTP_USER"]
    msg = EmailMessage()
    msg["From"] = f"{_NEGOCIO['nombre']} <{usuario}>"
    msg["To"] = para
    msg["Subject"] = asunto
    msg.set_content(texto)
    msg.add_alternative(cuerpo_html, subtype="html")
    with smtplib.SMTP(os.environ.get("SMTP_HOST", "smtp.gmail.com"),
                      int(os.environ.get("SMTP_PORT", "587")), timeout=20) as s:
        s.starttls()
        s.login(usuario, os.environ["SMTP_PASSWORD"])
        s.send_message(msg)


def _avisar(r: dict) -> None:
    """Correo al cliente y al dueño. Corre en un hilo: la cita ya está guardada."""
    if not _correo_activo():
        _log.warning("Reserva %s guardada; correo sin configurar (SMTP_USER/SMTP_PASSWORD).", r["codigo"])
        return
    cuando = f"{r['fecha']} a las {_hhmm(r['inicio'])}"
    filas = "".join(
        f"<tr><td style='padding:6px 0;color:#667'>{k}</td><td style='padding:6px 0'><b>{v}</b></td></tr>"
        for k, v in (("Servicio", r["servicio"]), ("Con", r["profesional"]), ("Cuándo", cuando),
                     ("Código", r["codigo"]), ("Dónde", _NEGOCIO.get("direccion", "")))
        if v)
    def tarjeta(titulo: str, extra: str) -> str:
        return (f"<div style='font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;"
                f"border:1px solid #e5e7eb;border-radius:12px;padding:24px'>"
                f"<h2 style='margin:0 0 4px'>{titulo}</h2><p style='margin:0 0 16px;color:#667'>"
                f"{_NEGOCIO['nombre']}</p><table style='width:100%'>{filas}</table>{extra}</div>")
    try:
        _enviar(r["email"], f"Cita confirmada · {_NEGOCIO['nombre']} · {cuando}",
                f"Hola {r['nombre']}, tu cita de {r['servicio']} quedó para el {cuando}. Código {r['codigo']}.",
                tarjeta(f"¡Listo, {html_escape(r['nombre'].split()[0])}!",
                        f"<p style='margin-top:18px'><a href='{r['calendario']}'>Añadir a Google Calendar</a></p>"))
        dueno = os.environ.get("NOTIFICAR_A") or _NEGOCIO.get("email") or os.environ["SMTP_USER"]
        _enviar(dueno, f"Nueva reserva: {r['nombre']} · {cuando}",
                f"{r['nombre']} ({r['email']} {r['telefono']}) reservó {r['servicio']} el {cuando}.",
                tarjeta("Nueva reserva", f"<p>{html_escape(r['nombre'])} · {html_escape(r['email'])} · {html_escape(r['telefono'])}</p>"
                                         f"<p style='color:#667'>{html_escape(r['nota'])}</p>"))
        _log.info("Reserva %s: correos enviados.", r["codigo"])
    except Exception as exc:  # el correo nunca tumba una cita ya guardada
        _log.error("Reserva %s guardada, pero el correo falló: %s", r["codigo"], type(exc).__name__)


def html_escape(texto: str) -> str:
    return (texto or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class ReservaIn(BaseModel):
    servicio: str = Field(max_length=10)
    profesional: str = Field(default="", max_length=10)
    fecha: _date
    hora: str = Field(max_length=5)
    nombre: str = Field(default="", max_length=80)
    email: str = Field(default="", max_length=120)
    telefono: str = Field(default="", max_length=24)
    nota: str = Field(default="", max_length=500)
    credencial_google: str = Field(default="", max_length=4096)
    web: str = Field(default="", max_length=200)  # campo trampa


class CancelarIn(BaseModel):
    email: str = Field(max_length=120)


@app.get("/api/negocio")
def negocio() -> dict:
    return {
        "nombre": _NEGOCIO["nombre"], "whatsapp": _NEGOCIO.get("whatsapp", ""),
        "servicios": _NEGOCIO["servicios"], "profesionales": _NEGOCIO["profesionales"],
        "agenda": _AG, "dias_adelante": _NEGOCIO.get("dias_adelante", 30),
        "hoy": datetime.now(_zona()).date().isoformat(),
        "google_client_id": os.environ.get("GOOGLE_CLIENT_ID", "").strip(),
        "correo_activo": _correo_activo(),
    }


@app.get("/api/disponibilidad")
def disponibilidad(servicio: str, fecha: _date, profesional: str = "") -> dict:
    s = _SERVICIOS.get(servicio)
    if not s:
        raise HTTPException(404, "Ese servicio no existe.")
    with _agenda() as con:
        huecos = _huecos(con, fecha, s, profesional)
    return {"fecha": fecha.isoformat(), "horas": list(huecos)}


@app.post("/api/reservas", status_code=201)
def reservar(r: ReservaIn) -> dict:
    s = _SERVICIOS.get(r.servicio)
    if not s:
        raise HTTPException(404, "Ese servicio no existe.")
    if r.profesional and r.profesional not in _PROS:
        raise HTTPException(404, "Ese profesional no existe.")
    if not _HORA.match(r.hora):
        raise HTTPException(422, "Hora inválida.")
    if r.credencial_google:
        nombre, email = _google(r.credencial_google)
    else:
        nombre, email = r.nombre.strip(), r.email.strip().lower()
        if len(nombre) < 2:
            raise HTTPException(422, "Escribe tu nombre.")
        if not _CORREO.match(email):
            raise HTTPException(422, "Escribe un correo válido.")
    telefono = r.telefono.strip()
    if telefono and len(re.sub(r"\D", "", telefono)) < 7:
        raise HTTPException(422, "El celular debe tener al menos 7 dígitos.")
    if r.web:
        raise HTTPException(422, "No se pudo reservar.")
    with _CANDADO, _agenda() as con:
        libres = _huecos(con, r.fecha, s, r.profesional).get(r.hora)
        if not libres:
            raise HTTPException(409, "Esa hora se acaba de ocupar. Elige otra, por favor.")
        pro = r.profesional or libres[0]
        codigo = "R-" + secrets.token_hex(3).upper()
        inicio = _min(r.hora)
        con.execute(
            "INSERT INTO reservas (codigo, servicio, profesional, fecha, inicio, fin, nombre, email,"
            " telefono, nota, con_google, creado_en) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (codigo, s["id"], pro, r.fecha.isoformat(), inicio, inicio + int(s["duracion"]), nombre,
             email, telefono, r.nota.strip(), 1 if r.credencial_google else 0,
             datetime.now(timezone.utc).isoformat(timespec="seconds")),
        )
    salida = {
        "codigo": codigo, "servicio": s["nombre"], "precio": s.get("precio", ""),
        "duracion": s["duracion"], "profesional": _PROS[pro]["nombre"], "fecha": r.fecha.isoformat(),
        "hora": r.hora, "inicio": inicio, "fin": inicio + int(s["duracion"]), "nombre": nombre,
        "email": email, "telefono": telefono, "nota": r.nota.strip(),
        "correo": "enviando" if _correo_activo() else "sin_configurar",
    }
    salida["calendario"] = _enlace_calendario(salida)
    threading.Thread(target=_avisar, args=(dict(salida),), daemon=True).start()
    return salida


@app.post("/api/reservas/{codigo}/cancelar")
def cancelar(codigo: str, c: CancelarIn) -> dict:
    with _CANDADO, _agenda() as con:
        n = con.execute(
            "UPDATE reservas SET estado = 'cancelada' WHERE codigo = ? AND lower(email) = ? AND estado = 'confirmada'",
            (codigo.strip().upper(), c.email.strip().lower())).rowcount
    if not n:
        raise HTTPException(404, "No encontramos una cita activa con ese código y correo.")
    return {"ok": True}


@app.get("/api/reservas")
def reservas(x_clave_admin: str = Header(default=""), fecha: Optional[_date] = None) -> dict:
    clave = os.environ.get("CLAVE_ADMIN", "")
    if not clave:
        raise HTTPException(404, "Define CLAVE_ADMIN en el entorno para ver la agenda.")
    if not secrets.compare_digest(x_clave_admin, clave):
        raise HTTPException(401, "Clave incorrecta.")
    filtro, args = ("WHERE fecha = ?", (fecha.isoformat(),)) if fecha else ("", ())
    with _agenda() as con:
        filas = con.execute(
            "SELECT codigo, servicio, profesional, fecha, inicio, fin, nombre, email, telefono, nota, estado"
            f" FROM reservas {filtro} ORDER BY fecha, inicio LIMIT 1000", args).fetchall()
    return {"total": len(filas), "reservas": [{
        "codigo": f[0], "servicio": _SERVICIOS.get(f[1], {}).get("nombre", f[1]),
        "profesional": _PROS.get(f[2], {}).get("nombre", f[2]), "fecha": f[3], "hora": _hhmm(f[4]),
        "fin": _hhmm(f[5]), "nombre": f[6], "email": f[7], "telefono": f[8], "nota": f[9], "estado": f[10],
    } for f in filas]}


@app.get("/reservar")
def pagina_reservar():
    return FileResponse(str(_FRONT / "reservar.html"))


# ===========================================================================
# Panel del dueño: agenda del día, estados, cobros, resumen y clientes
# ===========================================================================
import hashlib
from datetime import timedelta as _td

from fastapi import Depends

_ESTADOS = ("confirmada", "atendida", "no_asistio", "cancelada")
_PAGOS = ("", "efectivo", "nequi", "tarjeta", "transferencia")
_SESION_HORAS = 12


def _precio_num(texto) -> int:
    """'$25.000' -> 25000 · 'Desde $40.000' -> 40000 · '12.50' -> 12."""
    m = re.search(r"\d[\d.,]*", str(texto or ""))
    if not m:
        return 0
    tok = m.group(0).rstrip(".,")
    if re.search(r"[.,]\d{2}$", tok):
        tok = tok[:-3]
    return int(re.sub(r"\D", "", tok) or 0)


@contextmanager
def _panel_db():
    with _agenda() as con:
        con.execute("CREATE TABLE IF NOT EXISTS panel_clave (id INTEGER PRIMARY KEY CHECK (id = 1),"
                    " sal TEXT NOT NULL, hash TEXT NOT NULL)")
        con.execute("CREATE TABLE IF NOT EXISTS panel_sesiones (token TEXT PRIMARY KEY, expira TEXT NOT NULL)")
        yield con


def _hash(clave: str, sal: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", clave.encode("utf-8"), bytes.fromhex(sal), 200_000).hex()


def _configurado(con) -> bool:
    return bool(os.environ.get("CLAVE_ADMIN")) or con.execute("SELECT 1 FROM panel_clave").fetchone() is not None


def _clave_valida(con, clave: str) -> bool:
    fija = os.environ.get("CLAVE_ADMIN", "")
    if fija:
        return secrets.compare_digest(clave, fija)
    fila = con.execute("SELECT sal, hash FROM panel_clave WHERE id = 1").fetchone()
    return bool(fila) and secrets.compare_digest(_hash(clave, fila[0]), fila[1])


def _nueva_sesion(con) -> str:
    token = secrets.token_urlsafe(32)
    ahora = datetime.now(timezone.utc)
    con.execute("DELETE FROM panel_sesiones WHERE expira < ?", (ahora.isoformat(),))
    con.execute("INSERT INTO panel_sesiones (token, expira) VALUES (?, ?)",
                (token, (ahora + _td(hours=_SESION_HORAS)).isoformat()))
    return token


def _dueno(authorization: str = Header(default="")) -> None:
    """Dependencia: exige la sesión del panel (Authorization: Bearer <token>)."""
    token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    if not token:
        raise HTTPException(401, "Entra al panel.")
    with _panel_db() as con:
        fila = con.execute("SELECT expira FROM panel_sesiones WHERE token = ?", (token,)).fetchone()
    if not fila or fila[0] < datetime.now(timezone.utc).isoformat():
        raise HTTPException(401, "Tu sesión terminó. Vuelve a entrar.")


class ClaveIn(BaseModel):
    clave: str = Field(min_length=1, max_length=128)


class EstadoIn(BaseModel):
    estado: str = Field(max_length=20)
    pago: str = Field(default="", max_length=20)


def _fila_cita(f) -> dict:
    s = _SERVICIOS.get(f[1], {})
    return {
        "codigo": f[0], "servicio": s.get("nombre", f[1]), "servicio_id": f[1],
        "profesional": _PROS.get(f[2], {}).get("nombre", f[2]), "profesional_id": f[2],
        "fecha": f[3], "hora": _hhmm(f[4]), "fin": _hhmm(f[5]), "nombre": f[6], "email": f[7],
        "telefono": f[8], "nota": f[9], "estado": f[10], "pago": f[11], "cobrado": f[12],
        "precio": _precio_num(s.get("precio")), "ejemplo": bool(f[13]),
    }


_COLS = ("codigo, servicio, profesional, fecha, inicio, fin, nombre, email, telefono, nota,"
         " estado, pago, cobrado, ejemplo")


@app.get("/api/panel/estado")
def panel_estado() -> dict:
    with _panel_db() as con:
        return {"configurado": _configurado(con), "negocio": _NEGOCIO["nombre"]}


@app.post("/api/panel/crear")
def panel_crear(c: ClaveIn) -> dict:
    """La PRIMERA persona que abre el panel fija la clave del dueño (mínimo 8)."""
    if len(c.clave) < 8:
        raise HTTPException(422, "La clave necesita al menos 8 caracteres.")
    with _CANDADO, _panel_db() as con:
        if _configurado(con):
            raise HTTPException(409, "El panel ya tiene clave. Entra con ella.")
        sal = secrets.token_hex(16)
        con.execute("INSERT INTO panel_clave (id, sal, hash) VALUES (1, ?, ?)", (sal, _hash(c.clave, sal)))
        return {"token": _nueva_sesion(con)}


@app.post("/api/panel/entrar")
def panel_entrar(c: ClaveIn) -> dict:
    with _CANDADO, _panel_db() as con:
        if not _clave_valida(con, c.clave):
            raise HTTPException(401, "Clave incorrecta.")
        return {"token": _nueva_sesion(con)}


@app.get("/api/panel/agenda", dependencies=[Depends(_dueno)])
def panel_agenda(fecha: Optional[_date] = None) -> dict:
    dia = fecha or datetime.now(_zona()).date()
    with _panel_db() as con:
        filas = con.execute(f"SELECT {_COLS} FROM reservas WHERE fecha = ? ORDER BY inicio", (dia.isoformat(),)).fetchall()
    citas = [_fila_cita(f) for f in filas]
    return {
        "fecha": dia.isoformat(), "abierto": dia.weekday() in _AG["dias"],
        "profesionales": _NEGOCIO["profesionales"], "citas": citas,
        "esperado": sum(c["precio"] for c in citas if c["estado"] in ("confirmada", "atendida")),
        "cobrado": sum(c["cobrado"] for c in citas if c["estado"] == "atendida"),
    }


@app.post("/api/panel/reservas/{codigo}/estado", dependencies=[Depends(_dueno)])
def panel_cambiar_estado(codigo: str, e: EstadoIn) -> dict:
    if e.estado not in _ESTADOS:
        raise HTTPException(422, "Estado desconocido.")
    if e.pago not in _PAGOS:
        raise HTTPException(422, "Método de pago desconocido.")
    with _CANDADO, _panel_db() as con:
        fila = con.execute(f"SELECT {_COLS} FROM reservas WHERE codigo = ?", (codigo.strip().upper(),)).fetchone()
        if not fila:
            raise HTTPException(404, "Esa cita no existe.")
        cita = _fila_cita(fila)
        if e.estado == "confirmada" and not _hueco_libre(con, cita):
            raise HTTPException(409, "Esa hora ya la tiene otra cita.")
        cobrado = cita["precio"] if e.estado == "atendida" else 0
        pago = (e.pago or "efectivo") if e.estado == "atendida" else ""
        con.execute("UPDATE reservas SET estado = ?, pago = ?, cobrado = ? WHERE codigo = ?",
                    (e.estado, pago, cobrado, cita["codigo"]))
        fila = con.execute(f"SELECT {_COLS} FROM reservas WHERE codigo = ?", (cita["codigo"],)).fetchone()
    return _fila_cita(fila)


def _hueco_libre(con, cita: dict) -> bool:
    """¿Se puede REACTIVAR esta cita sin pisar otra del mismo profesional?"""
    ini, fin = _min(cita["hora"]), _min(cita["fin"])
    otras = con.execute(
        "SELECT inicio, fin FROM reservas WHERE fecha = ? AND profesional = ? AND codigo <> ?"
        " AND estado IN ('confirmada', 'atendida')",
        (cita["fecha"], cita["profesional_id"], cita["codigo"])).fetchall()
    return all(fin <= a or ini >= b for a, b in otras)


@app.get("/api/panel/resumen", dependencies=[Depends(_dueno)])
def panel_resumen() -> dict:
    hoy = datetime.now(_zona()).date()
    mes = hoy.replace(day=1).isoformat()
    desde = (hoy - _td(days=13)).isoformat()
    with _panel_db() as con:
        filas = [_fila_cita(f) for f in con.execute(
            f"SELECT {_COLS} FROM reservas WHERE fecha >= ? ORDER BY fecha, inicio",
            (min(mes, desde),)).fetchall()]
    de_hoy = [c for c in filas if c["fecha"] == hoy.isoformat()]
    del_mes = [c for c in filas if mes <= c["fecha"] <= hoy.isoformat()]
    cerradas = [c for c in del_mes if c["estado"] in ("atendida", "no_asistio")]
    serie = []
    for i in range(14):
        dia = (hoy - _td(days=13 - i)).isoformat()
        serie.append({"fecha": dia, "citas": sum(1 for c in filas if c["fecha"] == dia and c["estado"] != "cancelada"),
                      "ingresos": sum(c["cobrado"] for c in filas if c["fecha"] == dia)})
    def ranking(clave: str) -> list:
        cuenta: dict = {}
        for c in del_mes:
            if c["estado"] in ("confirmada", "atendida"):
                x = cuenta.setdefault(c[clave], {"nombre": c[clave], "citas": 0, "ingresos": 0})
                x["citas"] += 1
                x["ingresos"] += c["cobrado"]
        return sorted(cuenta.values(), key=lambda x: (-x["citas"], -x["ingresos"]))[:6]
    return {
        "hoy": hoy.isoformat(),
        "citas_hoy": sum(1 for c in de_hoy if c["estado"] != "cancelada"),
        "pendientes_hoy": sum(1 for c in de_hoy if c["estado"] == "confirmada"),
        "ingresos_hoy": sum(c["cobrado"] for c in de_hoy),
        "ingresos_mes": sum(c["cobrado"] for c in del_mes),
        "proximas": sum(1 for c in filas if c["fecha"] > hoy.isoformat() and c["estado"] == "confirmada"),
        "inasistencia": round(100 * sum(1 for c in cerradas if c["estado"] == "no_asistio") / len(cerradas))
        if cerradas else 0,
        "serie": serie, "servicios": ranking("servicio"), "profesionales": ranking("profesional"),
        "hay_ejemplos": any(c["ejemplo"] for c in filas),
    }


@app.get("/api/panel/clientes", dependencies=[Depends(_dueno)])
def panel_clientes(q: str = "") -> dict:
    with _panel_db() as con:
        filas = [_fila_cita(f) for f in con.execute(
            f"SELECT {_COLS} FROM reservas ORDER BY fecha DESC, inicio DESC LIMIT 5000").fetchall()]
    clientes: dict = {}
    for c in filas:
        x = clientes.setdefault(c["email"].lower(), {
            "nombre": c["nombre"], "email": c["email"], "telefono": c["telefono"],
            "visitas": 0, "inasistencias": 0, "gastado": 0, "ultima": c["fecha"], "proxima": "",
        })
        x["telefono"] = x["telefono"] or c["telefono"]
        if c["estado"] == "atendida":
            x["visitas"] += 1
            x["gastado"] += c["cobrado"]
        elif c["estado"] == "no_asistio":
            x["inasistencias"] += 1
        elif c["estado"] == "confirmada" and c["fecha"] >= datetime.now(_zona()).date().isoformat():
            x["proxima"] = c["fecha"] + " " + c["hora"]
    lista = sorted(clientes.values(), key=lambda x: (-x["visitas"], x["nombre"]))
    q = q.strip().lower()
    if q:
        lista = [x for x in lista if q in x["nombre"].lower() or q in x["email"].lower() or q in x["telefono"]]
    return {"total": len(lista), "clientes": lista[:300]}


@app.post("/api/panel/ejemplos/borrar", dependencies=[Depends(_dueno)])
def panel_borrar_ejemplos() -> dict:
    with _CANDADO, _panel_db() as con:
        n = con.execute("DELETE FROM reservas WHERE ejemplo = 1").rowcount
    return {"borradas": n}


@app.get("/panel")
def pagina_panel():
    return FileResponse(str(_FRONT / "panel.html"))


_NOMBRES_EJEMPLO = ("Santiago Beltrán", "Valentina Ríos", "Andrés Felipe Rincón", "Camila Ortiz",
                    "Julián Restrepo", "Mariana Gómez", "Sebastián Ordóñez", "Laura Cárdenas",
                    "Mateo Arboleda", "Daniela Suárez", "Felipe Marulanda", "Sara Valencia")


def _sembrar_ejemplos() -> None:
    """Una agenda vacía no enseña nada: siembra citas de ejemplo (marcadas, y
    borrables desde el panel con un clic) la primera vez que arranca."""
    if os.environ.get("RESERVAS_EJEMPLO", "si").lower() in ("no", "0", "false"):
        return
    servicios, pros = list(_SERVICIOS.values()), list(_PROS)
    if not servicios or not pros:
        return
    zona = _zona()
    ahora = datetime.now(zona)
    hoy = ahora.date()
    apertura, cierre, paso = _min(_AG["apertura"]), _min(_AG["cierre"]), int(_AG["intervalo"])
    with _CANDADO, _agenda() as con:
        # Una sola vez por base: si el dueño los borró, no vuelven al reiniciar.
        con.execute("CREATE TABLE IF NOT EXISTS semilla (id INTEGER PRIMARY KEY CHECK (id = 1))")
        if con.execute("SELECT 1 FROM semilla").fetchone():
            return
        con.execute("INSERT INTO semilla (id) VALUES (1)")
        if con.execute("SELECT COUNT(*) FROM reservas").fetchone()[0]:
            return
        n = 0
        for desfase in list(range(-12, 0)) + [0, 1, 2]:
            dia = hoy + _td(days=desfase)
            if dia.weekday() not in _AG["dias"]:
                continue
            ocupado: dict = {p: [] for p in pros}
            for k in range(2 if desfase < 0 else 3):
                s = servicios[(n + k) % len(servicios)]
                p = pros[(n + k) % len(pros)]
                dura = int(s["duracion"])
                base = apertura
                if desfase == 0:  # hoy, solo lo que todavía no ha pasado
                    minimo = ahora.hour * 60 + ahora.minute + 30
                    if minimo > apertura:
                        base = apertura + paso * -(-(minimo - apertura) // paso)
                huecos = (cierre - base - dura) // paso + 1
                if huecos <= 0:
                    continue
                m = base + paso * ((n * 3 + k * 5) % huecos)
                if m + dura > cierre or not all(m + dura <= a or m >= b for a, b in ocupado[p]):
                    continue
                ocupado[p].append((m, m + dura))
                nombre = _NOMBRES_EJEMPLO[n % len(_NOMBRES_EJEMPLO)]
                if desfase < 0:
                    estado = "no_asistio" if n % 9 == 4 else ("cancelada" if n % 11 == 7 else "atendida")
                else:
                    estado = "confirmada"
                cobrado = _precio_num(s.get("precio")) if estado == "atendida" else 0
                pago = ("efectivo", "nequi", "tarjeta")[n % 3] if estado == "atendida" else ""
                usuario = re.sub(r"[^a-z]", "", nombre.split()[0].lower().translate(str.maketrans("áéíóúñ", "aeioun")))
                con.execute(
                    "INSERT INTO reservas (codigo, servicio, profesional, fecha, inicio, fin, nombre, email,"
                    " telefono, nota, estado, creado_en, pago, cobrado, ejemplo)"
                    " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
                    ("R-" + secrets.token_hex(3).upper(), s["id"], p, dia.isoformat(), m, m + dura, nombre,
                     f"{usuario}{n}@ejemplo.com", f"300{(n * 7919) % 10000000:07d}", "", estado,
                     datetime.now(timezone.utc).isoformat(timespec="seconds"), pago, cobrado),
                )
                n += 1


_sembrar_ejemplos()
'''


# ---------------------------------------------------------------------------
# Página /reservar
# ---------------------------------------------------------------------------
def reservar_html(d: DominioLanding, pal: dict, idioma: str, base: str, dixel_tags: str,
                  dixel_on: str) -> str:
    t = textos(idioma)
    inicial = next((ch for ch in d.nombre.upper() if ch.isalnum()), "A")
    textos_json = json.dumps(t, ensure_ascii=False).replace("</", "<\\/")
    pasos = "".join(
        f'<li data-paso="{n}"><button type="button" disabled><span class="punto"></span>'
        f'<span class="etq">{_e(t[f"p{n}"])}</span></button></li>'
        for n in range(1, 5)
    )
    return f'''<!doctype html>
<html lang="{idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_e(t["titulo"])} · {_e(d.nombre)}</title>
<meta name="description" content="{_e(t["titulo"])} · {_e(d.nombre)}">
<meta name="theme-color" content="{pal["hero"]}">
<link rel="icon" href="{base}icono.svg" type="image/svg+xml">
<link rel="stylesheet" href="{base}styles.css">
<link rel="stylesheet" href="{base}reservar.css">
{dixel_tags}
</head>
<body class="pag-reservar">
<div class="rs-fondo" aria-hidden="true"><span>{_e(d.nombre)}</span></div>
<header class="rs-cab">
<a class="rs-volver" href="./">&larr; {_e(t["volver"])}</a>
<span class="rs-logo" aria-hidden="true">{_e(inicial)}</span>
<h1>{_e(t["titulo"])}</h1>
<p class="rs-negocio">{_e(d.nombre)}</p>
<p class="rs-pill"><span class="rs-vivo"></span>{_e(t["abierta"])}</p>
</header>
<main class="rs-main">
<div class="rs-progreso"><p class="rs-paso-n" id="rs-paso-n"></p><p class="rs-paso-etq" id="rs-paso-etq"></p></div>
<ol class="rs-pasos" id="rs-pasos">{pasos}</ol>
<section class="rs-tarjeta" id="rs-tarjeta" aria-live="polite"><p class="rs-cargando">{_e(t["cargando"])}</p></section>
</main>
<div class="rs-barra" id="rs-barra">
<div class="rs-barra-in"><div class="rs-resumen" id="rs-resumen"><small>{_e(t["resumen_servicio"])}</small><b>{_e(t["resumen_vacio"])}</b></div>
<button type="button" class="btn" id="rs-seguir" disabled>{_e(t["continuar"])}</button></div>
</div>
<script id="rs-textos" type="application/json">{textos_json}</script>
<script src="{base}reservar.js" defer></script>
{f"<script>{dixel_on}</script>" if dixel_on else ""}
</body>
</html>
'''


RESERVAR_CSS = """
.pag-reservar{background:var(--hero);color:#fff;min-height:100vh;padding-bottom:120px}
.rs-fondo{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;
  background:radial-gradient(60% 50% at 50% 0%,color-mix(in srgb,var(--acc) 45%,transparent),transparent 70%),
  radial-gradient(40% 40% at 100% 100%,color-mix(in srgb,var(--acc) 25%,transparent),transparent 70%)}
.rs-fondo span{position:absolute;top:34%;left:50%;transform:translateX(-50%);white-space:nowrap;
  font-size:clamp(64px,14vw,180px);font-weight:800;letter-spacing:.18em;text-transform:uppercase;
  color:transparent;-webkit-text-stroke:1px rgba(255,255,255,.07)}
.rs-cab,.rs-main{position:relative;z-index:1}
.rs-cab{text-align:center;padding:28px 16px 8px}
.rs-volver{position:absolute;left:16px;top:20px;color:rgba(255,255,255,.75);font-size:.9rem;text-decoration:none}
.rs-volver:hover{color:#fff}
.rs-logo{display:inline-grid;place-items:center;width:76px;height:76px;border-radius:50%;margin-top:24px;
  background:var(--acc);color:#fff;font-size:2rem;font-weight:800;
  box-shadow:0 0 0 6px rgba(255,255,255,.06),0 18px 40px -12px var(--acc)}
.rs-cab h1{font-size:1.15rem;font-weight:600;margin:14px 0 2px;color:rgba(255,255,255,.85)}
.rs-negocio{margin:0 0 12px;font-size:1.6rem;font-weight:750;letter-spacing:-.01em;color:#fff}
.rs-pill{display:inline-flex;align-items:center;gap:8px;margin:0;padding:6px 14px;border-radius:999px;
  border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);font-size:.85rem;font-weight:600}
.rs-vivo{width:8px;height:8px;border-radius:50%;background:#22C55E;box-shadow:0 0 0 4px rgba(34,197,94,.2)}
.rs-main{max-width:640px;margin:0 auto;padding:16px}
.rs-progreso{display:flex;justify-content:space-between;align-items:baseline;margin:8px 4px 10px}
.rs-paso-n{margin:0;font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.6);font-weight:700}
.rs-paso-etq{margin:0;font-weight:700}
.rs-pasos{list-style:none;display:grid;grid-template-columns:repeat(4,1fr);margin:0 0 16px;padding:0;position:relative}
.rs-pasos:before{content:"";position:absolute;left:12%;right:12%;top:9px;height:2px;background:rgba(255,255,255,.18)}
.rs-pasos li{text-align:center;position:relative}
.rs-pasos button{background:none;border:0;color:rgba(255,255,255,.55);display:grid;justify-items:center;gap:6px;
  width:100%;font:inherit;font-size:.78rem;cursor:pointer;padding:0}
.rs-pasos button:disabled{cursor:default}
.rs-pasos .punto{width:20px;height:20px;border-radius:50%;background:var(--hero);border:2px solid rgba(255,255,255,.35)}
.rs-pasos li.hecho .punto{background:var(--acc);border-color:var(--acc)}
.rs-pasos li.actual .punto{background:#fff;border-color:#fff;box-shadow:0 0 0 5px color-mix(in srgb,var(--acc) 55%,transparent)}
.rs-pasos li.actual button,.rs-pasos li.hecho button{color:#fff}
.rs-tarjeta{background:var(--superficie);color:var(--tinta);border-radius:20px;padding:22px;
  box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
.rs-tarjeta h2{font-size:1.25rem;margin:0 0 16px}
.rs-buscar{width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--linea);background:var(--fondo);
  font:inherit;margin-bottom:14px}
.rs-lista{display:grid;gap:10px}
.rs-op{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;text-align:left;width:100%;
  padding:14px;border-radius:14px;border:1px solid var(--linea);background:var(--superficie);color:inherit;
  font:inherit;cursor:pointer;transition:border-color .15s,box-shadow .15s,transform .15s}
.rs-op:hover{border-color:var(--acc);transform:translateY(-1px)}
.rs-op[aria-pressed=true]{border-color:var(--acc);box-shadow:0 0 0 3px var(--acc-suave)}
.rs-ava{width:48px;height:48px;border-radius:12px;display:grid;place-items:center;font-weight:800;
  background:var(--acc-suave);color:var(--acc)}
.rs-ava.redondo{border-radius:50%}
.rs-op b{display:block;font-size:1.02rem}
.rs-op small{display:block;color:var(--tinta-2);margin-top:2px;line-height:1.35;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rs-chip{display:inline-flex;gap:4px;align-items:center;margin-top:6px;padding:2px 8px;border-radius:999px;
  background:var(--fondo);font-size:.78rem;color:var(--tinta-2);border:1px solid var(--linea)}
.rs-precio{font-weight:800;color:var(--acc);white-space:nowrap}
.rs-dias{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;scroll-snap-type:x mandatory}
.rs-dia{flex:0 0 64px;scroll-snap-align:start;display:grid;gap:2px;justify-items:center;padding:10px 0;
  border-radius:14px;border:1px solid var(--linea);background:var(--superficie);color:inherit;font:inherit;cursor:pointer}
.rs-dia small{font-size:.72rem;text-transform:uppercase;color:var(--tinta-2);letter-spacing:.06em}
.rs-dia b{font-size:1.25rem}
.rs-dia:disabled{opacity:.4;cursor:not-allowed}
.rs-dia[aria-pressed=true]{background:var(--acc);border-color:var(--acc);color:#fff}
.rs-dia[aria-pressed=true] small{color:rgba(255,255,255,.85)}
.rs-franja{margin:16px 0 8px;font-size:.8rem;text-transform:uppercase;letter-spacing:.1em;color:var(--tinta-2);font-weight:700}
.rs-horas{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px}
.rs-hora{padding:10px 0;border-radius:10px;border:1px solid var(--linea);background:var(--superficie);
  color:inherit;font:inherit;font-weight:650;cursor:pointer}
.rs-hora:hover{border-color:var(--acc)}
.rs-hora[aria-pressed=true]{background:var(--acc);border-color:var(--acc);color:#fff}
.rs-vacio{padding:18px;border-radius:12px;background:var(--fondo);color:var(--tinta-2);text-align:center}
.rs-google{display:grid;justify-items:center;gap:10px;margin-bottom:6px}
.rs-o{display:flex;align-items:center;gap:10px;color:var(--tinta-2);font-size:.85rem;margin:14px 0}
.rs-o:before,.rs-o:after{content:"";flex:1;height:1px;background:var(--linea)}
.rs-quien{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;
  border-radius:12px;background:var(--acc-suave);margin-bottom:14px}
.rs-quien button{background:none;border:0;color:var(--acc);font:inherit;font-weight:650;cursor:pointer}
.rs-form .campo{margin-bottom:12px}
.rs-form label{display:block;font-weight:600;font-size:.9rem;margin-bottom:6px}
.rs-form input,.rs-form textarea{width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--borde);
  font:inherit;background:var(--superficie);color:var(--tinta)}
.rs-form input:focus,.rs-form textarea:focus,.rs-buscar:focus{outline:2px solid var(--acc);outline-offset:1px}
.rs-form .error{color:var(--error);font-size:.85rem;margin:4px 0 0;min-height:1em}
.rs-detalle{border:1px dashed var(--linea);border-radius:14px;padding:14px;margin:6px 0 14px;display:grid;gap:6px}
.rs-detalle div{display:flex;justify-content:space-between;gap:12px}
.rs-detalle span{color:var(--tinta-2)}
.rs-aviso{color:var(--error);font-weight:600;margin:10px 0 0}
.rs-listo{text-align:center}
.rs-check{width:72px;height:72px;margin:4px auto 12px;border-radius:50%;display:grid;place-items:center;
  background:color-mix(in srgb,var(--exito) 14%,transparent);color:var(--exito)}
.rs-check svg{width:38px;height:38px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.rs-codigo{display:inline-block;font-family:ui-monospace,Consolas,monospace;font-size:1.3rem;font-weight:800;
  letter-spacing:.12em;padding:8px 16px;border-radius:10px;background:var(--fondo);margin:4px 0 14px}
.rs-acciones{display:grid;gap:10px;margin-top:16px}
.rs-acciones .btn{justify-content:center}
.btn-borde{background:transparent;color:var(--acc);border:1px solid var(--acc)}
.rs-enlace{background:none;border:0;color:var(--tinta-2);font:inherit;text-decoration:underline;cursor:pointer;margin-top:6px}
.rs-enlaces{display:flex;justify-content:center;flex-wrap:wrap;gap:4px 18px;margin:14px 0 0}
.rs-barra{position:fixed;left:0;right:0;bottom:0;z-index:5;padding:12px 16px calc(12px + env(safe-area-inset-bottom));
  background:color-mix(in srgb,var(--hero) 86%,transparent);backdrop-filter:blur(12px);border-top:1px solid rgba(255,255,255,.1)}
.rs-barra-in{max-width:640px;margin:0 auto;display:flex;gap:12px;align-items:center;justify-content:space-between}
.rs-resumen{min-width:0}
.rs-resumen small{display:block;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.6)}
.rs-resumen b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rs-barra[hidden]{display:none !important}
.rs-cargando{text-align:center;color:var(--tinta-2);margin:20px 0}
@media (max-width:520px){.rs-tarjeta{padding:16px;border-radius:16px}.rs-op{grid-template-columns:auto 1fr;}
  .rs-op .rs-precio{grid-column:2}.rs-volver{position:static;display:block;text-align:left;margin-bottom:8px}
  .rs-pasos .etq{display:none}}
@media (prefers-reduced-motion:reduce){.rs-op{transition:none}}
"""


RESERVAR_JS = r"""(function () {
  "use strict";
  var T = JSON.parse(document.getElementById("rs-textos").textContent);
  var tarjeta = document.getElementById("rs-tarjeta");
  var seguir = document.getElementById("rs-seguir");
  var resumen = document.getElementById("rs-resumen");
  var barra = document.getElementById("rs-barra");
  var N = null;
  var st = { paso: 1, servicio: null, profesional: "", fecha: "", hora: "", google: null,
             nombre: "", email: "", telefono: "", nota: "" };
  var CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var DIAS = { es: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"], en: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] };
  var MESES = { es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
                en: ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] };
  var LANG = document.documentElement.lang === "en" ? "en" : "es";

  function el(tag, attrs, hijos) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "texto") n.textContent = attrs[k];
      else if (k === "clase") n.className = attrs[k];
      else if (k.indexOf("on") === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (hijos || []).forEach(function (h) { if (h) n.appendChild(typeof h === "string" ? document.createTextNode(h) : h); });
    return n;
  }
  function iniciales(t) { return t.split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0]; }).join("").toUpperCase(); }
  function pro(id) { return N.profesionales.filter(function (p) { return p.id === id; })[0]; }
  function fechaLarga(iso) {
    var p = iso.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
    return DIAS[LANG][d.getDay()] + " " + d.getDate() + " " + MESES[LANG][d.getMonth()];
  }
  function api(ruta, opciones) {
    return fetch(ruta, opciones).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, datos: d }; });
    });
  }
  function soloUnPro() { return N.profesionales.length < 2; }

  function pintarPasos() {
    var visibles = soloUnPro() ? [1, 3, 4] : [1, 2, 3, 4];
    var orden = visibles.indexOf(st.paso) + 1;
    document.getElementById("rs-paso-n").textContent = st.paso > 4 ? "" : T.paso.replace("{n}", Math.max(orden, 1)).replace("{t}", visibles.length);
    document.getElementById("rs-paso-etq").textContent = st.paso > 4 ? "" : T["p" + st.paso];
    document.querySelectorAll("#rs-pasos li").forEach(function (li) {
      var n = +li.getAttribute("data-paso");
      li.hidden = visibles.indexOf(n) < 0;
      li.className = n < st.paso ? "hecho" : n === st.paso ? "actual" : "";
      var b = li.querySelector("button");
      b.disabled = !(n < st.paso && st.paso <= 4);
      b.onclick = function () { ir(n); };
    });
    document.getElementById("rs-pasos").style.gridTemplateColumns = "repeat(" + visibles.length + ",1fr)";
  }

  function pintarResumen() {
    resumen.innerHTML = "";
    if (!st.servicio) {
      resumen.appendChild(el("small", { texto: T.resumen_servicio }));
      resumen.appendChild(el("b", { texto: T.resumen_vacio }));
      return;
    }
    var linea = st.servicio.nombre + (st.servicio.precio ? " · " + st.servicio.precio : "");
    var sub = [st.servicio.duracion + " " + T.min];
    if (st.profesional) sub.push(T.con + " " + pro(st.profesional).nombre);
    if (st.fecha) sub.push(fechaLarga(st.fecha) + (st.hora ? " · " + st.hora : ""));
    resumen.appendChild(el("small", { texto: sub.join(" · ") }));
    resumen.appendChild(el("b", { texto: linea }));
  }

  function listo() {
    if (st.paso === 1) return !!st.servicio;
    if (st.paso === 2) return true;
    if (st.paso === 3) return !!(st.fecha && st.hora);
    return false;
  }
  function actualizarBarra() {
    barra.hidden = st.paso >= 4;
    seguir.disabled = !listo();
    pintarResumen();
  }

  function ir(paso) {
    if (paso === 2 && soloUnPro()) paso = st.paso > 2 ? 1 : 3;
    st.paso = paso;
    pintarPasos();
    tarjeta.innerHTML = "";
    ({ 1: pasoServicio, 2: pasoProfesional, 3: pasoFecha, 4: pasoDatos })[paso]();
    actualizarBarra();
    if (paso > 1) window.scrollTo({ top: tarjeta.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
  }
  seguir.addEventListener("click", function () { if (listo()) ir(st.paso + 1); });

  function opcion(activo, ava, titulo, sub, extra, alPulsar) {
    return el("button", { type: "button", clase: "rs-op", "aria-pressed": activo ? "true" : "false", onclick: alPulsar },
      [ava, el("span", {}, [el("b", { texto: titulo }), sub ? el("small", { texto: sub }) : null, extra]),
       arguments[6] || null]);
  }

  function pasoServicio() {
    var lista = el("div", { clase: "rs-lista" });
    function pintar(filtro) {
      lista.innerHTML = "";
      N.servicios.filter(function (s) {
        return !filtro || (s.nombre + " " + s.descripcion).toLowerCase().indexOf(filtro) >= 0;
      }).forEach(function (s) {
        var chip = el("span", { clase: "rs-chip", texto: "⏱ " + s.duracion + " " + T.min });
        var precio = s.precio ? el("span", { clase: "rs-precio", texto: s.precio }) : null;
        lista.appendChild(opcion(st.servicio && st.servicio.id === s.id,
          el("span", { clase: "rs-ava", texto: iniciales(s.nombre) }), s.nombre, s.descripcion, chip,
          function () { st.servicio = s; st.hora = ""; ir(soloUnPro() ? 3 : 2); }, precio));
      });
    }
    var buscar = el("input", { clase: "rs-buscar", type: "search", placeholder: T.buscar, "aria-label": T.buscar,
      oninput: function () { pintar(buscar.value.trim().toLowerCase()); } });
    tarjeta.appendChild(el("h2", { texto: T.q1 }));
    if (N.servicios.length > 5) tarjeta.appendChild(buscar);
    tarjeta.appendChild(lista);
    pintar("");
  }

  function pasoProfesional() {
    var lista = el("div", { clase: "rs-lista" });
    lista.appendChild(opcion(st.profesional === "", el("span", { clase: "rs-ava redondo", texto: "★" }),
      T.cualquiera, T.cualquiera_sub, null, function () { st.profesional = ""; st.hora = ""; ir(3); }));
    N.profesionales.forEach(function (p) {
      lista.appendChild(opcion(st.profesional === p.id, el("span", { clase: "rs-ava redondo", texto: iniciales(p.nombre) }),
        p.nombre, p.especialidad, null, function () { st.profesional = p.id; st.hora = ""; ir(3); }));
    });
    tarjeta.appendChild(el("h2", { texto: T.q2 }));
    tarjeta.appendChild(lista);
  }

  function pasoFecha() {
    var dias = el("div", { clase: "rs-dias", role: "group", "aria-label": T.p3 });
    var horas = el("div");
    var p = N.hoy.split("-"), base = new Date(+p[0], +p[1] - 1, +p[2]);
    var primero = "";
    for (var i = 0; i < Math.min(N.dias_adelante, 21); i++) {
      var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      var iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      var abre = N.agenda.dias.indexOf((d.getDay() + 6) % 7) >= 0;
      if (abre && !primero) primero = iso;
      (function (iso, abre, d) {
        var b = el("button", { type: "button", clase: "rs-dia", "aria-pressed": st.fecha === iso ? "true" : "false",
          title: abre ? fechaLarga(iso) : T.cerrado,
          onclick: function () { st.fecha = iso; st.hora = ""; marcar(); cargar(); } },
          [el("small", { texto: DIAS[LANG][d.getDay()] }), el("b", { texto: String(d.getDate()) }),
           el("small", { texto: MESES[LANG][d.getMonth()] })]);
        b.disabled = !abre;
        b.dataset.iso = iso;
        dias.appendChild(b);
      })(iso, abre, d);
    }
    function marcar() {
      dias.querySelectorAll(".rs-dia").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.iso === st.fecha ? "true" : "false"); });
      actualizarBarra();
    }
    function cargar() {
      horas.innerHTML = "";
      horas.appendChild(el("p", { clase: "rs-cargando", texto: T.cargando }));
      var q = "api/disponibilidad?servicio=" + encodeURIComponent(st.servicio.id) + "&fecha=" + st.fecha +
              "&profesional=" + encodeURIComponent(st.profesional);
      var pedida = st.fecha;
      api(q).then(function (r) {
        if (pedida !== st.fecha) return;
        horas.innerHTML = "";
        var lista = (r.ok && r.datos.horas) || [];
        if (!lista.length) { horas.appendChild(el("p", { clase: "rs-vacio", texto: T.sin_huecos })); return; }
        [[T.manana, 0, 720], [T.tarde, 720, 1080], [T.noche, 1080, 1440]].forEach(function (f) {
          var dentro = lista.filter(function (h) { var m = +h.slice(0, 2) * 60 + +h.slice(3); return m >= f[1] && m < f[2]; });
          if (!dentro.length) return;
          horas.appendChild(el("p", { clase: "rs-franja", texto: f[0] }));
          var rej = el("div", { clase: "rs-horas" });
          dentro.forEach(function (h) {
            rej.appendChild(el("button", { type: "button", clase: "rs-hora", "aria-pressed": st.hora === h ? "true" : "false",
              texto: h, onclick: function () {
                st.hora = h;
                rej.parentNode.querySelectorAll(".rs-hora").forEach(function (b) { b.setAttribute("aria-pressed", b.textContent === h ? "true" : "false"); });
                actualizarBarra();
              } }));
          });
          horas.appendChild(rej);
        });
      }).catch(function () { horas.innerHTML = ""; horas.appendChild(el("p", { clase: "rs-vacio", texto: T.fallo })); });
    }
    tarjeta.appendChild(el("h2", { texto: T.q3 }));
    tarjeta.appendChild(dias);
    tarjeta.appendChild(horas);
    if (!st.fecha) st.fecha = primero;
    marcar();
    if (st.fecha) cargar();
  }

  function detalle() {
    var filas = [[T.p1, st.servicio.nombre + (st.servicio.precio ? " · " + st.servicio.precio : "")],
                 [T.p3, fechaLarga(st.fecha) + " · " + st.hora + " (" + st.servicio.duracion + " " + T.min + ")"]];
    if (st.profesional) filas.splice(1, 0, [T.p2, pro(st.profesional).nombre]);
    return el("div", { clase: "rs-detalle" }, filas.map(function (f) {
      return el("div", {}, [el("span", { texto: f[0] }), el("b", { texto: f[1] })]);
    }));
  }

  function pasoDatos() {
    tarjeta.appendChild(el("h2", { texto: T.q4 }));
    tarjeta.appendChild(detalle());
    var cuerpo = el("div");
    tarjeta.appendChild(cuerpo);
    pintarDatos(cuerpo);
  }

  function campo(id, etiqueta, tipo, valor, extra) {
    var input = el(tipo === "textarea" ? "textarea" : "input", Object.assign({ id: id, name: id }, extra || {}));
    if (tipo !== "textarea") input.type = tipo;
    input.value = valor || "";
    return { caja: el("div", { clase: "campo" }, [el("label", { for: id, texto: etiqueta }), input,
             el("p", { clase: "error", id: "e-" + id })]), input: input };
  }

  function pintarDatos(cuerpo) {
    cuerpo.innerHTML = "";
    var form = el("form", { clase: "rs-form", novalidate: "" });
    if (st.google) {
      form.appendChild(el("div", { clase: "rs-quien" }, [
        el("span", {}, [T.conectado + " ", el("b", { texto: st.google.email })]),
        el("button", { type: "button", texto: T.cambiar, onclick: function () { st.google = null; pintarDatos(cuerpo); } })]));
    } else if (N.google_client_id) {
      var hueco = el("div", { id: "rs-google-btn" });
      cuerpo.appendChild(el("div", { clase: "rs-google" }, [hueco]));
      cuerpo.appendChild(el("p", { clase: "rs-o", texto: T.google_o }));
      montarGoogle(hueco, cuerpo);
    }
    var fN = campo("nombre", T.nombre, "text", st.nombre, { autocomplete: "name", maxlength: "80" });
    var fE = campo("email", T.email, "email", st.email, { autocomplete: "email", maxlength: "120" });
    var fT = campo("telefono", T.telefono, "tel", st.telefono, { autocomplete: "tel", maxlength: "24" });
    var fX = campo("nota", T.nota, "textarea", st.nota, { rows: "2", maxlength: "500" });
    if (!st.google) { form.appendChild(fN.caja); form.appendChild(fE.caja); }
    form.appendChild(fT.caja);
    form.appendChild(fX.caja);
    var boton = el("button", { type: "submit", clase: "btn", texto: T.confirmar });
    var aviso = el("p", { clase: "rs-aviso", role: "alert" });
    form.appendChild(boton);
    form.appendChild(aviso);
    form.appendChild(el("button", { type: "button", clase: "rs-enlace", texto: "← " + T.atras, onclick: function () { ir(3); } }));
    cuerpo.appendChild(form);

    function errores() {
      var e = {};
      if (!st.google && fN.input.value.trim().length < 2) e.nombre = T.e_nombre;
      if (!st.google && !CORREO.test(fE.input.value.trim())) e.email = T.e_email;
      var tel = fT.input.value.replace(/\D/g, "");
      if (tel && tel.length < 7) e.telefono = T.e_telefono;
      return e;
    }
    function validar(mostrar) {
      var e = errores();
      ["nombre", "email", "telefono"].forEach(function (k) {
        var p = form.querySelector("#e-" + k);
        if (p) p.textContent = mostrar && mostrar[k] ? (e[k] || "") : "";
      });
      boton.disabled = Object.keys(e).length > 0;
      return e;
    }
    var tocados = {};
    form.addEventListener("input", function (ev) {
      tocados[ev.target.name] = true;
      st[ev.target.name] = ev.target.value;
      validar(tocados);
    });
    form.addEventListener("focusout", function (ev) { if (ev.target.name) { tocados[ev.target.name] = true; validar(tocados); } });
    validar(null);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (Object.keys(validar({ nombre: 1, email: 1, telefono: 1 })).length) return;
      boton.disabled = true;
      boton.textContent = T.confirmando;
      aviso.textContent = "";
      api("api/reservas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        servicio: st.servicio.id, profesional: st.profesional, fecha: st.fecha, hora: st.hora,
        nombre: fN.input.value.trim(), email: fE.input.value.trim(), telefono: fT.input.value.trim(),
        nota: fX.input.value.trim(), credencial_google: st.google ? st.google.credencial : "" }) })
      .then(function (r) {
        if (r.ok) { confirmada(r.datos); return; }
        boton.disabled = false;
        boton.textContent = T.confirmar;
        if (r.status === 409) { aviso.textContent = T.ocupado; st.hora = ""; setTimeout(function () { ir(3); }, 1600); return; }
        aviso.textContent = (r.datos && typeof r.datos.detail === "string") ? r.datos.detail : T.fallo;
      }).catch(function () { boton.disabled = false; boton.textContent = T.confirmar; aviso.textContent = T.fallo; });
    });
  }

  function montarGoogle(hueco, cuerpo) {
    function dibujar() {
      google.accounts.id.initialize({ client_id: N.google_client_id, callback: function (resp) {
        try {
          var datos = JSON.parse(decodeURIComponent(escape(atob(resp.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))));
          st.google = { credencial: resp.credential, email: datos.email, nombre: datos.name || "" };
          pintarDatos(cuerpo);
        } catch (e) { /* si el token no se lee, el formulario sigue disponible */ }
      } });
      google.accounts.id.renderButton(hueco, { theme: "outline", size: "large", shape: "pill", text: "continue_with", locale: LANG });
    }
    if (window.google && google.accounts) { dibujar(); return; }
    var s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = dibujar;
    document.head.appendChild(s);
  }

  function confirmada(r) {
    st.paso = 5;
    pintarPasos();
    barra.hidden = true;
    tarjeta.innerHTML = "";
    var check = el("div", { clase: "rs-check" });
    check.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
    var caja = el("div", { clase: "rs-listo" }, [
      check, el("h2", { texto: T.listo }), el("p", { texto: T.codigo }), el("span", { clase: "rs-codigo", texto: r.codigo })]);
    tarjeta.appendChild(caja);
    var filas = [[T.p1, r.servicio + (r.precio ? " · " + r.precio : "")], [T.p2, r.profesional],
                 [T.p3, fechaLarga(r.fecha) + " · " + r.hora]];
    tarjeta.appendChild(el("div", { clase: "rs-detalle" }, filas.map(function (f) {
      return el("div", {}, [el("span", { texto: f[0] }), el("b", { texto: f[1] })]);
    })));
    tarjeta.appendChild(el("p", { texto: r.correo === "enviando" ? T.correo_ok + " " + r.email + "." : T.correo_no }));
    // La cita viaja al inicio: allí se ve confirmada sin quedarse en el
    // asistente (el cliente no tiene que «salir» de un bucle de reservas).
    var guardada = { codigo: r.codigo, servicio: r.servicio, profesional: r.profesional, fecha: r.fecha,
                     hora: r.hora, email: r.email, calendario: r.calendario };
    try { localStorage.setItem("mi_cita", JSON.stringify(guardada)); } catch (e) { /* sin almacenamiento: no pasa nada */ }
    var acciones = el("div", { clase: "rs-acciones" }, [
      el("a", { clase: "btn", href: "./?cita=" + encodeURIComponent(r.codigo), texto: T.inicio }),
      el("a", { clase: "btn btn-borde", href: r.calendario, target: "_blank", rel: "noopener", texto: T.calendario })]);
    if (N.whatsapp) {
      var msg = encodeURIComponent(r.codigo + " · " + r.servicio + " · " + fechaLarga(r.fecha) + " " + r.hora + " · " + r.nombre);
      acciones.appendChild(el("a", { clase: "btn btn-borde", href: "https://wa.me/" + N.whatsapp + "?text=" + msg,
        target: "_blank", rel: "noopener", texto: T.whatsapp }));
    }
    var enlaces = el("p", { clase: "rs-enlaces" });
    enlaces.appendChild(el("button", { type: "button", clase: "rs-enlace", texto: T.otra, onclick: function () {
      st.servicio = null; st.hora = ""; st.fecha = ""; st.profesional = ""; ir(1); } }));
    enlaces.appendChild(el("button", { type: "button", clase: "rs-enlace", texto: T.cancelar, onclick: function (ev) {
      var b = ev.currentTarget;
      api("api/reservas/" + encodeURIComponent(r.codigo) + "/cancelar", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: r.email }) })
      .then(function (x) {
        if (x.ok) {
          try { localStorage.removeItem("mi_cita"); } catch (e) { /* nada */ }
          b.replaceWith(el("span", { clase: "rs-aviso", texto: T.cancelada }));
        }
      });
    } }));
    tarjeta.appendChild(acciones);
    tarjeta.appendChild(enlaces);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  api("api/negocio").then(function (r) {
    if (!r.ok) throw new Error("negocio");
    N = r.datos;
    var pedido = new URLSearchParams(location.search).get("servicio");
    var s = N.servicios.filter(function (x) { return x.id === pedido; })[0];
    if (s) { st.servicio = s; ir(soloUnPro() ? 3 : 2); } else { ir(1); }
  }).catch(function () {
    tarjeta.innerHTML = "";
    tarjeta.appendChild(el("p", { clase: "rs-vacio", texto: T.fallo }));
  });
})();
"""


# ---------------------------------------------------------------------------
# Página /panel (dueño): agenda por profesional, cobros, resumen y clientes
# ---------------------------------------------------------------------------
_PANEL_UI = {
    "es": {
        "panel": "Panel del negocio", "agenda": "Agenda", "resumen": "Resumen", "clientes": "Clientes",
        "ver_pagina": "Ver página", "salir": "Salir", "hoy": "Hoy", "nueva": "Nueva cita",
        "crear_titulo": "Crea la clave del panel", "crear_sub": "Solo tú la sabrás. Con ella ves la agenda, los cobros y los clientes.",
        "entrar_titulo": "Entra al panel", "entrar_sub": "Escribe la clave del negocio.",
        "clave": "Clave", "repetir": "Repite la clave", "e_corta": "Mínimo 8 caracteres.", "e_distinta": "Las claves no coinciden.",
        "crear": "Crear y entrar", "entrar": "Entrar", "entrando": "Entrando…",
        "citas": "Citas", "pendientes": "Por atender", "esperado": "Esperado", "cobrado": "Cobrado",
        "sin_citas": "No hay citas este día.", "cerrado": "Cerrado este día.",
        "atendida": "Atendida", "no_asistio": "No asistió", "cancelada": "Cancelada", "confirmada": "Confirmada",
        "marcar_atendida": "Atendida", "marcar_no": "No asistió", "cancelar": "Cancelar", "reactivar": "Reactivar", "deshacer": "Deshacer",
        "como_pago": "¿Cómo pagó?", "efectivo": "Efectivo", "nequi": "Nequi", "tarjeta": "Tarjeta", "transferencia": "Transferencia",
        "pago_en": "Pagó con", "ingresos_hoy": "Ingresos de hoy", "ingresos_mes": "Ingresos del mes",
        "citas_hoy": "Citas de hoy", "proximas": "Próximas citas", "inasistencia": "Inasistencia del mes",
        "ultimos": "Últimos 14 días", "top_servicios": "Servicios más pedidos (mes)", "por_pro": "Por profesional (mes)",
        "ejemplos": "Estás viendo citas de EJEMPLO para que veas el panel en uso.", "borrar_ejemplos": "Borrar ejemplos",
        "buscar": "Buscar por nombre, correo o celular…", "visitas": "Visitas", "gastado": "Gastado",
        "ultima": "Última", "proxima": "Próxima", "faltas": "Faltas", "cliente": "Cliente", "celular": "Celular",
        "sin_clientes": "Todavía no hay clientes.", "error": "No se pudo cargar. Revisa tu conexión.",
        "clave_mal": "Clave incorrecta.", "ocupado": "Esa hora ya la tiene otra cita.",
    },
    "en": {
        "panel": "Business panel", "agenda": "Schedule", "resumen": "Overview", "clientes": "Clients",
        "ver_pagina": "View site", "salir": "Log out", "hoy": "Today", "nueva": "New booking",
        "crear_titulo": "Create the panel password", "crear_sub": "Only you will know it. It unlocks the schedule, payments and clients.",
        "entrar_titulo": "Sign in to the panel", "entrar_sub": "Enter the business password.",
        "clave": "Password", "repetir": "Repeat password", "e_corta": "At least 8 characters.", "e_distinta": "Passwords don't match.",
        "crear": "Create and enter", "entrar": "Sign in", "entrando": "Signing in…",
        "citas": "Bookings", "pendientes": "To serve", "esperado": "Expected", "cobrado": "Collected",
        "sin_citas": "No bookings this day.", "cerrado": "Closed this day.",
        "atendida": "Done", "no_asistio": "No-show", "cancelada": "Cancelled", "confirmada": "Confirmed",
        "marcar_atendida": "Done", "marcar_no": "No-show", "cancelar": "Cancel", "reactivar": "Restore", "deshacer": "Undo",
        "como_pago": "How did they pay?", "efectivo": "Cash", "nequi": "Nequi", "tarjeta": "Card", "transferencia": "Transfer",
        "pago_en": "Paid by", "ingresos_hoy": "Today's revenue", "ingresos_mes": "Month revenue",
        "citas_hoy": "Today's bookings", "proximas": "Upcoming", "inasistencia": "No-show rate (month)",
        "ultimos": "Last 14 days", "top_servicios": "Top services (month)", "por_pro": "By professional (month)",
        "ejemplos": "You're looking at SAMPLE bookings so you can see the panel in use.", "borrar_ejemplos": "Delete samples",
        "buscar": "Search by name, email or phone…", "visitas": "Visits", "gastado": "Spent",
        "ultima": "Last", "proxima": "Next", "faltas": "No-shows", "cliente": "Client", "celular": "Phone",
        "sin_clientes": "No clients yet.", "error": "Couldn't load. Check your connection.",
        "clave_mal": "Wrong password.", "ocupado": "That time is taken by another booking.",
    },
}


def panel_html(d: DominioLanding, pal: dict, idioma: str, base: str) -> str:
    t = _PANEL_UI.get(idioma, _PANEL_UI["es"])
    inicial = next((ch for ch in d.nombre.upper() if ch.isalnum()), "A")
    textos_json = json.dumps(t, ensure_ascii=False).replace("</", "<\\/")
    return f'''<!doctype html>
<html lang="{idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{_e(t["panel"])} · {_e(d.nombre)}</title>
<meta name="theme-color" content="{pal["hero"]}">
<link rel="icon" href="{base}icono.svg" type="image/svg+xml">
<link rel="stylesheet" href="{base}styles.css">
<link rel="stylesheet" href="{base}panel.css">
</head>
<body class="pag-panel">
<section class="pn-acceso" id="pn-acceso" hidden>
<form class="pn-login" id="pn-login" novalidate>
<span class="rs-logo" aria-hidden="true">{_e(inicial)}</span>
<p class="pn-negocio">{_e(d.nombre)}</p>
<h1 id="pn-login-titulo"></h1>
<p class="pn-sub" id="pn-login-sub"></p>
<label for="pn-clave">{_e(t["clave"])}</label>
<input id="pn-clave" type="password" autocomplete="current-password" required>
<p class="error" id="pn-e-clave"></p>
<div id="pn-repetir-caja" hidden>
<label for="pn-repetir">{_e(t["repetir"])}</label>
<input id="pn-repetir" type="password" autocomplete="new-password">
<p class="error" id="pn-e-repetir"></p>
</div>
<button class="btn" id="pn-entrar" type="submit" disabled></button>
<p class="error" id="pn-e-login" role="alert"></p>
</form>
</section>
<div class="pn-app" id="pn-app" hidden>
<header class="pn-cab">
<div class="pn-cab-in">
<a class="pn-marca" href="./"><span class="rs-logo" aria-hidden="true">{_e(inicial)}</span><span><b>{_e(d.nombre)}</b><small>{_e(t["panel"])}</small></span></a>
<nav class="pn-tabs" id="pn-tabs" role="tablist">
<button role="tab" data-tab="agenda" aria-selected="true">{_e(t["agenda"])}</button>
<button role="tab" data-tab="resumen" aria-selected="false">{_e(t["resumen"])}</button>
<button role="tab" data-tab="clientes" aria-selected="false">{_e(t["clientes"])}</button>
</nav>
<div class="pn-cab-acc"><a href="./" class="pn-link">{_e(t["ver_pagina"])}</a><button type="button" class="pn-link" id="pn-salir">{_e(t["salir"])}</button></div>
</div>
</header>
<p class="pn-ejemplos" id="pn-ejemplos" hidden><span>{_e(t["ejemplos"])}</span><button type="button" id="pn-borrar-ejemplos">{_e(t["borrar_ejemplos"])}</button></p>
<main class="pn-main" id="pn-main"></main>
</div>
<script id="pn-textos" type="application/json">{textos_json}</script>
<script src="{base}panel.js" defer></script>
</body>
</html>
'''


PANEL_CSS = """
.pag-panel{background:var(--fondo);color:var(--tinta);min-height:100vh}
.pag-panel [hidden]{display:none !important}
.pn-acceso{min-height:100vh;display:grid;place-items:center;padding:24px 16px;
  background:radial-gradient(60% 50% at 50% 0%,color-mix(in srgb,var(--acc) 40%,transparent),transparent 70%),var(--hero)}
.pn-login{width:100%;max-width:400px;background:var(--superficie);border-radius:20px;padding:28px;text-align:center;
  box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
.pn-login .rs-logo{margin:0 auto}
.pn-negocio{margin:12px 0 0;font-weight:700;color:var(--tinta-2)}
.pn-login h1{font-size:1.4rem;margin:4px 0 4px}
.pn-sub{color:var(--tinta-2);margin:0 0 18px;font-size:.95rem}
.pn-login label{display:block;text-align:left;font-weight:600;font-size:.9rem;margin:10px 0 6px}
.pn-login input{width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--borde);font:inherit;background:var(--superficie);color:var(--tinta)}
.pn-login input:focus{outline:2px solid var(--acc);outline-offset:1px}
.pn-login .btn{width:100%;margin-top:14px}
.pn-login .btn:disabled{opacity:.5;cursor:not-allowed}
.pag-panel .error{color:var(--error);font-size:.85rem;margin:4px 0 0;min-height:1em;text-align:left}
.pag-panel .rs-logo{display:inline-grid;place-items:center;width:52px;height:52px;border-radius:50%;background:var(--acc);color:#fff;font-size:1.4rem;font-weight:800}
.pn-cab{background:var(--hero);color:#fff;position:sticky;top:0;z-index:20}
.pn-cab-in{max-width:1200px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.pn-marca{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;margin-right:auto}
.pn-marca .rs-logo{width:38px;height:38px;font-size:1rem}
.pn-marca b{display:block;line-height:1.2}
.pn-marca small{display:block;color:rgba(255,255,255,.65);font-size:.78rem}
.pn-tabs{display:flex;gap:4px;background:rgba(255,255,255,.08);padding:4px;border-radius:12px}
.pn-tabs button{background:none;border:0;color:rgba(255,255,255,.75);font:inherit;font-weight:600;font-size:.92rem;padding:8px 14px;border-radius:9px;cursor:pointer}
.pn-tabs button[aria-selected=true]{background:#fff;color:var(--hero)}
.pn-cab-acc{display:flex;gap:6px}
.pn-link{background:none;border:0;color:rgba(255,255,255,.8);font:inherit;font-size:.9rem;text-decoration:none;cursor:pointer;padding:6px 8px}
.pn-link:hover{color:#fff}
.pn-ejemplos{max-width:1200px;margin:14px auto 0;padding:10px 14px;border-radius:12px;background:var(--acc-suave);
  display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;font-size:.92rem;width:calc(100% - 32px)}
.pn-ejemplos button{background:none;border:1px solid var(--acc);color:var(--acc);border-radius:8px;padding:6px 10px;font:inherit;font-weight:600;cursor:pointer}
.pn-main{max-width:1200px;margin:0 auto;padding:16px 16px 48px}
.pn-barra{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0 16px}
.pn-barra h2{font-size:1.25rem;margin:0 8px 0 0}
.pn-barra h2::first-letter{text-transform:uppercase}
.pn-ico{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:10px;border:1px solid var(--linea);background:var(--superficie);color:var(--tinta);font:inherit;font-size:1.1rem;cursor:pointer}
.pn-chipbtn{border:1px solid var(--linea);background:var(--superficie);color:var(--tinta);border-radius:10px;padding:8px 12px;font:inherit;font-weight:600;cursor:pointer}
.pn-barra .btn{margin-left:auto;min-height:40px;padding:.5rem 1rem}
.pn-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}
.pn-kpi{background:var(--superficie);border:1px solid var(--linea);border-radius:14px;padding:14px 16px}
.pn-kpi small{display:block;color:var(--tinta-2);font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.pn-kpi b{display:block;font-size:1.6rem;letter-spacing:-.01em;margin-top:4px}
.pn-kpi.acento b{color:var(--acc)}
.pn-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;align-items:start}
.pn-col{background:var(--superficie);border:1px solid var(--linea);border-radius:16px;padding:12px}
.pn-col-cab{display:flex;align-items:center;gap:10px;padding:4px 4px 12px;border-bottom:1px solid var(--linea);margin-bottom:10px}
.pn-ava{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:var(--acc-suave);color:var(--acc);font-weight:800}
.pn-col-cab b{display:block;line-height:1.2}
.pn-col-cab small{color:var(--tinta-2);font-size:.8rem}
.pn-cita{border:1px solid var(--linea);border-left:4px solid var(--acc);border-radius:12px;padding:10px 12px;margin-bottom:10px;background:var(--fondo)}
.pn-cita.atendida{border-left-color:var(--exito)}
.pn-cita.no_asistio{border-left-color:var(--error);opacity:.8}
.pn-cita.cancelada{border-left-color:var(--borde);opacity:.6}
.pn-cita.cancelada .pn-quien{text-decoration:line-through}
.pn-hora{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:700;font-size:.92rem}
.pn-estado{font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--acc-suave);color:var(--acc);text-transform:uppercase;letter-spacing:.04em}
.pn-estado.atendida{background:color-mix(in srgb,var(--exito) 14%,transparent);color:var(--exito)}
.pn-estado.no_asistio{background:color-mix(in srgb,var(--error) 12%,transparent);color:var(--error)}
.pn-estado.cancelada{background:var(--linea);color:var(--tinta-2)}
.pn-quien{font-weight:650;margin:4px 0 0}
.pn-que{color:var(--tinta-2);font-size:.88rem;margin:2px 0 0}
.pn-tel{font-size:.85rem;color:var(--acc);text-decoration:none;font-weight:600}
.pn-acc{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px}
.pn-acc button{border:1px solid var(--linea);background:var(--superficie);color:var(--tinta);border-radius:8px;padding:6px 10px;font:inherit;font-size:.82rem;font-weight:600;cursor:pointer}
.pn-acc button.si{background:var(--exito);border-color:var(--exito);color:#fff}
.pn-acc button:disabled{opacity:.5}
.pn-pago{font-size:.82rem;color:var(--exito);font-weight:600;margin:6px 0 0}
.pn-vacio{padding:22px;text-align:center;color:var(--tinta-2);background:var(--superficie);border:1px dashed var(--borde);border-radius:14px}
.pn-col .pn-vacio{padding:14px;border:0;background:none;font-size:.9rem}
.pn-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.pn-caja{background:var(--superficie);border:1px solid var(--linea);border-radius:16px;padding:16px}
.pn-caja h3{font-size:1rem;margin:0 0 14px}
.pn-grafica{display:flex;align-items:flex-end;gap:6px;height:170px;padding-top:8px}
.pn-barra-g{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end}
.pn-barra-g i{display:block;width:100%;max-width:34px;border-radius:6px 6px 2px 2px;background:var(--acc);min-height:3px}
.pn-barra-g.hoy i{background:var(--hero)}
.pn-barra-g small{font-size:.7rem;color:var(--tinta-2)}
.pn-rank{display:grid;gap:10px}
.pn-rank div{display:grid;gap:4px}
.pn-rank p{display:flex;justify-content:space-between;gap:8px;margin:0;font-size:.92rem}
.pn-rank p span{color:var(--tinta-2);white-space:nowrap}
.pn-rank i{display:block;height:8px;border-radius:99px;background:var(--acc)}
.pn-buscar{width:100%;max-width:420px;padding:11px 14px;border-radius:12px;border:1px solid var(--borde);font:inherit;background:var(--superficie);color:var(--tinta);margin-bottom:14px}
.pn-tabla-caja{overflow-x:auto;background:var(--superficie);border:1px solid var(--linea);border-radius:16px}
.pn-tabla{width:100%;border-collapse:collapse;font-size:.92rem}
.pn-tabla th{text-align:left;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:var(--tinta-2);padding:12px 14px;border-bottom:1px solid var(--linea);white-space:nowrap}
.pn-tabla td{padding:12px 14px;border-bottom:1px solid var(--linea);vertical-align:top}
.pn-tabla tr:last-child td{border-bottom:0}
.pn-tabla td small{display:block;color:var(--tinta-2)}
.pn-num{text-align:right;white-space:nowrap}
@media (max-width:640px){.pn-tabs{order:3;width:100%}.pn-tabs button{flex:1}.pn-kpi b{font-size:1.3rem}
  .pn-barra h2{flex-basis:100%;margin:0 0 4px}.pn-barra .btn{margin-left:0;width:100%}.pn-cab-acc{margin-left:auto}}
"""


PANEL_JS = r"""(function () {
  "use strict";
  var T = JSON.parse(document.getElementById("pn-textos").textContent);
  var CLAVE = "panel_sesion";
  var token = "";
  try { token = localStorage.getItem(CLAVE) || ""; } catch (e) { token = ""; }
  var main = document.getElementById("pn-main");
  var tab = "agenda";
  var fecha = null;
  var buscarTimer = null;
  var configurado = true;

  function el(tag, o, hijos) {
    var n = document.createElement(tag);
    o = o || {};
    if (o.clase) n.className = o.clase;
    if (o.texto != null) n.textContent = o.texto;
    if (o.attrs) Object.keys(o.attrs).forEach(function (k) { n.setAttribute(k, o.attrs[k]); });
    if (o.click) n.addEventListener("click", o.click);
    (hijos || []).forEach(function (h) { if (h) n.appendChild(h); });
    return n;
  }
  function $(id) { return document.getElementById(id); }
  function plata(n) { return "$" + Number(n || 0).toLocaleString("es-CO"); }
  function guardar(t) { token = t; try { if (t) localStorage.setItem(CLAVE, t); else localStorage.removeItem(CLAVE); } catch (e) {} }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function deIso(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function wa(tel) { var d = (tel || "").replace(/\D/g, ""); return d ? "https://wa.me/" + (d.length === 10 ? "57" + d : d) : ""; }

  function api(ruta, metodo, cuerpo) {
    var o = { method: metodo || "GET", headers: { "Authorization": "Bearer " + token } };
    if (cuerpo) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(cuerpo); }
    return fetch(ruta, o).then(function (r) {
      if (r.status === 401) { guardar(""); acceso(); throw new Error("401"); }
      return r.json().then(function (j) {
        if (!r.ok) { var e = new Error(j.detail || "error"); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  // ---------------- acceso ----------------
  function textoBoton() { return configurado ? T.entrar : T.crear; }
  function acceso() {
    $("pn-app").hidden = true;
    $("pn-acceso").hidden = false;
    fetch("api/panel/estado").then(function (r) { return r.json(); }).then(function (j) {
      configurado = j.configurado;
      $("pn-login-titulo").textContent = configurado ? T.entrar_titulo : T.crear_titulo;
      $("pn-login-sub").textContent = configurado ? T.entrar_sub : T.crear_sub;
      $("pn-repetir-caja").hidden = configurado;
      $("pn-clave").setAttribute("autocomplete", configurado ? "current-password" : "new-password");
      $("pn-entrar").textContent = textoBoton();
      validar();
      $("pn-clave").focus();
    }).catch(function () { $("pn-e-login").textContent = T.error; });
  }
  function validar() {
    var c = $("pn-clave").value, r = $("pn-repetir").value, ok = c.length > 0;
    $("pn-e-clave").textContent = "";
    $("pn-e-repetir").textContent = "";
    if (!configurado) {
      if (c && c.length < 8) $("pn-e-clave").textContent = T.e_corta;
      if (r && r !== c) $("pn-e-repetir").textContent = T.e_distinta;
      ok = c.length >= 8 && r === c;
    }
    $("pn-entrar").disabled = !ok;
    return ok;
  }
  $("pn-clave").addEventListener("input", validar);
  $("pn-repetir").addEventListener("input", validar);
  $("pn-login").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!validar()) return;
    var b = $("pn-entrar"), err = $("pn-e-login");
    b.disabled = true; b.textContent = T.entrando; err.textContent = "";
    fetch(configurado ? "api/panel/entrar" : "api/panel/crear", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave: $("pn-clave").value })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        b.textContent = textoBoton();
        if (!x.ok) { err.textContent = x.j.detail || T.clave_mal; validar(); return; }
        guardar(x.j.token);
        $("pn-clave").value = ""; $("pn-repetir").value = "";
        abrir();
      }).catch(function () { err.textContent = T.error; b.textContent = textoBoton(); validar(); });
  });
  $("pn-salir").addEventListener("click", function () { guardar(""); acceso(); });

  // ---------------- app ----------------
  function abrir() {
    $("pn-acceso").hidden = true;
    $("pn-app").hidden = false;
    pintar();
  }
  Array.prototype.forEach.call(document.querySelectorAll("#pn-tabs button"), function (b) {
    b.addEventListener("click", function () {
      tab = b.getAttribute("data-tab");
      Array.prototype.forEach.call(document.querySelectorAll("#pn-tabs button"), function (x) {
        x.setAttribute("aria-selected", x === b ? "true" : "false");
      });
      pintar();
    });
  });
  $("pn-borrar-ejemplos").addEventListener("click", function () {
    api("api/panel/ejemplos/borrar", "POST").then(function () { $("pn-ejemplos").hidden = true; pintar(); });
  });

  function fallo(e) {
    if (e && e.message === "401") return;
    main.innerHTML = "";
    main.appendChild(el("p", { clase: "pn-vacio", texto: T.error }));
  }
  function pintar() {
    main.innerHTML = "";
    main.appendChild(el("p", { clase: "pn-vacio", texto: "…" }));
    api("api/panel/resumen").then(function (r) {
      $("pn-ejemplos").hidden = !r.hay_ejemplos;
      if (tab === "agenda") return agenda();
      if (tab === "resumen") return resumen(r);
      main.innerHTML = "";
      return clientes("");
    }).catch(fallo);
  }

  function kpi(etq, valor, acento) {
    return el("div", { clase: "pn-kpi" + (acento ? " acento" : "") }, [el("small", { texto: etq }), el("b", { texto: String(valor) })]);
  }

  // ---- agenda ----
  function agenda() {
    return api("api/panel/agenda" + (fecha ? "?fecha=" + fecha : "")).then(function (a) {
      fecha = a.fecha;
      main.innerHTML = "";
      var etiqueta = deIso(a.fecha).toLocaleDateString(document.documentElement.lang || "es", { weekday: "long", day: "numeric", month: "long" });
      function mover(n) { var x = deIso(fecha); x.setDate(x.getDate() + n); fecha = iso(x); agenda().catch(fallo); }
      main.appendChild(el("div", { clase: "pn-barra" }, [
        el("h2", { texto: etiqueta }),
        el("button", { clase: "pn-ico", texto: "‹", attrs: { "aria-label": "←", type: "button" }, click: function () { mover(-1); } }),
        el("button", { clase: "pn-ico", texto: "›", attrs: { "aria-label": "→", type: "button" }, click: function () { mover(1); } }),
        el("button", { clase: "pn-chipbtn", texto: T.hoy, attrs: { type: "button" }, click: function () { fecha = null; agenda().catch(fallo); } }),
        el("a", { clase: "btn", texto: "+ " + T.nueva, attrs: { href: "reservar", target: "_blank", rel: "noopener" } })
      ]));
      main.appendChild(el("div", { clase: "pn-kpis" }, [
        kpi(T.citas, a.citas.filter(function (c) { return c.estado !== "cancelada"; }).length),
        kpi(T.pendientes, a.citas.filter(function (c) { return c.estado === "confirmada"; }).length),
        kpi(T.esperado, plata(a.esperado)),
        kpi(T.cobrado, plata(a.cobrado), true)
      ]));
      if (!a.citas.length) {
        main.appendChild(el("p", { clase: "pn-vacio", texto: a.abierto ? T.sin_citas : T.cerrado }));
        return;
      }
      var cols = el("div", { clase: "pn-cols" });
      a.profesionales.forEach(function (p) {
        var suyas = a.citas.filter(function (c) { return c.profesional_id === p.id; });
        var col = el("section", { clase: "pn-col" }, [
          el("div", { clase: "pn-col-cab" }, [
            el("span", { clase: "pn-ava", texto: (p.nombre || "?").charAt(0) }),
            el("div", {}, [el("b", { texto: p.nombre }), el("small", { texto: suyas.length + " · " + T.citas.toLowerCase() })])
          ])
        ]);
        if (!suyas.length) col.appendChild(el("p", { clase: "pn-vacio", texto: T.sin_citas }));
        suyas.forEach(function (c) { col.appendChild(tarjetaCita(c)); });
        cols.appendChild(col);
      });
      main.appendChild(cols);
    });
  }

  function cambiar(c, estado, pago, boton) {
    if (boton) boton.disabled = true;
    return api("api/panel/reservas/" + encodeURIComponent(c.codigo) + "/estado", "POST", { estado: estado, pago: pago || "" })
      .then(function () { return agenda(); })
      .catch(function (e) {
        if (boton) boton.disabled = false;
        if (e && e.status === 409) window.alert(T.ocupado);
      });
  }

  function tarjetaCita(c) {
    var enlace = wa(c.telefono);
    var caja = el("article", { clase: "pn-cita " + c.estado }, [
      el("div", { clase: "pn-hora" }, [el("span", { texto: c.hora + " – " + c.fin }), el("span", { clase: "pn-estado " + c.estado, texto: T[c.estado] || c.estado })]),
      el("p", { clase: "pn-quien", texto: c.nombre }),
      el("p", { clase: "pn-que", texto: c.servicio + (c.precio ? " · " + plata(c.precio) : "") }),
      enlace ? el("a", { clase: "pn-tel", texto: c.telefono, attrs: { href: enlace, target: "_blank", rel: "noopener" } }) : null,
      c.nota ? el("p", { clase: "pn-que", texto: "“" + c.nota + "”" }) : null
    ]);
    var acc = el("div", { clase: "pn-acc" });
    if (c.estado === "confirmada") {
      acc.appendChild(el("button", { clase: "si", texto: "✓ " + T.marcar_atendida, attrs: { type: "button" }, click: function () {
        acc.innerHTML = "";
        acc.appendChild(el("span", { clase: "pn-que", texto: T.como_pago }));
        ["efectivo", "nequi", "tarjeta", "transferencia"].forEach(function (m) {
          acc.appendChild(el("button", { texto: T[m], attrs: { type: "button" }, click: function (ev) { cambiar(c, "atendida", m, ev.currentTarget); } }));
        });
      } }));
      acc.appendChild(el("button", { texto: T.marcar_no, attrs: { type: "button" }, click: function (ev) { cambiar(c, "no_asistio", "", ev.currentTarget); } }));
      acc.appendChild(el("button", { texto: T.cancelar, attrs: { type: "button" }, click: function (ev) { cambiar(c, "cancelada", "", ev.currentTarget); } }));
    } else {
      if (c.estado === "atendida") caja.appendChild(el("p", { clase: "pn-pago", texto: T.pago_en + " " + (T[c.pago] || c.pago) + " · " + plata(c.cobrado) }));
      acc.appendChild(el("button", { texto: c.estado === "atendida" ? T.deshacer : T.reactivar, attrs: { type: "button" }, click: function (ev) { cambiar(c, "confirmada", "", ev.currentTarget); } }));
    }
    caja.appendChild(acc);
    return caja;
  }

  // ---- resumen ----
  function resumen(r) {
    main.innerHTML = "";
    main.appendChild(el("div", { clase: "pn-kpis" }, [
      kpi(T.ingresos_hoy, plata(r.ingresos_hoy), true),
      kpi(T.ingresos_mes, plata(r.ingresos_mes), true),
      kpi(T.citas_hoy, r.citas_hoy),
      kpi(T.proximas, r.proximas),
      kpi(T.inasistencia, r.inasistencia + "%")
    ]));
    var max = Math.max.apply(null, r.serie.map(function (s) { return s.citas; }).concat([1]));
    var graf = el("div", { clase: "pn-grafica" });
    r.serie.forEach(function (s) {
      var barra = el("i");
      barra.style.height = Math.round(100 * s.citas / max) + "%";
      graf.appendChild(el("div", { clase: "pn-barra-g" + (s.fecha === r.hoy ? " hoy" : ""), attrs: { title: s.fecha + " · " + s.citas + " · " + plata(s.ingresos) } },
        [barra, el("small", { texto: String(+s.fecha.slice(8)) })]));
    });
    function rank(lista) {
      var tope = Math.max.apply(null, lista.map(function (x) { return x.citas; }).concat([1]));
      var caja = el("div", { clase: "pn-rank" });
      if (!lista.length) caja.appendChild(el("p", { clase: "pn-que", texto: T.sin_citas }));
      lista.forEach(function (x) {
        var b = el("i");
        b.style.width = Math.round(100 * x.citas / tope) + "%";
        caja.appendChild(el("div", {}, [el("p", {}, [el("b", { texto: x.nombre }), el("span", { texto: x.citas + " · " + plata(x.ingresos) })]), b]));
      });
      return caja;
    }
    main.appendChild(el("div", { clase: "pn-grid2" }, [
      el("section", { clase: "pn-caja" }, [el("h3", { texto: T.ultimos }), graf]),
      el("section", { clase: "pn-caja" }, [el("h3", { texto: T.top_servicios }), rank(r.servicios)]),
      el("section", { clase: "pn-caja" }, [el("h3", { texto: T.por_pro }), rank(r.profesionales)])
    ]));
  }

  // ---- clientes ----
  function clientes(q) {
    return api("api/panel/clientes?q=" + encodeURIComponent(q)).then(function (r) {
      var input = main.querySelector(".pn-buscar");
      if (!input) {
        main.innerHTML = "";
        input = el("input", { clase: "pn-buscar", attrs: { type: "search", placeholder: T.buscar, "aria-label": T.buscar } });
        input.addEventListener("input", function () {
          clearTimeout(buscarTimer);
          buscarTimer = setTimeout(function () { clientes(input.value).catch(fallo); }, 250);
        });
        main.appendChild(input);
        main.appendChild(el("div", { clase: "pn-tabla-caja", attrs: { id: "pn-tabla" } }));
      }
      var caja = $("pn-tabla");
      caja.innerHTML = "";
      if (!r.clientes.length) { caja.appendChild(el("p", { clase: "pn-vacio", texto: T.sin_clientes })); return; }
      var cab = el("tr");
      [T.cliente, T.celular, T.visitas, T.gastado, T.ultima, T.proxima, T.faltas].forEach(function (h, i) {
        cab.appendChild(el("th", { clase: (i === 2 || i === 3 || i === 6) ? "pn-num" : "", texto: h }));
      });
      var tbody = el("tbody");
      r.clientes.forEach(function (c) {
        var enlace = wa(c.telefono);
        tbody.appendChild(el("tr", {}, [
          el("td", {}, [el("b", { texto: c.nombre }), el("small", { texto: c.email })]),
          el("td", {}, [enlace ? el("a", { clase: "pn-tel", texto: c.telefono, attrs: { href: enlace, target: "_blank", rel: "noopener" } }) : el("span", { texto: "—" })]),
          el("td", { clase: "pn-num", texto: String(c.visitas) }),
          el("td", { clase: "pn-num", texto: plata(c.gastado) }),
          el("td", { texto: c.ultima }),
          el("td", { texto: c.proxima || "—" }),
          el("td", { clase: "pn-num", texto: String(c.inasistencias) })
        ]));
      });
      caja.appendChild(el("table", { clase: "pn-tabla" }, [el("thead", {}, [cab]), tbody]));
    });
  }

  if (token) abrir(); else acceso();
})();
"""
