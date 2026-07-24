"""Mocks deterministas del curso (para USE_MOCK_LLM=true): sin gastar IA.

Genera un temario coherente de 10 clases con criterios verificables reales
(quiz, repo_git, url_publicada, reflexion), para probar toda la mecánica del
módulo profesor sin llamar a ningún modelo.
"""

from __future__ import annotations

from src.domain.entities import (
    Clase,
    CriterioSuperacion,
    PreguntaQuiz,
    Syllabus,
    TipoCriterio,
)
from src.domain.ports import GeneradorSyllabusPort, ProfesorChatPort


class MockGeneradorSyllabus(GeneradorSyllabusPort):
    def generar(self, proyecto, arquetipo, files, num_clases, language="es") -> Syllabus:
        base = [
            ("Conoce tu sistema", "Entender qué hace tu proyecto y sus partes.",
             f"Tu proyecto **{proyecto}** tiene un backend (el que atiende) y un frontend "
             "(las pantallas). Vamos a mirar juntos cómo se hablan.",
             "Abre el proyecto y encuentra el archivo que arranca el servidor.",
             "arquitectura cliente-servidor",
             CriterioSuperacion(
                 tipo=TipoCriterio.QUIZ, descripcion="Responde bien 2 de 3.",
                 aciertos_minimos=2,
                 quiz=[
                     PreguntaQuiz(pregunta="¿Qué hace el backend?",
                                  opciones=["Pinta colores", "Atiende peticiones y guarda datos", "Nada"],
                                  correcta=1),
                     PreguntaQuiz(pregunta="¿Dónde ve el usuario tu sistema?",
                                  opciones=["En el frontend (las pantallas)", "En la base de datos", "En el router"],
                                  correcta=0),
                     PreguntaQuiz(pregunta="¿Qué guarda los datos?",
                                  opciones=["El CSS", "La base de datos", "El logo"],
                                  correcta=1),
                 ])),
            ("Tu primer cambio", "Cambiar un texto de tu sistema y verlo.",
             "Todo texto que ves vive en un archivo. Cambiar uno es tu primer paso como dev.",
             "Cambia el título principal de tu página.",
             "editar y ver el resultado",
             CriterioSuperacion(tipo=TipoCriterio.REFLEXION,
                                descripcion="Cuéntame qué texto cambiaste y qué pasó.")),
            ("Los datos de tu sistema", "Entender las semillas: los datos de ejemplo.",
             "Tu sistema arranca con datos de prueba (las 'semillas'). Así se ve lleno desde el día 1.",
             "Encuentra dónde están los datos de ejemplo de tu proyecto.",
             "datos semilla",
             CriterioSuperacion(tipo=TipoCriterio.REFLEXION,
                                descripcion="Dime qué datos de ejemplo trae tu sistema.")),
            ("Córrelo en tu computador", "Arrancar tu sistema sin Docker, con Node.",
             "Node.js es el motor. Con `npm install` y `npm start`, tu sistema corre en tu máquina.",
             "Instala Node, corre `npm install` y `npm start`, y abre localhost.",
             "ejecutar en local",
             CriterioSuperacion(tipo=TipoCriterio.REFLEXION,
                                descripcion="Cuéntame si lograste abrirlo en tu computador y qué viste.")),
            ("El corazón: el CRUD", "Entender Crear, Leer, Editar, Borrar.",
             "CRUD son las 4 cosas que todo sistema hace con sus datos. Tu proyecto ya las tiene.",
             "Crea un registro nuevo desde la pantalla de tu sistema.",
             "operaciones CRUD",
             CriterioSuperacion(
                 tipo=TipoCriterio.QUIZ, descripcion="Responde bien 2 de 3.", aciertos_minimos=2,
                 quiz=[
                     PreguntaQuiz(pregunta="¿Qué significa la C de CRUD?",
                                  opciones=["Copiar", "Crear", "Cerrar"], correcta=1),
                     PreguntaQuiz(pregunta="¿Y la D?",
                                  opciones=["Borrar (Delete)", "Descargar", "Dividir"], correcta=0),
                     PreguntaQuiz(pregunta="¿La R?",
                                  opciones=["Reiniciar", "Leer (Read)", "Repetir"], correcta=1),
                 ])),
            ("Una pantalla por dentro", "Ver cómo una pantalla pide datos y los muestra.",
             "Tus pantallas piden datos al backend y los pintan. Vamos a seguir ese viaje.",
             "Encuentra en tu código dónde se piden los productos/datos al backend.",
             "frontend pide al backend",
             CriterioSuperacion(tipo=TipoCriterio.REFLEXION,
                                descripcion="Dime qué pantalla miraste y qué datos muestra.")),
            ("Git: tu caja fuerte", "Guardar tu código en GitHub.",
             "GitHub es la caja fuerte y el historial de tu código. Cada 'commit' es una foto con nombre.",
             "Crea tu cuenta de GitHub y sube tu proyecto a un repositorio nuevo.",
             "control de versiones",
             CriterioSuperacion(tipo=TipoCriterio.REPO_GIT,
                                descripcion="Pega el enlace de tu repositorio de GitHub.",
                                pista="Debe verse como https://github.com/tu-usuario/tu-proyecto y estar Público.")),
            ("Publícalo al mundo", "Poner tu sistema en internet, gratis.",
             "Con Netlify (páginas) o Render (sistemas con backend) tu proyecto vive en internet, gratis.",
             "Publica tu proyecto y consigue tu URL pública.",
             "despliegue",
             CriterioSuperacion(tipo=TipoCriterio.URL_PUBLICADA,
                                descripcion="Pega la URL pública donde quedó tu sistema.",
                                pista="Algo como https://tu-proyecto.netlify.app")),
            ("El ciclo real", "Cambiar algo y volver a publicar.",
             "Así trabaja un dev: cambias, guardas (commit), subes (push) y se actualiza solo.",
             "Haz un cambio pequeño, súbelo a GitHub y mira cómo se actualiza.",
             "ciclo de despliegue",
             CriterioSuperacion(tipo=TipoCriterio.REFLEXION,
                                descripcion="Cuéntame qué cambiaste y si viste el cambio publicado.")),
            ("Graduación", "Repasar todo lo aprendido.",
             "Recorriste el camino completo: de una idea a un sistema tuyo en internet. 🎓",
             "Responde el quiz final y recibe tu graduación.",
             "repaso final",
             CriterioSuperacion(
                 tipo=TipoCriterio.QUIZ, descripcion="Responde bien 2 de 3 para graduarte.", aciertos_minimos=2,
                 quiz=[
                     PreguntaQuiz(pregunta="¿Qué es un commit?",
                                  opciones=["Borrar todo", "Una foto con nombre de tu código", "Un error"],
                                  correcta=1),
                     PreguntaQuiz(pregunta="¿Para qué sirve Render/Netlify?",
                                  opciones=["Publicar tu sistema en internet", "Escribir música", "Nada"],
                                  correcta=0),
                     PreguntaQuiz(pregunta="¿Dónde vive el historial de tu código?",
                                  opciones=["En GitHub", "En el escritorio", "En la RAM"],
                                  correcta=0),
                 ])),
        ]
        clases = [
            Clase(numero=i, titulo=t, objetivo=o, contenido=c, reto=r,
                  concepto_clave=k, criterio=crit)
            for i, (t, o, c, r, k, crit) in enumerate(base[:num_clases], start=1)
        ]
        return Syllabus(
            proyecto=proyecto, arquetipo=arquetipo,
            titulo_curso=f"De cero a producción con {proyecto}",
            resumen=f"Aprende a entender, correr y publicar {proyecto} — tu propio sistema.",
            clases=clases,
        )


class MockProfesorChat(ProfesorChatPort):
    def responder(self, clase, historial, mensaje, contexto_proyecto, language="es") -> str:
        return (f"[Modo demo] Buena pregunta sobre «{clase.titulo}». En tu proyecto, "
                "mira el archivo que mencioné y prueba el reto. Si te atascas, dime "
                "exactamente qué línea no entiendes. 🙂")

    def evaluar_reflexion(self, clase, respuesta, language="es") -> tuple[bool, str]:
        # En demo: aprueba si el alumno escribió algo con sustancia.
        if len((respuesta or "").strip()) >= 15:
            return True, "¡Muy bien! Se nota que lo entendiste. 💪"
        return False, "Cuéntame un poquito más, con tus palabras, y lo reviso de nuevo. 🙂"
