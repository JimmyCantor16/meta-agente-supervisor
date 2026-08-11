import { useState } from "react";
import { Button } from "../../../components/Button";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { useAuth } from "../../auth/AuthProvider";

interface PromptInputProps {
  /** Se dispara al enviar; recibe el texto del prompt. */
  onSubmit: (prompt: string) => void;
  /** Indica que hay una evaluación en curso (bloquea el envío). */
  loading: boolean;
  /** Modo profesor activo. */
  teacherMode: boolean;
  /** Alterna el modo profesor. */
  onTeacherToggle: () => void;
  /** Texto inicial (lo siembran los chips de ejemplo; remontar con `key`). */
  initialValue?: string;
}

const MIN_LENGTH = 10;

/**
 * Caja de entrada estilo Skywork: textarea amplia + fila de controles
 * (toggle Modo Profesor y botón de evaluar). Tema claro.
 */
export function PromptInput({
  onSubmit,
  loading,
  teacherMode,
  onTeacherToggle,
  initialValue = "",
}: PromptInputProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [value, setValue] = useState(initialValue);

  const trimmed = value.trim();
  // Sin sesión NO se puede empezar: evita el "error inesperado" de intentar
  // generar/evaluar sin estar autenticado.
  const necesitaSesion = !user;
  const isValid = trimmed.length >= MIN_LENGTH && !necesitaSesion;

  const handleSubmit = () => {
    if (isValid && !loading) onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm ring-1 ring-black/10">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={4}
        placeholder={t.promptInput.placeholder}
        className="w-full resize-y rounded-xl border-0 bg-transparent px-2 py-1 text-[15px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none focus:ring-0"
      />

      <div className="mt-3 flex flex-col gap-3 border-t border-black/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Toggle Modo Profesor */}
        <button
          type="button"
          onClick={onTeacherToggle}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            teacherMode
              ? "border-brand-200 bg-brand-50 text-brand-700"
              : "border-black/10 bg-white text-ink-muted hover:bg-surface-muted"
          }`}
          title={teacherMode ? t.promptInput.teacherOn : t.promptInput.teacherOff}
        >
          <span aria-hidden>🎓</span>
          {t.promptInput.teacherMode}
          <span className={`h-2 w-2 rounded-full ${teacherMode ? "bg-brand-500" : "bg-slate-300"}`} />
        </button>

        <div className="flex items-center gap-3">
          <span className={`text-xs ${necesitaSesion ? "font-medium text-brand-600" : "hidden text-ink-faint sm:block"}`}>
            {necesitaSesion
              ? `🔐 ${t.promptInput.loginRequired}`
              : isValid
                ? "Ctrl + Enter"
                : t.promptInput.minChars(trimmed.length, MIN_LENGTH)}
          </span>
          <Button onClick={handleSubmit} loading={loading} disabled={!isValid}>
            {loading ? t.promptInput.submitting : t.promptInput.submit}
          </Button>
        </div>
      </div>
    </div>
  );
}
