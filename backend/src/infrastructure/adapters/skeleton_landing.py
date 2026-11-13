"""Esqueleto de LANDING PAGE: la página de ESE negocio, no una plantilla con su nombre.

Historia (por qué se reescribió)
--------------------------------
La v1 recibía un título, un lema, un botón y tres párrafos `{heading, text}`, y
los apilaba numerados (01, 02, 03) bajo un hero centrado. Pidieras lo que
pidieras salía la misma página: los servicios iban dentro de un párrafo, el
WhatsApp aparecía escrito pero no se podía pulsar, el botón final apuntaba a
`#` (un botón que no lleva a nada) y su texto se cortaba a ciegas a 30
caracteres. Eso es lo que el usuario llamaba «el modelo básico».

Ahora la ESTRUCTURA sale del negocio (`DominioLanding`): rejilla de servicios
con precio, tabla de planes solo si vende planes, horarios solo si importan,
pasos de «cómo reservar», testimonios, preguntas frecuentes y un contacto que
FUNCIONA — un formulario que guarda el mensaje en el backend de la propia
landing, con WhatsApp/correo como canal directo. El código sigue siendo fijo y
correcto por construcción; el modelo solo aporta el contenido.

Dos formas de entrega comparten el mismo HTML:
- `construir_landing_desde` (esqueleto): mini FastAPI que sirve la página y
  recibe el formulario (`POST /api/contacto`, SQLite de la biblioteca estándar).
- `archivos_landing_estatica` (base dorada estática): sin backend; el
  formulario abre WhatsApp o el correo con el mensaje ya escrito.

Reglas que se mantienen: rutas RELATIVAS, cero emojis como iconos (SVG de
trazo), DIXEL perfil `sitio` dentro del proyecto y encendido con el acento de
la marca, respeto a `prefers-reduced-motion`, y ningún enlace a `#` vacío.
"""

from __future__ import annotations

import html
import json
import re
from datetime import date
from urllib.parse import quote

from src.domain.dominio_landing import DominioLanding
from src.domain.entities import GeneratedFile, GeneratedProject
from src.infrastructure.adapters import dixel_assets

MARCADOR = "backend/.esqueleto"

# ---------------------------------------------------------------------------
# Iconos (SVG de trazo, monocromos: heredan el color del texto)
# ---------------------------------------------------------------------------
_ICONOS = {
    "tijeras": '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    "estrella": '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    "corazon": '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
    "reloj": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    "calendario": '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    "ubicacion": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    "chat": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    "hoja": '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.2-6.1"/>',
    "sol": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    "luna": '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
    "rayo": '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    "escudo": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    "check": '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    "regalo": '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    "usuario": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    "grupo": '<circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0M16 3.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 4 7"/>',
    "taza": '<path d="M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v3M10 2v3M14 2v3"/>',
    "casa": '<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    "herramienta": '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
    "camara": '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
    "musica": '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    "libro": '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    "carrito": '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
    "auto": '<path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5M3 12h18"/>',
    "salud": '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    "chispa": '<path d="M12 3l1.9 5.8L20 10.7l-6.1 1.9L12 18.5l-1.9-5.9L4 10.7l6.1-1.9z"/><path d="M19 3v4M17 5h4"/>',
    # De interfaz (no los elige el modelo):
    "telefono": '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    "correo": '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
    "instagram": '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
    "menu": '<path d="M3 6h18M3 12h18M3 18h18"/>',
    "flecha": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    "whatsapp": '<path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 7.9 19.5z"/><path d="M9 8.6c0 3.3 3.1 6.4 6.4 6.4l1.1-1.6-2-1-1 1c-1-.4-2.4-1.8-2.8-2.8l1-1-1-2z"/>',
}


def _ico(nombre: str, clase: str = "ico") -> str:
    trazo = _ICONOS.get(nombre) or _ICONOS["estrella"]
    return f'<svg class="{clase}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{trazo}</svg>'


# ---------------------------------------------------------------------------
# Color: la marca manda, pero con contraste garantizado
# ---------------------------------------------------------------------------
#: (fondo, superficie, tinta, tinta suave, línea, borde de control, acento)
_TONOS = {
    "calido": ("#FBF7F1", "#FFFFFF", "#2B211B", "#6B5647", "#EADFD0", "#9C8B79", "#9A5B28"),
    "frio": ("#F4F8FB", "#FFFFFF", "#16232E", "#56677A", "#D9E4EC", "#7F8F9C", "#1C6E8C"),
    "sobrio": ("#F6F6F4", "#FFFFFF", "#1F1F1E", "#5E5E5A", "#E2E2DD", "#8C8C89", "#3F3F3D"),
    "vivo": ("#FAF6FD", "#FFFFFF", "#241635", "#665A78", "#E8DDF1", "#9487A3", "#7A3FBF"),
    "neutro": ("#F7F8FA", "#FFFFFF", "#16202B", "#55636F", "#E1E6EC", "#89919A", "#3B4CCA"),
}


def _rgb(hexa: str) -> tuple[int, int, int]:
    h = hexa.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _hex(rgb: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{max(0, min(255, round(c))):02X}" for c in rgb)


def _luminancia(hexa: str) -> float:
    def canal(c: int) -> float:
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = _rgb(hexa)
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)


