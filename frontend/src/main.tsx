import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./features/auth/AuthProvider";
import { AvisoVersion } from "./features/desktop";
import { NotificationProvider } from "./features/notifications/NotificationProvider";
import { LanguageProvider } from "./i18n/LanguageProvider";
import "./index.css";

// Service worker de la PWA. Con `autoUpdate`, cuando un deploy trae versión
// nueva el SW nuevo se instala y la página se recarga sola para usarla; en la
// primera instalación no recarga nada.
registerSW({ immediate: true });

// Punto de montaje de la SPA.
// Proveedores: idioma (i18n) y autenticación con Google.
// AvisoVersion solo actúa dentro de la app de escritorio (Tauri); en la web no
// renderiza nada. Va aquí porque necesita el contexto de notificaciones.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <AuthProvider>
          <NotificationProvider>
            <App />
            <AvisoVersion />
          </NotificationProvider>
        </AuthProvider>
      </LanguageProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
