# SKILL: Diseño de interfaces (doctrina obligatoria)

Estas reglas se inyectan al escribir CSS/JSX/HTML. No son sugerencias: son el
estándar mínimo de todo lo que este sistema entrega. Nacieron de auditar con un
navegador real decenas de interfaces generadas y arreglar a mano sus fallos.

## 1. Tokens primero — nunca colores sueltos
- TODO el color vive en variables CSS en `:root`: `--fondo`, `--superficie`,
  `--tinta`, `--tinta-suave`, `--acento`, `--acento-2`, `--linea`, `--radio`,
  `--sombra`. Los componentes SOLO usan variables, jamás hex directos.
- Si el usuario eligió plantilla/paleta, sus colores SON los tokens. Sin
  paleta elegida: fondo claro cálido (#FAF8F5), tinta oscura (#1F2430), UN
  acento saturado y neutros con el matiz del acento (no gris puro #808080).
- Un solo acento protagonista. El segundo color solo para degradado del CTA.

## 2. Contraste — la regla que más se viola
- Texto sobre fondo: mínimo AA (4.5:1). PROHIBIDO texto blanco sobre fondos
  claros y texto claro sobre imagen sin capa oscura (`rgba(0,0,0,.45)`).
- Si un fondo es un degradado o imagen, el texto encima lleva SIEMPRE color
  sólido comprobado, nunca `background-clip: text` con el mismo degradado.
- Los placeholders más claros que el texto, pero legibles (no #eee).

## 3. Espaciado y ritmo
- Escala de 8: espacios de 8/16/24/32/48/64 px (en rem). Nada de 13px, 27px.
- Contenido SIEMPRE en contenedor centrado: `max-width: 1100-1200px;
  margin-inline: auto; padding-inline: 1.5rem`. NADA pegado al borde.
- Grupos con `display:flex/grid` + `gap`, no márgenes sueltos que colapsan.
- Aire generoso: una tarjeta respira con `padding: 1.25-1.75rem`.

## 4. Tipografía
- Escala: 1 título de página (clamp(1.8rem, 4vw, 2.5rem)), títulos de sección,
  cuerpo 1rem/1.6, notas .875rem. Nunca más de 4 tamaños.
- `font-family` del sistema o UNA de Google Fonts + fallback. Titulares con
  `letter-spacing: -0.02em` y `text-wrap: balance`.
- Líneas de texto corrido: máximo ~65-75 caracteres (`max-width: 65ch`).

## 5. Componentes — anatomía obligatoria
- BOTONES: primario (fondo acento, texto blanco, `border-radius: 12-14px`,
  `padding: .7rem 1.3rem`, hover con `translateY(-1px)` + sombra), secundario
  (borde 1.5px, fondo transparente). El disabled se ve disabled (opacity .55).
- TARJETAS: superficie clara, borde 1px `--linea`, radio 14-18px, sombra suave
  SOLO en Y (`0 12px 30px -14px rgba(0,0,0,.18)`), hover que eleva 2-4px.
- FORMULARIOS: label SIEMPRE visible encima del input; inputs con borde 1.5px,
  radio 12px, `:focus` con borde acento + anillo (`box-shadow: 0 0 0 3px
  color-mix(in srgb, var(--acento) 20%, transparent)`); errores en texto rojo
  bajo el campo, en lenguaje humano.
- NAV: sticky con `backdrop-filter: blur`, borde inferior sutil; los links con
  padding y hover con fondo, NUNCA texto pelado azul subrayado.
- TABLAS: cabecera diferenciada, filas con hover, contenedor con
  `overflow-x:auto`. Números alineados a la derecha con `tabular-nums`.

## 6. Estados — una pantalla sin estados está incompleta
- VACÍO: icono/emoji grande + frase amable + botón de acción ("Aún no tienes
  pedidos. ¡Haz el primero!"). Jamás una zona en blanco.
- CARGANDO: spinner o esqueleto; el botón que dispara muestra "Guardando…".
- ERROR: qué pasó y qué hacer, en cristiano. Nunca el stack trace al usuario.
- ÉXITO: confirmación visible (mensaje verde o cambio en pantalla).

## 7. Landing / Hero
- Hero de casi-pantalla: fondo con degradado de la paleta (NUNCA una imagen
  que no exista en el proyecto), titular que vende el beneficio, subtítulo y
  UN CTA primario que hace scroll suave (`scroll-behavior: smooth` + anclas).
- Debajo: secciones alternando fondo `--fondo`/`--superficie`, cada una con
  título + contenido real (nada de lorem).

## 8. Responsive — mobile primero
- Grids con `repeat(auto-fit, minmax(260px, 1fr))`; tipografía con `clamp()`;
  imágenes `max-width:100%`. Prohibido cualquier ancho fijo en px > 400.
- El menú en móvil colapsa o envuelve con `flex-wrap`; nada se desborda.
- Probar mentalmente en 390px: si algo se rompería ahí, está mal escrito.

## 9. Detalles que delatan una IA descuidada (evítalos todos)
- Links azul-morado por defecto → siempre estilizados con la paleta.
- `<title>` genérico, sin favicon → usa el logo.svg del proyecto.
- Imágenes rotas → si el asset no existe en el proyecto, usa degradado o emoji.
- Viñetas de `<ul>` visibles en menús/footers → `list-style:none`.
- Todo centrado con `<center>`-style → alinear a la izquierda el texto corrido.
- Animación reveal que oculta contenido si el JS falla → el contenido es
  visible por defecto; la animación solo AÑADE.

## 10. Accesibilidad mínima
- `:focus-visible` visible (anillo del acento), `aria-label` en botones de
  icono, `alt` real en imágenes, HTML semántico (nav/main/section/footer),
  `prefers-reduced-motion: reduce` desactiva animaciones.
