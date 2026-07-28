"""Dibuja el CEREBRO IA en la consola: la cadena real de proveedores.

No es un diagrama de adorno: lee la configuración VIVA (`LLM_PROVIDERS`) y
muestra el orden exacto en que se consultarían los modelos, con sus límites y
sus roles. Sirve para responder de un vistazo: «¿a quién le va a preguntar el
sistema y en qué orden?».

Uso:
    docker compose exec backend python -m tools.cerebro_grafo
"""

from __future__ import annotations

import sys

from src.config import LLMProvider, get_settings

ANCHO = 74


def _linea(car: str = "─") -> str:
    return car * ANCHO


def _caja(titulo: str, filas: list[str], borde: str = "═") -> list[str]:
    """Caja con título centrado."""
    out = ["╔" + borde * (ANCHO - 2) + "╗"]
    out.append("║" + titulo.center(ANCHO - 2) + "║")
    out.append("╟" + "─" * (ANCHO - 2) + "╢")
    for f in filas:
        out.append("║ " + f.ljust(ANCHO - 4) + " ║")
    out.append("╚" + borde * (ANCHO - 2) + "╝")
    return out


def _limites(p: LLMProvider) -> str:
    partes: list[str] = []
    if p.max_context:
        partes.append(f"ctx {p.max_context // 1000}k" if p.max_context >= 1000 else f"ctx {p.max_context}")
    tpm = getattr(p, "max_tpm", None)
    rpm = getattr(p, "max_rpm", None)
    if tpm:
        partes.append(f"{tpm // 1000}k tok/min" if tpm >= 1000 else f"{tpm} tok/min")
    if rpm:
        partes.append(f"{rpm} pet/min")
    return " · ".join(partes) if partes else "sin límites declarados"


def _cadena(rol: str, proveedores: list[LLMProvider]) -> list[str]:
    """Dibuja la cadena de un rol, en el ORDEN REAL de consulta."""
    candidatos = [p for p in proveedores if p.serves(rol)] or list(proveedores)
    # Mismo criterio que el enrutador: la bolsa finita, al final.
    candidatos.sort(key=lambda p: p.exhaustible)

    etiqueta = {
        "prompt": "PROMPT  ·  analizar · evaluar · enseñar",
        "code": "CODE    ·  escribir · reparar código",
    }.get(rol, rol)

    out = [f"  CADENA [{etiqueta}]   {len(candidatos)} proveedor(es)", "  " + _linea("╌")]
    for i, p in enumerate(candidatos, 1):
        ultimo = i == len(candidatos)
        rama = "  └─" if ultimo else "  ├─"
        marca = " ⚠ bolsa finita" if p.exhaustible else ""
        out.append(f"{rama}[{i}] {p.name:<24} {_limites(p)}{marca}")
        if not ultimo:
            out.append("  │      ↓ si falla / satura / responde mal")
    out.append("")
    out.append("         ✖ si TODOS fallan → se detiene con el detalle de cada uno")
    return out


FLUJO = r"""
  POR CADA PROVEEDOR, EN ORDEN:

        ┌───────────────────┐   no cabe    ┌──────────────────────────┐
        │  ¿Cabe la         │─────────────►│  saltar (evita un 413    │
        │   petición?       │              │  seguro y un viaje       │
        └─────────┬─────────┘              │  desperdiciado)          │
                  │ sí                     └──────────────────────────┘
                  ▼
        ┌───────────────────┐  saturado    ┌──────────────────────────┐
        │  ¿Le queda cuota  │─────────────►│  APARCAR y probar otro   │
        │   este minuto?    │              │  (cambiar es gratis;     │
        └─────────┬─────────┘              │   dormir cuesta tiempo)  │
                  │ libre                  └──────────────────────────┘
                  ▼
        ┌───────────────────┐
        │     L L A M A R   │
        └─────────┬─────────┘
                  ▼
        ┌───────────────────────────────────────────────────────────┐
        │  ¿La respuesta SIRVE?                                     │
        │    · vacía            → no                                │
        │    · cortada a medias → no   ─────────► siguiente proveedor│
        │    · JSON inválido    → no                                │
        └─────────┬─────────────────────────────────────────────────┘
                  │ sí
                  ▼
            ✔  se entrega  ·  se anota el gasto en su cuota

  Si TODOS los que caben están saturados → espera al que antes se libere.
"""


def main() -> int:
    settings = get_settings()
    proveedores = settings.resolved_providers
    if not proveedores:
        print("No hay proveedores configurados (revisa LLM_PROVIDERS).")
        return 1

    print()
    for l in _caja("C E R E B R O   I A   ·   cadena de respaldo", [
        f"{len(proveedores)} proveedores configurados",
        "Cada petición se enruta por OFICIO y baja por la cadena hasta que",
        "alguien responde algo válido.",
    ]):
        print(l)
    print()

    print("  Una petición entra")
    print("        │")
    print("        ├──► ¿qué oficio?  ──┬──►  PROMPT   (razonar)")
    print("        │                    └──►  CODE     (construir)")
    print("        ▼")
    print()

    for rol in ("prompt", "code"):
        for l in _cadena(rol, proveedores):
            print(l)
        print()

    print(FLUJO)

    # Agrupación por cuenta: gastar en uno resta al otro.
    grupos: dict[str, list[str]] = {}
    for p in proveedores:
        grupos.setdefault(p.quota_key, []).append(p.name)
    compartidas = {k: v for k, v in grupos.items() if len(v) > 1}
    if compartidas:
        print("  CUOTAS COMPARTIDAS (gastar en uno le resta al otro):")
        for cuenta, nombres in compartidas.items():
            print(f"    ◆ {cuenta}: " + " + ".join(nombres))
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
