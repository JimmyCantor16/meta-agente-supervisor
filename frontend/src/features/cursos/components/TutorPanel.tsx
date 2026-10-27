import { useState } from "react";
import { Bot, LoaderCircle, Paperclip, Send, User, X } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { useAuth } from "../../auth/AuthProvider";
import { ApiError, preguntarTutorCatalogo } from "../../../lib/api";
import type { RespuestaTutor } from "../types";
import { BloqueCodigo } from "./BloqueCodigo";
import { Markdown } from "./Markdown";

export interface CodigoAdjunto {
  codigo: string;
  lenguaje: string;
  titulo: string;
}

interface Turno {
  pregunta: string;
  adjunto: string;
  respuesta: RespuestaTutor;
}

/**
 * El tutor IA dentro de la lección. La conversación vive en esta sesión (no se
 * guarda): es para resolver la duda del momento, con la lección como contexto.
 * Un fragmento de código de la lección puede adjuntarse para preguntar por él.
 */
export function TutorPanel({
  cursoId,
  leccionId,
  adjunto,
  onQuitarAdjunto,
}: {
  cursoId: string;
  leccionId: string;
  adjunto: CodigoAdjunto | null;
  onQuitarAdjunto: () => void;
}) {
  const { t } = useLanguage();
  const g = t.cursos;
  const { user } = useAuth();
  const [pregunta, setPregunta] = useState("");
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async () => {
    const texto = pregunta.trim();
    if (!texto || pensando) return;
    setPensando(true);
    setError(null);
    try {
      const respuesta = await preguntarTutorCatalogo(cursoId, leccionId, texto, adjunto?.codigo ?? "");
      setTurnos((prev) => [...prev, { pregunta: texto, adjunto: adjunto?.titulo ?? "", respuesta }]);
      setPregunta("");
      onQuitarAdjunto();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : g.tutorError);
    } finally {
      setPensando(false);
    }
  };

  return (
    <section id="tutor-curso" className="space-y-4 rounded-lg border border-black/10 bg-surface-sunken p-5">
      <header>
        <h3 className="flex items-center gap-2 text-subhead text-ink">
          <Bot size={18} className="text-brand-600" aria-hidden /> {g.tutorTitle}
        </h3>
        <p className="mt-1 text-xs text-ink-muted">{g.tutorHint}</p>
      </header>

      {turnos.map((turno, i) => (
        <div key={i} className="space-y-2">
          <p className="flex items-start gap-2 text-sm text-ink">
            <User size={16} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden />
            <span>
              {turno.pregunta}
              {turno.adjunto && <span className="ml-1 text-xs text-ink-faint">· {turno.adjunto}</span>}
            </span>
          </p>
          <div className="ml-6 space-y-3 rounded-lg bg-white p-4 shadow-sm">
            <Markdown texto={turno.respuesta.respuesta} />
            {turno.respuesta.codigo && (
              <BloqueCodigo codigo={turno.respuesta.codigo} lenguaje={turno.respuesta.lenguaje || "text"} />
            )}
            {turno.respuesta.siguiente_paso && (
              <p className="text-xs text-brand-800">
                <b>{g.nextStep}:</b> {turno.respuesta.siguiente_paso}
              </p>
            )}
          </div>
        </div>
      ))}

      {error && <p className="text-sm text-red-700">{error}</p>}

      {adjunto && (
        <p className="flex items-center gap-2 text-xs text-ink-body">
          <Paperclip size={14} aria-hidden /> {g.attached(adjunto.titulo)}
          <button onClick={onQuitarAdjunto} aria-label={g.removeAttachment} className="text-ink-faint hover:text-ink">
            <X size={14} />
          </button>
        </p>
      )}

      {user ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder={g.tutorPlaceholder}
            className="min-w-0 flex-1 resize-y rounded border border-black/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={pensando || !pregunta.trim()}
            className="flex h-10 items-center gap-2 rounded bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pensando ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Send size={16} aria-hidden />}
            <span className="hidden sm:inline">{pensando ? g.thinking : g.ask}</span>
          </button>
        </form>
      ) : (
        <p className="text-xs text-ink-muted">{g.loginForTutor}</p>
      )}
    </section>
  );
}
