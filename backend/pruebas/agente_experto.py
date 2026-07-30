"""Prueba del agente experto (FASE 6) con el experto SIMULADO: cero coste.

Lo que se comprueba es exactamente lo que hace vendible el plan:
  · Free y Pro NO usan experto; Studio en los momentos críticos; Business en todo.
  · Cuando entra, MEJORA algo comprobable (el modelo de datos gana campos y cálculo).
  · El gasto se mide y el TOPE corta: un cliente intensivo no se come el margen.
  · Sin clave, el experto queda inerte y el sistema sigue funcionando.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.application.experto import ServicioExperto  # noqa: E402
from src.domain.experto import MomentoExperto  # noqa: E402
from src.domain.planes import PLANES  # noqa: E402
from src.infrastructure.adapters.claude_experto import ClaudeAgenteExperto  # noqa: E402
from src.infrastructure.adapters.gasto_experto import RegistroGastoMemoria  # noqa: E402
from src.infrastructure.adapters.mock_experto import MockAgenteExperto  # noqa: E402

DOMINIO_POBRE = {
    "app_name": "Control de Rutinas",
    "entidad": "rutina",
    "entidad_plural": "rutinas",
    "campos": [
        {"nombre": "nombre", "etiqueta": "Nombre", "tipo": "texto"},
        {"nombre": "minutos", "etiqueta": "Minutos", "tipo": "entero"},
    ],
    "calculos": [],
    "tono": "vivo",
}


def sep(titulo: str) -> None:
    print(f"\n{'=' * 66}\n{titulo}\n{'=' * 66}")


def main() -> int:
    sep("1. QUIÉN USA EXPERTO, SEGÚN EL PLAN")
    print(f"{'plan':10} {'precio':>7}  diseño  rescate  repaso   tope")
    for plan in PLANES:
        marcas = "".join(
            f"{'  sí   ' if plan.entra_experto_en(m.value) else '  no   '}"
            for m in MomentoExperto
        )
        print(f"{plan.nombre:10} ${plan.precio_usd:>6}{marcas}  ${plan.tope_experto_usd:.2f}")

    sep("2. LA MISMA IDEA, CON Y SIN EXPERTO")
    for plan_id in ("free", "studio", "business"):
        servicio = ServicioExperto(
            MockAgenteExperto(), RegistroGastoMemoria(), usuario=f"u-{plan_id}", plan_id=plan_id
        )
        aporte = servicio.intervenir(MomentoExperto.DISENO, {"dominio": DOMINIO_POBRE})
        if aporte is None:
            puede, motivo = servicio.puede_intervenir(MomentoExperto.DISENO)
            print(f"\n{plan_id:9}: sin experto → {motivo}")
            print(f"{'':11}campos: {len(DOMINIO_POBRE['campos'])} · cálculos: 0")
            continue
        mejorado = aporte.datos["dominio"]
        print(f"\n{plan_id:9}: {aporte.resumen}")
        print(f"{'':11}campos: {len(mejorado['campos'])} · cálculos: {len(mejorado['calculos'])}"
              f" · coste ${aporte.coste_usd:.2f}")
        assert len(mejorado["campos"]) > len(DOMINIO_POBRE["campos"]), "no mejoró el modelo"
        assert mejorado["calculos"], "no añadió ningún cálculo"

    sep("3. RESCATE Y REPASO (los momentos que sí paga Studio)")
    servicio = ServicioExperto(
        MockAgenteExperto(), RegistroGastoMemoria(), usuario="u-studio", plan_id="studio"
    )
    rescate = servicio.intervenir(
        MomentoExperto.RESCATE,
        {"error": "sqlite3.OperationalError: no such table: rutinas", "archivo": "db.py"},
    )
    print(f"rescate: {rescate.resumen}")
    print(f"         {rescate.datos['diagnostico'][:100]}…")
    repaso = servicio.intervenir(
        MomentoExperto.REPASO,
        {"archivos": ["index.html", "web.py", "db.py", "estilos.css"]},
    )
    print(f"\nrepaso : {repaso.resumen}")
    for mejora in repaso.datos["mejoras"]:
        print(f"         · {mejora}")

    sep("4. EL TOPE DE GASTO CORTA DE VERDAD")
    gastos = RegistroGastoMemoria()
    servicio = ServicioExperto(MockAgenteExperto(), gastos, usuario="intensivo", plan_id="studio")
    tope = servicio.plan.tope_experto_usd
    entradas = 0
    for _ in range(40):
        aporte = servicio.intervenir(
            MomentoExperto.REPASO, {"archivos": ["index.html", "web.py"]}
        )
        if aporte is None:
            break
        entradas += 1
    resumen = servicio.resumen_gasto()
    puede, motivo = servicio.puede_intervenir(MomentoExperto.REPASO)
    print(f"tope del plan Studio  : ${tope:.2f}")
    print(f"intervenciones antes de cortar: {entradas}")
    print(f"gastado               : ${resumen['gastado_usd']:.2f}")
    print(f"al pedir otra         : {motivo}")
    assert not puede, "¡el tope no cortó!"
    assert resumen["gastado_usd"] >= tope, "cortó antes de agotar el tope"

    sep("5. SIN CLAVE, EL EXPERTO QUEDA INERTE (y el sistema sigue)")
    inerte = ClaudeAgenteExperto(api_key="")
    servicio = ServicioExperto(inerte, RegistroGastoMemoria(), usuario="u", plan_id="business")
    puede, motivo = servicio.puede_intervenir(MomentoExperto.DISENO)
    print(f"disponible: {inerte.disponible} · puede intervenir: {puede}")
    print(f"motivo    : {motivo}")
    assert not inerte.disponible and not puede

    print("\nTODO CORRECTO. Falta solo pegar la clave para que el experto sea real.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
