# DIXEL — tema adaptable (fork de Jamz)

Upstream: https://github.com/ldikay99/dixel (MIT, Jonathan Contreras · lDikay).
Este directorio es una copia vendorizada con los cambios de abajo. Si se
actualiza desde upstream, hay que rehacerlos (o mandarlos como PR).

## Qué se cambió y por qué

Antes, retintar la librería no era posible sin editarla: los colores de marca
estaban escritos a mano en 110 sitios del CSS (`rgba(109, 92, 255, 0.4)`,
`#2ee6d6`…) y en los `static defaults` de los shaders. Cambiar `--dx-primary`
dejaba media interfaz morada.

1. **Los tokens salen de canales RGB.** `tokens/tokens.css` define primero
   `--dx-primary-rgb: 109 92 255` y de ahí derivan `--dx-primary`,
   `--dx-primary-soft`, `--dx-primary-deep`, glows y gradientes. Todo literal de
   marca del CSS de categorías pasó a `rgb(var(--dx-…-rgb) / alfa)`.
2. **Tres temas**: `[data-dx-theme='light']`, el oscuro por defecto y
   `[data-dx-theme='auto']`, que sigue a `prefers-color-scheme`.
3. **API `Dixel.theme()`** para cambiar la paleta en caliente (abajo).
4. **`Utils.token/color/channels/onTheme`**: los componentes que pintan en canvas
   leen el color por token y se resuscriben a los cambios de tema, así un cambio
   de paleta también retinta shaders, partículas y estelas de cursor.
5. **Cero dependencias, de verdad**: `build.mjs` ya no busca `esbuild` en una
   ruta de otra máquina, y la librería no carga fuentes ni CSS de ningún CDN
   (las familias se nombran con fallback del sistema; se sustituyen con
   `Dixel.theme({ fonts: … })`).

## Uso

```js
Dixel.init({
  theme: { primary: '#027E6F', cyan: '#00E0AC', mode: 'light' }
});

Dixel.theme({ primary: '#027E6F' });          // en caliente, retinta todo
Dixel.theme({ mode: 'auto' });                 // sigue al sistema
Dixel.theme({ fonts: { sans: 'Inter, system-ui' } });
Dixel.theme({ tokens: { '--dx-radius-lg': '10px' } });
Dixel.theme();                                 // devuelve la paleta vigente
```

Claves de color admitidas (se guardan como canales, así que las derivadas
—soft, deep, glow, gradiente— salen solas): `bg`, `surface`, `surface-2`, `ink`,
`ink-soft`, `ink-dim`, `line`, `primary`, `cyan`, `magenta`, `success`,
`warning`, `danger`, `sheen`, `shadow`. Acepta `#rgb`, `#rrggbb` o `rgb(...)`.

En un componente propio, para un color que dependa del tema:

```js
const readColors = () => {
  this.color = Utils.token('primary', '#6d5cff');
};
readColors();
this.addCleanup(Utils.onTheme(readColors));
```

Y en opciones que reciben color, `Utils.color(valor, 'primary')` acepta tanto un
literal (`'#ff0000'`) como el nombre de un token (`'primary'`), que es lo que
usan ahora los shaders por defecto.

## Build

```
node build.mjs                                   # dist completo
node build.mjs --only=components/inputs,components/feedback --out=dist/perfil-form
```

El perfil sirve para las apps generadas: el dist completo son ~166 kB gzip de JS
y no todas las apps necesitan los 38 shaders. `--only` acepta cualquier carpeta
de categoría; el core y los tokens van siempre.

Si `esbuild` no está instalado, el build avisa y omite los `.min` en vez de
fallar. Para generarlos sin instalar nada en `vendor/`:

```
NODE_PATH=../../frontend/node_modules node build.mjs
```