def _contraste(a: str, b: str) -> float:
    la, lb = sorted((_luminancia(a), _luminancia(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def _mezcla(a: str, b: str, peso_a: float) -> str:
    ra, rb = _rgb(a), _rgb(b)
    return _hex(tuple(x * peso_a + y * (1 - peso_a) for x, y in zip(ra, rb)))


def _acento_legible(hexa: str) -> str:
    """Oscurece el color de marca hasta que el texto blanco encima se lea (AA).

    El acento es a la vez fondo de botón (texto blanco) y color de enlace sobre
    blanco: un amarillo o un verde claro de marca, tal cual, dejaría ambos
    ilegibles. Se conserva el tono y se baja la luz lo justo.
    """
    color = hexa
    for _ in range(30):
        if _contraste(color, "#FFFFFF") >= 4.6:
            return color
        color = _hex(tuple(c * 0.9 for c in _rgb(color)))
    return color


def _paleta(d: DominioLanding) -> dict[str, str]:
    fondo, superficie, tinta, tinta2, linea, borde, acento_tono = _TONOS.get(d.tono, _TONOS["neutro"])
    acc = _acento_legible(d.acento or acento_tono)
    return {
        # El fondo y las líneas se tiñen de la MARCA, no del tono: un acento
        # café sobre el fondo lila del tono «vivo» se leía como dos marcas.
        "fondo": _mezcla(acc, "#FFFFFF", 0.035), "superficie": superficie,
        "tinta": tinta, "tinta2": tinta2,
        "linea": _mezcla(acc, "#FFFFFF", 0.13), "borde": borde, "acc": acc,
        # El hero y la banda final: casi negro teñido de la marca.
        "hero": _mezcla(acc, "#0B0D12", 0.22),
        # Acento aclarado para texto pequeño sobre el hero oscuro.
        "acc_claro": _mezcla(acc, "#FFFFFF", 0.45),
    }


# ---------------------------------------------------------------------------
# Textos de interfaz (lo que no escribe el modelo)
# ---------------------------------------------------------------------------
_UI = {
    "es": {
        "saltar": "Saltar al contenido", "menu": "Abrir menú", "servicios": "Servicios",
        "planes": "Planes", "horarios": "Horarios", "nosotros": "Nosotros",
        "opiniones": "Opiniones", "preguntas": "Preguntas", "contacto": "Contacto",
        "ver_servicios": "Ver servicios", "lo_mas_pedido": "Lo más pedido",
        "lo_que_hacemos": "Lo que hacemos", "ver_todo": "Ver todo",
        "kicker_servicios": "Qué ofrecemos", "titulo_servicios": "Nuestros servicios",
        "kicker_planes": "Planes", "titulo_planes": "Elige tu plan",
        "recomendado": "Recomendado", "elegir": "Lo quiero",
        "kicker_horarios": "Horarios", "titulo_horarios": "Cuándo encontrarnos",
        "kicker_pasos": "Cómo funciona", "titulo_pasos": "Así de fácil",
        "kicker_nosotros": "Quiénes somos",
        "kicker_opiniones": "Opiniones", "titulo_opiniones": "Lo que dicen nuestros clientes",
        "kicker_faq": "Preguntas frecuentes", "titulo_faq": "Resolvemos tus dudas",
        "kicker_contacto": "Contacto", "titulo_contacto": "Hablemos",
        "intro_contacto": "Déjanos tu mensaje y te respondemos lo antes posible.",
        "whatsapp": "WhatsApp", "escribenos": "Escríbenos por WhatsApp",
        "llamanos": "Llámanos", "correo": "Correo", "visitanos": "Visítanos",
        "como_llegar": "Cómo llegar", "instagram": "Instagram",
        "f_nombre": "Tu nombre", "f_contacto": "WhatsApp o correo",
        "f_interes": "¿Qué te interesa?", "f_interes_vacio": "Elige una opción (opcional)",
        "f_mensaje": "Mensaje", "f_mensaje_ph": "Cuéntanos qué necesitas",
        "f_enviar": "Enviar mensaje", "f_enviar_wa": "Enviar por WhatsApp",
        "f_enviar_mail": "Enviar por correo", "f_enviando": "Enviando…",
        "f_trampa": "No llenes este campo",
        "e_nombre": "Escribe tu nombre (mínimo 2 letras).",
        "e_contacto": "Escribe un correo válido o un teléfono con al menos 7 dígitos.",
        "e_mensaje": "Cuéntanos un poco más (mínimo 10 caracteres).",
        "ok": "¡Gracias! Recibimos tu mensaje y te contactamos pronto.",
        "fallo": "No pudimos enviar el mensaje. Inténtalo de nuevo o escríbenos directamente:",
        "abierto": "Abrimos tu aplicación con el mensaje listo para enviar.",
        "hola_wa": "Hola, vi su página y quiero más información.",
        "derechos": "Todos los derechos reservados.",
    },
    "en": {
        "saltar": "Skip to content", "menu": "Open menu", "servicios": "Services",
        "planes": "Plans", "horarios": "Hours", "nosotros": "About",
        "opiniones": "Reviews", "preguntas": "FAQ", "contacto": "Contact",
        "ver_servicios": "See services", "lo_mas_pedido": "Most requested",
        "lo_que_hacemos": "What we do", "ver_todo": "See all",
        "kicker_servicios": "What we offer", "titulo_servicios": "Our services",
        "kicker_planes": "Plans", "titulo_planes": "Choose your plan",
        "recomendado": "Recommended", "elegir": "I want it",
        "kicker_horarios": "Hours", "titulo_horarios": "When to find us",
        "kicker_pasos": "How it works", "titulo_pasos": "It's that easy",
        "kicker_nosotros": "Who we are",
        "kicker_opiniones": "Reviews", "titulo_opiniones": "What our clients say",
        "kicker_faq": "FAQ", "titulo_faq": "Your questions, answered",
        "kicker_contacto": "Contact", "titulo_contacto": "Let's talk",
        "intro_contacto": "Leave us a message and we'll get back to you soon.",
        "whatsapp": "WhatsApp", "escribenos": "Message us on WhatsApp",
        "llamanos": "Call us", "correo": "Email", "visitanos": "Visit us",
        "como_llegar": "Get directions", "instagram": "Instagram",
        "f_nombre": "Your name", "f_contacto": "WhatsApp or email",
        "f_interes": "What are you interested in?", "f_interes_vacio": "Pick one (optional)",
        "f_mensaje": "Message", "f_mensaje_ph": "Tell us what you need",
        "f_enviar": "Send message", "f_enviar_wa": "Send via WhatsApp",
        "f_enviar_mail": "Send via email", "f_enviando": "Sending…",
        "f_trampa": "Do not fill this field",
        "e_nombre": "Enter your name (at least 2 letters).",
        "e_contacto": "Enter a valid email or a phone with at least 7 digits.",
        "e_mensaje": "Tell us a bit more (at least 10 characters).",
        "ok": "Thanks! We got your message and will contact you soon.",
        "fallo": "We couldn't send your message. Try again or reach us directly:",
        "abierto": "We opened your app with the message ready to send.",
        "hola_wa": "Hi, I saw your page and I'd like more information.",
        "derechos": "All rights reserved.",
    },
}


def _e(texto: str) -> str:
    return html.escape(str(texto or ""), quote=True)


def _opciones(datos: dict) -> str:
    """`data-dx-options` seguro dentro de un atributo con comillas simples."""
    return _e(json.dumps(datos, ensure_ascii=False))


def _destacado_valor(valor: str) -> str:
    """Una cifra entera sola se anima con CountUp; lo demás se escribe tal cual."""
    m = re.fullmatch(r"(\D{0,3})(\d{1,5})(\D{0,6})", valor.strip())
    if not m:
        return _e(valor)
    pre, num, suf = m.groups()
    return (f'{_e(pre)}<span data-dx="CountUp" data-dx-options=\'{_opciones({"value": int(num)})}\'>'
            f'{num}</span>{_e(suf)}')


# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------
def _index_html(d: DominioLanding, t: dict, pal: dict, idioma: str, base: str,
                endpoint: str | None) -> str:
    """La página entera. `base` es el prefijo de los assets; `endpoint`, la ruta
    del formulario (None = sin backend: el formulario abre WhatsApp/correo)."""
    c = d.contacto
    wa = d.whatsapp_digitos
    tel = re.sub(r"[^\d+]", "", c.telefono or c.whatsapp)
    wa_link = f"https://wa.me/{wa}?text={quote(t['hola_wa'])}" if wa else ""
    cta = d.hero.cta or (t["escribenos"] if wa else t["titulo_contacto"])
    cta_href = wa_link or "#contacto"
    cta_ext = ' target="_blank" rel="noopener"' if wa_link else ""
    cta_icono = _ico("whatsapp") if wa_link else _ico("flecha")
    # La ciudad solo se añade si la dirección no la trae ya («…, Medellín, Medellín»).
    ciudad = d.ciudad if d.ciudad and d.ciudad.lower() not in c.direccion.lower() else ""
    lugar = ", ".join(x for x in (c.direccion, ciudad) if x)
    mapa = f"https://www.google.com/maps/search/?api=1&query={quote(lugar)}" if lugar else ""
    insta = c.instagram.lstrip("@").strip()
    insta_link = f"https://instagram.com/{quote(insta)}" if re.fullmatch(r"[A-Za-z0-9._]{2,30}", insta) else ""

    # --- navegación: SOLO a secciones que existen ---
    enlaces = []
    if d.servicios:
        enlaces.append(("#servicios", t["servicios"]))
    if d.planes:
        enlaces.append(("#planes", t["planes"]))
    if d.horarios:
        enlaces.append(("#horarios", t["horarios"]))
    if d.sobre:
        enlaces.append(("#nosotros", t["nosotros"]))
    if d.testimonios:
        enlaces.append(("#opiniones", t["opiniones"]))
    if d.faq:
        enlaces.append(("#preguntas", t["preguntas"]))
    enlaces.append(("#contacto", t["contacto"]))
    nav = "".join(f'<a href="{h}">{_e(n)}</a>' for h, n in enlaces)

    # --- hero ---
    eyebrow = d.hero.eyebrow or " · ".join(x for x in (d.rubro, d.ciudad) if x)
    destacados = ""
    if d.destacados:
        destacados = '<ul class="destacados">' + "".join(
            f"<li><strong>{_destacado_valor(x.valor)}</strong><span>{_e(x.etiqueta)}</span></li>"
            for x in d.destacados
        ) + "</ul>"
    secundario = (f'<a class="btn btn-sec" href="#servicios">{_e(t["ver_servicios"])}</a>'
                  if d.servicios else "")

    con_precio = [s for s in d.servicios if s.precio]
    tarjeta_items = (con_precio or d.servicios)[:3]
    tarjeta = ""
    if tarjeta_items:
        filas = "".join(
            f"<li><b>{_e(s.nombre)}</b>{f'<span>{_e(s.precio)}</span>' if s.precio else ''}</li>"
            for s in tarjeta_items
        )
        datos = ""
        if d.horarios:
            h0 = d.horarios[0]
            datos += f'<p class="dato">{_ico("reloj")}<span>{_e(h0.dia)} · {_e(h0.horas)}</span></p>'
        if lugar:
            datos += f'<p class="dato">{_ico("ubicacion")}<span>{_e(lugar)}</span></p>'
        titulo_tarjeta = t["lo_mas_pedido"] if con_precio else t["lo_que_hacemos"]
        tarjeta = (
            f'<aside class="hero-tarjeta" aria-label="{_e(titulo_tarjeta)}">'
            f'<h2>{_e(titulo_tarjeta)}</h2><ul class="lista-precios">{filas}</ul>{datos}'
            f'<a class="enlace" href="#servicios">{_e(t["ver_todo"])} {_ico("flecha")}</a></aside>'
        )

    secciones: list[str] = []
    reveal = f'data-dx="Reveal" data-dx-options=\'{_opciones({"once": True, "distance": 28})}\''
    alterna = [False]

    def seccion(id_: str, kicker: str, titulo: str, intro: str, cuerpo: str) -> str:
        alterna[0] = not alterna[0]
        clase = "seccion alterna" if alterna[0] else "seccion"
        intro_html = f"<p>{_e(intro)}</p>" if intro else ""
        return (
            f'<section id="{id_}" class="{clase}" aria-labelledby="t-{id_}">'
            f'<div class="contenedor" {reveal}>'
            f'<header class="cab" data-reveal-child><p class="kicker">{_e(kicker)}</p>'
            f'<h2 id="t-{id_}">{_e(titulo)}</h2>{intro_html}</header>{cuerpo}</div></section>'
        )

    if d.servicios:
        tarjetas = "".join(
            f'<div data-reveal-child><article class="tarjeta" data-dx="LiftHover" '
            f'data-dx-options=\'{_opciones({"lift": 6, "scale": 1.01})}\'>'
            f'<span class="tarjeta-ico">{_ico(s.icono)}</span><h3>{_e(s.nombre)}</h3>'
            f'{f"<p>{_e(s.descripcion)}</p>" if s.descripcion else ""}'
            f'{f"<p class=precio>{_e(s.precio)}</p>" if s.precio else ""}</article></div>'
            for s in d.servicios
        )
        secciones.append(seccion(
            "servicios", t["kicker_servicios"], d.servicios_titulo or t["titulo_servicios"],
            d.servicios_intro, f'<div class="rejilla">{tarjetas}</div>'))

    if d.planes:
        planes = ""
        for p in d.planes:
            items = "".join(f"<li>{_ico('check')}<span>{_e(x)}</span></li>" for x in p.incluye)
            periodo = f"<small> / {_e(p.periodo)}</small>" if p.periodo else ""
            etiqueta = f'<span class="plan-etiqueta">{_e(t["recomendado"])}</span>' if p.destacado else ""
            href = (f"https://wa.me/{wa}?text={quote(t['hola_wa'] + ' ' + p.nombre)}" if wa else "#contacto")
            ext = ' target="_blank" rel="noopener"' if wa else ""
            planes += (
                f'<div data-reveal-child><article class="plan{" destacado" if p.destacado else ""}">'
                f'{etiqueta}<h3>{_e(p.nombre)}</h3>'
                f'{f"<p class=plan-precio>{_e(p.precio)}{periodo}</p>" if p.precio else ""}'
                f'{f"<ul>{items}</ul>" if items else ""}'
                f'<a class="btn" href="{_e(href)}"{ext}>{_e(t["elegir"])}</a></article></div>'
            )
        secciones.append(seccion("planes", t["kicker_planes"], t["titulo_planes"], "",
                                 f'<div class="planes">{planes}</div>'))

    if d.horarios:
        filas = "".join(
            f'<div class="horario" data-reveal-child><div><b>{_e(h.dia)}</b>'
            f'{f"<small>{_e(h.detalle)}</small>" if h.detalle else ""}</div>'
            f'<span>{_e(h.horas)}</span></div>'
            for h in d.horarios
        )
        secciones.append(seccion("horarios", t["kicker_horarios"],
                                 d.horarios_titulo or t["titulo_horarios"], "",
                                 f'<div class="horarios">{filas}</div>'))

    if d.pasos:
        pasos = "".join(
            f'<li data-reveal-child><h3>{_e(p.titulo)}</h3><p>{_e(p.texto)}</p></li>' for p in d.pasos
        )
        secciones.append(seccion("como-funciona", t["kicker_pasos"], t["titulo_pasos"], "",
                                 f'<ol class="pasos">{pasos}</ol>'))

    if d.sobre:
        secciones.append(seccion("nosotros", t["kicker_nosotros"], d.nombre, "",
                                 f'<p class="texto-sobre" data-reveal-child>{_e(d.sobre)}</p>'))

    if d.testimonios:
        testimonios = "".join(
            f'<figure class="testimonio" data-reveal-child><blockquote>{_e(x.texto)}</blockquote>'
            f'<figcaption>{_e(x.autor)}{f"<small>{_e(x.detalle)}</small>" if x.detalle else ""}'
            f'</figcaption></figure>'
            for x in d.testimonios
        )
        secciones.append(seccion("opiniones", t["kicker_opiniones"], t["titulo_opiniones"], "",
                                 f'<div class="testimonios">{testimonios}</div>'))

    if d.faq:
        faq = "".join(
            f'<details data-reveal-child><summary>{_e(q.pregunta)}</summary><p>{_e(q.respuesta)}</p></details>'
            for q in d.faq
        )
        secciones.append(seccion("preguntas", t["kicker_faq"], t["titulo_faq"], "",
                                 f'<div class="faq">{faq}</div>'))

    # --- contacto: canales directos + formulario que funciona ---
    canales = ""
    if wa_link:
        canales += (f'<a class="canal" href="{_e(wa_link)}" target="_blank" rel="noopener">{_ico("whatsapp")}'
                    f'<span><small>{_e(t["whatsapp"])}</small><b>{_e(c.whatsapp)}</b></span></a>')
    if tel and c.telefono:
        canales += (f'<a class="canal" href="tel:{_e(tel)}">{_ico("telefono")}'
                    f'<span><small>{_e(t["llamanos"])}</small><b>{_e(c.telefono)}</b></span></a>')
    if c.email:
        canales += (f'<a class="canal" href="mailto:{_e(c.email)}">{_ico("correo")}'
                    f'<span><small>{_e(t["correo"])}</small><b>{_e(c.email)}</b></span></a>')
    if mapa:
        canales += (f'<a class="canal" href="{_e(mapa)}" target="_blank" rel="noopener">{_ico("ubicacion")}'
                    f'<span><small>{_e(t["visitanos"])} · {_e(t["como_llegar"])}</small><b>{_e(lugar)}</b></span></a>')
    if insta_link:
        canales += (f'<a class="canal" href="{_e(insta_link)}" target="_blank" rel="noopener">{_ico("instagram")}'
                    f'<span><small>{_e(t["instagram"])}</small><b>@{_e(insta)}</b></span></a>')

    formulario = ""
    if endpoint or wa or c.email:
        intereses = [s.nombre for s in d.servicios] + [p.nombre for p in d.planes]
        select = ""
        if intereses:
            ops = "".join(f'<option>{_e(x)}</option>' for x in dict.fromkeys(intereses))
            select = (f'<div class="campo"><label for="c-interes">{_e(t["f_interes"])}</label>'
                      f'<select id="c-interes" name="interes"><option value="">{_e(t["f_interes_vacio"])}</option>'
                      f'{ops}</select></div>')
        boton = t["f_enviar"] if endpoint else (t["f_enviar_wa"] if wa else t["f_enviar_mail"])
        atributos = f' data-endpoint="{_e(endpoint)}"' if endpoint else ""
        atributos += f' data-whatsapp="{wa}"' if wa else ""
        atributos += f' data-email="{_e(c.email)}"' if c.email else ""
        atributos += "".join(
            f' data-t-{k.replace("_", "-")}="{_e(t[k])}"'
            for k in ("e_nombre", "e_contacto", "e_mensaje", "ok", "fallo", "abierto", "f_enviando")
        )
        formulario = f'''<form id="form-contacto" class="form" novalidate{atributos}>
<div class="campo"><label for="c-nombre">{_e(t["f_nombre"])}</label>
<input id="c-nombre" name="nombre" autocomplete="name" required minlength="2" maxlength="80" aria-describedby="e-nombre">
<p class="error" id="e-nombre"></p></div>
<div class="campo"><label for="c-contacto">{_e(t["f_contacto"])}</label>
<input id="c-contacto" name="contacto" autocomplete="email" required maxlength="120" aria-describedby="e-contacto">
<p class="error" id="e-contacto"></p></div>
{select}
<div class="campo"><label for="c-mensaje">{_e(t["f_mensaje"])}</label>
<textarea id="c-mensaje" name="mensaje" rows="4" required minlength="10" maxlength="2000" placeholder="{_e(t["f_mensaje_ph"])}" aria-describedby="e-mensaje"></textarea>
<p class="error" id="e-mensaje"></p></div>
<div class="trampa" aria-hidden="true"><label for="c-web">{_e(t["f_trampa"])}</label><input id="c-web" name="web" tabindex="-1" autocomplete="off"></div>
<button type="submit" class="btn" disabled>{_e(boton)}</button>
<p class="form-estado" role="status" aria-live="polite"></p>
</form>'''
    contacto_cuerpo = (f'<div class="contacto"><div data-reveal-child><div class="canales">{canales}</div></div>'
                       f'<div data-reveal-child>{formulario}</div></div>')
    secciones.append(seccion("contacto", t["kicker_contacto"], t["titulo_contacto"],
                             t["intro_contacto"] if formulario else "", contacto_cuerpo))

    final = ""
    if d.cta_final_titulo:
        final = (
            f'<section class="final" aria-labelledby="t-final"><div class="contenedor">'
            f'<h2 id="t-final">{_e(d.cta_final_titulo)}</h2>'
            f'{f"<p>{_e(d.cta_final_texto)}</p>" if d.cta_final_texto else ""}'
            f'<a class="btn" href="{_e(cta_href)}"{cta_ext}>{cta_icono}{_e(cta)}</a></div></section>'
        )

    flotante = (f'<a class="wa-flotante" href="{_e(wa_link)}" target="_blank" rel="noopener" '
                f'aria-label="{_e(t["escribenos"])}">{_ico("whatsapp")}</a>' if wa_link else "")

    # Datos estructurados: que un buscador entienda qué negocio es y dónde está.
    ld = {"@context": "https://schema.org", "@type": "LocalBusiness", "name": d.nombre,
          "description": d.hero.subtitulo or d.hero.titulo}
    if lugar:
        ld["address"] = {"@type": "PostalAddress", "streetAddress": c.direccion,
                         "addressLocality": d.ciudad}
    if tel:
        ld["telephone"] = tel
    if c.email:
        ld["email"] = c.email
    ld_json = json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")

    titulo_doc = d.nombre + (f" · {d.rubro.capitalize()}" if d.rubro else "") + (
        f" en {d.ciudad}" if d.ciudad and idioma == "es" else "")
    descripcion = d.hero.subtitulo or d.hero.titulo
    inicial = next((ch for ch in d.nombre.upper() if ch.isalnum()), "A")
    dixel_tags = dixel_assets.etiquetas(f"{base}vendor", dixel_assets.PERFIL_SITIO)
    dixel_on = dixel_assets.arranque(pal["acc"], "light", dixel_assets.PERFIL_SITIO, sangria="  ")
    pie_nav = "".join(f'<a href="{h}">{_e(n)}</a>' for h, n in enlaces)

    return f'''<!doctype html>
<html lang="{idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_e(titulo_doc)}</title>
<meta name="description" content="{_e(descripcion)}">
<meta name="theme-color" content="{pal["acc"]}">
<meta property="og:title" content="{_e(d.nombre)}">
<meta property="og:description" content="{_e(descripcion)}">
<meta property="og:type" content="website">
<link rel="icon" href="{base}icono.svg" type="image/svg+xml">
<link rel="stylesheet" href="{base}styles.css">
{dixel_tags}
<script type="application/ld+json">{ld_json}</script>
</head>
<body>
<a class="saltar" href="#principal">{_e(t["saltar"])}</a>
<div data-dx="ScrollProgressBar" data-dx-options='{_opciones({"tint": "primary"})}'></div>
<header class="barra"><div class="contenedor barra-in">
<a class="marca" href="#inicio"><span class="marca-logo" aria-hidden="true">{_e(inicial)}</span>{_e(d.nombre)}</a>
<button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu" aria-label="{_e(t["menu"])}">{_ico("menu")}</button>
<nav id="menu" class="menu" aria-label="{_e(t["menu"])}">{nav}<a class="btn btn-sm" href="{_e(cta_href)}"{cta_ext}>{_e(cta)}</a></nav>
</div></header>
<main id="principal">
<section class="hero" id="inicio"><div class="contenedor hero-in">
<div class="hero-copy">
{f'<p class="eyebrow">{_ico("chispa")}{_e(eyebrow)}</p>' if eyebrow else ''}
<h1>{_e(d.hero.titulo)}</h1>
{f'<p class="lead">{_e(d.hero.subtitulo)}</p>' if d.hero.subtitulo else ''}
<div class="acciones"><a class="btn" data-dx="Magnetic" data-dx-options='{_opciones({"strength": 0.2})}' href="{_e(cta_href)}"{cta_ext}>{cta_icono}{_e(cta)}</a>{secundario}</div>
{destacados}
</div>
{tarjeta}
</div></section>
{"".join(secciones)}
{final}
</main>
<footer class="pie"><div class="contenedor pie-in">
<div><b>{_e(d.nombre)}</b><br>© {date.today().year} {_e(d.nombre)}. {_e(t["derechos"])}</div>
<nav aria-label="{_e(t["contacto"])}">{pie_nav}</nav>
</div></footer>
{flotante}
<script src="{base}app.js" defer></script>
<script>
  {dixel_on}
</script>
</body>
</html>
'''


def _styles(pal: dict) -> str:
    raiz = (
        ":root{"
        f"--fondo:{pal['fondo']};--superficie:{pal['superficie']};--tinta:{pal['tinta']};"
        f"--tinta-2:{pal['tinta2']};--linea:{pal['linea']};--borde:{pal['borde']};"
        f"--acc:{pal['acc']};--acc-claro:{pal['acc_claro']};--hero:{pal['hero']};"
        "--sobre-acc:#FFFFFF;--acc-suave:color-mix(in srgb,var(--acc) 11%,transparent);"
        "--error:#B42318;--exito:#127A3E}\n"
    )
    return raiz + _CSS


_CSS = """*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--fondo);color:var(--tinta);font-family:Inter,"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;font-size:1.0625rem;line-height:1.6;-webkit-font-smoothing:antialiased}
h1,h2,h3{line-height:1.15;letter-spacing:-.015em;margin:0;text-wrap:balance;color:var(--tinta)}
p{margin:0}
a{color:var(--acc)}
:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
section[id]{scroll-margin-top:72px}
.contenedor{width:min(1120px,calc(100% - 2.5rem));margin-inline:auto}
.ico{width:1.25em;height:1.25em;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.saltar{position:absolute;left:-999px;top:.5rem;z-index:100;background:var(--acc);color:var(--sobre-acc);padding:.6rem 1rem;border-radius:8px}
.saltar:focus{left:.75rem}

.barra{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--fondo) 90%,transparent);backdrop-filter:saturate(1.4) blur(12px);-webkit-backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--linea)}
.barra-in{position:relative;display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:64px}
.marca{display:flex;align-items:center;gap:.6rem;font-weight:750;color:var(--tinta);text-decoration:none;letter-spacing:-.01em;min-width:0}
.marca-logo{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:9px;background:var(--acc);color:var(--sobre-acc);font-weight:800}
.menu{display:flex;align-items:center;gap:.15rem}
.menu a{color:var(--tinta-2);text-decoration:none;font-weight:550;font-size:.95rem;padding:.5rem .7rem;border-radius:8px}
.menu a:hover{color:var(--tinta);background:var(--acc-suave)}
.menu a.btn{color:var(--sobre-acc);margin-left:.5rem}
.menu a.btn:hover{background:var(--acc)}
.menu-btn{display:none}
@media (max-width:900px){
  .menu-btn{display:inline-grid;place-items:center;width:44px;height:44px;border:1px solid var(--linea);border-radius:10px;background:var(--superficie);color:var(--tinta);cursor:pointer}
  .menu{display:none;position:absolute;top:100%;left:-1.25rem;right:-1.25rem;flex-direction:column;align-items:stretch;gap:.2rem;padding:.75rem 1.25rem 1.25rem;background:var(--superficie);border-bottom:1px solid var(--linea);box-shadow:0 18px 30px -20px rgba(16,24,40,.35)}
  .menu.abierto{display:flex}
  .menu a{padding:.75rem .5rem}
  .menu a.btn{margin:.5rem 0 0}
}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-height:48px;padding:.75rem 1.4rem;border-radius:10px;border:1.5px solid transparent;background:var(--acc);color:var(--sobre-acc);font:inherit;font-weight:650;line-height:1.2;text-decoration:none;cursor:pointer;transition:filter .15s ease,background-color .15s ease}
.btn:hover{filter:brightness(1.08)}
.btn:disabled{opacity:.5;cursor:not-allowed;filter:none}
.btn-sm{min-height:40px;padding:.5rem 1rem;font-size:.92rem}
.btn-sec{background:transparent;color:var(--tinta);border-color:var(--borde)}

.hero{position:relative;overflow:hidden;isolation:isolate;background:var(--hero);color:#fff}
.hero::before{content:"";position:absolute;z-index:-1;top:-30%;right:-15%;width:70vmax;height:70vmax;background:radial-gradient(closest-side,color-mix(in srgb,var(--acc) 60%,transparent),transparent);opacity:.5}
.hero::after{content:"";position:absolute;z-index:-1;bottom:-40%;left:-20%;width:50vmax;height:50vmax;background:radial-gradient(closest-side,color-mix(in srgb,var(--acc-claro) 30%,transparent),transparent);opacity:.35}
.hero-in{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,.9fr);gap:clamp(2rem,5vw,4rem);align-items:center;padding-block:clamp(3.5rem,9vw,6.5rem)}
.eyebrow{display:inline-flex;align-items:center;gap:.5rem;font-size:.8rem;font-weight:650;letter-spacing:.12em;text-transform:uppercase;color:var(--acc-claro)}
.hero h1{color:#fff;font-size:clamp(2.2rem,5.4vw,3.9rem);font-weight:780;letter-spacing:-.028em;margin:.9rem 0 1.1rem}
.lead{font-size:clamp(1.05rem,2vw,1.22rem);color:rgba(255,255,255,.84);max-width:36rem}
.acciones{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.9rem}
.hero .btn-sec{color:#fff;border-color:rgba(255,255,255,.45)}
.hero .btn-sec:hover{background:rgba(255,255,255,.08)}
.destacados{list-style:none;display:flex;flex-wrap:wrap;gap:1.25rem 2.5rem;margin:2.6rem 0 0;padding:1.6rem 0 0;border-top:1px solid rgba(255,255,255,.16)}
.destacados strong{display:block;font-size:1.9rem;font-weight:780;line-height:1.1;color:#fff;font-variant-numeric:tabular-nums}
.destacados li>span{font-size:.9rem;color:rgba(255,255,255,.74)}
.hero-tarjeta{background:var(--superficie);color:var(--tinta);border-radius:16px;padding:1.6rem 1.7rem;box-shadow:0 30px 60px -30px rgba(0,0,0,.65)}
.hero-tarjeta h2{font-size:.82rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tinta-2)}
.lista-precios{list-style:none;margin:.8rem 0 .4rem;padding:0}
.lista-precios li{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;padding:.8rem 0;border-bottom:1px dashed var(--linea)}
.lista-precios b{font-weight:620}
.lista-precios span{color:var(--acc);font-weight:750;white-space:nowrap;font-variant-numeric:tabular-nums}
.dato{display:flex;gap:.6rem;align-items:flex-start;color:var(--tinta-2);font-size:.95rem;margin-top:.75rem}
.dato .ico{color:var(--acc);margin-top:.18em}
.enlace{display:inline-flex;align-items:center;gap:.35rem;margin-top:1.1rem;font-weight:650;color:var(--acc);text-decoration:none}
.enlace:hover{text-decoration:underline}
@media (max-width:900px){.hero-in{grid-template-columns:1fr}}

.seccion{padding-block:clamp(3.5rem,8vw,6rem)}
.seccion.alterna{background:var(--superficie);border-block:1px solid var(--linea)}
.cab{max-width:42rem;margin-bottom:2.5rem}
.kicker{font-size:.8rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--acc);margin-bottom:.6rem}
.cab h2{font-size:clamp(1.8rem,3.6vw,2.6rem);font-weight:740}
.cab p:not(.kicker){margin-top:.85rem;color:var(--tinta-2);font-size:1.08rem}
.rejilla{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1.25rem}
.rejilla>div,.planes>div{display:flex}
.tarjeta{flex:1;display:flex;flex-direction:column;gap:.6rem;background:var(--superficie);border:1px solid var(--linea);border-radius:14px;padding:1.5rem}
.alterna .tarjeta,.alterna .plan,.alterna .horario,.alterna .testimonio,.alterna .faq details,.alterna .canal{background:var(--fondo)}
.tarjeta-ico{display:grid;place-items:center;width:46px;height:46px;border-radius:12px;background:var(--acc-suave);color:var(--acc)}
.tarjeta h3{font-size:1.15rem;font-weight:680}
.tarjeta p{color:var(--tinta-2);font-size:.98rem}
.tarjeta .precio{margin-top:auto;padding-top:.5rem;font-weight:750;color:var(--tinta);font-variant-numeric:tabular-nums}

.planes{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1.25rem}
.plan{flex:1;display:flex;flex-direction:column;gap:1rem;background:var(--superficie);border:1px solid var(--linea);border-radius:16px;padding:1.8rem}
.plan.destacado{border:2px solid var(--acc);box-shadow:0 24px 50px -32px var(--acc)}
.plan h3{font-size:1.2rem}
.plan-etiqueta{align-self:flex-start;font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:var(--acc);color:var(--sobre-acc);padding:.25rem .65rem;border-radius:999px}
.plan-precio{font-size:2.1rem;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.plan-precio small{font-size:.95rem;font-weight:500;color:var(--tinta-2)}
.plan ul{list-style:none;margin:0;padding:0;display:grid;gap:.55rem}
.plan li{display:flex;gap:.55rem;color:var(--tinta-2)}
.plan li .ico{color:var(--acc);margin-top:.2em}
.plan .btn{margin-top:auto}
.plan:not(.destacado) .btn{background:transparent;color:var(--acc);border-color:var(--acc)}

.horarios{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:.75rem}
.horario{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;padding:1rem 1.2rem;background:var(--superficie);border:1px solid var(--linea);border-radius:12px}
.horario b{font-weight:650}
.horario small{display:block;color:var(--tinta-2);font-size:.88rem}
.horario span{color:var(--acc);font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}

.pasos{list-style:none;counter-reset:paso;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.75rem;margin:0;padding:0}
.pasos li{counter-increment:paso;position:relative;padding-top:3.3rem}
.pasos li::before{content:counter(paso);position:absolute;top:0;left:0;display:grid;place-items:center;width:2.5rem;height:2.5rem;border-radius:50%;background:var(--acc);color:var(--sobre-acc);font-weight:750}
.pasos h3{font-size:1.1rem;margin-bottom:.4rem}
.pasos p{color:var(--tinta-2)}

.texto-sobre{max-width:46rem;font-size:1.18rem;color:var(--tinta-2)}

.testimonios{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.25rem}
.testimonio{margin:0;display:flex;flex-direction:column;gap:1.1rem;background:var(--superficie);border:1px solid var(--linea);border-radius:14px;padding:1.6rem}
.testimonio blockquote{margin:0;font-size:1.04rem;color:var(--tinta)}
.testimonio blockquote::before{content:"\\201C";display:block;height:1.4rem;font:700 3rem/1 Georgia,serif;color:var(--acc)}
.testimonio figcaption{margin-top:auto;font-weight:650}
.testimonio figcaption small{display:block;font-weight:400;color:var(--tinta-2)}

.faq{max-width:50rem;display:grid;gap:.75rem}
.faq details{background:var(--superficie);border:1px solid var(--linea);border-radius:12px;padding:0 1.2rem}
.faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1.1rem 0;font-weight:650}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";flex:none;font-size:1.5rem;line-height:1;color:var(--acc);transition:transform .2s ease}
.faq details[open] summary::after{transform:rotate(45deg)}
.faq details p{padding-bottom:1.15rem;color:var(--tinta-2)}

.contacto{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:clamp(2rem,5vw,4rem);align-items:start}
@media (max-width:900px){.contacto{grid-template-columns:1fr}}
.canales{display:grid;gap:.75rem}
.canal{display:flex;align-items:center;gap:.9rem;padding:1rem 1.1rem;background:var(--superficie);border:1px solid var(--linea);border-radius:12px;color:var(--tinta);text-decoration:none;transition:border-color .15s ease}
.canal:hover{border-color:var(--acc)}
.canal .ico{width:1.5em;height:1.5em;color:var(--acc)}
.canal span{min-width:0}
.canal small{display:block;font-size:.84rem;color:var(--tinta-2)}
.canal b{font-weight:650;overflow-wrap:anywhere}
.form{position:relative;display:grid;gap:1rem;background:var(--superficie);border:1px solid var(--linea);border-radius:16px;padding:clamp(1.4rem,3vw,2rem)}
.alterna .form{background:var(--fondo)}
.campo{display:grid;gap:.35rem}
.campo label{font-weight:600;font-size:.95rem}
.campo input,.campo select,.campo textarea{width:100%;min-height:48px;padding:.75rem .9rem;font:inherit;color:var(--tinta);background:var(--superficie);border:1.5px solid var(--borde);border-radius:10px}
.campo textarea{min-height:120px;resize:vertical}
.campo input:focus,.campo select:focus,.campo textarea:focus{outline:none;border-color:var(--acc);box-shadow:0 0 0 3px var(--acc-suave)}
.campo [aria-invalid="true"]{border-color:var(--error)}
.error{min-height:1.2em;font-size:.86rem;color:var(--error)}
.trampa{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.form-estado{min-height:1.4em;font-weight:600}
.form-estado.ok{color:var(--exito)}
.form-estado.error{color:var(--error)}
.form-estado a{color:inherit}

.final{background:var(--hero);color:#fff;text-align:center;padding-block:clamp(3.5rem,8vw,5.5rem)}
.final h2{color:#fff;font-size:clamp(1.8rem,4vw,2.6rem)}
.final p{max-width:36rem;margin:1rem auto 0;color:rgba(255,255,255,.82)}
.final .btn{margin-top:1.8rem}

.pie{background:var(--superficie);border-top:1px solid var(--linea);padding-block:2.4rem;color:var(--tinta-2);font-size:.92rem}
.pie b{color:var(--tinta)}
.pie-in{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:1rem 2rem}
.pie nav{display:flex;flex-wrap:wrap;gap:.25rem 1.25rem}
.pie a{color:var(--tinta-2);text-decoration:none}
.pie a:hover{color:var(--acc)}
.wa-flotante{position:fixed;right:1.1rem;bottom:1.1rem;z-index:50;display:grid;place-items:center;width:58px;height:58px;border-radius:50%;background:#1F8F4E;color:#fff;box-shadow:0 14px 30px -12px rgba(0,0,0,.5)}
.wa-flotante .ico{width:28px;height:28px}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{transition:none!important;animation:none!important}}
"""


_APP_JS = r"""(function () {
  "use strict";

  var boton = document.querySelector(".menu-btn");
  var menu = document.getElementById("menu");
  if (boton && menu) {
    var cerrar = function () {
      boton.setAttribute("aria-expanded", "false");
      menu.classList.remove("abierto");
    };
    boton.addEventListener("click", function () {
      var abierto = boton.getAttribute("aria-expanded") === "true";
      boton.setAttribute("aria-expanded", String(!abierto));
      menu.classList.toggle("abierto", !abierto);
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) cerrar();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") cerrar();
    });
  }

  var form = document.getElementById("form-contacto");
  if (!form) return;
  var d = form.dataset;
  var enviar = form.querySelector('button[type="submit"]');
  var textoBoton = enviar.textContent;
  var estado = form.querySelector(".form-estado");
  var tocados = {};
  var reglas = {
    nombre: function (v) { return v.trim().length >= 2 ? "" : d.tENombre; },
    contacto: function (v) {
      v = v.trim();
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return "";
      return v.replace(/\D/g, "").length >= 7 && v.indexOf("@") < 0 ? "" : d.tEContacto;
    },
    mensaje: function (v) { return v.trim().length >= 10 ? "" : d.tEMensaje; }
  };

  function revisar(todos) {
    var valido = true;
    Object.keys(reglas).forEach(function (nombre) {
      var campo = form.elements[nombre];
      var error = reglas[nombre](campo.value);
      if (error) valido = false;
      if (todos || tocados[nombre]) {
        document.getElementById("e-" + nombre).textContent = error;
        campo.setAttribute("aria-invalid", error ? "true" : "false");
      }
    });
    enviar.disabled = !valido;
    return valido;
  }

  function ponerEstado(texto, tipo, enlace) {
    estado.textContent = texto;
    estado.className = "form-estado " + (tipo || "");
    if (enlace) {
      var a = document.createElement("a");
      a.href = enlace.href;
      a.textContent = " " + enlace.texto;
      if (enlace.href.indexOf("http") === 0) { a.target = "_blank"; a.rel = "noopener"; }
      estado.appendChild(a);
    }
  }

  function mensajeDe(datos) {
    var partes = ["Hola, soy " + datos.nombre + "."];
    if (datos.interes) partes.push("Me interesa: " + datos.interes + ".");
    partes.push(datos.mensaje);
    partes.push("Mi contacto: " + datos.contacto);
    return partes.join("\n");
  }

  function canalDirecto(datos) {
    var texto = mensajeDe(datos);
    if (d.whatsapp) return { href: "https://wa.me/" + d.whatsapp + "?text=" + encodeURIComponent(texto), texto: "WhatsApp" };
    if (d.email) return { href: "mailto:" + d.email + "?subject=" + encodeURIComponent(document.title) + "&body=" + encodeURIComponent(texto), texto: d.email };
    return null;
  }

  ["nombre", "contacto", "mensaje"].forEach(function (nombre) {
    var campo = form.elements[nombre];
    campo.addEventListener("input", function () { revisar(false); });
    campo.addEventListener("blur", function () { tocados[nombre] = true; revisar(false); });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!revisar(true)) return;
    var datos = {
      nombre: form.elements.nombre.value.trim(),
      contacto: form.elements.contacto.value.trim(),
      mensaje: form.elements.mensaje.value.trim(),
      interes: form.elements.interes ? form.elements.interes.value : "",
      web: form.elements.web.value
    };

    if (!d.endpoint) {
      var canal = canalDirecto(datos);
      if (!canal) return;
      if (canal.href.indexOf("http") === 0) window.open(canal.href, "_blank", "noopener");
      else window.location.href = canal.href;
      ponerEstado(d.tAbierto, "ok");
      return;
    }

    enviar.disabled = true;
    enviar.textContent = d.tFEnviando;
    ponerEstado("", "");
    fetch(d.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos)
    })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        form.reset();
        tocados = {};
        ["nombre", "contacto", "mensaje"].forEach(function (n) {
          document.getElementById("e-" + n).textContent = "";
          form.elements[n].removeAttribute("aria-invalid");
        });
        ponerEstado(d.tOk, "ok");
      })
      .catch(function () {
        ponerEstado(d.tFallo, "error", canalDirecto(datos));
      })
      .then(function () {
        enviar.textContent = textoBoton;
        revisar(false);
      });
  });

  revisar(false);
})();
"""


# ---------------------------------------------------------------------------
# Backend (solo en la forma de esqueleto)
# ---------------------------------------------------------------------------
def _requirements() -> str:
    return "fastapi==0.111.0\nuvicorn==0.30.1\n"


def _main(nombre: str) -> str:
    return '''"""Sirve la landing y recibe los mensajes de su formulario de contacto.

Un solo servicio: la página (rutas relativas) y una API mínima.
- POST /api/contacto  guarda el mensaje (SQLite de la biblioteca estándar).
- GET  /api/mensajes  los lista para el dueño, con la cabecera X-Clave-Admin
  igual a la variable de entorno CLAVE_ADMIN (sin ella, la ruta no existe).
"""
from __future__ import annotations

import os
import re
import secrets
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

_RAIZ = Path(__file__).resolve().parent.parent
_FRONT = _RAIZ / "frontend"
_DB = Path(os.environ.get("CONTACTO_DB") or (_RAIZ / "data" / "contacto.db"))
_CANDADO = threading.Lock()
_CORREO = re.compile(r"^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")


@contextmanager
def _conexion():
    """Abre, confirma y CIERRA. `with sqlite3.connect()` solo confirma: deja
    la conexión abierta y el archivo bloqueado."""
    _DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(_DB)
    try:
        con.execute(
            "CREATE TABLE IF NOT EXISTS mensajes ("
            " id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL,"
            " contacto TEXT NOT NULL, interes TEXT NOT NULL DEFAULT '',"
            " mensaje TEXT NOT NULL, creado_en TEXT NOT NULL)"
        )
        yield con
        con.commit()
    finally:
        con.close()


class MensajeIn(BaseModel):
    nombre: str = Field(min_length=2, max_length=80)
    contacto: str = Field(min_length=5, max_length=120)
    mensaje: str = Field(min_length=10, max_length=2000)
    interes: str = Field(default="", max_length=120)
    # Campo trampa: invisible para personas, los robots lo rellenan.
    web: str = Field(default="", max_length=200)

    @field_validator("nombre", "mensaje", "interes")
    @classmethod
    def _limpio(cls, v: str) -> str:
        return v.strip()

    @field_validator("contacto")
    @classmethod
    def _contacto(cls, v: str) -> str:
        v = v.strip()
        if _CORREO.match(v) or ("@" not in v and len(re.sub(r"\\D", "", v)) >= 7):
            return v
        raise ValueError("Escribe un correo válido o un teléfono con al menos 7 dígitos.")


app = FastAPI(title=__TITULO__)


@app.get("/api/salud")
def salud() -> dict:
    return {"ok": True}


@app.post("/api/contacto", status_code=201)
def recibir(m: MensajeIn) -> dict:
    if m.web:
        return {"ok": True}  # robot: se le contesta igual y no se guarda nada
    with _CANDADO, _conexion() as con:
        con.execute(
            "INSERT INTO mensajes (nombre, contacto, interes, mensaje, creado_en) VALUES (?,?,?,?,?)",
            (m.nombre, m.contacto, m.interes, m.mensaje,
             datetime.now(timezone.utc).isoformat(timespec="seconds")),
        )
    return {"ok": True}


@app.get("/api/mensajes")
def mensajes(x_clave_admin: str = Header(default="")) -> dict:
    clave = os.environ.get("CLAVE_ADMIN", "")
    if not clave:
        raise HTTPException(404, "Define CLAVE_ADMIN en el entorno para leer los mensajes.")
    if not secrets.compare_digest(x_clave_admin, clave):
        raise HTTPException(401, "Clave incorrecta.")
    with _conexion() as con:
        filas = con.execute(
            "SELECT id, nombre, contacto, interes, mensaje, creado_en FROM mensajes ORDER BY id DESC LIMIT 500"
        ).fetchall()
    campos = ("id", "nombre", "contacto", "interes", "mensaje", "creado_en")
    return {"total": len(filas), "mensajes": [dict(zip(campos, f)) for f in filas]}


app.mount("/static", StaticFiles(directory=str(_FRONT)), name="static")


@app.get("/")
def index():
    return FileResponse(str(_FRONT / "index.html"))
'''.replace("__TITULO__", repr(nombre))


def _icono_svg(pal: dict, inicial: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<rect width="64" height="64" rx="14" fill="{pal["acc"]}"/>'
        '<text x="32" y="43" text-anchor="middle" font-family="Segoe UI, system-ui, sans-serif" '
        f'font-size="32" font-weight="800" fill="#fff">{html.escape(inicial)}</text></svg>\n'
    )


def _manual(d: DominioLanding, con_backend: bool) -> str:
    lineas = [
        f"# {d.nombre}", "",
        d.hero.subtitulo or d.hero.titulo, "",
        "## Qué tiene la página", "",
    ]
    for etiqueta, hay in (
        ("Servicios con precio", bool(d.servicios)), ("Planes", bool(d.planes)),
        ("Horarios", bool(d.horarios)), ("Cómo funciona", bool(d.pasos)),
        ("Opiniones de clientes", bool(d.testimonios)), ("Preguntas frecuentes", bool(d.faq)),
        ("Contacto (WhatsApp, teléfono, correo, mapa)", True),
    ):
        if hay:
            lineas.append(f"- {etiqueta}")
    lineas += ["", "## El formulario de contacto", ""]
    if con_backend:
        lineas += [
            "Funciona de verdad: cada mensaje se guarda en el servidor de la página",
            "(`POST /api/contacto`, base SQLite en `data/contacto.db`).",
            "",
            "Para leerlos, define la variable de entorno `CLAVE_ADMIN` en tu servidor y pide:",
            "",
            "```",
            "curl -H \"X-Clave-Admin: TU_CLAVE\" https://tu-pagina/api/mensajes",
            "```",
            "",
            "Si el envío falla, la página ofrece WhatsApp o correo con el mensaje ya escrito.",
        ]
    else:
        lineas += ["Abre WhatsApp (o el correo) con el mensaje del visitante ya escrito."]
    lineas += [
        "", "## Antes de publicarla", "",
        "Revisa el número de WhatsApp, el teléfono, el correo y la dirección: son los",
        "que el visitante va a usar para escribirte. Están en `index.html`.",
        "",
        "Hecha con Meta-Agente: HTML/CSS/JS sin dependencias externas, con la librería",
        "gráfica DIXEL dentro del proyecto (carpeta `vendor/`).", "",
    ]
    return "\n".join(lineas)


def _paquete(d: DominioLanding, idioma: str, base: str, endpoint: str | None) -> dict[str, str]:
    """index.html, styles.css, app.js, icono.svg y DIXEL, con rutas relativas a `base`."""
    t = _UI.get(idioma, _UI["es"])
    pal = _paleta(d)
    inicial = next((ch for ch in d.nombre.upper() if ch.isalnum()), "A")
    return {
        "index.html": _index_html(d, t, pal, idioma if idioma in _UI else "es", base, endpoint),
        "styles.css": _styles(pal),
        "app.js": _APP_JS,
        "icono.svg": _icono_svg(pal, inicial),
        # La librería viaja DENTRO: una página publicada no puede depender de
        # que un tercero siga sirviendo un archivo.
        **dixel_assets.archivos(dixel_assets.PERFIL_SITIO, "vendor"),
    }


# ---------------------------------------------------------------------------
# Puntos de entrada
# ---------------------------------------------------------------------------
def construir_landing_desde(d: DominioLanding, idioma: str = "es") -> GeneratedProject:
    """Esqueleto completo: landing + mini backend que recibe el formulario."""
    archivos = {f"frontend/{ruta}": c for ruta, c in
                _paquete(d, idioma, "static/", "api/contacto").items()}
    archivos.update({
        "backend/requirements.txt": _requirements(),
        "backend/__init__.py": "",
        "backend/main.py": _main(d.nombre),
        "MANUAL.md": _manual(d, con_backend=True),
        "README.md": (
            f"# {d.nombre}\n\nLanding page instanciada por Meta-Agente. Un solo servicio "
            "FastAPI sirve la página y recibe el formulario de contacto.\n\n## Correr\n\n"
            "```\npip install -r backend/requirements.txt\nuvicorn backend.main:app\n```\n\n"
            "Ver `MANUAL.md` para leer los mensajes recibidos.\n"
        ),
        ".gitignore": "data/\n__pycache__/\n*.pyc\n",
        MARCADOR: "esqueleto landing v2",
    })
    return GeneratedProject(
        name=d.nombre,
        summary=f"Landing de {d.nombre}: {d.hero.titulo}",
        files=[GeneratedFile(path=p, content=c) for p, c in archivos.items()],
        run_instructions="pip install -r backend/requirements.txt && uvicorn backend.main:app",
    )


def archivos_landing_estatica(d: DominioLanding, idioma: str = "es") -> dict[str, str]:
    """La misma landing sin backend (base dorada estática): el formulario abre
    WhatsApp o el correo con el mensaje ya escrito."""
    archivos = _paquete(d, idioma, "", None)
    archivos["MANUAL.md"] = _manual(d, con_backend=False)
    archivos["README.md"] = (f"# {d.nombre}\n\nLanding instanciada por Meta-Agente. "
                             "Ábrela con cualquier servidor estático.\n")
    return archivos


def construir_landing(title: str, tagline: str, cta: str, secciones: list[dict],
                      idioma: str = "es") -> GeneratedProject:
    """Compatibilidad: arma la landing con lo poco que trae el clasificador.

    Es la red de seguridad cuando el diseño detallado no llega: cada sección
    `{heading, text}` pasa a ser una tarjeta de la rejilla, que ya se lee mejor
    que una lista numerada, y el contacto sigue funcionando por formulario.
    """
    d = DominioLanding.model_validate({
        "nombre": (title or "").strip() or "Mi negocio",
        "hero": {"titulo": tagline or title or "", "cta": cta},
        "servicios": [{"nombre": s.get("heading"), "descripcion": s.get("text"),
                       "icono": "chispa"} for s in (secciones or []) if isinstance(s, dict)],
    })
    if not d.hero.titulo:
        d.hero.titulo = d.nombre
    return construir_landing_desde(d, idioma)
