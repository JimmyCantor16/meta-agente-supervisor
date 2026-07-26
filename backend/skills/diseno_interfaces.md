# SKILL: Diseño de interfaces y Frontend (Doctrina Obligatoria 2026)

Estas reglas se inyectan al escribir CSS/JSX/HTML. No son sugerencias: son el estándar mínimo de todo lo que este sistema entrega. Nacieron de auditar con un navegador real decenas de interfaces generadas y arreglar sus fallos.

## 1. Tokens primero — OKLCH y Semántica
- TODO el color vive en variables CSS en `:root` usando el espacio de color `oklch()` para luminosidad uniforme: `--fondo`, `--superficie`, `--tinta`, `--tinta-suave`, `--acento`, `--acento-hover`, `--linea`, `--radio`, `--sombra`. Los componentes SOLO usan variables, jamás hex/rgb directos en componentes.
- Soporte nativo para tema claro y oscuro mapeado a través de variables en `:root` y `@media (prefers-color-scheme: dark)` o atributo `data-theme`.
- Sin paleta elegida por el usuario: fondo claro cálido (oklch(98% 0.01 80)), tinta oscura (oklch(20% 0.02 260)), UN acento saturado.
- Un solo acento protagonista. Modifica estados usando `color-mix(in oklch, var(--acento) 85%, black/white)`.

## 2. Contraste y Tipografía Avanzada
- Texto sobre fondo: mínimo AA (4.5:1). PROHIBIDO texto blanco sobre fondos claros y texto claro sobre imagen sin capa oscura (`rgba(0,0,0,.55)`).
- Tipografía pulida: Usar obligatorio `text-wrap: balance` en títulos (h1-h3) y `text-wrap: pretty` en párrafos para evitar líneas huérfanas al final.
- Gradientes: Si un fondo es degradado o imagen, el texto encima lleva SIEMPRE color sólido comprobado, nunca `background-clip: text` con el mismo degradado.
- Placeholders más claros que el texto, pero legibles (contraste mínimo 3:1).

## 3. Espaciado y Propiedades Lógicas Modernas
- Escala de 8: espacios en rem correspondientes a 8/16/24/32/48/64 px.
- Usar PROPIEDADES LÓGICAS CSS siempre que sea posible: `padding-inline`, `padding-block`, `margin-block`, `inline-size` en lugar de left/right/top/bottom.
- Contenido SIEMPRE en contenedor centrado: `max-width: 1200px; margin-inline: auto; padding-inline: 1.5rem`. NADA pegado al borde.
- Tarjetas y contenedores con `padding-block` y `padding-inline` generosos (1.25rem - 2rem).

## 4. Tipografía y Reset Base
- Escala restringida: 1 título de página (`clamp(2rem, 5vw, 3.2rem)`), títulos de sección (`clamp(1.5rem, 3vw, 2.2rem)`), cuerpo (1rem/1.6), notas (.875rem). Máximo 4 tamaños en todo el sistema.
- `font-family` del sistema o UNA de Google Fonts + fallback. Titulares con `letter-spacing: -0.025em`.
- Líneas de texto corrido: máximo ~65-75 caracteres (`max-width: 65ch`).
- Reset tipográfico global: `-webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;`.

## 5. Componentes — Anatomía, :has() y Estados
- BOTONES: Primario (fondo acento, texto contrastante, `border-radius: 12px`, `padding: .75rem 1.5rem`, hover con `transform: translateY(-1px)`, active con `transform: scale(0.98)`). Secundario (borde 1.5px, fondo transparente).
- TARJETAS: Superficie `--superficie`, borde 1px `--linea`, radio 16px, sombra suave en Y (`0 10px 25px -10px rgba(0,0,0,.1)`), hover suave que eleva 2-4px. Usar `@container` (Container Queries) para layout interno flexible.
- FORMULARIOS: Label SIEMPRE visible encima del input; inputs con borde 1.5px, `:focus-visible` con borde acento + anillo (`box-shadow: 0 0 0 3px color-mix(in oklch, var(--acento) 25%, transparent)`).
- Aprovechar `:has()` para estados condicionales sin JS (e.g., estilizar tarjetas según un checkbox checked).
- Estilar `input:-webkit-autofill` para que coincida con la paleta.
- NAV: Sticky con `backdrop-filter: blur(12px)`, borde inferior sutil; links con hover de fondo suave, NUNCA texto pelado o azul subrayado.
- TABLAS: Cabecera diferenciada, filas con hover, contenedor con `overflow-x: auto`. Números alineados a la derecha con `font-variant-numeric: tabular-nums`.

## 6. Microinteracciones y Motion
- Transiciones explícitas en interactivos: `transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1)`.
- Respetar accesibilidad de movimiento: `@media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`.

## 7. Manejo Obligatorio de Estados
- VACÍO: Ilustración SVG / icono grande + frase amable + acción primaria ("Aún no hay datos. ¡Crea el primero!").
- CARGANDO: Skeletons animados (`background: linear-gradient(...)`) que imitan la estructura real; botones muestran spinner + texto en gerundio ("Guardando...").
- ERROR: Explicación amigable + botón de reintento. Sin stack traces.
- ÉXITO: Feedback visual inmediato (toast, badge o cambio de estado).

## 8. Landing / Hero
- Hero: Fondo con gradiente de tokens, titular orientado a valor/beneficio, subtítulo claro y UN CTA primario.
- Secciones alternando fondos (`--fondo` / `--superficie`), títulos claros y contenido simulado REAL (cero `lorem ipsum`).

## 9. Responsive Moderno (Mobile-First)
- Layouts con `grid` + `repeat(auto-fit, minmax(280px, 1fr))` o Flexbox flexible.
- Tipografía fluida con `clamp()`. Imágenes siempre con `max-width: 100%; height: auto; display: block;`.
- Cero scroll horizontal no deseado (`overflow-x: clip` en el body/wrapper si es necesario).

## 10. Antipatrones de IA (PROHIBIDOS)
- Links azules/morados estándar de navegador.
- `<title>` genérico o imágenes/iconos rotos (usar SVGs en línea o emojis si no hay assets).
- Viñetas de `<ul>` en menús/footers (`list-style: none`).
- Animaciones JS que dejan el contenido invisible si el script o la hidratación fallan (visibilidad HTML por defecto siempre).
