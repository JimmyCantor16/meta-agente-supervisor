import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";

/**
 * Editor de código del aula, sobre CodeMirror 6.
 *
 * Sustituye al textarea plano: números de línea, resaltado por lenguaje según
 * la extensión del archivo, y tema CLARO acorde al sistema de diseño (fondo
 * blanco, grises azulados, la marca solo en cursor y línea activa). Un editor
 * que se parece al de un IDE de verdad hace que tocar código intimide menos.
 */
export function EditorCodigo({
  valor,
  path,
  lineaInicial = null,
  onCambio,
}: {
  /** Contenido con el que nace (o renace) el editor: al abrir/deshacer. */
  valor: string;
  /** Ruta del archivo: decide el resaltado por su extensión. */
  path: string;
  /** Línea a la que saltar al abrir (1-indexada), si la misión la insinúa. */
  lineaInicial?: number | null;
  /** Cada tecla del alumno llega aquí (el estado `editado` de arriba). */
  onCambio: (texto: string) => void;
}) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const vistaRef = useRef<EditorView | null>(null);
  const abiertoRef = useRef<string | null>(null);
  // El callback vive en un ref para que el listener del editor use siempre el
  // último sin obligar a recrear la vista en cada render.
  const onCambioRef = useRef(onCambio);
  onCambioRef.current = onCambio;

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;
    // Si la vista ya muestra EXACTAMENTE este contenido (p. ej. tras compilar,
    // que solo confirma lo escrito), no se recrea: el cursor no salta.
    if (
      vistaRef.current &&
      abiertoRef.current === path &&
      vistaRef.current.state.doc.toString() === valor
    ) {
      return;
    }
    vistaRef.current?.destroy();
    const vista = new EditorView({
      doc: valor,
      parent: contenedor,
      extensions: [
        basicSetup,
        lenguajePorExtension(path),
        temaClaro,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onCambioRef.current(u.state.doc.toString());
        }),
      ],
    });
    vistaRef.current = vista;
    abiertoRef.current = path;
    // Salta a la línea que la misión insinúa: pone el cursor ahí (la línea
    // activa queda resaltada) y la centra en pantalla.
    if (lineaInicial && lineaInicial >= 1 && lineaInicial <= vista.state.doc.lines) {
      const pos = vista.state.doc.line(lineaInicial).from;
      vista.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: "center" }),
      });
    }
  }, [valor, path, lineaInicial]);

  // Al desmontar el componente se libera la vista.
  useEffect(
    () => () => {
      vistaRef.current?.destroy();
      vistaRef.current = null;
    },
    []
  );

  return <div ref={contenedorRef} className="h-full min-h-[48vh]" />;
}

/** Resaltado según la extensión del archivo abierto. */
function lenguajePorExtension(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "py":
      return python();
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
    case "json":
      return javascript({ jsx: true });
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "html":
    case "htm":
      return html();
    case "css":
      return css();
    default:
      return [];
  }
}

// Tema claro con los tokens del sistema (tailwind.config.js): fondo blanco,
// grises azulados (ink-*), y la marca (#027E6F) solo en cursor y acentos.
const temaClaro = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "#FFFFFF",
    color: "#1F243C", // ink-body
    fontSize: "12px",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    lineHeight: "1.6",
  },
  ".cm-gutters": {
    backgroundColor: "#FAFAFA", // surface-sunken
    color: "#878DA2", // ink-faint
    border: "none",
    borderRight: "1px solid rgba(14, 16, 26, 0.06)",
  },
  ".cm-activeLine": { backgroundColor: "#ECFBF7" }, // brand-50
  ".cm-activeLineGutter": { backgroundColor: "#ECFBF7", color: "#04665A" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "#D0F5EB", // brand-100
  },
  ".cm-cursor": { borderLeftColor: "#027E6F" }, // brand-600
  ".cm-selectionMatch": { backgroundColor: "#ECFBF7" },
});
