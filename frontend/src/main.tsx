import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./features/auth/AuthProvider";
import { AvisoVersion } from "./features/desktop";
import { NotificationProvider } from "./features/notifications/NotificationProvider";
import { LanguageProvider } from "./i18n/LanguageProvider";
import "./index.css";

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
