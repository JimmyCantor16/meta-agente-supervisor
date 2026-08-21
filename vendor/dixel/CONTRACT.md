# DIXEL — Contrato de construcción

Librería gráfica propia, cero dependencias externas. Autor: Jonathan Contreras (lDikay).

## Arquitectura

Cada archivo JS registra una clase con `Dixel.define(nombre, dependencias, factory)`:

```js
Dixel.define('MagneticButton', ['Button', 'Pointer', 'Utils'], function (Button, Pointer, Utils) {
  'use strict';
  class MagneticButton extends Button {
    static defaults = Object.assign({}, Button.defaults, { strength: 0.35 });
    ready() {
      super.ready();
      /* ... */
    }
  }
  return MagneticButton;
});
```

- El orden de archivos NO importa: `Dixel.init()` resuelve dependencias al final.
- Singletons disponibles como dependencia: `Utils`, `Ticker`, `Viewport`, `Pointer`, `ScrollWatch`.
- Clases disponibles: `Component` (base de todo), `Motion` (animación), `SmoothScroll`, `Button` (modelo de referencia).
- Todo componente hereda de `Component` o de otra clase que herede de ella.

## API de Component (leer core/Component.js)

- `build()` retorna el elemento raíz (para `mount(parent)`).
- `attach(el)` realza un elemento existente del DOM; `ready()` corre en ambos casos y debe funcionar en ambos.
- `this.listen(target, tipo, handler)` — listeners con limpieza automática.
- `this.onFrame(cb)` — suscribe al Ticker global. NUNCA crear requestAnimationFrame propios.
- `this.whenVisible(cb)` — visibilidad vía IntersectionObserver compartido. Toda animación continua DEBE pausarse cuando no es visible.
- `this.addCleanup(fn)` y `destroy()`.

## Reglas de código (obligatorias)

1. CERO comentarios en el código. Cero console.log. Nombres de variables y funciones autoexplicativos en inglés.
2. Sin dependencias externas, sin imports/exports ES: solo el patrón `Dixel.define`.
3. Un componente por archivo, PascalCase (`GlowButton.js`). Un solo CSS por categoría (`buttons.css`).
4. CSS con prefijo `dx-`, BEM simple (`dx-btn`, `dx-btn--ghost`, `dx-btn-label`). Usar SIEMPRE los tokens de `tokens/tokens.css` (colores, radios, sombras, easings, tipografía). Jamás valores de color hardcodeados salvo alfa/gradientes derivados de los tokens.
5. `static defaults` en cada clase; opciones via `this.options`.

## Reglas de performance (la ley)

1. Animar SOLO `transform` y `opacity`. Prohibido animar filter, box-shadow, width/height, top/left, letter-spacing, background-position. Sombras y glows estáticos.
2. Un solo reloj: `Ticker` (o `this.onFrame`). Prohibido `requestAnimationFrame` y `setInterval` propios para animación.
3. Todo canvas/bucle continuo se pausa fuera del viewport (`whenVisible`).
4. Cero lecturas de layout (getBoundingClientRect/clientWidth) dentro de frames: medir en ready/resize y cachear. `Utils.fitCanvas` para canvas.
5. DPR limitado a 2 (`Utils.dpr`). Canvas: repintar solo si algo cambió.
6. Respetar `Utils.reducedMotion`: los efectos saltan a su estado final.
7. Hover solo dentro de `@media (hover: hover)`. Touch: `Utils.isTouch`.
8. Los efectos de cursor/trail usan `Pointer` (con `Pointer.use()` para el suavizado compartido) — nunca listeners pointermove propios con trabajo pesado.

## Responsividad (obligatoria)

- Tipografía y espaciados con `clamp()` o tokens fluidos.
- Componentes fluidos por defecto (width 100% del contenedor o inline según naturaleza), sin anchos fijos en px salvo mínimos razonables.
- Verificar mentalmente 320px → 4K. Grids con `auto-fit/minmax`.

## Entregables por dominio

- Archivos JS + un CSS por categoría.
- `manifest.json` en la raíz de cada categoría: array de `{ "class": "GlowButton", "file": "GlowButton.js", "extends": "Button", "description": "…", "demo": { opciones de ejemplo } }`.
- Verificar cada JS con `node --check`.

## Seguridad de markup
- Toda opcion de TEXTO (label, title, message, hint, plan, feature...) pasa por Utils.escape antes de interpolarse en innerHTML. Nunca se interpola texto crudo.
- El atajo html: de Utils.el y las opciones-HTML declaradas (SplitView.panes, CompareSlider.before/after, Carousel.slides, data.html en chat) son la UNICA via para markup: solo aceptan markup del desarrollador, jamas datos de usuario final.
- Los iconos (icon:) son SVG interno del catalogo por convencion y viajan crudos.
