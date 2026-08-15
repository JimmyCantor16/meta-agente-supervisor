"""Prueba de que una idea concreta NO acaba convertida en la plantilla genérica.

Sin red y sin gastar cupo: los proveedores son de mentira y responden lo que
esta prueba les dicta.

QUÉ DEMUESTRA
-------------
1. Un proveedor que dice 'crud_login' sin dominio construible cuenta como fallo
   SUYO: el siguiente proveedor se prueba y salva la generación.
2. El contrato acepta 'landing' y 'otro' sin dominio (se sostienen solos) y
   exige temario de 2+ clases cuando el tipo es 'por_clases'.
3. Si NINGÚN proveedor da un dominio construible, se delega al generador libre
   —un intento real sobre la idea— y NUNCA se entrega la plantilla «Mi App».

POR QUÉ EXISTE
--------------
El 15-ago-2026 se pidió en producción «un carrito de compras» y llegó un sitio
llamado «Mi App» con una lista de «elementos»: la rama de emergencia de
`skeleton_generator`. El clasificador llamaba a `chat_json` SIN `validar`, así
que un JSON impecable con la forma equivocada contaba como éxito, la cadena de
proveedores se paraba con modelos sanos sin probar, y encima la rama devolvía
una plantilla con el nombre de nadie en lugar de intentar la idea de verdad.

    cd backend
    python pruebas/carrito_no_acaba_en_plantilla.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config import LLMProvider  # noqa: E402
from src.domain.entities import GeneratedFile, GeneratedProject  # noqa: E402
from src.domain.ports import ProjectGeneratorPort  # noqa: E402
from src.infrastructure.adapters.multimodel_llm import MultiModelLLM  # noqa: E402
from src.infrastructure.adapters.skeleton_generator import (  # noqa: E402
    SkeletonProjectGenerator,
    _contrato_del_clasificador,
)

# --- respuestas de mentira ---------------------------------------------------

#: JSON impecable, forma inventada: dice el tipo y se olvida del dominio. Es
#: exactamente lo que produce la plantilla «Mi App».
SIN_DOMINIO = json.dumps({"tipo": "crud_login", "app_name": "Tienda"})

#: La respuesta buena: dominio real de un carrito.
CON_DOMINIO = json.dumps(
    {
        "tipo": "crud_login",
        "dominio": {
            "app_name": "Tienda en Línea",
            "entidad": "Pedido",
            "entidad_plural": "Pedidos",
            "campos": [
                {"nombre": "cliente", "etiqueta": "Cliente", "tipo": "texto", "obligatorio": True},
                {"nombre": "total", "etiqueta": "Total", "tipo": "decimal", "minimo": 0},
            ],
            "ejemplos": [{"cliente": "Juan Pérez", "total": 30000}],
        },
    }
)


class ClienteFalso:
    """Imita lo justo del cliente OpenAI: `.chat.completions.create(...)`."""

    def __init__(self, respuesta: str) -> None:
        self.respuesta = respuesta
        self.llamadas = 0
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **_kwargs):
        self.llamadas += 1
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=self.respuesta), finish_reason="stop"
                )
            ],
            usage=SimpleNamespace(total_tokens=10),
        )


class FallbackEspia(ProjectGeneratorPort):
    """Generador libre de mentira: solo apunta si lo llamaron y con qué."""

    def __init__(self) -> None:
        self.llamado_con: str | None = None

    def generate(self, prompt: str, language: str = "es") -> GeneratedProject:
        self.llamado_con = prompt
        return GeneratedProject(
            name="Intento real",
            summary="lo hizo el generador libre",
            files=[GeneratedFile(path="README.md", content="#")],
            run_instructions="-",
        )

    def repair_with_error(self, project: GeneratedProject, error: str) -> GeneratedProject:
        return project

    def aplicar_stubs(self, project: GeneratedProject) -> GeneratedProject:
        return project


def montar(*respuestas: str) -> tuple[SkeletonProjectGenerator, list[ClienteFalso], FallbackEspia]:
    """Un generador de esqueleto cuya cadena responde lo que se le dicta."""
    provs = [
        LLMProvider(
            name=f"falso-{i}",
            base_url="http://localhost:1/v1",
            api_key="clave-de-mentira",
            model="modelo-de-mentira",
        )
        for i, _ in enumerate(respuestas, start=1)
    ]
    llm = MultiModelLLM(providers=provs, timeout=1.0, max_retries=0)
    clientes = [ClienteFalso(r) for r in respuestas]
    llm._clients = list(zip(provs, clientes))  # noqa: SLF001 - es el punto de la prueba

    espia = FallbackEspia()
    gen = SkeletonProjectGenerator(fallback=espia)
    gen._llm = llm  # noqa: SLF001 - se le presta la cadena de mentira
    return gen, clientes, espia


def main() -> int:
    fallos = 0

    # 1) El contrato, aislado.
    for datos, motivo in (
        ({"tipo": "crud_login", "app_name": "Tienda"}, "crud_login sin dominio"),
        ({"tipo": "inventado"}, "tipo que no existe"),
        ({"tipo": "por_clases", "dominio": {"campos": [{"nombre": "a", "etiqueta": "A"}]}},
         "por_clases sin temario"),
    ):
        try:
            _contrato_del_clasificador(datos)
            print(f"1. FALLO: el contrato aceptó «{motivo}»")
            fallos += 1
        except Exception:
            pass
    # 'landing' y 'otro' se sostienen sin dominio: no deben rechazarse.
    for datos in ({"tipo": "landing", "title": "X"}, {"tipo": "otro"}):
        try:
            _contrato_del_clasificador(datos)
        except Exception as exc:  # noqa: BLE001
            print(f"1. FALLO: el contrato rechazó {datos['tipo']!r}: {exc}")
            fallos += 1
    if not fallos:
        print("1. el contrato distingue lo construible de lo que no ✓")

    # 2) Forma mala primero -> el segundo proveedor salva la generación.
    gen, clientes, espia = montar(SIN_DOMINIO, CON_DOMINIO)
    proyecto = gen.generate("Quiero un carrito de compras")
    if clientes[1].llamadas != 1:
        print("2. FALLO: no llegó a probar el segundo proveedor")
        fallos += 1
    elif proyecto.name == "Mi App" or espia.llamado_con is not None:
        print(f"2. FALLO: acabó en plantilla/fallback pese a haber un proveedor sano "
              f"(name={proyecto.name!r})")
        fallos += 1
    else:
        print(f"2. la forma mala del 1º no tumbó nada: salió «{proyecto.name}» ✓")

    # 3) Ninguno sirve -> generador libre, NUNCA la plantilla «Mi App».
    gen, _, espia = montar(SIN_DOMINIO, SIN_DOMINIO)
    proyecto = gen.generate("Quiero un carrito de compras")
    if proyecto.name == "Mi App":
        print("3. FALLO: volvió la plantilla genérica «Mi App»")
        fallos += 1
    elif espia.llamado_con != "Quiero un carrito de compras":
        print(f"3. FALLO: no se delegó la idea original (fue {espia.llamado_con!r})")
        fallos += 1
    else:
        print("3. sin dominio construible se intenta la idea de verdad, no la plantilla ✓")

    if fallos:
        print(f"\n{fallos} FALLO(S).")
        return 1
    print("\nTODO CORRECTO: una idea concreta ya no puede degradarse en silencio")
    print("hasta «Mi App» con una lista de «elementos».")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
