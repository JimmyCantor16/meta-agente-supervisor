window.DixelCatalog = {
  "icons": [
    {
      "class": "Icon",
      "file": "Icon.js",
      "extends": "Component",
      "description": "Sistema de iconos propio: 810 trazos SVG consistentes, tamaño y grosor configurables, hereda el color del texto.",
      "demo": {
        "name": "sparkles",
        "size": 28
      }
    },
    {
      "class": "DrawIcon",
      "file": "DrawIcon.js",
      "extends": "Icon",
      "description": "Icono que se dibuja trazo a trazo al entrar en pantalla y se redibuja al volver.",
      "demo": {
        "name": "rocket",
        "size": 40,
        "duration": 1.2
      }
    },
    {
      "class": "IconSet",
      "file": "IconSet.js",
      "extends": null,
      "description": "Registro de 810 trazos con variantes de notificaciones, mensajes, flechas, IA, redes, cursores, teclado, formas y un set tipo emoji de caras, gestos y símbolos.",
      "demo": null
    },
    {
      "class": "IconCategories",
      "file": "IconCategories.js",
      "extends": null,
      "description": "Mapa de los 810 iconos en 31 categorías en español: interfaz, flechas, archivos, media, comunicación, social, comercio, desarrollo, datosIA, seguridad, clima, transporte, lugares, salud, comida, educación, oficina, tiempo, cursores, formas, emociones, ventana, notificaciones, herramientas, electrodomésticos, música, animales, electrónica, hogar, personas y cocina. Valida en runtime que ningún icono quede sin categoría.",
      "demo": null
    }
  ],
  "components/board": [
    {
      "class": "KanbanBoard",
      "file": "KanbanBoard.js",
      "extends": "Component",
      "description": "Tablero kanban con arrastre real entre columnas: fantasma que sigue el cursor, hueco que se abre con transición, reordenamiento interno, soporte táctil con pulsación larga, teclado accesible y contadores por columna.",
      "demo": {
        "columns": [
          {
            "title": "Por hacer",
            "cards": [
              {
                "title": "Definir flujo de registro con verificación por correo",
                "tag": "Producto",
                "tone": "primary"
              },
              {
                "title": "Investigar pasarela de pagos para Latinoamérica",
                "tag": "Pagos",
                "tone": "warning"
              },
              {
                "title": "Preparar guía de marca para el equipo externo",
                "tag": "Diseño",
                "tone": "magenta"
              }
            ]
          },
          {
            "title": "En progreso",
            "cards": [
              {
                "title": "Migrar el panel de métricas a la nueva API",
                "tag": "Backend",
                "tone": "cyan"
              },
              {
                "title": "Rediseñar la pantalla de facturación",
                "tag": "Diseño",
                "tone": "magenta"
              }
            ]
          },
          {
            "title": "En revisión",
            "cards": [
              {
                "title": "Pruebas de carga del buscador global",
                "tag": "QA",
                "tone": "danger"
              }
            ]
          },
          {
            "title": "Hecho",
            "cards": [
              {
                "title": "Exportación de reportes en PDF",
                "tag": "Feature",
                "tone": "success"
              },
              {
                "title": "Modo oscuro en la app móvil",
                "tag": "Feature",
                "tone": "success"
              }
            ]
          }
        ]
      }
    }
  ],
  "components/builder": [
    {
      "class": "PageBuilder",
      "file": "PageBuilder.js",
      "extends": "Component",
      "description": "Constructor de templates con drag and drop completo: paleta lateral de piezas DIXEL agrupadas (bottom-sheet colapsable en móvil) que se arrastran en modo clone al lienzo, donde se instancia el componente real dentro de un bloque con asa para mover, duplicar y eliminar. Reordenamiento arrastrando o con teclado, serialize()/load() del layout como JSON, exportar al portapapeles, limpiar con confirmación, callback onChange y estado vacío elegante.",
      "demo": {
        "paletteTitle": "Piezas",
        "emptyTitle": "Arrastra tu primera pieza",
        "emptyHint": "Elige un bloque de la paleta y suéltalo en el lienzo."
      }
    }
  ],
  "components/buttons": [
    {
      "class": "Button",
      "file": "Button.js",
      "extends": "Component",
      "description": "Botón base con variantes solid, ghost y soft; modelo de referencia de la categoría.",
      "demo": {
        "label": "Get started",
        "variant": "solid",
        "size": "md"
      }
    },
    {
      "class": "MagneticButton",
      "file": "MagneticButton.js",
      "extends": "Button",
      "description": "Botón que se imanta al cursor con el Pointer compartido y regresa con física elástica.",
      "demo": {
        "label": "Hover me",
        "variant": "solid",
        "strength": 0.32,
        "liftScale": 1.04
      }
    },
    {
      "class": "GlowButton",
      "file": "GlowButton.js",
      "extends": "Button",
      "description": "Botón con halo estático y brillo interior que barre el botón con transform en hover.",
      "demo": {
        "label": "Launch",
        "variant": "solid",
        "tone": "cyan"
      }
    },
    {
      "class": "RippleButton",
      "file": "RippleButton.js",
      "extends": "Button",
      "description": "Botón con onda expansiva desde el punto exacto del click, animada con scale y opacity.",
      "demo": {
        "label": "Tap me",
        "variant": "solid",
        "rippleOpacity": 0.38
      }
    },
    {
      "class": "BorderSweepButton",
      "file": "BorderSweepButton.js",
      "extends": "Button",
      "description": "Botón con borde degradado que gira en bucle; la rotación se pausa fuera del viewport.",
      "demo": {
        "label": "Premium",
        "size": "md"
      }
    },
    {
      "class": "IconButton",
      "file": "IconButton.js",
      "extends": "Button",
      "description": "Botón compacto de solo ícono, circular o cuadrado, con aria-label accesible.",
      "demo": {
        "label": "Add item",
        "variant": "soft",
        "shape": "circle"
      }
    },
    {
      "class": "PillToggle",
      "file": "PillToggle.js",
      "extends": "Component",
      "description": "Control segmentado con indicador que se desliza entre opciones usando solo transform.",
      "demo": {
        "options": [
          "Day",
          "Week",
          "Month"
        ],
        "value": 0
      }
    },
    {
      "class": "FabButton",
      "file": "FabButton.js",
      "extends": "Component",
      "description": "Botón flotante que despliega un menú radial de acciones en una capa fija sobre toda la página, con stagger y física de rebote.",
      "demo": {
        "label": "Quick actions",
        "radius": 84,
        "items": [
          {
            "label": "Edit",
            "icon": "✎"
          },
          {
            "label": "Share",
            "icon": "↗"
          },
          {
            "label": "Delete",
            "icon": "✕"
          }
        ]
      }
    },
    {
      "class": "HoldButton",
      "file": "HoldButton.js",
      "extends": "Button",
      "description": "Botón de mantener presionado para confirmar, con progreso en anillo, relleno o barrido de borde (progressStyle: ring | fill | sweep) y pulso al completar.",
      "demo": {
        "label": "Hold to delete",
        "variant": "ghost",
        "holdDuration": 1.1,
        "progressStyle": "ring"
      }
    }
  ],
  "components/cards": [
    {
      "class": "Card",
      "file": "Card.js",
      "extends": "Component",
      "description": "Tarjeta base con superficies en degradado, padding fluido y elevación sutil al pasar el cursor.",
      "demo": {
        "title": "Profundidad real",
        "body": "Superficies que capturan la luz de la interfaz.",
        "footer": "DIXEL · 2026"
      }
    },
    {
      "class": "TiltCard",
      "file": "TiltCard.js",
      "extends": "Card",
      "description": "Tarjeta con inclinación 3D que sigue al cursor mediante Pointer y regresa suave al salir.",
      "demo": {
        "title": "Sigue tu mano",
        "body": "Física amortiguada en cada eje.",
        "maxTilt": 10,
        "lift": 1.03
      }
    },
    {
      "class": "SpotlightCard",
      "file": "SpotlightCard.js",
      "extends": "Card",
      "description": "Tarjeta con luz radial que persigue el cursor solo durante el hover, con suavizado compartido.",
      "demo": {
        "title": "Luz que responde",
        "body": "Un foco recorre la superficie.",
        "radius": 300,
        "tone": "cyan"
      }
    },
    {
      "class": "GlassCard",
      "file": "GlassCard.js",
      "extends": "Card",
      "description": "Tarjeta de vidrio esmerilado con borde luminoso en degradado y brillo interior estático.",
      "demo": {
        "title": "Cristal vivo",
        "body": "Transparencia con carácter."
      }
    },
    {
      "class": "GradientBorderCard",
      "file": "GradientBorderCard.js",
      "extends": "Card",
      "description": "Tarjeta con borde degradado cónico en rotación continua por transform, pausado fuera del viewport.",
      "demo": {
        "title": "Borde en órbita",
        "body": "Color girando sin costo de layout.",
        "speed": 6
      }
    },
    {
      "class": "FlipCard",
      "file": "FlipCard.js",
      "extends": "Card",
      "description": "Tarjeta que voltea 180 grados con preserve-3d al hacer click, hover o con el teclado.",
      "demo": {
        "front": "<h3>Anverso</h3><p>Haz click para girar.</p>",
        "back": "<h3>Reverso</h3><p>Aquí vive el detalle.</p>",
        "trigger": "click"
      }
    },
    {
      "class": "StackCard",
      "file": "StackCard.js",
      "extends": "Card",
      "description": "Pila de tarjetas con profundidad escalonada donde la superior se desliza y rota hacia el fondo.",
      "demo": {
        "items": [
          "<h3>Uno</h3><p>La primera capa.</p>",
          "<h3>Dos</h3><p>La segunda espera.</p>",
          "<h3>Tres</h3><p>El fondo respira.</p>"
        ],
        "offset": 16
      }
    },
    {
      "class": "PricingCard",
      "file": "PricingCard.js",
      "extends": "Card",
      "description": "Tarjeta de precios con lista de beneficios, CTA y variante destacada con halo de marca.",
      "demo": {
        "plan": "Pro",
        "price": "$29",
        "period": "/mes",
        "features": [
          "Proyectos ilimitados",
          "Soporte prioritario",
          "Analítica avanzada"
        ],
        "featured": true
      }
    },
    {
      "class": "ProfileCard",
      "file": "ProfileCard.js",
      "extends": "Card",
      "description": "Tarjeta de perfil con portada en degradado, avatar, estadísticas y acción principal.",
      "demo": {
        "name": "Ana Riveros",
        "role": "Product Designer",
        "initials": "AR",
        "stats": [
          {
            "value": "128",
            "label": "Shots"
          },
          {
            "value": "4.9",
            "label": "Rating"
          }
        ],
        "actionLabel": "Seguir"
      }
    }
  ],
  "components/chat": [
    {
      "class": "ChatThread",
      "file": "ChatThread.js",
      "extends": "Component",
      "description": "Hilo de conversación con burbujas propias y ajenas, avatares con iniciales, agrupación de mensajes consecutivos, estados de lectura, entrada animada y auto-scroll inteligente.",
      "demo": {
        "label": "Conversación con soporte",
        "messages": [
          {
            "author": "Valentina Ríos",
            "text": "¡Hola! Vi que activaste el plan Pro, ¿te ayudo con la migración?",
            "time": "09:14"
          },
          {
            "author": "Valentina Ríos",
            "text": "El proceso tarda unos 10 minutos y no pierdes ningún dato.",
            "time": "09:14"
          },
          {
            "author": "Tú",
            "own": true,
            "text": "Hola Valentina, sí por favor. ¿Puedo seguir trabajando mientras tanto?",
            "time": "09:16",
            "status": "read"
          },
          {
            "author": "Valentina Ríos",
            "text": "Claro, la migración corre en segundo plano. Te aviso apenas termine.",
            "time": "09:17"
          },
          {
            "author": "Tú",
            "own": true,
            "text": "Perfecto, gracias 🙌",
            "time": "09:18",
            "status": "sent"
          }
        ]
      }
    },
    {
      "class": "TypingDots",
      "file": "TypingDots.js",
      "extends": "Component",
      "description": "Indicador de escritura con tres puntos ondulantes animados solo por transform, pausado fuera del viewport.",
      "demo": {
        "author": "Valentina Ríos"
      }
    },
    {
      "class": "ChatInput",
      "file": "ChatInput.js",
      "extends": "Component",
      "description": "Barra de entrada de mensajes con textarea que crece automáticamente, envío con Enter y botón con estado activo animado.",
      "demo": {
        "placeholder": "Escribe una respuesta…",
        "sendLabel": "Enviar mensaje"
      }
    }
  ],
  "components/data": [
    {
      "class": "StatCounter",
      "file": "StatCounter.js",
      "extends": "Component",
      "description": "Número que cuenta hasta su valor al entrar en pantalla, con separador de miles.",
      "demo": {
        "value": 128450,
        "label": "Usuarios activos",
        "suffix": "+",
        "duration": 1.8
      }
    },
    {
      "class": "Sparkline",
      "file": "Sparkline.js",
      "extends": "Component",
      "description": "Mini gráfico de línea en canvas que se dibuja al entrar, con gradiente de relleno; lineWidth ajustable y pointMarkers para marcar cada dato.",
      "demo": {
        "data": [
          4,
          9,
          6,
          12,
          10,
          16,
          13,
          21,
          18,
          26
        ],
        "color": "cyan",
        "pointMarkers": false
      }
    },
    {
      "class": "ChartTooltip",
      "file": "ChartTooltip.js",
      "extends": null,
      "description": "Tooltip compartido de todos los charts: portal al body con título, filas por serie con swatch y valor formateado.",
      "demo": null
    },
    {
      "class": "LineChart",
      "file": "LineChart.js",
      "extends": "Component",
      "description": "Líneas multi-serie con curvas suaves, glow, tooltip con crosshair, extremos marcados, formatos y leyenda clicable. Personalizable: showGrid (bool), gridColor (token, ej. line), labelRotation (grados para fechas largas), pointMarkers (bool, punto en cada dato), lineWidth global o por serie (serie.lineWidth), format (compact/number/currency/percent), currency y locale.",
      "demo": {
        "labels": [
          "12 ene",
          "12 feb",
          "12 mar",
          "12 abr",
          "12 may",
          "12 jun",
          "12 jul"
        ],
        "series": [
          {
            "label": "Ventas",
            "data": [
              12,
              19,
              14,
              26,
              22,
              34,
              29
            ]
          },
          {
            "label": "Costos",
            "data": [
              8,
              11,
              10,
              14,
              13,
              18,
              15
            ],
            "color": "magenta"
          }
        ],
        "markExtremes": true,
        "format": "compact",
        "labelRotation": 0,
        "pointMarkers": true,
        "showGrid": true
      }
    },
    {
      "class": "AreaChart",
      "file": "AreaChart.js",
      "extends": "LineChart",
      "description": "Áreas multi-serie apilables con degradados superpuestos y tooltip con totales. Hereda la personalización de LineChart: showGrid, gridColor, labelRotation, pointMarkers, lineWidth por serie, format, currency y locale.",
      "demo": {
        "labels": [
          "Lun",
          "Mar",
          "Mié",
          "Jue",
          "Vie",
          "Sáb",
          "Dom"
        ],
        "series": [
          {
            "label": "Orgánico",
            "data": [
              14,
              18,
              16,
              22,
              26,
              31,
              28
            ]
          },
          {
            "label": "Pago",
            "data": [
              8,
              9,
              11,
              10,
              14,
              16,
              13
            ],
            "color": "cyan"
          },
          {
            "label": "Referidos",
            "data": [
              4,
              5,
              4,
              7,
              6,
              9,
              8
            ],
            "color": "magenta"
          }
        ],
        "stacked": true
      }
    },
    {
      "class": "LiveChart",
      "file": "LiveChart.js",
      "extends": "Component",
      "description": "Línea en streaming con push(valor), ventana deslizante, glow y punto final latiendo — se autoalimenta en demo solo mientras es visible.",
      "demo": {
        "label": "Latencia p95 · ms",
        "demo": true,
        "min": 0,
        "max": 100,
        "color": "cyan"
      }
    },
    {
      "class": "RadarChart",
      "file": "RadarChart.js",
      "extends": "Component",
      "description": "Polígono multi-eje con relleno translúcido, vértices animados al entrar y tooltip por eje.",
      "demo": {
        "axes": [
          "Velocidad",
          "Diseño",
          "Código",
          "Motion",
          "Accesibilidad",
          "SEO"
        ],
        "series": [
          {
            "label": "DIXEL",
            "data": [
              92,
              88,
              90,
              96,
              84,
              80
            ]
          },
          {
            "label": "Promedio",
            "data": [
              60,
              55,
              62,
              40,
              58,
              66
            ],
            "color": "magenta"
          }
        ]
      }
    },
    {
      "class": "HeatmapGrid",
      "file": "HeatmapGrid.js",
      "extends": "Component",
      "description": "Calendario de intensidad estilo GitHub con escala de marca, tooltip por celda (fecha y valor) y entrada escalonada.",
      "demo": {
        "weeks": 26,
        "unit": "commits"
      }
    },
    {
      "class": "DonutProgress",
      "file": "DonutProgress.js",
      "extends": "Component",
      "description": "Anillo multi-segmento con barrido animado, hover que engrosa el segmento, valor central contando y porcentajes en leyenda.",
      "demo": {
        "segments": [
          {
            "label": "Diseño",
            "value": 34
          },
          {
            "label": "Desarrollo",
            "value": 46
          },
          {
            "label": "QA",
            "value": 12
          },
          {
            "label": "Gestión",
            "value": 8
          }
        ],
        "centerLabel": "Horas"
      }
    },
    {
      "class": "BulletChart",
      "file": "BulletChart.js",
      "extends": "Component",
      "description": "Barra de rendimiento contra objetivo con rangos de fondo y marcador de meta — compacta para filas de dashboard.",
      "demo": {
        "label": "Ventas Q3",
        "value": 78,
        "target": 85,
        "max": 100,
        "format": "percent"
      }
    },
    {
      "class": "BarChart",
      "file": "BarChart.js",
      "extends": "Component",
      "description": "Barras que suben escalonadas con transform al entrar en pantalla. Valores con format (number/compact/currency/percent), currency y locale como LineChart.",
      "demo": {
        "data": [
          {
            "label": "Lun",
            "value": 42
          },
          {
            "label": "Mar",
            "value": 61
          },
          {
            "label": "Mié",
            "value": 38
          },
          {
            "label": "Jue",
            "value": 74
          },
          {
            "label": "Vie",
            "value": 55
          }
        ],
        "format": "number",
        "locale": "es-CO"
      }
    },
    {
      "class": "RingChart",
      "file": "RingChart.js",
      "extends": "Component",
      "description": "Donut SVG cuyos segmentos barren al entrar, con leyenda de porcentajes.",
      "demo": {
        "data": [
          {
            "label": "Web",
            "value": 46
          },
          {
            "label": "Móvil",
            "value": 32
          },
          {
            "label": "API",
            "value": 22
          }
        ],
        "centerValue": "100%",
        "centerLabel": "Tráfico"
      }
    },
    {
      "class": "Meter",
      "file": "Meter.js",
      "extends": "Component",
      "description": "Gauge semicircular que se llena hasta su valor con número animado.",
      "demo": {
        "value": 78,
        "max": 100,
        "suffix": "%",
        "label": "Capacidad"
      }
    },
    {
      "class": "KpiTile",
      "file": "KpiTile.js",
      "extends": "Component",
      "description": "Tarjeta KPI con contador, delta con flecha y sparkline integrados.",
      "demo": {
        "label": "Ingresos",
        "value": 84300,
        "prefix": "$",
        "delta": 12.4,
        "data": [
          30,
          42,
          38,
          55,
          49,
          68,
          61,
          84
        ],
        "color": "success"
      }
    },
    {
      "class": "DataTable",
      "file": "DataTable.js",
      "extends": "Component",
      "description": "Tabla con encabezado sticky, orden por columna y filas que entran escalonadas — con columnLines para divisiones verticales de columna.",
      "demo": {
        "columns": [
          {
            "key": "name",
            "label": "Proyecto"
          },
          {
            "key": "owner",
            "label": "Responsable"
          },
          {
            "key": "progress",
            "label": "Avance",
            "align": "right"
          }
        ],
        "rows": [
          {
            "name": "Atlas",
            "owner": "Sofía",
            "progress": 82
          },
          {
            "name": "Nébula",
            "owner": "Marco",
            "progress": 47
          },
          {
            "name": "Orbe",
            "owner": "Lina",
            "progress": 91
          }
        ],
        "height": "320px",
        "columnLines": true
      }
    }
  ],
  "components/feedback": [
    {
      "class": "Toast",
      "file": "Toast.js",
      "extends": "Component",
      "description": "Cola de notificaciones apiladas que entran con spring, con barra de vida y pausa al pasar el cursor.",
      "demo": {
        "position": "bottom-right",
        "duration": 4.5,
        "max": 5
      }
    },
    {
      "class": "Modal",
      "file": "Modal.js",
      "extends": "Component",
      "description": "Diálogo modal con escala y fade sobre overlay difuminado, focus trap y cierre con Escape.",
      "demo": {
        "title": "Confirmar acción",
        "content": "<p>¿Deseas continuar?</p>",
        "dismissible": true
      }
    },
    {
      "class": "Tooltip",
      "file": "Tooltip.js",
      "extends": "Component",
      "description": "Globo de ayuda con posicionamiento inteligente que voltea según el espacio, flecha y retardo.",
      "demo": {
        "text": "Copiar al portapapeles",
        "placement": "top",
        "delay": 350
      }
    },
    {
      "class": "ProgressBar",
      "file": "ProgressBar.js",
      "extends": "Component",
      "description": "Barra de progreso con relleno degradado animado solo por transform scaleX y modo indeterminado.",
      "demo": {
        "value": 64,
        "label": "Subiendo archivos",
        "showValue": true
      }
    },
    {
      "class": "ProgressRing",
      "file": "ProgressRing.js",
      "extends": "Component",
      "description": "Anillo de progreso SVG con stroke degradado, dashoffset transicionado y porcentaje central.",
      "demo": {
        "value": 72,
        "size": 110,
        "stroke": 9
      }
    },
    {
      "class": "Skeleton",
      "file": "Skeleton.js",
      "extends": "Component",
      "description": "Placeholder de carga con shimmer movido por transform, pausado fuera del viewport. Brillo de carga configurable: sheenAngle (grados), sheenSpeed (segundos) y sheenColor.",
      "demo": {
        "variant": "card",
        "lines": 3,
        "height": 140,
        "sheenAngle": 115,
        "sheenSpeed": 1.3
      }
    },
    {
      "class": "Badge",
      "file": "Badge.js",
      "extends": "Component",
      "description": "Etiqueta compacta de estado con tonos de marca, variantes soft, solid y outline, y punto opcional.",
      "demo": {
        "label": "Nuevo",
        "tone": "cyan",
        "dot": true
      }
    },
    {
      "class": "Chip",
      "file": "Chip.js",
      "extends": "Component",
      "description": "Ficha removible con icono opcional y animación de salida por escala y fade.",
      "demo": {
        "label": "Motion",
        "tone": "primary",
        "removable": true
      }
    },
    {
      "class": "Alert",
      "file": "Alert.js",
      "extends": "Component",
      "description": "Aviso en línea que entra deslizando, con icono según severidad y cierre animado opcional.",
      "demo": {
        "type": "success",
        "title": "Guardado",
        "message": "Los cambios se aplicaron.",
        "dismissible": true
      }
    },
    {
      "class": "Spinner",
      "file": "Spinner.js",
      "extends": "Component",
      "description": "Indicador de carga en tres variantes ring, dots y pulse, pausado fuera del viewport.",
      "demo": {
        "variant": "dots",
        "size": "md"
      }
    },
    {
      "class": "LoaderOverlay",
      "file": "LoaderOverlay.js",
      "extends": "Component",
      "description": "Velo de carga que cubre su contenedor (o la pantalla con fullscreen) con spinner y etiqueta, controlado con show() y hide().",
      "demo": {
        "label": "Cargando datos",
        "fullscreen": false,
        "open": true
      }
    },
    {
      "class": "LoaderBar",
      "file": "LoaderBar.js",
      "extends": "Component",
      "description": "Barra superior indeterminada tipo YouTube que corre con start() y se completa y desvanece con done().",
      "demo": {
        "fixed": false,
        "color": "primary"
      }
    },
    {
      "class": "LoaderDots",
      "file": "LoaderDots.js",
      "extends": "Component",
      "description": "Onda de puntos que sube y baja en cascada, pausada fuera del viewport.",
      "demo": {
        "count": 5,
        "color": "cyan"
      }
    },
    {
      "class": "LoaderOrbit",
      "file": "LoaderOrbit.js",
      "extends": "Component",
      "description": "Satélites orbitando un núcleo en tres anillos a velocidades y sentidos distintos.",
      "demo": {
        "size": "md",
        "color": "primary"
      }
    },
    {
      "class": "LoaderPulse",
      "file": "LoaderPulse.js",
      "extends": "Component",
      "description": "Anillos concéntricos que emanan del centro en pulsos escalonados.",
      "demo": {
        "size": "md",
        "color": "magenta"
      }
    },
    {
      "class": "EmptyState",
      "file": "EmptyState.js",
      "extends": "Component",
      "description": "Estado vacío con icono, mensaje y acción, revelado con stagger al entrar en pantalla.",
      "demo": {
        "title": "Sin proyectos aún",
        "description": "Crea tu primer proyecto para empezar.",
        "actionLabel": "Crear proyecto"
      }
    }
  ],
  "components/flow": [
    {
      "class": "FlowGraph",
      "file": "FlowGraph.js",
      "extends": "Component",
      "description": "Editor de grafos con nodos arrastrables y cables conectables de puerto a puerto: estilos straight/step/bezier/wavy, flujo animado por el cable, pan y zoom, doble click desconecta, y modelo funcional con serialize/load/onConnect/validación por tipos.",
      "demo": {
        "wireStyle": "bezier",
        "flow": true,
        "nodes": [
          {
            "id": "src",
            "title": "Fuente",
            "icon": "database",
            "x": 20,
            "y": 40,
            "outputs": [
              "datos"
            ]
          },
          {
            "id": "ai",
            "title": "Modelo IA",
            "icon": "brain",
            "x": 280,
            "y": 10,
            "inputs": [
              "entrada"
            ],
            "outputs": [
              "predicción",
              "alertas"
            ]
          },
          {
            "id": "chart",
            "title": "Dashboard",
            "icon": "chartLine",
            "x": 560,
            "y": 30,
            "inputs": [
              "serie"
            ]
          },
          {
            "id": "notify",
            "title": "Notificar",
            "icon": "bellRing",
            "x": 560,
            "y": 150,
            "inputs": [
              "evento"
            ]
          }
        ],
        "edges": [
          {
            "from": {
              "node": "src",
              "port": 0
            },
            "to": {
              "node": "ai",
              "port": 0
            }
          },
          {
            "from": {
              "node": "ai",
              "port": 0
            },
            "to": {
              "node": "chart",
              "port": 0
            }
          },
          {
            "from": {
              "node": "ai",
              "port": 1
            },
            "to": {
              "node": "notify",
              "port": 0
            }
          }
        ]
      }
    }
  ],
  "components/inputs": [
    {
      "class": "Field",
      "file": "Field.js",
      "extends": "Component",
      "description": "Base de los campos: label flotante, anillo de foco cian, mensajes y estados success/error.",
      "demo": {
        "label": "Field",
        "helper": "Base class"
      }
    },
    {
      "class": "TextField",
      "file": "TextField.js",
      "extends": "Field",
      "description": "Campo de texto con label flotante animado y validación visual integrada.",
      "demo": {
        "label": "Full name",
        "helper": "As it appears on your ID",
        "type": "text"
      }
    },
    {
      "class": "PasswordField",
      "file": "PasswordField.js",
      "extends": "TextField",
      "description": "Campo de contraseña con ojo mostrar/ocultar y medidor de fuerza animado por transform.",
      "demo": {
        "label": "Password",
        "meter": true
      }
    },
    {
      "class": "SearchField",
      "file": "SearchField.js",
      "extends": "TextField",
      "description": "Buscador con ícono, botón de limpiar y atajo de teclado visible estilo kbd.",
      "demo": {
        "label": "Search docs",
        "shortcut": "/"
      }
    },
    {
      "class": "TextArea",
      "file": "TextArea.js",
      "extends": "Field",
      "description": "Área de texto que crece automáticamente con el contenido hasta maxRows y luego scrollea, con label flotante y modo sin ajuste de línea (wrap: false).",
      "demo": {
        "label": "Message",
        "rows": 3,
        "maxRows": 6,
        "wrap": true
      }
    },
    {
      "class": "SelectField",
      "file": "SelectField.js",
      "extends": "Field",
      "description": "Dropdown custom animado con navegación completa por teclado y roles ARIA de listbox.",
      "demo": {
        "label": "Country",
        "items": [
          "Colombia",
          "México",
          "Argentina",
          "Chile"
        ]
      }
    },
    {
      "class": "Checkbox",
      "file": "Checkbox.js",
      "extends": "Component",
      "description": "Checkbox con check dibujado por stroke-dashoffset y pop elástico al marcar.",
      "demo": {
        "label": "Accept terms",
        "checked": false
      }
    },
    {
      "class": "RadioGroup",
      "file": "RadioGroup.js",
      "extends": "Component",
      "description": "Grupo de radios con punto interior que entra con rebote y teclado nativo.",
      "demo": {
        "label": "Plan",
        "items": [
          "Free",
          "Pro",
          "Team"
        ],
        "value": "Pro",
        "inline": true
      }
    },
    {
      "class": "Switch",
      "file": "Switch.js",
      "extends": "Component",
      "description": "Interruptor con física de resorte elástico al soltar y estiramiento al presionar.",
      "demo": {
        "label": "Notifications",
        "checked": true
      }
    },
    {
      "class": "RangeSlider",
      "file": "RangeSlider.js",
      "extends": "Component",
      "description": "Slider con relleno degradado por scaleX y tooltip de valor que sigue al thumb.",
      "demo": {
        "label": "Volume",
        "min": 0,
        "max": 100,
        "value": 65,
        "unit": "%"
      }
    },
    {
      "class": "NumberStepper",
      "file": "NumberStepper.js",
      "extends": "Component",
      "description": "Selector numérico con botones más/menos y valor que entra deslizándose según la dirección.",
      "demo": {
        "label": "Quantity",
        "value": 1,
        "min": 0,
        "max": 99,
        "step": 1
      }
    },
    {
      "class": "PinInput",
      "file": "PinInput.js",
      "extends": "Component",
      "description": "Código PIN con celdas que saltan al llenarse, pegado inteligente y onda al completar.",
      "demo": {
        "label": "Verification code",
        "length": 4,
        "numeric": true
      }
    },
    {
      "class": "TagInput",
      "file": "TagInput.js",
      "extends": "Component",
      "description": "Entrada de etiquetas con chips que entran con scale elástico y se quitan con fade.",
      "demo": {
        "label": "Skills",
        "tags": [
          "design",
          "motion"
        ]
      }
    },
    {
      "class": "FileDrop",
      "file": "FileDrop.js",
      "extends": "Component",
      "description": "Zona de arrastre de archivos que respira durante el dragover y lista lo soltado.",
      "demo": {
        "label": "Drop files here",
        "hint": "or click to browse",
        "multiple": true
      }
    },
    {
      "class": "RatingStars",
      "file": "RatingStars.js",
      "extends": "Component",
      "description": "Calificación por estrellas con vista previa al pasar el cursor y cascada elástica al elegir.",
      "demo": {
        "label": "Rating",
        "count": 5,
        "value": 4
      }
    },
    {
      "class": "CheckboxGroup",
      "file": "CheckboxGroup.js",
      "extends": "Component",
      "description": "Grupo de checkboxes de selección múltiple con values[], onChange con la lista seleccionada, modo inline y setValues().",
      "demo": {
        "label": "Intereses",
        "items": [
          "Diseño",
          "Motion",
          "Código",
          "3D"
        ],
        "values": [
          "Motion",
          "3D"
        ],
        "inline": true
      }
    }
  ],
  "components/layout": [
    {
      "class": "Accordion",
      "file": "Accordion.js",
      "extends": "Component",
      "description": "Paneles plegables con altura animada vía grid-template-rows y flecha rotante.",
      "demo": {
        "items": [
          {
            "title": "¿Qué es DIXEL?",
            "content": "Una librería gráfica vanilla con UX cinematográfico.",
            "open": true
          },
          {
            "title": "¿Tiene dependencias?",
            "content": "Cero. Todo corre sobre el núcleo propio."
          },
          {
            "title": "¿Es responsiva?",
            "content": "De 320px a 4K con tokens fluidos."
          }
        ]
      }
    },
    {
      "class": "Timeline",
      "file": "Timeline.js",
      "extends": "Component",
      "description": "Línea vertical que se dibuja con el scroll y nodos que se encienden al pasar.",
      "demo": {
        "items": [
          {
            "date": "2024",
            "title": "Idea",
            "text": "Nace el concepto de la librería."
          },
          {
            "date": "2025",
            "title": "Núcleo",
            "text": "Ticker, Viewport y ScrollWatch compartidos."
          },
          {
            "date": "2026",
            "title": "Lanzamiento",
            "text": "Componentes de datos, texto y media."
          }
        ]
      }
    },
    {
      "class": "Steps",
      "file": "Steps.js",
      "extends": "Component",
      "description": "Indicador de pasos con conectores que se llenan y estados hecho/activo. Opción colors: un color por paso (token o hex) que pinta punto, número y conector.",
      "demo": {
        "steps": [
          "Cuenta",
          "Perfil",
          "Pago",
          "Listo"
        ],
        "current": 2,
        "colors": [
          "primary",
          "cyan",
          "magenta",
          "success"
        ]
      }
    },
    {
      "class": "MasonryGrid",
      "file": "MasonryGrid.js",
      "extends": "Component",
      "description": "Grilla tipo masonry de columnas responsivas con entrada escalonada; items declarables por opciones.",
      "demo": {
        "minWidth": 150,
        "stagger": 0.06,
        "items": [
          "<h4>Rápido</h4><p>Pieza 1 del muro.</p>",
          "<h4>Fluido</h4><p>Pieza 2 del muro, con algo más de texto para variar la altura.</p>",
          "<h4>Modular</h4><p>Pieza 3 del muro.</p>",
          "<h4>Vivo</h4><p>Pieza 4 del muro, columnas que se reparten solas.</p>",
          "<h4>Nítido</h4><p>Pieza 5 del muro.</p>"
        ]
      }
    },
    {
      "class": "StickyStack",
      "file": "StickyStack.js",
      "extends": "Component",
      "description": "Tarjetas que se apilan al scrollear y escalan levemente al quedar detrás; items declarables por opciones.",
      "demo": {
        "top": 32,
        "scaleStep": 0.05,
        "items": [
          "<h4>Un solo reloj</h4><p>Todas las animaciones laten en el mismo Ticker.</p>",
          "<h4>Solo pagan los visibles</h4><p>Todo se pausa fuera del viewport.</p>",
          "<h4>Cero dependencias</h4><p>Motion, scroll y observadores propios.</p>"
        ]
      }
    },
    {
      "class": "SplitView",
      "file": "SplitView.js",
      "extends": "Component",
      "description": "Dos paneles con divisor arrastrable por puntero y teclado, en orientación horizontal (lado a lado) o vertical (apilados), con asa en estilos pill, line (línea fina que se ilumina), dots (3 puntos) o chevrons (flechas según orientación); anidable sin heredar estilos del padre.",
      "demo": {
        "start": 0.5,
        "min": 0.25,
        "max": 0.75,
        "orientation": "horizontal",
        "handleStyle": "pill",
        "panes": [
          "<h4>Editor</h4><p>Arrastra el asa central.</p>",
          "<h4>Vista previa</h4><p>Los paneles se reparten el espacio.</p>"
        ]
      }
    },
    {
      "class": "SectionWave",
      "file": "SectionWave.js",
      "extends": "Component",
      "description": "Divisor SVG de onda, curva o diagonal entre secciones; color por token (surface, bg, primary-soft…), altura 60px por defecto ajustable con height y volteo vertical con flip.",
      "demo": {
        "shape": "wave",
        "color": "primary-soft",
        "flip": false,
        "height": "60px"
      }
    }
  ],
  "components/media": [
    {
      "class": "Carousel",
      "file": "Carousel.js",
      "extends": "Component",
      "description": "Carrusel con efectos: slide (fila clásica con drag inercial, dots y flechas), coverflow (3D con laterales rotados en Y y hundidos en Z), fade (fundido) y ring (cartas 2.5D: cada carta entra girada como naipe, rota mientras avanza y asienta plana de frente; ringInterval en segundos entre avances, ringSettle para la suavidad del asentamiento, pauseOnHover opcional y drag con inercia que hace snap a la carta más cercana).",
      "demo": {
        "dots": true,
        "arrows": true,
        "loop": true,
        "startIndex": 0,
        "effect": "ring",
        "ringInterval": 2.6,
        "pauseOnHover": true,
        "slides": [
          "<div class=\"dx-carousel-card\"><h3>Uno</h3><p>Arrastra o usa las flechas.</p></div>",
          "<div class=\"dx-carousel-card\"><h3>Dos</h3><p>Snap con inercia real.</p></div>",
          "<div class=\"dx-carousel-card\"><h3>Tres</h3><p>Loop infinito opcional.</p></div>"
        ]
      }
    },
    {
      "class": "CompareSlider",
      "file": "CompareSlider.js",
      "extends": "Component",
      "description": "Comparador antes/después con asa arrastrable por puntero y teclado; capas declarables por opciones.",
      "demo": {
        "start": 0.5,
        "labelBefore": "Antes",
        "labelAfter": "Después",
        "before": "<span>Antes</span>",
        "after": "<span>Después</span>"
      }
    },
    {
      "class": "Lightbox",
      "file": "Lightbox.js",
      "extends": "Component",
      "description": "Zoom FLIP desde el thumbnail hasta pantalla completa con fondo oscuro; miniaturas declarables por opciones.",
      "demo": {
        "duration": 0.45,
        "images": [
          {
            "src": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'><rect width='320' height='200' fill='%236d5cff'/><circle cx='250' cy='50' r='60' fill='%232ee6d6' opacity='0.55'/></svg>",
            "alt": "Aurora"
          },
          {
            "src": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'><rect width='320' height='200' fill='%23ff4ecd'/><circle cx='80' cy='140' r='70' fill='%236d5cff' opacity='0.6'/></svg>",
            "alt": "Neón"
          },
          {
            "src": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'><rect width='320' height='200' fill='%232ee6d6'/><circle cx='160' cy='60' r='55' fill='%230e9f8f' opacity='0.7'/></svg>",
            "alt": "Isla"
          }
        ]
      }
    },
    {
      "class": "LogoMarquee",
      "file": "LogoMarquee.js",
      "extends": "Component",
      "description": "Fila de logos infinita y seamless que se pausa fuera del viewport; logos de texto o imagen por opciones.",
      "demo": {
        "speed": 55,
        "direction": "left",
        "pauseOnHover": true,
        "logos": [
          "NOVA",
          "ORBIT",
          "PULSE",
          "VERTEX",
          "PRISMA",
          "ECO"
        ]
      }
    },
    {
      "class": "ImageReveal",
      "file": "ImageReveal.js",
      "extends": "Component",
      "description": "Imagen cubierta por un panel que se desliza al entrar en pantalla; acepta src por opciones.",
      "demo": {
        "direction": "left",
        "duration": 1,
        "zoom": true,
        "src": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'><rect width='800' height='450' fill='%236d5cff'/><circle cx='620' cy='120' r='150' fill='%23ff4ecd' opacity='0.5'/><circle cx='180' cy='360' r='110' fill='%232ee6d6' opacity='0.45'/></svg>",
        "alt": "Revelada"
      }
    },
    {
      "class": "ParallaxImage",
      "file": "ParallaxImage.js",
      "extends": "Component",
      "description": "La imagen interior se desplaza sutil con el progreso del scroll; acepta src por opciones.",
      "demo": {
        "range": 40,
        "src": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='800' height='600' fill='%230e9f8f'/><circle cx='620' cy='150' r='170' fill='%236d5cff' opacity='0.55'/><circle cx='190' cy='470' r='130' fill='%232ee6d6' opacity='0.4'/></svg>",
        "alt": "Profundidad"
      }
    }
  ],
  "components/navigation": [
    {
      "class": "Navbar",
      "file": "Navbar.js",
      "extends": "Component",
      "description": "Barra superior sticky que se vuelve vidrio al scrollear, se oculta bajando y reaparece subiendo.",
      "demo": {
        "brand": "DIXEL",
        "links": [
          {
            "label": "Inicio",
            "href": "#inicio"
          },
          {
            "label": "Trabajo",
            "href": "#trabajo"
          },
          {
            "label": "Contacto",
            "href": "#contacto"
          }
        ],
        "hideOnScroll": true
      }
    },
    {
      "class": "Tabs",
      "file": "Tabs.js",
      "extends": "Component",
      "description": "Pestañas con indicador que se desliza y estira entre ellas, navegables con flechas del teclado.",
      "demo": {
        "items": [
          {
            "label": "Diseño",
            "content": "Sistemas visuales."
          },
          {
            "label": "Motion",
            "content": "Física en pantalla."
          },
          {
            "label": "Código",
            "content": "Vanilla puro."
          }
        ],
        "active": 0
      }
    },
    {
      "class": "Dock",
      "file": "Dock.js",
      "extends": "Component",
      "description": "Dock estilo macOS con iconos que crecen hacia arriba sobre el riel sin recortarse; formatos wave (onda por cercanía), scale (solo el apuntado), lift (suben sin escalar) y bounce (rebote elástico). Los items aceptan nombres del IconSet propio (icon: 'home') o markup crudo.",
      "demo": {
        "items": [
          {
            "icon": "home",
            "label": "Inicio"
          },
          {
            "icon": "sparkles",
            "label": "Proyectos"
          },
          {
            "icon": "mail",
            "label": "Mensajes"
          },
          {
            "icon": "settings",
            "label": "Ajustes"
          }
        ],
        "magnify": 1.6,
        "range": 120,
        "animation": "wave"
      }
    },
    {
      "class": "DropdownMenu",
      "file": "DropdownMenu.js",
      "extends": "Component",
      "description": "Menú desplegable con submenús en cascada a cualquier profundidad vía children, flyout lateral con retardo de cierre, flip si falta espacio y teclado (derecha entra, izquierda regresa).",
      "demo": {
        "label": "Acciones",
        "items": [
          {
            "label": "Editar"
          },
          {
            "label": "Compartir",
            "children": [
              {
                "label": "Enlace"
              },
              {
                "label": "Exportar",
                "children": [
                  {
                    "label": "PDF"
                  },
                  {
                    "label": "CSV"
                  }
                ]
              }
            ]
          },
          {
            "divider": true
          },
          {
            "label": "Eliminar",
            "danger": true
          }
        ]
      }
    },
    {
      "class": "Drawer",
      "file": "Drawer.js",
      "extends": "Component",
      "description": "Panel lateral deslizante con overlay difuminado estático, cierre con Escape y bloqueo de scroll.",
      "demo": {
        "side": "right",
        "title": "Detalles",
        "content": "<p>Contenido del panel.</p>"
      }
    },
    {
      "class": "Breadcrumb",
      "file": "Breadcrumb.js",
      "extends": "Component",
      "description": "Ruta de navegación con separadores y subrayado animado por transform en los enlaces.",
      "demo": {
        "items": [
          {
            "label": "Inicio",
            "href": "#"
          },
          {
            "label": "Proyectos",
            "href": "#proyectos"
          },
          {
            "label": "DIXEL"
          }
        ]
      }
    },
    {
      "class": "Pagination",
      "file": "Pagination.js",
      "extends": "Component",
      "description": "Paginación con ventana de números, elipsis y pop elástico del número activo al cambiar.",
      "demo": {
        "total": 12,
        "page": 3,
        "siblings": 1
      }
    },
    {
      "class": "ScrollSpyDots",
      "file": "ScrollSpyDots.js",
      "extends": "Component",
      "description": "Puntos laterales fijos que marcan la sección visible y permiten saltar a ella con scroll suave.",
      "demo": {
        "sections": "section[id]",
        "offset": 0.35
      }
    },
    {
      "class": "CommandBar",
      "file": "CommandBar.js",
      "extends": "Component",
      "description": "Paleta de comandos tipo Ctrl K con búsqueda filtrante, navegación por teclado y entrada animada.",
      "demo": {
        "commands": [
          {
            "label": "Ir a inicio",
            "hint": "G I"
          },
          {
            "label": "Cambiar tema",
            "hint": "T"
          },
          {
            "label": "Buscar proyecto",
            "keywords": "portfolio"
          }
        ],
        "hotkey": true
      }
    },
    {
      "class": "ContextMenu",
      "file": "ContextMenu.js",
      "extends": "Component",
      "description": "Menú de click derecho personalizable en cualquier elemento: iconos propios, separadores, submenús anidados, atajos, items danger/disabled, long-press en táctil, Escape y click fuera.",
      "demo": {
        "items": [
          {
            "label": "Abrir",
            "icon": "folderOpen",
            "hint": "Ctrl+O"
          },
          {
            "label": "Compartir",
            "icon": "share",
            "children": [
              {
                "label": "Copiar enlace",
                "icon": "link"
              },
              {
                "label": "Enviar por correo",
                "icon": "mail"
              }
            ]
          },
          {
            "divider": true
          },
          {
            "label": "Eliminar",
            "icon": "trash",
            "danger": true
          }
        ]
      }
    }
  ],
  "components/notify": [
    {
      "class": "NotificationCenter",
      "file": "NotificationCenter.js",
      "extends": "Component",
      "description": "Campana con badge de no-leídas y panel desplegable con posicionamiento inteligente (bottom-sheet en móvil), tiempos relativos, marcar leídas y limpiar todo con animaciones de salida.",
      "demo": {
        "label": "Notificaciones",
        "notifications": [
          {
            "type": "message",
            "title": "Nuevo comentario",
            "text": "Camila respondió en «Rediseño de facturación».",
            "minutesAgo": 4
          },
          {
            "type": "success",
            "title": "Despliegue completado",
            "text": "La versión 2.8.0 ya está en producción.",
            "minutesAgo": 25
          },
          {
            "type": "warning",
            "title": "Límite de almacenamiento",
            "text": "Has usado el 85% de tu espacio disponible.",
            "minutesAgo": 180
          },
          {
            "type": "info",
            "title": "Recordatorio",
            "text": "La demo con el cliente es mañana a las 10:00.",
            "minutesAgo": 480,
            "unread": false
          },
          {
            "type": "danger",
            "title": "Pago rechazado",
            "text": "No pudimos procesar la tarjeta terminada en 4021.",
            "minutesAgo": 2880,
            "unread": false
          }
        ]
      }
    },
    {
      "class": "InlineBanner",
      "file": "InlineBanner.js",
      "extends": "Component",
      "description": "Banner de anuncio para el top de página en variantes info, upgrade y warning, con CTA opcional y cierre animado.",
      "demo": {
        "type": "upgrade",
        "title": "Pasa a Pro",
        "text": "Desbloquea reportes ilimitados y soporte prioritario para tu equipo.",
        "ctaLabel": "Mejorar plan",
        "dismissible": true
      }
    }
  ],
  "components/onboarding": [
    {
      "class": "OnboardingTour",
      "file": "OnboardingTour.js",
      "extends": "Component",
      "description": "Recorrido guiado por la página con velo en cuatro piezas que recorta un foco animado alrededor de cada elemento, tarjeta flotante con contador y navegación por teclado.",
      "demo": {
        "launcherLabel": "Iniciar recorrido",
        "steps": [
          {
            "target": ".dx-tour-launcher",
            "title": "Bienvenido a tu panel",
            "text": "Desde aquí lanzas el recorrido cada vez que un usuario nuevo llega a tu producto.",
            "placement": "bottom"
          },
          {
            "title": "Todo bajo control",
            "text": "Cada paso enfoca un elemento real de tu interfaz y oscurece el resto para guiar la mirada.",
            "placement": "bottom"
          },
          {
            "title": "¡Listo para empezar!",
            "text": "Usa las flechas del teclado para navegar y Escape para salir cuando quieras."
          }
        ]
      }
    },
    {
      "class": "Hotspot",
      "file": "Hotspot.js",
      "extends": "Component",
      "description": "Punto pulsante anclado a un elemento que al hacer clic abre un mini popover explicativo, con cierre por Escape o clic fuera.",
      "demo": {
        "title": "Exportación nueva",
        "text": "Ahora puedes descargar tus reportes en PDF y CSV directamente desde esta vista.",
        "placement": "top",
        "tone": "cyan",
        "label": "Ver novedad de exportación"
      }
    }
  ],
  "components/pickers": [
    {
      "class": "PickerBase",
      "file": "PickerBase.js",
      "extends": "Component",
      "description": "Base de popover anclado al disparador con posicionamiento arriba/abajo, bottom-sheet en móvil y cierre con Escape o click fuera.",
      "demo": {
        "label": "Selector",
        "placeholder": "Seleccionar"
      }
    },
    {
      "class": "DatePicker",
      "file": "DatePicker.js",
      "extends": "PickerBase",
      "description": "Calendario desplegable con vistas de días, meses y años navegables desde el título, transición deslizante, soporte de rango, hoy marcado, localización y navegación completa por teclado.",
      "demo": {
        "label": "Fecha de entrega",
        "range": false,
        "firstDay": 1
      }
    },
    {
      "class": "TimePicker",
      "file": "TimePicker.js",
      "extends": "PickerBase",
      "description": "Selector de hora con steppers de hora y minuto (click, flechas y rueda del mouse), segmento AM/PM en formato 12, toggle 12/24 horas opcional (formatToggle) y grilla de minutos rápidos configurable (quickMinutes).",
      "demo": {
        "label": "Hora de inicio",
        "format": 12,
        "stepMinutes": 5,
        "formatToggle": true,
        "quickMinutes": [
          0,
          15,
          30,
          45
        ]
      }
    },
    {
      "class": "ColorPicker",
      "file": "ColorPicker.js",
      "extends": "PickerBase",
      "description": "Selector de color con área saturación/brillo arrastrable, barras de matiz y alfa, selector de formato HEX/RGB/RGBA, botón de copiar al portapapeles, campo hex editable y paleta de swatches.",
      "demo": {
        "label": "Color de marca",
        "value": "#6d5cff",
        "alpha": true,
        "swatches": [
          "#6d5cff",
          "#2ee6d6",
          "#ff4ecd",
          "#3ddc97"
        ]
      }
    }
  ],
  "components/typography": [
    {
      "class": "SplitText",
      "file": "SplitText.js",
      "extends": "Component",
      "description": "Revela texto por caracteres, palabras o líneas con máscara y stagger, reactivable al re-entrar.",
      "demo": {
        "text": "El dato cobra vida",
        "split": "chars",
        "stagger": 0.03
      }
    },
    {
      "class": "GradientText",
      "file": "GradientText.js",
      "extends": "Component",
      "description": "Texto con gradiente de marca que aparece suavemente al entrar en pantalla.",
      "demo": {
        "text": "Cinematográfico",
        "gradient": "hot"
      }
    },
    {
      "class": "TypeWriter",
      "file": "TypeWriter.js",
      "extends": "Component",
      "description": "Teclea frases con caret parpadeante, las borra y rota a la siguiente.",
      "demo": {
        "phrases": [
          "Diseña rápido.",
          "Anima sin lag.",
          "Publica hoy."
        ],
        "typeSpeed": 16
      }
    },
    {
      "class": "ScrambleText",
      "file": "ScrambleText.js",
      "extends": "Component",
      "description": "Letras aleatorias que se asientan en el texto final al entrar en pantalla.",
      "demo": {
        "text": "DECODIFICANDO",
        "duration": 1.4
      }
    },
    {
      "class": "CountUp",
      "file": "CountUp.js",
      "extends": "Component",
      "description": "Número inline que cuenta hasta su valor con formato local, reactivable.",
      "demo": {
        "value": 98750,
        "duration": 2
      }
    },
    {
      "class": "MarqueeText",
      "file": "MarqueeText.js",
      "extends": "Component",
      "description": "Cinta de texto infinita y seamless que se pausa fuera de vista.",
      "demo": {
        "text": "DIXEL · UX CINEMATOGRÁFICO",
        "speed": 80,
        "direction": "left"
      }
    },
    {
      "class": "HighlightText",
      "file": "HighlightText.js",
      "extends": "Component",
      "description": "Subrayado o marcador que se dibuja al entrar en pantalla; el tipo marker es una franja baja pegada a la línea base, con leve inclinación y color con alfa detrás del texto.",
      "demo": {
        "text": "lo esencial",
        "type": "marker",
        "color": "cyan"
      }
    },
    {
      "class": "OutlineFillText",
      "file": "OutlineFillText.js",
      "extends": "Component",
      "description": "Texto contorneado que se rellena con un barrido lateral al entrar.",
      "demo": {
        "text": "IMPACTO",
        "gradient": true
      }
    }
  ],
  "components/wizard": [
    {
      "class": "WizardForm",
      "file": "WizardForm.js",
      "extends": "Component",
      "description": "Formulario multipaso con barra de progreso animada, indicador de pasos, transición deslizante, validación por paso con shake, resumen final y estado de éxito.",
      "demo": {
        "steps": [
          {
            "title": "Tu cuenta",
            "description": "Cuéntanos quién eres para crear tu espacio de trabajo.",
            "fields": [
              {
                "type": "text",
                "name": "nombre",
                "label": "Nombre completo",
                "placeholder": "Ana María Torres",
                "required": true,
                "minLength": 3
              },
              {
                "type": "email",
                "name": "correo",
                "label": "Correo de trabajo",
                "placeholder": "ana@empresa.com",
                "required": true
              }
            ]
          },
          {
            "title": "Tu empresa",
            "description": "Esto nos ayuda a configurar el plan ideal para tu equipo.",
            "fields": [
              {
                "type": "text",
                "name": "empresa",
                "label": "Nombre de la empresa",
                "placeholder": "Estudio Nébula",
                "required": true
              },
              {
                "type": "select",
                "name": "tamano",
                "label": "Tamaño del equipo",
                "placeholder": "Selecciona una opción",
                "required": true,
                "options": [
                  "1 a 5 personas",
                  "6 a 20 personas",
                  "21 a 100 personas",
                  "Más de 100 personas"
                ]
              }
            ]
          },
          {
            "title": "Preferencias",
            "fields": [
              {
                "type": "select",
                "name": "plan",
                "label": "Plan inicial",
                "placeholder": "Elige un plan",
                "required": true,
                "options": [
                  {
                    "value": "free",
                    "label": "Gratis — para probar"
                  },
                  {
                    "value": "pro",
                    "label": "Pro — equipos en crecimiento"
                  },
                  {
                    "value": "business",
                    "label": "Business — sin límites"
                  }
                ]
              },
              {
                "type": "text",
                "name": "referencia",
                "label": "¿Cómo nos conociste?",
                "placeholder": "Un amigo, redes, búsqueda…"
              }
            ]
          }
        ],
        "summaryTitle": "Revisa tu información",
        "successTitle": "¡Cuenta creada!",
        "successText": "Te enviamos un correo para verificar tu cuenta y empezar."
      }
    }
  ],
  "effects/background": [
    {
      "class": "ParticleField",
      "file": "ParticleField.js",
      "extends": "Component",
      "description": "Particulas flotantes con conexiones por cercania que repelen suave al cursor.",
      "demo": {
        "maxParticles": 90,
        "linkDistance": 110,
        "repelRadius": 130
      }
    },
    {
      "class": "StarField",
      "file": "StarField.js",
      "extends": "Component",
      "description": "Estrellas con parpadeo y profundidad que hacen parallax con el cursor.",
      "demo": {
        "maxStars": 220,
        "parallax": 26,
        "twinkle": 1.6
      }
    },
    {
      "class": "GradientMesh",
      "file": "GradientMesh.js",
      "extends": "Component",
      "description": "Blobs de gradiente radial pre-difuminados moviendose lento solo con transform.",
      "demo": {
        "blobs": 4,
        "range": 0.16
      }
    },
    {
      "class": "NoiseGrain",
      "file": "NoiseGrain.js",
      "extends": "Component",
      "description": "Grano sutil con feTurbulence en data-uri animado por transform en steps.",
      "demo": {
        "opacity": 0.08
      }
    },
    {
      "class": "WaveLines",
      "file": "WaveLines.js",
      "extends": "Component",
      "description": "Lineas horizontales que ondulan como tela dibujadas en canvas.",
      "demo": {
        "lines": 5,
        "amplitude": 16,
        "speed": 0.9
      }
    },
    {
      "class": "GridPulse",
      "file": "GridPulse.js",
      "extends": "Component",
      "description": "Rejilla de puntos que late en ondas desde el centro o desde el cursor.",
      "demo": {
        "gap": 46,
        "mode": "pointer",
        "speed": 2.4
      }
    },
    {
      "class": "AuroraVeil",
      "file": "AuroraVeil.js",
      "extends": "Component",
      "description": "Cortinas de luz suaves con gradientes rotados moviendose muy lento por transform.",
      "demo": {
        "veils": 3,
        "drift": 40,
        "speed": 0.1
      }
    }
  ],
  "effects/cursor": [
    {
      "class": "CursorDot",
      "file": "CursorDot.js",
      "extends": "Component",
      "description": "Punto pegado 1:1 al cursor y anillo con retardo corto que crece sobre elementos [data-cursor=\"hover\"].",
      "demo": {
        "size": 8,
        "ringSize": 38,
        "lag": 15,
        "hoverScale": 1.8,
        "blend": true
      }
    },
    {
      "class": "CursorTrail",
      "file": "CursorTrail.js",
      "extends": "Component",
      "description": "Estela de puntos reciclados que siguen al cursor con retardo en cascada.",
      "demo": {
        "count": 12,
        "size": 9,
        "lag": 17
      }
    },
    {
      "class": "CursorRibbon",
      "file": "CursorRibbon.js",
      "extends": "Component",
      "description": "Cinta fluida con degradado y grosor decreciente dibujada en un canvas fijo tras el cursor.",
      "demo": {
        "points": 26,
        "width": 9,
        "lag": 22
      }
    },
    {
      "class": "CursorGlow",
      "file": "CursorGlow.js",
      "extends": "Component",
      "description": "Luz radial grande que sigue al cursor iluminando la pagina, movida solo por transform.",
      "demo": {
        "size": 520,
        "lag": 10,
        "opacity": 0.6,
        "tint": "primary"
      }
    },
    {
      "class": "ClickBurst",
      "file": "ClickBurst.js",
      "extends": "Component",
      "description": "Click elegante: onda anular fina degradada mas chispas lineales que se disparan y encogen, todo desde un pool reciclado.",
      "demo": {
        "sparks": 5,
        "ringSize": 90,
        "spread": 130,
        "duration": 0.6
      }
    },
    {
      "class": "CursorStyle",
      "file": "CursorStyle.js",
      "extends": "Component",
      "description": "Reemplaza el cursor nativo (cursor none en el scope) por un icono del IconSet que sigue el puntero 1:1, con rotacion opcional por velocidad y estados via data-cursor pointer|grab|text|zoom. En touch no hace nada y destroy() restaura el cursor.",
      "demo": {
        "icon": "navigation",
        "size": 22,
        "tint": "primary",
        "rotate": true
      }
    }
  ],
  "effects/drag": [
    {
      "class": "DragManager",
      "file": "DragManager.js",
      "extends": null,
      "description": "Coordinador singleton del drag and drop universal: registra las zonas activas, cachea su geometría al iniciar cada drag (con re-cache por evento de scroll) y resuelve la zona e índice bajo el puntero sin lecturas de layout por frame. Sus listeners globales solo viven mientras hay un drag en curso.",
      "demo": null
    },
    {
      "class": "Draggable",
      "file": "Draggable.js",
      "extends": "Component",
      "description": "Hace arrastrable cualquier elemento o componente DIXEL: fantasma que sigue al cursor con escala 1.03, sombra estática e inclinación sutil según la velocidad, long-press táctil de 260ms con bloqueo de scroll solo durante el drag, modo move o clone (ideal para paletas) y regreso volando al origen con outBack si se suelta fuera de una zona válida.",
      "demo": {
        "mode": "move",
        "handle": null,
        "longPress": 260,
        "tilt": true,
        "payload": {
          "type": "task",
          "id": "demo-1",
          "title": "Diseñar el hero"
        }
      }
    },
    {
      "class": "DropZone",
      "file": "DropZone.js",
      "extends": "Component",
      "description": "Convierte cualquier contenedor en zona de soltado: acepta por tipo o función, se resalta con is-over al tener un drag encima, calcula el índice de inserción en eje vertical u horizontal abriendo hueco con un placeholder animado (hermanos trasladados con transform, nunca height) y expone onEnter, onLeave y onDrop. Con sortable:true sus hijos se reordenan entre sí automáticamente, incluso con teclado.",
      "demo": {
        "axis": "vertical",
        "sortable": true,
        "accepts": "task",
        "gap": 10,
        "highlight": true
      }
    },
    {
      "class": "Resizable",
      "file": "Resizable.js",
      "extends": "Component",
      "description": "Hace redimensionable cualquier elemento o componente: asas en bordes y esquinas, min/max, aspecto opcional, enable()/disable() para alternar junto al drag-and-drop, y callbacks onResize/onResizeEnd.",
      "demo": {
        "handles": [
          "e",
          "s",
          "se"
        ],
        "minWidth": 120,
        "minHeight": 80
      }
    }
  ],
  "effects/glitch": [
    {
      "class": "Glitch",
      "file": "Glitch.js",
      "extends": "Component",
      "description": "Glitch universal: se adjunta a un texto, botón, tarjeta o componente entero y lo rebana en franjas con desplazamientos estocásticos y clones cromáticos (rgbSplit). Opciones: intensity, interval, burstDuration, slices, rgbSplit, colorA/B, trigger always|hover|manual; métodos glitch()/calm(). Respeta reduced-motion.",
      "demo": {
        "intensity": 1,
        "interval": 2.2,
        "slices": 4,
        "trigger": "always"
      }
    }
  ],
  "effects/hover": [
    {
      "class": "Magnetic",
      "file": "Magnetic.js",
      "extends": "Component",
      "description": "El elemento se imanta al cursor y regresa intacto con fisica de resorte.",
      "demo": {
        "strength": 0.35,
        "scale": 1.04
      }
    },
    {
      "class": "Tilt",
      "file": "Tilt.js",
      "extends": "Component",
      "description": "Inclinacion 3D segun la posicion del cursor con brillo especular desplazado por transform.",
      "demo": {
        "max": 10,
        "perspective": 900,
        "shine": true
      }
    },
    {
      "class": "Spotlight",
      "file": "Spotlight.js",
      "extends": "Component",
      "description": "Foco de luz que sigue al cursor dentro del elemento y se apaga al salir.",
      "demo": {
        "size": 240,
        "opacity": 0.4
      }
    },
    {
      "class": "WarpHover",
      "file": "WarpHover.js",
      "extends": "Component",
      "description": "Deformacion elastica sutil segun la velocidad del cursor que vuelve con spring.",
      "demo": {
        "maxStretch": 0.1,
        "maxSkew": 6
      }
    },
    {
      "class": "LiftHover",
      "file": "LiftHover.js",
      "extends": "Component",
      "description": "Elevacion en hover con sombra estatica por capas revelada por opacidad.",
      "demo": {
        "lift": 8,
        "scale": 1.02
      }
    },
    {
      "class": "TextWave",
      "file": "TextWave.js",
      "extends": "Component",
      "description": "Las letras ondulan alejandose del cursor y regresan, con posiciones cacheadas.",
      "demo": {
        "amplitude": 14,
        "radius": 90
      }
    }
  ],
  "effects/light": [
    {
      "class": "LightSweep",
      "file": "LightSweep.js",
      "extends": "Component",
      "description": "Barrido de luz diagonal que cruza el elemento al entrar en viewport: franja degradada estatica movida solo por transform, reactivable al reentrar.",
      "demo": {
        "duration": 1.1,
        "angle": -18,
        "strength": 0.22
      }
    },
    {
      "class": "GlowOrbs",
      "file": "GlowOrbs.js",
      "extends": "Component",
      "description": "Orbes de luz flotantes con profundidad: 2 a 4 gradientes radiales pre-difuminados con drift lento y parallax sutil del cursor, pausados fuera de vista.",
      "demo": {
        "orbs": 3,
        "drift": 34,
        "parallax": 22
      }
    },
    {
      "class": "SpotStage",
      "file": "SpotStage.js",
      "extends": "Component",
      "description": "Escenario con foco: vineta estatica que oscurece el contenedor y una luz radial que sigue al cursor; en touch el foco orbita solo.",
      "demo": {
        "size": 420,
        "opacity": 0.5,
        "dim": 0.55
      }
    },
    {
      "class": "RimLight",
      "file": "RimLight.js",
      "extends": "Component",
      "description": "Luz de borde para tarjetas e imagenes: filo superior iluminado con gradiente y reflejo suave que se desplaza con el cursor via transform del pseudo-elemento.",
      "demo": {
        "shift": 0.3
      }
    },
    {
      "class": "AmbientPulse",
      "file": "AmbientPulse.js",
      "extends": "Component",
      "description": "Respiracion de luz de una seccion: capa de gradiente estatico cuya opacidad late en ciclo lento, pausada fuera del viewport.",
      "demo": {
        "period": 6,
        "min": 0.15,
        "max": 0.45,
        "tint": "primary"
      }
    }
  ],
  "effects/micro": [
    {
      "class": "Shimmer",
      "file": "Shimmer.js",
      "extends": "Component",
      "description": "Barrido de brillo periodico sobre el elemento: franja degradada estatica movida solo por transform, intervalo configurable y pausado fuera de vista. Para CTAs y badges.",
      "demo": {
        "interval": 3.2,
        "duration": 1.1,
        "strength": 0.35
      }
    },
    {
      "class": "PulseRing",
      "file": "PulseRing.js",
      "extends": "Component",
      "description": "Dos anillos circulares perfectos (borde 2px del color token) centrados en el elemento que emanan escalonados con scale y fade desde un pool fijo. Para senalar novedades.",
      "demo": {
        "interval": 2.2,
        "duration": 1.4,
        "spread": 1.9,
        "tint": "primary"
      }
    },
    {
      "class": "Float",
      "file": "Float.js",
      "extends": "Component",
      "description": "Levitacion suave perpetua con translateY senoidal y rotacion minima opcional; fase aleatoria para que varios elementos no vayan sincronizados, pausada fuera de vista.",
      "demo": {
        "amplitude": 8,
        "speed": 1.2,
        "rotate": 1.5
      }
    },
    {
      "class": "Attention",
      "file": "Attention.js",
      "extends": "Component",
      "description": "Efectos de atencion bajo demanda y encadenables via Motion: shake() para errores, wiggle(), tada(), pop() y flash(); opcion trigger hover o click.",
      "demo": {
        "trigger": "click",
        "effect": "tada"
      }
    },
    {
      "class": "BorderBeam",
      "file": "BorderBeam.js",
      "extends": "Component",
      "description": "Cometa con halo luminoso (glow: true) y estela degradada que recorre el perimetro de cualquier elemento en bucle; los objetivos inline se envuelven solos en un wrapper inline-block. Opciones color, size, speed y thickness; pausado fuera de vista.",
      "demo": {
        "color": "cyan",
        "size": 56,
        "speed": 4,
        "thickness": 2,
        "glow": true
      }
    },
    {
      "class": "Confetti",
      "file": "Confetti.js",
      "extends": "Component",
      "description": "Celebracion manual: burst() lanza rectangulitos de colores de marca con rotacion 3D falsa y fisica de caida desde un pool fijo, desde el elemento o coordenadas. Para onComplete de formularios.",
      "demo": {
        "count": 40,
        "power": 520,
        "duration": 1.6
      }
    },
    {
      "class": "TickNumber",
      "file": "TickNumber.js",
      "extends": "Component",
      "description": "Numero que al cambiar con set(valor) rueda digito a digito verticalmente: columnas de digitos con translateY y transicion CSS, sin layout por frame. Para contadores en vivo.",
      "demo": {
        "duration": 0.6,
        "stagger": 0.04,
        "value": 1024
      }
    }
  ],
  "effects/scroll": [
    {
      "class": "Reveal",
      "file": "Reveal.js",
      "extends": "Component",
      "description": "Entrada configurable por direccion con stagger de hijos, reactivable al subir y bajar.",
      "demo": {
        "direction": "up",
        "distance": 44,
        "stagger": 0.09,
        "once": false
      }
    },
    {
      "class": "ParallaxLayer",
      "file": "ParallaxLayer.js",
      "extends": "Component",
      "description": "Capa con velocidad relativa al scroll usando el progress compartido de ScrollWatch.",
      "demo": {
        "speed": 0.25,
        "axis": "y"
      }
    },
    {
      "class": "ScrollProgressBar",
      "file": "ScrollProgressBar.js",
      "extends": "Component",
      "description": "Barra fija superior que refleja el avance de la pagina solo con transform scaleX.",
      "demo": {
        "tint": "gradient"
      }
    },
    {
      "class": "VelocityWarp",
      "file": "VelocityWarp.js",
      "extends": "Component",
      "description": "Inclina y estira sutilmente el elemento segun la velocidad del scroll y se asienta al parar.",
      "demo": {
        "maxSkew": 4,
        "maxStretch": 0.05
      }
    },
    {
      "class": "StickyReveal",
      "file": "StickyReveal.js",
      "extends": "Component",
      "description": "Marco fijo mientras la seccion pasa; los pasos internos avanzan por progress.",
      "demo": {
        "pages": 3,
        "shift": 48
      }
    },
    {
      "class": "SmoothAnchorNav",
      "file": "SmoothAnchorNav.js",
      "extends": "Component",
      "description": "Nav de anclas con scroll suave que resalta la seccion visible.",
      "demo": {
        "offset": 80,
        "line": 0.35
      }
    }
  ],
  "effects/transitions": [
    {
      "class": "ColorFlow",
      "file": "ColorFlow.js",
      "extends": "Component",
      "description": "Interpola el color de fondo de la pagina entre secciones segun el scroll: cada seccion declara data-flow-color y el componente escribe una sola variable --dx-flow-bg en el html, viaje de color continuo sin cortes.",
      "demo": {
        "selector": "[data-flow-color]"
      }
    },
    {
      "class": "SectionFade",
      "file": "SectionFade.js",
      "extends": "Component",
      "description": "Funde los bordes de una seccion con gradientes automaticos arriba y abajo hacia el color de fondo vivo, para que cada seccion disuelva en la siguiente.",
      "demo": {
        "edges": "both"
      }
    },
    {
      "class": "WipeReveal",
      "file": "WipeReveal.js",
      "extends": "Component",
      "description": "Cortina del color de fondo que se desliza fuera con transform al entrar la seccion en viewport y vuelve al salir; variantes de direccion up, down, left y right.",
      "demo": {
        "direction": "up",
        "duration": 0.9
      }
    },
    {
      "class": "ZoomFlow",
      "file": "ZoomFlow.js",
      "extends": "Component",
      "description": "La seccion entra con leve profundidad: scale 0.96 a 1 mas fade ligados al progreso de scroll, scrub reversible como camara acercandose.",
      "demo": {
        "from": 0.96,
        "range": 0.32
      }
    }
  ],
  "scrollbars": [
    {
      "class": "FancyScrollbar",
      "file": "FancyScrollbar.js",
      "extends": "Component",
      "description": "Scrollbar overlay con riel fino y thumb de gradiente arrastrable que se auto-oculta; sirve para la pagina y para contenedores.",
      "demo": {
        "autoHide": true,
        "hideDelay": 1.4,
        "minThumb": 40
      }
    }
  ],
  "shaders": [
    {
      "class": "ShaderCanvas",
      "file": "ShaderCanvas.js",
      "extends": "Component",
      "description": "Base WebGL1 de todos los shaders: quad fullscreen, uniforms estándar, pausa fuera de viewport y fallback CSS.",
      "demo": {
        "colorA": "#6d5cff",
        "colorB": "#2ee6d6",
        "colorC": "#ff4ecd",
        "resolutionScale": 0.75
      }
    },
    {
      "class": "AuroraShader",
      "file": "AuroraShader.js",
      "extends": "ShaderCanvas",
      "description": "Cortinas de aurora boreal fluidas con movimiento lento y majestuoso en colores de marca.",
      "demo": {
        "speed": 0.6,
        "intensity": 1.1,
        "scale": 1.1
      }
    },
    {
      "class": "LiquidShader",
      "file": "LiquidShader.js",
      "extends": "ShaderCanvas",
      "description": "Líquido tricolor de metaballs con brillo especular en los bordes; el cursor lo empuja y siempre regresa a su flujo. La opción hero lo agranda para héroes.",
      "demo": {
        "speed": 1,
        "intensity": 1,
        "scale": 1,
        "hero": true
      }
    },
    {
      "class": "OceanShader",
      "file": "OceanShader.js",
      "extends": "ShaderCanvas",
      "description": "Fotografía submarina procedural: cuerpo de agua volumétrico con doble capa de olas, god-rays que atraviesan la masa, cáusticas cerca de la superficie y burbujas esféricas creíbles —borde luminoso, glint especular descentrado, interior casi transparente que refracta el fondo, wobble y estela al subir—; el cursor genera una corriente que las desvía.",
      "demo": {
        "speed": 1,
        "intensity": 1.15,
        "scale": 1
      }
    },
    {
      "class": "StudioShader",
      "file": "StudioShader.js",
      "extends": "ShaderCanvas",
      "description": "Backdrop de estudio fotográfico estilo render: ciclorama con luz principal cálida que sigue al cursor, luces de borde de marca y viñeta suave. El fondo perfecto para héroes de producto.",
      "demo": {
        "speed": 1,
        "intensity": 1.2,
        "warmth": 1
      }
    },
    {
      "class": "VolumetricShader",
      "file": "VolumetricShader.js",
      "extends": "ShaderCanvas",
      "description": "Haces de luz volumétricos desde una esquina configurable atravesando polvo fino flotante, con respiración lenta e intensidad y ángulo por opciones.",
      "demo": {
        "speed": 1,
        "intensity": 1.2,
        "corner": "top-left",
        "angle": 0
      }
    },
    {
      "class": "GlassShader",
      "file": "GlassShader.js",
      "extends": "ShaderCanvas",
      "description": "Vidrio esmerilado con refracción falsa: blobs de marca distorsionados por un normal-map procedural, brillos especulares y borde luminoso; el cursor desplaza la refracción.",
      "demo": {
        "speed": 1,
        "intensity": 1,
        "refraction": 1.1,
        "frost": 1
      }
    },
    {
      "class": "ChromeShader",
      "file": "ChromeShader.js",
      "extends": "ShaderCanvas",
      "description": "Metal líquido cromado con matcap procedural: superficie ondulante que refleja un entorno de estudio en colores de marca, fresnel fuerte y ondas al paso del cursor.",
      "demo": {
        "speed": 1,
        "intensity": 1.1,
        "scale": 1
      }
    },
    {
      "class": "SilkShader",
      "file": "SilkShader.js",
      "extends": "ShaderCanvas",
      "description": "Seda ondulante 2.5D con iluminación especular cinematográfica y pliegues que siguen al cursor.",
      "demo": {
        "speed": 0.7,
        "intensity": 1,
        "scale": 1.1
      }
    },
    {
      "class": "HaloShader",
      "file": "HaloShader.js",
      "extends": "ShaderCanvas",
      "description": "Orbe de luz volumétrica que respira en el centro con rayos radiales suaves, ideal para héroes.",
      "demo": {
        "speed": 1,
        "intensity": 1.2,
        "scale": 1,
        "resolutionScale": 1
      }
    },
    {
      "class": "WaveGridShader",
      "file": "WaveGridShader.js",
      "extends": "ShaderCanvas",
      "description": "Rejilla 3D en perspectiva con ondas viajeras y niebla hacia el horizonte, estilo synthwave elegante.",
      "demo": {
        "speed": 1,
        "intensity": 1,
        "scale": 1
      }
    },
    {
      "class": "NebulaShader",
      "file": "NebulaShader.js",
      "extends": "ShaderCanvas",
      "description": "Nebulosa espacial profunda con estrellas titilantes, polvo de color y parallax sutil con el cursor.",
      "demo": {
        "speed": 0.8,
        "intensity": 1,
        "scale": 1.2
      }
    },
    {
      "class": "FlowFieldShader",
      "file": "FlowFieldShader.js",
      "extends": "ShaderCanvas",
      "description": "Campo de flujo de filamentos de luz advectados por noise, como viento luminoso.",
      "demo": {
        "speed": 0.9,
        "intensity": 1,
        "scale": 1.3
      }
    },
    {
      "class": "RippleClickShader",
      "file": "RippleClickShader.js",
      "extends": "ShaderCanvas",
      "description": "Superficie de agua calma donde cada click lanza una onda circular que se expande y desvanece.",
      "demo": {
        "speed": 1,
        "intensity": 1,
        "interactive": true
      }
    },
    {
      "class": "WaterDropShader",
      "file": "WaterDropShader.js",
      "extends": "ShaderCanvas",
      "description": "El emblema del catálogo líquido: una gota cae y se une a la superficie con blending polimórfico de metaballs; el impacto abre un cráter con corona de salpicadura, lanza anillos concéntricos y un chorro central que rebota expulsando una gota secundaria que vuelve a fundirse con el agua mientras todo se calma en loop. El cursor estira el líquido a su paso y con interactive cada click deja caer otra gota.",
      "demo": {
        "speed": 1,
        "intensity": 1,
        "interactive": true
      }
    },
    {
      "class": "FireShader",
      "file": "FireShader.js",
      "extends": "ShaderCanvas",
      "description": "Fuego procedural realista: llamas fbm ascendentes con lenguas definidas, núcleo blanco, distorsión de calor y chispas que suben y se apagan; viento configurable y tintable para fuego de marca.",
      "demo": {
        "speed": 1,
        "intensity": 1.1,
        "height": 1,
        "wind": 0.2,
        "sparks": true
      }
    },
    {
      "class": "SmokeShader",
      "file": "SmokeShader.js",
      "extends": "ShaderCanvas",
      "description": "Humo volumétrico como tinta en agua: volutas fbm con domain warping y rizado fino en los bordes, luz direccional sutil que da volumen, ascenso lento y disipación; densidad y deriva configurables.",
      "demo": {
        "speed": 1,
        "intensity": 1,
        "density": 1.1,
        "drift": 0.2
      }
    },
    {
      "class": "PlasmaShader",
      "file": "PlasmaShader.js",
      "extends": "ShaderCanvas",
      "description": "Energía eléctrica viva: núcleo de plasma pulsante y arcos de rayo que crepitan con timing irregular; el cursor atrae levemente los arcos. Cantidad de rayos y caos configurables.",
      "demo": {
        "speed": 1,
        "intensity": 1.1,
        "bolts": 6,
        "chaos": 1,
        "core": true
      }
    },
    {
      "class": "BlackHoleShader",
      "file": "BlackHoleShader.js",
      "extends": "ShaderCanvas",
      "description": "Agujero negro astronómico: disco de acreción con brillo Doppler y precesión 3D animada —la inclinación y orientación del disco derivan lentamente como si la cámara lo orbitara—, anillo de fotones estable, lente gravitacional real sobre el campo de estrellas y materia en espiral que acelera y desaparece en el horizonte; con pull el cursor emite un hilo de materia que el agujero absorbe. Opciones tilt y tiltSpeed.",
      "demo": {
        "speed": 1,
        "intensity": 1.1,
        "scale": 1,
        "pull": true,
        "tilt": 0.35,
        "tiltSpeed": 0.12
      }
    },
    {
      "class": "VortexShader",
      "file": "VortexShader.js",
      "extends": "ShaderCanvas",
      "description": "Remolino de succión como embudo 3D: estrías espirales que aceleran angularmente hacia el centro, vistas con una inclinación que precesa lentamente y oscurecimiento hacia el fondo del embudo; dirección, tilt y tiltSpeed configurables.",
      "demo": {
        "speed": 1,
        "intensity": 1.1,
        "direction": 1,
        "tilt": 0.4,
        "tiltSpeed": 0.08
      }
    },
    {
      "class": "ShapeMorph",
      "file": "ShapeMorph.js",
      "extends": "Component",
      "description": "Constelación de partículas brillantes que se ordena en figuras dibujadas —estrella de cinco puntas, corazón, círculo, triángulo, hexágono, diamante, luna, infinito, rayo— y muta de una a otra con easing suave, jitter orgánico y líneas tenues entre puntos; morphTo acepta nombre o contorno custom [[x,y]...], el cursor repele levemente los puntos y trail deja estela sutil. Canvas 2D con pool fijo.",
      "demo": {
        "points": 90,
        "shapes": [
          "constellation",
          "star",
          "heart",
          "circle",
          "hexagon"
        ],
        "hold": 2.4,
        "morph": 1.6,
        "trail": 0.35
      }
    },
    {
      "class": "Mesh3D",
      "file": "mesh/Mesh3D.js",
      "extends": "Component",
      "description": "Motor 3D propio en WebGL1: matemáticas de matrices, wireframe real de solo aristas únicas (gl.LINES) con fade por profundidad e interior vacío, sólido lambert + fresnel y cromo matcap; rotación automática, arrastre con inercia y parallax con el cursor.",
      "demo": {
        "mode": "wireframe",
        "speed": 1,
        "intensity": 1
      }
    },
    {
      "class": "TorusMesh",
      "file": "mesh/TorusMesh.js",
      "extends": "Mesh3D",
      "description": "Toro 3D procedural girando en el espacio; en cromo parece un render de estudio y en wireframe una joya de neón.",
      "demo": {
        "mode": "chrome",
        "speed": 1,
        "intensity": 1
      }
    },
    {
      "class": "KnotMesh",
      "file": "mesh/KnotMesh.js",
      "extends": "Mesh3D",
      "description": "Nudo toroidal (p,q) con tubo procedural; hipnótico en wireframe con glow y escultural en modo sólido.",
      "demo": {
        "mode": "wireframe",
        "speed": 1,
        "intensity": 1.1
      }
    },
    {
      "class": "IcosaMesh",
      "file": "mesh/IcosaMesh.js",
      "extends": "Mesh3D",
      "description": "Icosaedro subdivisible hasta esfera geodésica; la retícula triangular en wireframe se ve premium con defaults.",
      "demo": {
        "mode": "wireframe",
        "detail": 1,
        "speed": 1,
        "intensity": 1
      }
    },
    {
      "class": "WavePlaneMesh",
      "file": "mesh/WavePlaneMesh.js",
      "extends": "Mesh3D",
      "description": "Plano ondulando en 3D real con normales analíticas: océano de malla en wireframe o seda metálica en sólido.",
      "demo": {
        "mode": "wireframe",
        "speed": 1,
        "amplitude": 0.22,
        "intensity": 1
      }
    },
    {
      "class": "SphereMesh",
      "file": "mesh/SphereMesh.js",
      "extends": "Mesh3D",
      "description": "Esfera UV con normales suaves; en wireframe muestra la retícula clásica de meridianos y paralelos y en cromo es una bola de espejo de estudio.",
      "demo": {
        "mode": "wireframe",
        "speed": 1,
        "intensity": 1
      }
    },
    {
      "class": "BoxMesh",
      "file": "mesh/BoxMesh.js",
      "extends": "Mesh3D",
      "description": "Cubo con bisel opcional: chaflán real en aristas y esquinas que atrapa la luz en sólido y cromo; con bevel 0 es un cubo puro de 12 aristas.",
      "demo": {
        "mode": "chrome",
        "bevel": 0.14,
        "speed": 1,
        "intensity": 1
      }
    },
    {
      "class": "CylinderMesh",
      "file": "mesh/CylinderMesh.js",
      "extends": "Mesh3D",
      "description": "Cilindro con lados suaves y tapas planas; en wireframe dibuja sus dos aros y las generatrices, en sólido parece una pieza torneada.",
      "demo": {
        "mode": "solid",
        "speed": 1,
        "intensity": 1
      }
    },
    {
      "class": "ConeMesh",
      "file": "mesh/ConeMesh.js",
      "extends": "Mesh3D",
      "description": "Cono con iluminación suave en la falda y base plana; en wireframe traza el aro base y las líneas hacia el vértice como una carpa de luz.",
      "demo": {
        "mode": "solid",
        "speed": 1,
        "intensity": 1
      }
    },
    {
      "class": "OctahedronMesh",
      "file": "mesh/OctahedronMesh.js",
      "extends": "Mesh3D",
      "description": "Octaedro de caras planas: mínimo y escultural, 12 aristas limpias en wireframe y facetas nítidas que giran la luz en sólido.",
      "demo": {
        "mode": "wireframe",
        "speed": 1,
        "intensity": 1.1
      }
    },
    {
      "class": "GemMesh",
      "file": "mesh/GemMesh.js",
      "extends": "Mesh3D",
      "description": "Diamante facetado: bipirámide con corona, mesa y pabellón de facetas planas que destellan al rotar; espectacular en cromo y joya de neón en wireframe.",
      "demo": {
        "mode": "chrome",
        "facets": 8,
        "speed": 1,
        "intensity": 1.1
      }
    },
    {
      "class": "IsoField",
      "file": "mesh/IsoField.js",
      "extends": "Component",
      "description": "Campo de cubos isométricos 2.5D que ondulan como ola con tres tonos de marca; el cursor levanta los cubos cercanos.",
      "demo": {
        "columns": 15,
        "rows": 15,
        "speed": 1,
        "lift": 1.6
      }
    },
    {
      "class": "OrbitRings",
      "file": "mesh/OrbitRings.js",
      "extends": "Component",
      "description": "Anillos orbitales en pseudo-3D con puntos brillantes que ganan tamaño y luz al pasar al frente, más parallax sutil con el cursor.",
      "demo": {
        "rings": 5,
        "dotsPerRing": 3,
        "speed": 1
      }
    },
    {
      "class": "TextMesh",
      "file": "mesh/TextMesh.js",
      "extends": "Mesh3D",
      "description": "Texto 3D real extruido de cualquier tipograf—a: s—lido, wireframe o cromo con glow, ondulaci—n GPU opcional y arrastre con inercia.",
      "demo": {
        "text": "DIXEL",
        "mode": "wireframe",
        "wave": 0.18,
        "weight": 800
      }
    },
    {
      "class": "GlitchShader",
      "file": "GlitchShader.js",
      "extends": "ShaderCanvas",
      "description": "Interferencia digital: bandas que se desplazan, aberracion RGB, filas rotas y ruido de senal en rafagas estocasticas.",
      "demo": {
        "speed": 1,
        "intensity": 1
      }
    },
    {
      "class": "ShaderLayer",
      "file": "ShaderLayer.js",
      "extends": "Component",
      "description": "Adaptador universal: monta cualquier shader como capa de un elemento en modo background (fondo vivo), text (el shader rellena los glifos del texto real, que sigue seleccionable) o border (anillo vivo del grosor elegido). Opciones: shader, mode, thickness, opacity, blend, resolutionScale, shaderOptions.",
      "demo": null
    },
    {
      "class": "ShapeMask",
      "file": "ShapeMask.js",
      "extends": null,
      "description": "Capturador de forma: rasteriza el texto de un host o un anillo con su radio real a un canvas-mascara; samplePoints extrae puntos de la silueta para efectos de particulas.",
      "demo": null
    }
  ]
};
