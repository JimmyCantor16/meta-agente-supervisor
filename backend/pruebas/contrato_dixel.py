"""Prueba: el contrato de DIXEL se corrige solo, sin gastar un token.

`domain/contrato_dixel.py` es el corrector objetivo con el que se enseña la
librería: el alumno escribe su componente y el veredicto es una regla citada,
no una opinión. Este guion demuestra dos cosas:

1. Que cada regla salta con código que la incumple, y que un componente correcto
   pasa limpio (si el corrector no distinguiera, no serviría para calificar).
2. Que la librería REAL de `vendor/dixel` cumple su propio contrato salvo tres
   desvíos conocidos. Si aparecen más, algo se torció y hay que mirarlo: es la
   alarma de deriva.

    cd backend
    PYTHONIOENCODING=utf-8 python pruebas/contrato_dixel.py

Offline: no toca la red ni gasta cupo de ningún modelo.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.domain import contrato_dixel as cd  # noqa: E402

#: Desvíos que la librería trae de origen (transiciones sobre propiedades
#: caras). Se dejan a la vista a propósito: son deuda conocida, no sorpresa.
DESVIOS_CONOCIDOS = 3

CORRECTO = """Dixel.define('NeonButton', ['Button', 'Utils'], function (Button, Utils) {
  'use strict';

  class NeonButton extends Button {
    static defaults = Object.assign({}, Button.defaults, { glow: 0.4 });

    ready() {
      super.ready();
      this.el.classList.add('dx-neon');
      this.onFrame(this.update);
    }

    update(time) {
      this.el.style.transform = 'scale(' + (1 + Math.sin(time) * 0.01) + ')';
    }
  }

  return NeonButton;
});
"""

CASOS = [
    ("sin-comentarios", "components/buttons/Mal.js", "Dixel.define('Mal', [], function () {\n  // esto explica\n  return class Mal extends Component { static defaults = {}; };\n});\n"),
    ("sin-console", "components/buttons/Mal.js", "Dixel.define('Mal', [], function () {\n  console.log('hola');\n  return class Mal extends Component { static defaults = {}; };\n});\n"),
    ("sin-modulos", "components/buttons/Mal.js", "import Button from './Button.js';\nDixel.define('Mal', [], function () {\n  return class Mal extends Component { static defaults = {}; };\n});\n"),
    ("un-solo-reloj", "components/buttons/Mal.js", "Dixel.define('Mal', [], function () {\n  return class Mal extends Component {\n    static defaults = {};\n    ready() {\n      requestAnimationFrame(this.pintar);\n    }\n  };\n});\n"),
    ("solo-transform-opacity", "components/buttons/Mal.js", "Dixel.define('Mal', [], function () {\n  return class Mal extends Component {\n    static defaults = {};\n    update(t) {\n      this.el.style.width = t + 'px';\n    }\n  };\n});\n"),
    ("sin-medir-en-frame", "components/buttons/Mal.js", "Dixel.define('Mal', [], function () {\n  return class Mal extends Component {\n    static defaults = {};\n    update() {\n      const caja = this.el.getBoundingClientRect();\n    }\n  };\n});\n"),
    ("static-defaults", "components/buttons/Mal.js", "Dixel.define('Mal', [], function () {\n  return class Mal extends Component {\n    ready() {\n      this.gap = this.options.gap || 10;\n    }\n  };\n});\n"),
    ("uno-por-archivo", "components/buttons/Mal.js", "Dixel.define('OtroNombre', [], function () {\n  return class OtroNombre extends Component { static defaults = {}; };\n});\n"),
    ("usa-define", "components/buttons/Mal.js", "class Mal extends Component {\n  static defaults = {};\n}\n"),
    ("texto-escapado", "components/buttons/Mal.js", "Dixel.define('Mal', [], function () {\n  return class Mal extends Component {\n    static defaults = {};\n    ready() {\n      this.el.innerHTML = '<b>' + this.options.label + '</b>';\n    }\n  };\n});\n"),
    ("color-por-token", "components/buttons/mal.css", ".dx-mal { color: #ff00aa; }\n"),
    ("prefijo-dx", "components/buttons/mal.css", ".boton-guapo { color: var(--dx-ink); }\n"),
    ("solo-transform-opacity", "components/buttons/mal.css", ".dx-mal { transition: box-shadow 0.3s ease; }\n"),
]

fallos: list[str] = []


def comprobar(condicion: bool, mensaje: str) -> None:
    print(("  OK   " if condicion else "  FALLA") + " " + mensaje)
    if not condicion:
        fallos.append(mensaje)


def main() -> int:
    print("\n1. Cada regla salta con el código que la incumple")
    for regla, ruta, codigo in CASOS:
        reglas = {f.regla for f in cd.revisar({ruta: codigo})}
        comprobar(regla in reglas, f"{regla} ← {ruta.rsplit('/', 1)[-1]}")

    print("\n2. Un componente correcto pasa limpio")
    faltas = cd.revisar({"components/buttons/NeonButton.js": CORRECTO})
    comprobar(not faltas, "NeonButton.js sin infracciones" + (
        " (salieron: " + cd.resumen(faltas) + ")" if faltas else ""
    ))

    print("\n3. Lo que no es componente ni CSS, ni se mira")
    ajenos = cd.revisar({"build.mjs": "// un comentario\nconsole.log('hola');\n"})
    comprobar(not ajenos, "build.mjs queda fuera del contrato")

    print("\n4. La librería real cumple su propio contrato")
    raiz = Path(__file__).resolve().parents[2] / "vendor" / "dixel"
    if not raiz.is_dir():
        print("  (sin vendor/dixel a mano: me salto esta parte)")
    else:
        archivos = {
            str(p.relative_to(raiz)).replace("\\", "/"): p.read_text(encoding="utf-8", errors="ignore")
            for p in raiz.rglob("*")
            if p.suffix in (".js", ".css") and "dist" not in p.parts and "node_modules" not in p.parts
        }
        faltas = cd.revisar(archivos)
        comprobar(
            len(faltas) <= DESVIOS_CONOCIDOS,
            f"{len(archivos)} archivos revisados, {len(faltas)} infracciones "
            f"(tope conocido: {DESVIOS_CONOCIDOS})",
        )
        if faltas:
            print("  Deuda conocida de la librería:")
            for falta in faltas:
                print("   · " + falta.como_texto())

    print("\n" + ("=== FIN OK ===" if not fallos else "=== FALLOS: %d ===" % len(fallos)))
    for fallo in fallos:
        print(" - " + fallo)
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
