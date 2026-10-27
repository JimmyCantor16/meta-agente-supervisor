"""Prueba del catálogo de cursos escritos (estilo Platzi). Offline.

QUÉ DEMUESTRA
-------------
1. La semilla del curso fullstack es válida (5 módulos, la final con 10
   preguntas) y sembrarla dos veces no duplica ni pisa; una versión mayor sí
   reemplaza.
2. Lo que llega al navegador NO trae `correcta`, la explicación de la
   respuesta ni la solución de los retos.
3. El quiz se corrige en el servidor: sin responder es un fallo, el mejor
   puntaje se conserva y aprobar el quiz de una lección la completa.
4. Una lección con quiz no se completa «a mano» sin aprobarlo (409).
5. Al terminar todo, sale UN certificado; repetir no emite otro.
6. El progreso es de cada usuario: el de uno no aparece en otro.
7. El reto pasa por el tutor (simulado aquí) y queda registrado si se aprueba.

    cd backend
    PYTHONIOENCODING=utf-8 python pruebas/catalogo_cursos.py
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.application.catalogo_cursos import CatalogoCursosUseCase  # noqa: E402
from src.domain.ports import LeccionBloqueadaError  # noqa: E402
from src.infrastructure.adapters.mock_tutor_curso import MockTutorCurso  # noqa: E402
from src.infrastructure.adapters.sqlite_actividad_repository import SqliteActividadRepository  # noqa: E402
from src.infrastructure.adapters.sqlite_catalogo_repository import SqliteCatalogoRepository  # noqa: E402
from src.infrastructure.semillas import cursos_semilla  # noqa: E402
from src.infrastructure.semillas.fullstack import CURSO_ID  # noqa: E402


def todas_bien(ev) -> dict[str, int]:
    return {p.id: p.correcta for p in ev.preguntas}


def main() -> int:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db = str(Path(tmp) / "catalogo.db")
        repo = SqliteCatalogoRepository(db)
        actividad = SqliteActividadRepository(db)
        uc = CatalogoCursosUseCase(repo, MockTutorCurso(), actividad)

        # 1) Semilla idempotente y versionada.
        semilla = cursos_semilla()
        curso = semilla[0]
        assert len(curso.modulos) == 5, len(curso.modulos)
        assert len(curso.evaluacion("m5-final-quiz").preguntas) == 10
        assert uc.sembrar(semilla) == [CURSO_ID]
        assert uc.sembrar(cursos_semilla()) == [], "la misma versión no debe reescribirse"
        nueva = cursos_semilla()[0]
        nueva.version += 1
        assert uc.sembrar([nueva]) == [CURSO_ID], "una versión mayor debe reemplazar"
        print("1. semilla válida, idempotente y versionada ✓")

        # 2) Nada de respuestas hacia el navegador.
        vista = json.dumps(uc.detalle(CURSO_ID, "ana"))
        for secreto in ('"correcta"', '"solucion_referencia"'):
            assert secreto not in vista, f"{secreto} viaja al navegador"
        respuesta = curso.evaluacion("m5-final-quiz").preguntas[0].explicacion
        assert respuesta not in vista, "la explicación de la respuesta viaja antes de contestar"
        print("2. el curso que ve el alumno no trae respuestas ni soluciones ✓")

        # 3) Corrección en el servidor.
        l1 = curso.lecciones()[0]
        ev = l1.evaluacion
        r = uc.evaluar("ana", CURSO_ID, ev.id, {})
        assert r["resultado"]["puntaje"] == 0 and not r["resultado"]["aprobado"]
        r = uc.evaluar("ana", CURSO_ID, ev.id, todas_bien(ev))
        assert r["resultado"]["puntaje"] == 100 and r["resultado"]["aprobado"]
        assert l1.id in r["progreso"]["lecciones_completadas"], "aprobar el quiz debe completar la lección"
        r = uc.evaluar("ana", CURSO_ID, ev.id, {})
        assert r["resultado"]["mejor_puntaje"] == 100, "un intento peor no borra el mejor"
        print("3. el quiz se corrige en el servidor y conserva el mejor puntaje ✓")

        # 4) No se salta el quiz.
        l2 = curso.lecciones()[1]
        try:
            uc.completar_leccion("ana", CURSO_ID, l2.id)
            print("4. FALLO: completó una lección sin aprobar su quiz")
            return 1
        except LeccionBloqueadaError:
            print("4. una lección con quiz no se completa sin aprobarlo ✓")

        # 5) Todo → un certificado.
        for leccion in curso.lecciones():
            if leccion.evaluacion:
                uc.evaluar("ana", CURSO_ID, leccion.evaluacion.id, todas_bien(leccion.evaluacion))
            else:
                uc.completar_leccion("ana", CURSO_ID, leccion.id, "Ana")
        assert uc.certificado("ana", CURSO_ID) is None, "sin la final no hay certificado"
        final = curso.evaluacion("m5-final-quiz")
        r = uc.evaluar("ana", CURSO_ID, final.id, todas_bien(final), "Ana")
        cert = r["progreso"]["certificado"]
        assert cert and cert["folio"].startswith("MA-"), cert
        assert r["progreso"]["avance"] == 100
        uc.evaluar("ana", CURSO_ID, final.id, todas_bien(final), "Ana")
        assert uc.certificado("ana", CURSO_ID).folio == cert["folio"], "repetir no debe emitir otro"
        assert actividad.fechas_de("ana"), "avanzar debe dejar huella en la racha"
        print(f"5. curso completo → un único certificado ({cert['folio']}) ✓")

        # 6) Progreso por usuario.
        assert uc.detalle(CURSO_ID, "beto")["progreso"]["avance"] == 0
        assert [c["avance"] for c in uc.listar("beto")] == [0]
        assert uc.certificado("beto", CURSO_ID) is None
        print("6. el progreso de un alumno no aparece en otro ✓")

        # 7) Reto por el tutor (simulado).
        reto, _ = curso.reto("m3-l2-reto")
        r = uc.revisar_reto("beto", CURSO_ID, reto.id, "class X {}")
        assert not r["veredicto"]["aprobado"] and reto.id not in r["progreso"]["retos_superados"]
        r = uc.revisar_reto("beto", CURSO_ID, reto.id, reto.solucion_referencia + "\n// ok")
        assert r["veredicto"]["aprobado"] and reto.id in r["progreso"]["retos_superados"]
        print("7. el reto pasa por el tutor y queda registrado al aprobarse ✓")

    print("\nTODO CORRECTO: el catálogo corrige en el servidor y certifica una vez.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
