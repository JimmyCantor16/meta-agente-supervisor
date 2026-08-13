import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Configuración de Vite.
// El proxy redirige las llamadas a `/api` hacia el backend FastAPI en el puerto
// 8000, evitando problemas de CORS durante el desarrollo.
//
// PWA: la web es INSTALABLE desde el navegador del teléfono (con su auditoría
// autenticada y su multimedia completo), como plan B instalable mientras
// madura la app nativa. Misma receta que los MVPs que genera el propio
// proyecto (ver `_manifest` en skeleton_dominio_armar.py): standalone, lang
// es, y el verde de marca como theme_color.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // El service worker se actualiza solo al publicar una versión nueva;
      // el registro lo inyecta el propio plugin en el index del build.
      registerType: "autoUpdate",
      manifest: {
        name: "Meta-Agente — Jamz Software",
        short_name: "Meta-Agente",
        description:
          "Convierte una idea en un proyecto de software real y enseña a completarlo.",
        lang: "es",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#027E6F",
        background_color: "#FFFFFF",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          // Maskable: el fondo de marca llega hasta el borde (esquinas
          // rectas), así el recorte circular de Android no corta nada.
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // SPA: cualquier navegación a una ruta de React cae al index
        // precacheado (el equivalente offline del `try_files` de Nginx y
        // del rewrite /* de Render)…
        navigateFallback: "index.html",
        // …pero NUNCA estas rutas, que TIENEN que salir a la red. Comprobado
        // con el sitio apagado: sin la lista, el service worker respondía a
        // /preview/<slug>/ con el shell del Meta-Agente desde su caché, así
        // que el MVP del usuario nunca llegaba a pintarse.
        //   · /api/**      → el backend (rewrite de Render o proxy de Nginx).
        //   · /preview/**  → el proxy que sirve los MVP generados; vive en el
        //     backend, pero si alguien abre esa ruta bajo el dominio del
        //     frontend, el SW no debe quedársela.
        // Ojo: workbox compara contra `pathname + search`, así que anclar con
        // ^ es correcto y `/?puente=CODIGO` (el puente de sesión con el
        // escritorio) NO cae aquí: sigue recibiendo el index con su query.
        navigateFallbackDenylist: [/^\/api\//, /^\/preview\//],
        // Precache SOLO de los assets del build (más los iconos de public/).
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        // El bundle principal ronda 1 MB (CodeMirror + hls.js); margen para
        // que el precache no lo excluya en silencio si crece.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // CRÍTICO: /api/** JAMÁS se cachea — un cache aquí rompería
            // licencias y progreso. NetworkOnly deja pasar la petición tal
            // cual a la red, respetando el rewrite /api/* de Render.
            // (El WebSocket ni siquiera pasa por el service worker.)
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
