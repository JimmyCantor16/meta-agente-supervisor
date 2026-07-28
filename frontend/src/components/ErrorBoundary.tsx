import { Component } from "react";
import type { ErrorInfo, PropsWithChildren } from "react";

interface Estado {
  error: Error | null;
}

/**
 * Red de seguridad de la interfaz.
 *
 * Sin esto, cualquier excepción durante un render deja la página EN BLANCO, sin
 * un solo mensaje y sin forma de recuperarse: ni siquiera se puede cerrar sesión
 * para volver a un estado limpio. Aquí se muestra qué pasó y se ofrece la salida.
 */
export class ErrorBoundary extends Component<PropsWithChildren, Estado> {
  state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Fallo no controlado en la interfaz:", error, info.componentStack);
  }

  private reiniciar = (): void => {
    // La causa más común es un dato guardado que quedó corrupto: se limpia.
    try {
      window.localStorage.removeItem("auth.user");
      window.localStorage.removeItem("auth.credential");
    } catch {
      /* sin almacenamiento tampoco pasa nada */
    }
    window.location.href = "/";
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
          <h1 className="text-lg font-bold text-slate-900">Algo se rompió en la pantalla</h1>
          <p className="mt-2 text-sm text-slate-600">
            La aplicación encontró un problema y no pudo seguir dibujando esta vista. Tus proyectos
            están a salvo en el servidor.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-300">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={this.reiniciar}
            className="mt-4 w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Empezar de nuevo
          </button>
        </div>
      </div>
    );
  }
}
