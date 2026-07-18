/** @type {import('tailwindcss').Config} */
export default {
  // `darkMode: "class"` permite forzar el modo oscuro por defecto añadiendo la
  // clase `dark` al elemento raíz (ver index.html).
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta del "workspace" de IA.
        brand: {
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
