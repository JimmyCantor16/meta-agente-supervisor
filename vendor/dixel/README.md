# DIXEL

Librería gráfica propia: componentes, efectos, animación, scroll y shaders — sin dependencias.

- Autor: Jonathan Contreras (lDikay)
- Motor de animación propio (`Motion`), smooth scroll propio (`SmoothScroll`), reloj único (`Ticker`), visibilidad compartida (`Viewport`), puntero global (`Pointer`).
- Componentes por categoría en `components/`, efectos en `effects/`, shaders WebGL en `shaders/`, scrollbars en `scrollbars/`.
- Reglas de construcción en `CONTRACT.md`.

## Uso

```html
<link rel="stylesheet" href="dixel/dist/dixel.css" />
<script src="dixel/dist/dixel.js"></script>
<script>
  Dixel.init();
  Dixel.create('Button', { label: 'Hola', variant: 'solid' }).mount(document.body);
</script>
```

Declarativo:

```html
<div data-dx="TiltCard" data-dx-options='{"strength":12}'>…</div>
```

## Build

```
node build.mjs
```

Genera `dist/dixel.js` y `dist/dixel.css`.
