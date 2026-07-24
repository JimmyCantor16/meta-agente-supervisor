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
