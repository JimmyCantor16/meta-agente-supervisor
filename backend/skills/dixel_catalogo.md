# SKILL: DIXEL, la librería gráfica que ya viaja dentro de la app

Toda app generada por este sistema lleva DIXEL en `frontend/vendor/dixel.js` +
`frontend/vendor/dixel.css`, ya enlazados en el `<head>` y encendidos con la
paleta del proyecto. **No hay que instalar, importar ni descargar nada**: es un
global, `window.Dixel`, sin dependencias y sin build.

## Cómo se usa

Declarativo, sobre un elemento que ya existe:

```html
<div data-dx="Skeleton" data-dx-options='{"variant":"card","lines":3}'></div>
```

O por código, cuando hace falta guardar la instancia:

```js
const toasts = Dixel.create("Toast", { position: "bottom-right" }).mount(document.body);
toasts.push({ type: "success", message: "Guardado." });
```

Ya existe `window.avisar(texto, tipo)` en toda app generada (`tipo`: `success`,
`error`, `info`, `warning`). Para confirmar una acción, se llama a eso; no se
monta otro sistema de notificaciones.

## Reglas innegociables

1. **Solo nombres del catálogo de abajo.** `Dixel.create("SuperCard")` no falla
   al escribirlo: falla en pantalla, en silencio, y el hueco queda vacío. El
   verificador rechaza la entrega si aparece un componente que no existe.
2. **DIXEL no sustituye la funcionalidad**: un `Modal` que no guarda nada, o un
   `LineChart` sin datos reales de la API, es decoración — y la decoración está
   prohibida. Si un componente no lleva a algo que funciona, no se dibuja.
3. **La paleta ya está puesta.** No se escriben colores a mano encima de la
   librería: se cambia el tema con `Dixel.theme({ primary: "#…" })` o se usan
   sus tokens (`var(--dx-primary)`, `var(--dx-surface)`, `var(--dx-ink)`).
4. **No inventes opciones.** Si no estás seguro de una opción, monta el
   componente sin ella: cada clase trae valores por defecto razonables.
5. Estados de carga y vacío: `Skeleton`, `LoaderBar`, `EmptyState` existen y son
   la forma preferida de resolver lo que el sistema ya exige que esté resuelto.

## Catálogo entregado

Lo que viaja en la app es un perfil de la librería, no la librería entera. Estas
son las clases disponibles:

<!-- CATALOGO:INICIO -->

**Perfil `app`** (90 clases):

- **buttons**: Button, MagneticButton, GlowButton, RippleButton, BorderSweepButton, IconButton, PillToggle, FabButton, HoldButton
- **cards**: Card, TiltCard, SpotlightCard, GlassCard, GradientBorderCard, FlipCard, StackCard, PricingCard, ProfileCard
- **data**: StatCounter, Sparkline, ChartTooltip, LineChart, AreaChart, LiveChart, RadarChart, HeatmapGrid, DonutProgress, BulletChart, BarChart, RingChart, Meter, KpiTile, DataTable
- **feedback**: Toast, Modal, Tooltip, ProgressBar, ProgressRing, Skeleton, Badge, Chip, Alert, Spinner, LoaderOverlay, LoaderBar, LoaderDots, LoaderOrbit, LoaderPulse, EmptyState
- **inputs**: Field, TextField, PasswordField, SearchField, TextArea, SelectField, Checkbox, RadioGroup, Switch, RangeSlider, NumberStepper, PinInput, TagInput, FileDrop, RatingStars, CheckboxGroup
- **layout**: Accordion, Timeline, Steps, MasonryGrid, StickyStack, SplitView, SectionWave
- **typography**: SplitText, GradientText, TypeWriter, ScrambleText, CountUp, MarqueeText, HighlightText, OutlineFillText
- **scroll**: Reveal, ParallaxLayer, ScrollProgressBar, VelocityWarp, StickyReveal, SmoothAnchorNav
- **icons**: Icon, DrawIcon, IconSet, IconCategories

**Perfil `sitio`** (69 clases):

- **buttons**: Button, MagneticButton, GlowButton, RippleButton, BorderSweepButton, IconButton, PillToggle, FabButton, HoldButton
- **cards**: Card, TiltCard, SpotlightCard, GlassCard, GradientBorderCard, FlipCard, StackCard, PricingCard, ProfileCard
- **layout**: Accordion, Timeline, Steps, MasonryGrid, StickyStack, SplitView, SectionWave
- **media**: Carousel, CompareSlider, Lightbox, LogoMarquee, ImageReveal, ParallaxImage
- **typography**: SplitText, GradientText, TypeWriter, ScrambleText, CountUp, MarqueeText, HighlightText, OutlineFillText
- **background**: ParticleField, StarField, GradientMesh, NoiseGrain, WaveLines, GridPulse, AuroraVeil
- **hover**: Magnetic, Tilt, Spotlight, WarpHover, LiftHover, TextWave
- **micro**: Shimmer, PulseRing, Float, Attention, BorderBeam, Confetti, TickNumber
- **scroll**: Reveal, ParallaxLayer, ScrollProgressBar, VelocityWarp, StickyReveal, SmoothAnchorNav
- **icons**: Icon, DrawIcon, IconSet, IconCategories
<!-- CATALOGO:FIN -->

Si necesitas algo que no está en esa lista, escríbelo a mano con HTML y CSS
normal. Es preferible eso a citar un componente que no llegó.
