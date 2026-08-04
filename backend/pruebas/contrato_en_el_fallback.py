"""Prueba de que el CONTRATO se valida dentro del bucle de fallback.

Sin red y sin gastar cupo: los proveedores son de mentira y responden lo que
esta prueba les dicta.

QUÉ DEMUESTRA
-------------
1. Un proveedor que devuelve JSON perfecto pero con la FORMA equivocada no
   tumba la petición: cuenta como fallo suyo y el siguiente lo intenta.
2. Cuando ninguno cumple el contrato, el error dice de quién fue la culpa.
3. Sin `validar`, el comportamiento de siempre no cambia (compatibilidad).
4. Un validador que revienta de forma inesperada tampoco tumba la tarea.

POR QUÉ EXISTE
--------------
En agosto de 2026 `/evaluate` estuvo caído al 100% (6 de 6 peticiones en 502)
con cuatro proveedores sanos en la cadena sin llegar a probarse: `mistral-small`
devolvía `prompt_final_optimizado` como objeto en vez de string, y el esquema se
comprobaba DESPUÉS del bucle, cuando ya no había vuelta atrás. Este guion existe
para que ese fallo no pueda volver en silencio.

    cd backend
    python pruebas/contrato_en_el_fallback.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import BaseModel  # noqa: E402

from src.config import LLMProvider  # noqa: E402
from src.infrastructure.adapters.multimodel_llm import LLMError, MultiModelLLM  # noqa: E402


class Contrato(BaseModel):
    """La forma que el llamador exige: `titulo` es TEXTO, no un objeto."""

    titulo: str


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
                    message=SimpleNamespace(content=self.respuesta),
                    finish_reason="stop",
                )
            ],
            usage=SimpleNamespace(total_tokens=10),
        )


def montar(*respuestas: str) -> tuple[MultiModelLLM, list[ClienteFalso]]:
    """Un MultiModelLLM cuya cadena responde exactamente lo que se le pasa."""
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
    return llm, clientes


def main() -> int:
    forma_mala = json.dumps({"titulo": {"contexto": "soy un objeto, no un texto"}})
    forma_buena = json.dumps({"titulo": "soy el texto que se esperaba"})

    # 1) El primero cumple la sintaxis pero no el contrato -> salta al segundo.
    llm, clientes = montar(forma_mala, forma_buena)
    datos = llm.chat_json("s", "u", validar=Contrato.model_validate)
    print(f"1. el 2º proveedor salvó la petición : {datos['titulo']!r}")
    assert datos["titulo"] == "soy el texto que se esperaba"
    assert clientes[0].llamadas == 1, "no llegó a probar el primero"
    assert clientes[1].llamadas == 1, "no llegó a probar el segundo"
    print("   ambos proveedores se probaron ✓")

    # 2) Si NINGUNO cumple, el error dice de quién fue la culpa.
    llm, _ = montar(forma_mala, forma_mala)
    try:
        llm.chat_json("s", "u", validar=Contrato.model_validate)
        print("2. FALLO: debería haber lanzado LLMError")
        return 1
    except LLMError as exc:
        assert "no cumple el contrato" in str(exc), f"error poco claro: {exc}"
        assert "falso-1" in str(exc) and "falso-2" in str(exc), "no dice quién falló"
        print("2. sin proveedores válidos, el error nombra a los culpables ✓")

    # 3) Sin `validar`, nada cambia: la forma mala se acepta como antes.
    llm, clientes = montar(forma_mala, forma_buena)
    datos = llm.chat_json("s", "u")
    assert isinstance(datos["titulo"], dict), "sin validador no debería filtrar"
    assert clientes[1].llamadas == 0, "no debió tocar al segundo proveedor"
    print("3. sin validador, el comportamiento de siempre se conserva ✓")

    # 4) Un validador que revienta de forma imprevista tampoco tumba la tarea:
    #    en un bucle de fallback, cualquier fallo suyo significa "el siguiente".
    def validador_roto(_d: dict) -> None:
        raise RuntimeError("me rompí por otra razón")

    llm, _ = montar(forma_buena, forma_buena)
    try:
        llm.chat_json("s", "u", validar=validador_roto)
        print("4. FALLO: debería haber agotado la cadena")
        return 1
    except LLMError as exc:
        assert "me rompí por otra razón" in str(exc)
        print("4. un validador que revienta se trata como fallo del proveedor ✓")

    print("\nTODO CORRECTO: el contrato se comprueba DENTRO del bucle, así que")
    print("un modelo que inventa la forma ya no tumba la petición entera.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
