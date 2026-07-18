import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./features/auth/AuthProvider";
import { LanguageProvider } from "./i18n/LanguageProvider";
import "./index.css";

// Punto de montaje de la SPA.
// Proveedores: idioma (i18n) y autenticación con Google.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);
