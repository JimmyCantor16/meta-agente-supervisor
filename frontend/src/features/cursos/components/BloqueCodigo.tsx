import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, basicSetup } from "codemirror";
import { Check, Copy, MessageCircleQuestion } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { lenguajePorExtension, temaClaro } from "../../workspace/components/EditorCodigo";

/** Extensión equivalente a cada nombre de lenguaje del curso (para el resaltado). */
const EXTENSION: Record<string, string> = {
  java: "java",
  ts: "ts",
  typescript: "ts",
  js: "js",
  javascript: "js",
  vue: "vue",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  html: "html",
  css: "css",
  python: "py",
  py: "py",
};

/**
 * Código de la lección con resaltado de sintaxis (CodeMirror en solo lectura,
 * el mismo tema claro del aula), botón de copiar y, si se pasa `onPreguntar`,
 * un atajo para preguntarle al tutor por ESTE fragmento.
 */
export function BloqueCodigo({
  codigo,
  lenguaje,
  titulo,
  onPreguntar,
}: {
  codigo: string;
  lenguaje: string;
  /** Nombre del archivo o del fragmento, en la barra superior. */
  titulo?: string;
  onPreguntar?: () => void;
}) {
  const { t } = useLanguage();
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;
    const vista = new EditorView({
      parent: contenedor,
      state: EditorState.create({
        doc: codigo,
        extensions: [
          basicSetup,
          lenguajePorExtension(`x.${EXTENSION[lenguaje.toLowerCase()] ?? "txt"}`),
          temaClaro,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
        ],
      }),
    });
    return () => vista.destroy();
  }, [codigo, lenguaje]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sin permiso de portapapeles: no hay nada útil que mostrar.
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-black/5 bg-surface-sunken px-3 py-1.5">
        <span className="truncate font-mono text-xs text-ink-muted">{titulo || lenguaje}</span>
        <div className="flex shrink-0 items-center gap-1">
          {onPreguntar && (
            <button
              type="button"
              onClick={onPreguntar}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-ink-muted transition hover:bg-brand-50 hover:text-brand-700"
            >
              <MessageCircleQuestion size={14} aria-hidden />
              {t.cursos.askAboutCode}
            </button>
          )}
          <button
            type="button"
            onClick={copiar}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-ink-muted transition hover:bg-brand-50 hover:text-brand-700"
          >
            {copiado ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copiado ? t.cursos.copied : t.cursos.copy}
          </button>
        </div>
      </div>
      <div ref={contenedorRef} className="max-h-[28rem] overflow-auto text-xs" />
    </div>
  );
}
