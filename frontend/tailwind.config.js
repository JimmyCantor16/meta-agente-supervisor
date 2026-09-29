/** @type {import('tailwindcss').Config} */

/*
 * SISTEMA DE DISEÑO
 * =================
 * Tokens derivados del análisis de una referencia de producto de primer nivel
 * (grammarly.com). Las cuatro reglas que hacen que una UI se vea "cara":
 *
 *   1. UN solo color de marca, sin gradientes. El color se gana su presencia
 *      por escasez: solo CTA, links y estado activo.
 *   2. Radios pequeños (6px base). Los radios grandes leen como plantilla.
 *   3. Sombras multicapa TEÑIDAS de azul-gris, nunca negras.
 *   4. Titulares con line-height < 1.15 y letter-spacing de -1% del tamaño.
 *
 * Los tamaños semánticos (text-display / text-title / …) empaquetan las tres
 * variables tipográficas juntas para que no se puedan usar a medias.
 */
export default {
  // `darkMode: "class"` permite forzar el modo oscuro por defecto añadiendo la
  // clase `dark` al elemento raíz (ver index.html).
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Verde de marca. Escala COMPLETA: el código ya usaba brand-50/100/200/
        // 300/700/800/900, que antes no existían y Tailwind no generaba.
        brand: {
          50: "#ECFBF7",
          100: "#D0F5EB",
          200: "#A3EAD8",
          300: "#6BD9C0",
          400: "#2FBFA1",
          500: "#0F9E84",
          600: "#027E6F", // ← color de marca; 4.98:1 sobre blanco (AA)
          700: "#04665A", // ← hover; 6.87:1
          800: "#075147",
          900: "#0A423B",
        },
        // Acento: solo para resaltados puntuales (nunca como fondo de texto).
        accent: "#00E0AC",
        // Texto. Nunca negro puro ni gris neutro: van con tinte azulado.
        ink: {
          DEFAULT: "#0E101A", // titulares
          body: "#1F243C", // cuerpo
          muted: "#5C6178", // secundario
          faint: "#878DA2", // terciario (mismo tinte que las sombras)
        },
        surface: {
          DEFAULT: "#FFFFFF",
          sunken: "#FAFAFA",
          muted: "#F5F5F5", // fondo de sección
        },
        // LA SALA: el único tema OSCURO del sistema, y solo para la página de
        // entretenimiento (el Taller y el resto siguen en claro). Mismo tinte
        // azulado que `ink`, llevado a la noche; el verde de marca sigue siendo
        // el único color de acción.
        sala: {
          bg: "#090B15",
          raise: "#0E1122", // sidebar / bloques elevados
          panel: "#13162B", // tarjetas
          line: "rgba(150,160,210,.12)",
          "line-2": "rgba(150,160,210,.22)",
          ink: "#EEF0F8",
          body: "#C4C8DC",
          muted: "#8C92AE",
          faint: "#5F6585",
          remote: "#1A1D35", // cuerpo del control remoto
          key: "#262A48", // teclas del control
          "key-edge": "#0C0E1D",
        },
        // La tele estilo Simpsons (la misma del modo flotante y del Document PiP).
        tele: {
          out: "#20233B", // contorno cómic
          bezel: "#6EC7D6",
          led: "#FF4D4D",
          osd: "#00E0AC", // letras de la pantalla (canal, volumen)
        },
        // Las cuatro teclas de color del control = los pilares de La Sala:
        // rojo en vivo, verde aprende, amarillo infórmate, azul radio.
        tecla: {
          red: "#E5484D",
          green: "#30A46C",
          yellow: "#F5D90A",
          blue: "#3E63DD",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
        // Marca de la tele ("Jamz Software · Free TV") y rótulos en pantalla.
        tele: ["Righteous", "Trebuchet MS", "system-ui", "sans-serif"],
        osd: ["VT323", "ui-monospace", "monospace"],
      },
      // Cada entrada empaqueta tamaño + interlineado + tracking + peso, que es
      // la fórmula completa. Pesos intermedios (670) en vez de 700: solo
      // funcionan porque Inter se carga como fuente VARIABLE (ver index.html).
      fontSize: {
        display: ["52px", { lineHeight: "58px", letterSpacing: "-0.52px", fontWeight: "670" }],
        title: ["36px", { lineHeight: "40px", letterSpacing: "-0.36px", fontWeight: "670" }],
        heading: ["24px", { lineHeight: "28px", letterSpacing: "-0.24px", fontWeight: "670" }],
        subhead: ["18px", { lineHeight: "23px", letterSpacing: "-0.18px", fontWeight: "620" }],
      },
      borderRadius: {
        // 6px es el radio del sistema. Se redefine toda la escala para que las
        // pantallas aún sin migrar bajen de golpe a radios de producto.
        DEFAULT: "6px",
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "10px",
        "2xl": "12px",
        "3xl": "16px",
      },
      boxShadow: {
        // Sombras teñidas (#878DA2), no negras. `float` es la de 4 capas que
        // usa la referencia en su tarjeta protagonista.
        float:
          "0 0 0 0.5px #878DA2, 0 0 2px 0.5px rgba(135,141,162,.5), 0 1px 8px 0.5px rgba(135,141,162,.1), 0 2px 12px 0.5px rgba(135,141,162,.25)",
        card: "0 0 0 0.5px rgba(135,141,162,.35), 0 1px 3px rgba(135,141,162,.12), 0 4px 12px rgba(135,141,162,.10)",
        sm: "0 1px 2px rgba(135,141,162,.14)",
        DEFAULT: "0 1px 3px rgba(135,141,162,.16), 0 1px 2px rgba(135,141,162,.10)",
      },
      letterSpacing: {
        // -1% del tamaño, la proporción que usa la referencia en todo titular.
        snug: "-0.01em",
      },
    },
  },
  plugins: [],
};
