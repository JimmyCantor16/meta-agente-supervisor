"""Mock del generador de metas: un mapa de hitos determinista y honesto.

Reconoce el caso emblemático (monetizar YouTube) y, para cualquier otra meta,
arma un camino genérico razonable — todo sin gastar cupo de IA.
"""

from __future__ import annotations

from src.domain.entities import DependeDe, Hito, MetaProceso
from src.domain.ports import GeneradorMetaPort


class MockGeneradorMeta(GeneradorMetaPort):
    def generar(self, objetivo, contexto, language="es") -> MetaProceso:
        t = (objetivo or "").lower()
        if any(p in t for p in ("azure", "nube", "cloud", "aws", "conectar", "credencial", "api real")):
            hitos = [
                Hito(titulo="Crear una credencial de SOLO LECTURA en Azure",
                     descripcion="Un 'service principal' con rol Reader, acotado a tu suscripción. Nunca la llave maestra: así nadie puede crear ni borrar nada, solo mirar.",
                     depende_de=DependeDe.PLATAFORMA),
                Hito(titulo="Guardar la clave en la CARPETA DE SECRETOS (nunca en el chat)",
                     descripcion="Suéltala en un .txt en la carpeta 🔐 Secretos del proyecto. Ahí se queda solo en tu computador; jamás viaja a la IA.",
                     depende_de=DependeDe.ALUMNO),
                Hito(titulo="Instalar el Azure CLI / SDK en tu computador",
                     descripcion="La herramienta que habla con Azure. El profesor te da el comando para tu sistema.",
                     depende_de=DependeDe.ALUMNO),
                Hito(titulo="Primera consulta: traer UN dato real",
                     descripcion="Construimos aquí el código que lee la clave del entorno y trae un solo número real de tu Azure. Ver un dato real confirma que la conexión funciona.",
                     depende_de=DependeDe.SISTEMA),
                Hito(titulo="Cablear el tablero con tus datos reales",
                     descripcion="Reemplazamos los datos de ejemplo por tus recursos, costos y estados reales, uno por uno.",
                     depende_de=DependeDe.SISTEMA),
                Hito(titulo="Refresco en vivo",
                     descripcion="Que el tablero se actualice solo con la última información de Azure.",
                     depende_de=DependeDe.TIEMPO),
            ]
            resumen = ("SÍ se puede conectar tu Azure real, y de forma segura: tu "
                       "clave va a la carpeta de secretos (NUNCA al chat), usamos "
                       "una credencial de solo lectura, y lo cableamos paso a paso. "
                       "Yo (la IA) nunca veo tu clave.")
            return MetaProceso(usuario_sub="", objetivo=objetivo, resumen=resumen, hitos=hitos)
        if "youtube" in t or "canal" in t or "monetiz" in t:
            hitos = [
                Hito(titulo="Definir el tema y el público de tu canal",
                     descripcion="Qué videos harás y para quién. Sin esto, nada crece.",
                     depende_de=DependeDe.ALUMNO),
                Hito(titulo="Crear la web/landing de tu canal",
                     descripcion="Una página que construimos aquí para presentar tu canal.",
                     depende_de=DependeDe.SISTEMA),
                Hito(titulo="Publicar videos con constancia",
                     descripcion="El trabajo real: subir contenido de valor, seguido.",
                     depende_de=DependeDe.ALUMNO),
                Hito(titulo="Alcanzar 1.000 suscriptores y 4.000 horas",
                     descripcion="El umbral que exige YouTube para el programa de socios.",
                     depende_de=DependeDe.PLATAFORMA),
                Hito(titulo="Que crezca tu audiencia con el tiempo",
                     descripcion="Esto no depende de un clic: se gana video a video.",
                     depende_de=DependeDe.TIEMPO),
                Hito(titulo="Abrir AdSense y pasar la revisión de Google",
                     descripcion="Una cuenta para cobrar y la aprobación de la plataforma.",
                     depende_de=DependeDe.PLATAFORMA),
            ]
            resumen = ("SÍ se puede monetizar, pero no en un clic: es un camino. "
                       "Nosotros construimos tu web hoy; los suscriptores los ganan "
                       "tus videos con el tiempo. Te acompaño en todo el trayecto.")
        else:
            hitos = [
                Hito(titulo="Definir bien qué quieres lograr",
                     descripcion="Aterrizar la meta en algo concreto y medible.",
                     depende_de=DependeDe.ALUMNO),
                Hito(titulo="Construir el sistema/web que lo soporte",
                     descripcion="Lo que hacemos aquí: tu herramienta lista y publicada.",
                     depende_de=DependeDe.SISTEMA),
                Hito(titulo="Ponerlo frente a la gente",
                     descripcion="Compartirlo, usarlo, conseguir los primeros usuarios.",
                     depende_de=DependeDe.ALUMNO),
                Hito(titulo="Cumplir requisitos de terceros si los hay",
                     descripcion="Cuentas, pagos, aprobaciones que dependen de plataformas.",
                     depende_de=DependeDe.PLATAFORMA),
                Hito(titulo="Darle tiempo para que crezca",
                     descripcion="Los resultados reales llegan con constancia, no de golpe.",
                     depende_de=DependeDe.TIEMPO),
            ]
            resumen = ("Tu meta se logra por pasos: unos los construimos aquí, otros "
                       "dependen de ti, de terceros y del tiempo. Vamos uno a uno.")
        return MetaProceso(usuario_sub="", objetivo=objetivo, resumen=resumen, hitos=hitos)
