"""Contrato del CONTENIDO de una landing generada.

Por qué existe
--------------
La landing salía siempre igual: el modelo devolvía un título, un lema, un
botón y tres párrafos `{heading, text}`, y la plantilla los apilaba numerados
(01, 02, 03) con un botón final que apuntaba a `#`. Daba igual pedir una
barbería en Medellín o un estudio de yoga: la ESTRUCTURA era la misma, los
servicios iban dentro de un párrafo, el WhatsApp aparecía escrito pero no se
podía pulsar y el texto del botón se cortaba a 30 caracteres («Reserva tu cita
ahora por What»).

Ahora el modelo describe el NEGOCIO —qué ofrece y a qué precio, si vende
planes, si tiene horarios, cómo se reserva, qué preguntan sus clientes, por
dónde se le escribe— y la plantilla decide qué secciones dibujar a partir de
eso. Dos ideas distintas dan dos páginas distintas.

Misma doctrina que `dominio_app`: **lo accesorio DEGRADA, lo sustancial se
RECHAZA.** Un testimonio sin autor, un icono inventado o un plan sin nombre se
descartan sin tumbar la página; una landing sin nombre, sin promesa en el hero
o sin al menos tres cosas que ofrecer no se construye, y el contrato se lo dice
al fallback para que lo intente el siguiente proveedor.

Es dominio puro: describe QUÉ dice la página, sin saber de HTML ni de FastAPI.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, Field, model_validator

#: Lo mínimo que se tiene que poder ofrecer para que la página tenga sustancia.
#: Con dos tarjetas la rejilla se ve a medio montar; con cero no hay landing.
MINIMO_SERVICIOS = 3

#: Iconos que la plantilla sabe dibujar (SVG de trazo, monocromos). Un nombre
#: fuera de esta lista no se rechaza: cae a `estrella`.
ICONOS = (
    "tijeras", "estrella", "corazon", "reloj", "calendario", "ubicacion", "chat",
    "hoja", "sol", "luna", "rayo", "escudo", "check", "regalo", "usuario", "grupo",
    "taza", "casa", "herramienta", "camara", "musica", "libro", "carrito", "auto",
    "salud", "chispa",
)

TONOS = ("calido", "frio", "sobrio", "vivo", "neutro")

_ACENTOS = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _txt(valor, limite: int) -> str:
    """Texto limpio y acotado. Cualquier cosa que no sea texto o número es vacío."""
    if isinstance(valor, bool) or valor is None:
        return ""
    if isinstance(valor, (int, float)):
        valor = str(valor)
    if not isinstance(valor, str):
        return ""
    limpio = re.sub(r"\s+", " ", valor).strip()
    if len(limpio) <= limite:
        return limpio
    # Se corta en el último espacio: «Reserva tu cita ahora por What» era
    # exactamente un corte a ciegas a mitad de palabra.
    corte = limpio[:limite].rsplit(" ", 1)[0].rstrip(" ,.;:-")
    return corte or limpio[:limite]


def _precio(valor) -> str:
    """Precio legible. Una cifra suelta se formatea; un texto se respeta.

    El modelo manda `35000`, `"35000"`, `"$35.000"` o `"Desde 80.000"`; los dos
    primeros se ven mejor como `$35.000`, los demás ya vienen escritos.
    """
    if isinstance(valor, bool) or valor is None:
        return ""
    if isinstance(valor, (int, float)):
        numero = float(valor)
    else:
        texto = _txt(valor, 32)
        if not re.fullmatch(r"\d+(?:[.,]\d+)?", texto):
            return texto
        numero = float(texto.replace(",", "."))
    if numero <= 0:
        return ""
    if numero >= 1000 or numero == int(numero):
        return "$" + f"{int(round(numero)):,}".replace(",", ".")
    return "$" + f"{numero:.2f}".replace(".", ",")


def _lista(valor, maximo: int) -> list:
    """Solo los elementos que son objetos, hasta `maximo`."""
    if not isinstance(valor, list):
        return []
    return [x for x in valor if isinstance(x, dict)][:maximo]


def _icono(valor) -> str:
    nombre = _txt(valor, 20).translate(_ACENTOS).lower()
    return nombre if nombre in ICONOS else "estrella"


class Hero(BaseModel):
    eyebrow: str = ""
    titulo: str = ""
    subtitulo: str = ""
    cta: str = ""


class Destacado(BaseModel):
    valor: str
    etiqueta: str


class Servicio(BaseModel):
    nombre: str
    descripcion: str = ""
    precio: str = ""
    icono: str = "estrella"


class Plan(BaseModel):
    nombre: str
    precio: str = ""
    periodo: str = ""
    incluye: list[str] = Field(default_factory=list)
    destacado: bool = False


class Horario(BaseModel):
    dia: str
    horas: str
    detalle: str = ""


class Paso(BaseModel):
    titulo: str
    texto: str = ""


class Testimonio(BaseModel):
    texto: str
    autor: str
    detalle: str = ""


class Pregunta(BaseModel):
    pregunta: str
    respuesta: str


class Contacto(BaseModel):
    whatsapp: str = ""
    telefono: str = ""
    email: str = ""
    direccion: str = ""
    instagram: str = ""


class DominioLanding(BaseModel):
    """Lo que dice la landing. Todo lo accesorio llega ya saneado."""

    nombre: str
    rubro: str = ""
    ciudad: str = ""
    tono: str = "neutro"
    acento: str = ""
    hero: Hero = Field(default_factory=Hero)
    destacados: list[Destacado] = Field(default_factory=list)
    servicios_titulo: str = ""
    servicios_intro: str = ""
    servicios: list[Servicio] = Field(default_factory=list)
    planes: list[Plan] = Field(default_factory=list)
    horarios_titulo: str = ""
    horarios: list[Horario] = Field(default_factory=list)
    pasos: list[Paso] = Field(default_factory=list)
    sobre: str = ""
    testimonios: list[Testimonio] = Field(default_factory=list)
    faq: list[Pregunta] = Field(default_factory=list)
    contacto: Contacto = Field(default_factory=Contacto)
    cta_final_titulo: str = ""
    cta_final_texto: str = ""

    @model_validator(mode="before")
    @classmethod
    def _normalizar(cls, datos):
        """Traduce la respuesta del modelo a la forma estricta, descartando lo roto.

        Va ANTES de la validación a propósito: si un testimonio viene sin autor,
        lo que debe pasar es que ese testimonio desaparezca, no que la landing
        entera se rechace por un adorno.
        """
        if not isinstance(datos, dict):
            return datos
        d = dict(datos)
        hero = d.get("hero") if isinstance(d.get("hero"), dict) else {}
        # Los modelos a veces aplanan el hero o lo llaman por su nombre en inglés.
        titulo_hero = hero.get("titulo") or hero.get("title") or d.get("titulo") or d.get("title")
        cta_final = d.get("cta_final") if isinstance(d.get("cta_final"), dict) else {}
        contacto = d.get("contacto") if isinstance(d.get("contacto"), dict) else {}

        tono = _txt(d.get("tono"), 12).translate(_ACENTOS).lower()
        acento = _txt(d.get("acento"), 7)

        servicios = []
        for s in _lista(d.get("servicios"), 8):
            nombre = _txt(s.get("nombre") or s.get("titulo"), 60)
            if nombre:
                servicios.append({
                    "nombre": nombre,
                    "descripcion": _txt(s.get("descripcion") or s.get("texto"), 220),
                    "precio": _precio(s.get("precio")),
                    "icono": _icono(s.get("icono")),
                })

        planes = []
        for p in _lista(d.get("planes"), 4):
            nombre = _txt(p.get("nombre"), 40)
            if not nombre:
                continue
            incluye = p.get("incluye") if isinstance(p.get("incluye"), list) else []
            planes.append({
                "nombre": nombre,
                "precio": _precio(p.get("precio")),
                "periodo": _txt(p.get("periodo"), 20),
                "incluye": [t for t in (_txt(x, 90) for x in incluye[:6]) if t],
                "destacado": p.get("destacado") is True,
            })
        # Un solo plan no es una tabla de precios: es un servicio más.
        if len(planes) == 1:
            unico = planes.pop()
            servicios.append({"nombre": unico["nombre"], "descripcion": "; ".join(unico["incluye"])[:220],
                              "precio": unico["precio"], "icono": "estrella"})

        def _pares(lista, a, b, la, lb, maximo, extra=None, lx=0):
            salida = []
            for x in _lista(lista, maximo):
                va, vb = _txt(x.get(a), la), _txt(x.get(b), lb)
                if va and vb:
                    fila = {a: va, b: vb}
                    if extra:
                        fila[extra] = _txt(x.get(extra), lx)
                    salida.append(fila)
            return salida

        return {
            "nombre": _txt(d.get("nombre") or d.get("app_name") or d.get("title"), 60),
            "rubro": _txt(d.get("rubro"), 40),
            "ciudad": _txt(d.get("ciudad"), 40),
            "tono": tono if tono in TONOS else "neutro",
            "acento": acento if _HEX.match(acento) else "",
            "hero": {
                "eyebrow": _txt(hero.get("eyebrow"), 60),
                "titulo": _txt(titulo_hero, 90),
                "subtitulo": _txt(hero.get("subtitulo") or d.get("tagline"), 240),
                "cta": _txt(hero.get("cta") or d.get("cta"), 32),
            },
            "destacados": _pares(d.get("destacados"), "valor", "etiqueta", 12, 40, 4),
            "servicios_titulo": _txt(d.get("servicios_titulo"), 70),
            "servicios_intro": _txt(d.get("servicios_intro"), 200),
            "servicios": servicios[:8],
            "planes": planes if len(planes) >= 2 else [],
            "horarios_titulo": _txt(d.get("horarios_titulo"), 60),
            "horarios": _pares(d.get("horarios"), "dia", "horas", 40, 40, 8, "detalle", 60),
            "pasos": _pares(d.get("pasos"), "titulo", "texto", 50, 200, 4),
            "sobre": _txt(d.get("sobre"), 600),
            "testimonios": _pares(d.get("testimonios"), "texto", "autor", 280, 50, 4, "detalle", 50),
            "faq": _pares(d.get("faq"), "pregunta", "respuesta", 140, 400, 6),
            "contacto": {
                "whatsapp": _txt(contacto.get("whatsapp"), 24),
                "telefono": _txt(contacto.get("telefono"), 24),
                "email": _txt(contacto.get("email"), 80) if "@" in str(contacto.get("email") or "") else "",
                "direccion": _txt(contacto.get("direccion"), 120),
                "instagram": _txt(contacto.get("instagram"), 40),
            },
            "cta_final_titulo": _txt(cta_final.get("titulo") or d.get("cta_final_titulo"), 80),
            "cta_final_texto": _txt(cta_final.get("texto") or d.get("cta_final_texto"), 200),
        }

    # -- lectura ------------------------------------------------------------
    @property
    def construible(self) -> bool:
        """Hay identidad, promesa y algo que ofrecer: lo sustancial está."""
        return bool(self.nombre and self.hero.titulo and len(self.servicios) >= MINIMO_SERVICIOS)

    def faltante(self) -> str | None:
        """Qué le falta para construirse, dicho para el log del fallback."""
        if not self.nombre:
            return "falta 'nombre'"
        if not self.hero.titulo:
            return "falta 'hero.titulo'"
        if len(self.servicios) < MINIMO_SERVICIOS:
            return f"trae {len(self.servicios)} servicio(s); hacen falta {MINIMO_SERVICIOS}"
        return None

    @property
    def whatsapp_digitos(self) -> str:
        """El número de WhatsApp listo para `wa.me` (solo dígitos, con indicativo).

        Un móvil colombiano de 10 dígitos que empieza por 3 sin indicativo es el
        caso más común en lo que se pide aquí; se le antepone el 57. Cualquier
        otra cosa se respeta tal cual (con menos de 8 dígitos no es un número).
        """
        digitos = re.sub(r"\D", "", self.contacto.whatsapp)
        if len(digitos) == 10 and digitos.startswith("3"):
            digitos = "57" + digitos
        return digitos if len(digitos) >= 8 else ""
