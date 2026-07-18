import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuración de Vite.
// El proxy redirige las llamadas a `/api` hacia el backend FastAPI en el puerto
// 8000, evitando problemas de CORS durante el desarrollo.
export default defineConfig({
  plugins: [react()],
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
