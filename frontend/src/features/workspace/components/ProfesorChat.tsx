import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleCheckBig,
  FlaskConical,
  GraduationCap,
  Lightbulb,
  LoaderCircle,
  Lock,
  OctagonX,
  RotateCw,
  Search,
  Send,
  Target,
  TriangleAlert,
  Trophy,
  User,
  UserRound,
  Wrench,
} from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import {
  ApiError,
  abrirClase,
  chatProfesor,
  diagnosticarMVP,
  estimarNivel,
  existeCurso,
  iniciarCurso,
  relanzarMVP,
  verificarClase,
} from "../../../lib/api";
import type { ClaseCurso, CursoResult, DiagnosticoMVP, MensajeChat, MisionClase } from "../types";

/**
 * El módulo profesor como CURSO INTERACTIVO por chat.
 *
 * Tras el MVP, el silencio se acaba: el profesor abre un curso sobre EL
 * proyecto del alumno, clase por clase, y no lo deja avanzar hasta comprobar
 * que aprendió (quiz sobre su código, un cambio, su repo o su URL vivos). Es
 * lo que ningún chatbot gratis hace: enseña TU sistema y revisa TU tarea.
 *
 * Visualmente sigue el sistema de diseño de `tailwind.config.js`: un solo
 * color de marca, cero gradientes, radios de 6-8px, sombras teñidas e iconos
 * vectoriales monocromos (nunca emojis como iconografía).
 */
export function ProfesorChat({
  projectName,
  onIrAlAula,
}: {
  projectName: string;
  /** Lleva al alumno al aula con el archivo de la clase ya abierto. */
  onIrAlAula?: (m: MisionClase) => void;
}) {
  const { t, lang } = useLanguage();
  const g = t.curso;

  const [curso, setCurso] = useState<CursoResult | null>(null);
  const [claseActiva, setClaseActiva] = useState(1);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [entrada, setEntrada] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoMVP | null>(null);
  // Si el curso aún no existe, primero medimos el nivel para adaptar el temario.
  const [nivelPrimero, setNivelPrimero] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  const abrirCurso = async (c: CursoResult) => {
    setCurso(c);
    const inicial = c.progreso.clase_actual;
    setClaseActiva(inicial);
    await cargarClase(c.progreso.curso_id, inicial);
  };

  // Al montar: si el curso ya existe, lo abre; si no, mide el nivel primero
  // para que el temario nazca adaptado (a un principiante no se le exige git/URL).
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const info = await existeCurso(projectName);
        if (!vivo) return;
        if (info.existe) {
          const c = await iniciarCurso(projectName, "", lang);
          if (vivo) await abrirCurso(c);
        } else {
          setNivelPrimero(true);
        }
      } catch (err) {
        if (vivo) setError(err instanceof ApiError ? err.message : "No se pudo abrir el curso.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName]);

  // Tras nivelar a un curso nuevo: se genera el temario con ese nivel.
  const generarConNivel = async (nivel: "bajo" | "medio" | "alto") => {
    setCargando(true);
    try {
      const c = await iniciarCurso(projectName, "", lang, nivel);
      await abrirCurso(c);
      setNivelPrimero(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el curso.");
    } finally {
      setCargando(false);
    }
  };

  // El profesor RETOMA el proyecto y diagnostica, honesto, si el MVP sirve.
  // No bloquea el curso: corre en paralelo y aparece como aviso arriba.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = await diagnosticarMVP(projectName, "", lang);
        if (vivo) setDiagnostico(d);
      } catch {
        // Si el diagnóstico falla no rompe el curso; simplemente no se muestra.
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  const cargarClase = async (cursoId: string, numero: number) => {
    const { mensajes } = await abrirClase(cursoId, numero);
    setMensajes(mensajes);
  };

  const cambiarClase = async (numero: number) => {
    if (!curso || numero === claseActiva) return;
    setClaseActiva(numero);
    setMensajes([]);
    setCargando(true);
    try {
      await cargarClase(curso.progreso.curso_id, numero);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo abrir la clase.");
    } finally {
      setCargando(false);
    }
  };

  const enviar = async () => {
    if (!curso || !entrada.trim() || enviando) return;
    const texto = entrada.trim();
    setEntrada("");
    setMensajes((m) => [...m, { rol: "alumno", texto }]);
    setEnviando(true);
    try {
      const { mensajes } = await chatProfesor(curso.progreso.curso_id, claseActiva, texto, lang);
      setMensajes((m) => [...m, ...mensajes]);
    } catch (err) {
      setMensajes((m) => [
        ...m,
        { rol: "profesor", texto: err instanceof ApiError ? err.message : "Algo falló, reintenta." },
      ]);
    } finally {
      setEnviando(false);
    }
  };

  if (cargando && !curso) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-brand-600" strokeWidth={2} />
          <p className="mt-4 text-sm text-ink-muted">{g.preparando}</p>
        </div>
      </div>
    );
  }

  // Curso nuevo: primero el profesor te conoce, y con eso arma un temario a tu
  // medida (a un principiante no le pone pruebas técnicas duras de entrada).
  if (nivelPrimero && !curso) {
    return <NivelacionPanel cursoId="" onNivel={(nivel) => void generarConNivel(nivel)} />;
  }

  if (error && !curso) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <TriangleAlert className="mt-px h-4 w-4 shrink-0" strokeWidth={2} />
        <span>{error}</span>
      </div>
    );
  }
  if (!curso) return null;

  const clase = curso.clases.find((c) => c.numero === claseActiva);
  const completadas = new Set(curso.progreso.completadas);
  const maxAbierta = curso.progreso.clase_actual;
  const pct = (completadas.size / curso.progreso.total_clases) * 100;

  return (
    <div className="space-y-4">
      {/* Cabecera del curso: fondo plano, sin gradiente. */}
      <div className="rounded-lg bg-ink p-6 text-white">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/60">
          <GraduationCap className="h-3.5 w-3.5" strokeWidth={2.2} />
          {g.tuCurso}
        </p>
        <h1 className="mt-2 text-heading text-white">{curso.titulo_curso}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/70">{curso.resumen}</p>
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
            <span className="text-white/60">{g.progreso}</span>
            <span className="flex items-center gap-1.5 tabular-nums text-white/90">
              {completadas.size}/{curso.progreso.total_clases}
              {curso.progreso.graduado && (
                <span className="flex items-center gap-1 text-accent">
                  <Trophy className="h-3.5 w-3.5" strokeWidth={2.2} />
                  {g.graduado}
                </span>
              )}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-sm bg-white/15">
            <div
              className="h-full rounded-sm bg-accent transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Diagnóstico honesto del MVP: ¿esto que entregamos SE VE y SIRVE? */}
      {diagnostico && (
        <DiagnosticoBanner
          d={diagnostico}
          projectName={projectName}
          onRelanzado={(nuevo) => setDiagnostico(nuevo)}
        />
      )}

      {/* Nivelación: el profesor mide el nivel para adaptar el curso. */}
      {curso.progreso.nivel === "desconocido" && (
        <NivelacionPanel
          cursoId={curso.progreso.curso_id}
          onNivel={(nivel) =>
            setCurso((c) => (c ? { ...c, progreso: { ...c.progreso, nivel } } : c))
          }
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        {/* Panel de clases */}
        <aside className="space-y-1">
          {curso.clases.map((c) => {
            const hecha = completadas.has(c.numero);
            const bloqueada = c.numero > maxAbierta;
            const activa = c.numero === claseActiva;
            const Icono = hecha ? CircleCheckBig : bloqueada ? Lock : activa ? BookOpen : Circle;
            return (
              <button
                key={c.numero}
                onClick={() => !bloqueada && cambiarClase(c.numero)}
                disabled={bloqueada}
                className={`flex w-full items-start gap-2.5 rounded px-3 py-2.5 text-left text-sm transition ${
                  activa
                    ? "bg-brand-50 font-semibold text-brand-800 shadow-[inset_2px_0_0_0_#027E6F]"
                    : bloqueada
                      ? "cursor-not-allowed text-ink-faint/60"
                      : "text-ink-body hover:bg-surface-muted"
                }`}
              >
                <Icono
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    hecha ? "text-brand-600" : activa ? "text-brand-700" : "text-ink-faint"
                  }`}
                  strokeWidth={2}
                />
                <span className="flex-1 leading-snug">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                    {g.clase} {c.numero}
                  </span>
                  {c.titulo}
                </span>
              </button>
            );
          })}
        </aside>

        {/* Chat de la clase */}
        <section className="flex min-h-[60vh] flex-col overflow-hidden rounded-lg bg-white shadow-card">
          <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ maxHeight: "60vh" }}>
            {mensajes.map((m, i) => (
              <Burbuja key={i} mensaje={m} />
            ))}
            {enviando && (
              <div className="flex items-center gap-2.5 text-sm text-ink-faint">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-brand-50">
                  <GraduationCap className="h-4 w-4 text-brand-600" strokeWidth={2} />
                </span>
                <span className="flex gap-1">
                  <span className="h-1 w-1 animate-bounce rounded-sm bg-ink-faint" style={{ animationDelay: "0ms" }} />
                  <span className="h-1 w-1 animate-bounce rounded-sm bg-ink-faint" style={{ animationDelay: "150ms" }} />
                  <span className="h-1 w-1 animate-bounce rounded-sm bg-ink-faint" style={{ animationDelay: "300ms" }} />
                </span>
                {g.profeEscribiendo}
              </div>
            )}
            <div ref={finRef} />
          </div>

          {/* Panel de superación de la clase */}
          {clase && (
            <SuperarClase
              curso={curso}
              clase={clase}
              onIrAlAula={onIrAlAula}
              yaHecha={completadas.has(clase.numero)}
              onSuperada={(actualizado) => {
                setCurso(actualizado);
                setMensajes((m) => [...m]);
                // recarga historial (incluye el mensaje de cierre del profe)
                void cargarClase(actualizado.progreso.curso_id, clase.numero);
              }}
            />
          )}

          {/* Entrada del chat */}
          <div className="flex gap-2 border-t border-black/[0.07] p-3">
            <input
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviar()}
              placeholder={g.preguntaAlProfe}
              disabled={enviando}
              className="flex-1 rounded border border-black/10 bg-white px-3.5 py-2.5 text-sm text-ink-body transition placeholder:text-ink-faint focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
            />
            <button
              onClick={() => void enviar()}
              disabled={enviando || !entrada.trim()}
              aria-label={g.enviar}
              className="inline-flex items-center gap-1.5 rounded bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
            >
              {g.enviar}
              <Send className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

/** El veredicto honesto del profesor sobre el MVP entregado, con opción de relanzar. */
function DiagnosticoBanner({
  d,
  projectName,
  onRelanzado,
}: {
  d: DiagnosticoMVP;
  projectName: string;
  onRelanzado: (nuevo: DiagnosticoMVP) => void;
}) {
  const { t, lang } = useLanguage();
  const g = t.curso;
  const [relanzando, setRelanzando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const estilo = {
    funciona: { borde: "border-brand-200", fondo: "bg-brand-50", texto: "text-brand-800", icono: CircleCheckBig, tinte: "text-brand-600", titulo: g.diagFunciona },
    parcial: { borde: "border-amber-200", fondo: "bg-amber-50", texto: "text-amber-900", icono: TriangleAlert, tinte: "text-amber-600", titulo: g.diagParcial },
    vacio: { borde: "border-red-200", fondo: "bg-red-50", texto: "text-red-900", icono: OctagonX, tinte: "text-red-600", titulo: g.diagVacio },
  }[d.estado];
  const Icono = estilo.icono;

  const relanzar = async () => {
    setRelanzando(true);
    setAviso(null);
    try {
      const r = await relanzarMVP(projectName, lang);
      onRelanzado(r.diagnostico);
      setAviso(r.url ? `${g.relanzarListo} ${r.url}` : g.relanzarListoSinUrl);
    } catch (err) {
      setAviso(err instanceof ApiError ? err.message : g.relanzarError);
    } finally {
      setRelanzando(false);
    }
  };

  return (
    <div className={`rounded-lg border ${estilo.borde} ${estilo.fondo} p-4`}>
      <div className="flex items-start gap-3">
        <Icono className={`mt-0.5 h-5 w-5 shrink-0 ${estilo.tinte}`} strokeWidth={2} />
        <div className="flex-1">
          <p className={`text-sm font-semibold ${estilo.texto}`}>
            {g.diagTitulo}: {estilo.titulo}
          </p>
          <p className={`mt-1 text-sm leading-relaxed ${estilo.texto}`}>{d.veredicto}</p>
          {d.lo_que_ve_el_usuario && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-ink-muted">
              <User className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span>{g.diagVeUsuario}: {d.lo_que_ve_el_usuario}</span>
            </p>
          )}
          {d.problemas.length > 0 && (
            <ul className={`mt-2 list-disc space-y-0.5 pl-5 text-xs ${estilo.texto}`}>
              {d.problemas.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          {d.siguiente_paso && (
            <p className={`mt-2.5 flex items-start gap-1.5 text-sm font-semibold ${estilo.texto}`}>
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
              <span>{d.siguiente_paso}</span>
            </p>
          )}
          {d.estado !== "funciona" && (
            <button
              onClick={() => void relanzar()}
              disabled={relanzando}
              className="mt-3 inline-flex items-center gap-1.5 rounded bg-ink px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-ink-body disabled:opacity-50"
            >
              <RotateCw className={`h-3.5 w-3.5 ${relanzando ? "animate-spin" : ""}`} strokeWidth={2.2} />
              {relanzando ? g.relanzando2 : g.relanzar}
            </button>
          )}
          {aviso && <p className="mt-2 whitespace-pre-wrap text-xs font-medium text-ink-muted">{aviso}</p>}
        </div>
      </div>
    </div>
  );
}

/** Fase 1: el profesor mide el nivel del alumno para adaptar el curso. */
function NivelacionPanel({
  cursoId,
  onNivel,
}: {
  cursoId: string;
  onNivel: (nivel: "bajo" | "medio" | "alto") => void;
}) {
  const { t, lang } = useLanguage();
  const g = t.curso;
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const enviar = async (respuesta: string) => {
    if (enviando || !respuesta.trim()) return;
    setEnviando(true);
    try {
      const r = await estimarNivel(cursoId, respuesta, lang);
      setMsg(r.mensaje);
      setTimeout(() => onNivel(r.nivel as "bajo" | "medio" | "alto"), 1600);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "No pude registrar tu nivel.");
      setEnviando(false);
    }
  };

  if (msg) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
        <GraduationCap className="mt-px h-4 w-4 shrink-0 text-brand-600" strokeWidth={2} />
        <span>{msg}</span>
      </div>
    );
  }

  const rapidas: [string, string][] = [
    [g.nivelNunca, g.nivelNuncaFrase],
    [g.nivelAlgo, g.nivelAlgoFrase],
    [g.nivelBastante, g.nivelBastanteFrase],
  ];

  return (
    <div className="rounded-lg bg-white p-5 shadow-card">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <UserRound className="h-4 w-4 text-brand-600" strokeWidth={2} />
        {g.nivelTitulo}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{g.nivelIntro}</p>
      <div className="mt-3.5 flex flex-wrap gap-2">
        {rapidas.map(([label, frase]) => (
          <button
            key={label}
            onClick={() => void enviar(frase)}
            disabled={enviando}
            className="rounded border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink-body transition hover:border-brand-600 hover:text-brand-700 disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3.5 flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void enviar(texto)}
          placeholder={g.nivelPlaceholder}
          disabled={enviando}
          className="flex-1 rounded border border-black/10 bg-white px-3.5 py-2 text-sm text-ink-body transition placeholder:text-ink-faint focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
        />
        <button
          onClick={() => void enviar(texto)}
          disabled={enviando || !texto.trim()}
          className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          {enviando ? "…" : g.enviar}
        </button>
      </div>
    </div>
  );
}

function Burbuja({ mensaje }: { mensaje: MensajeChat }) {
  const esProfe = mensaje.rol === "profesor";

  if (esProfe) {
    return (
      <div className="flex gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-brand-50">
          <GraduationCap className="h-4 w-4 text-brand-600" strokeWidth={2} />
        </span>
        {/* 66ch es la medida legible clásica: a 85% de ancho la línea se iba a
            ~140 caracteres y el ojo pierde el renglón al volver. */}
        <div className="max-w-[66ch] whitespace-pre-wrap rounded-lg rounded-tl-sm bg-surface-muted px-4 py-2.5 text-sm leading-relaxed text-ink-body">
          {mensaje.texto}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div className="max-w-[66ch] whitespace-pre-wrap rounded-lg rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm leading-relaxed text-white">
        {mensaje.texto}
      </div>
    </div>
  );
}

/** El panel que cambia según CÓMO se supera la clase (quiz/reflexión/url/repo). */
function SuperarClase({
  curso,
  clase,
  yaHecha,
  onSuperada,
  onIrAlAula,
}: {
  curso: CursoResult;
  clase: ClaseCurso;
  yaHecha: boolean;
  onSuperada: (c: CursoResult) => void;
  onIrAlAula?: (m: MisionClase) => void;
}) {
  const { t, lang } = useLanguage();
  const g = t.curso;
  const [abierto, setAbierto] = useState(false);
  // El panel de superar la clase va PLEGADO: el chat es lo principal. El alumno
  // lo abre cuando se sienta listo, sin sentir un examen encima todo el tiempo.
  const [expandido, setExpandido] = useState(false);
  const [respuestas, setRespuestas] = useState<Record<number, number>>({});
  const [texto, setTexto] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);

  const criterio = clase.criterio;
  const esQuiz = criterio.tipo === "quiz" && criterio.quiz.length > 0;
  const esCambio = criterio.tipo === "cambio";
  const esTexto = ["reflexion", "cambio"].includes(criterio.tipo);
  const esUrl = criterio.tipo === "url_publicada";
  const esRepo = criterio.tipo === "repo_git";

  // El botón "Ya lo hice, revísame" solo se activa cuando el examen está
  // completo: en un quiz, con las 3 respuestas marcadas; si no, con texto.
  const quizRespondidas = criterio.quiz.filter((_, i) => respuestas[i] !== undefined).length;
  const quizCompleto = criterio.quiz.length > 0 && quizRespondidas === criterio.quiz.length;
  const puedeRevisar = esQuiz ? quizCompleto : texto.trim().length > 0;

  const revisar = async () => {
    setVerificando(true);
    setResultado(null);
    try {
      const quizArr = esQuiz ? criterio.quiz.map((_, i) => respuestas[i] ?? -1) : [];
      const r = await verificarClase(curso.progreso.curso_id, clase.numero, quizArr, texto.trim(), lang);
      setResultado({ ok: r.superada, msg: r.mensaje });
      if (r.superada) {
        // Refleja el avance en el progreso local sin recargar todo.
        const nuevoProg = { ...curso.progreso };
        if (!nuevoProg.completadas.includes(clase.numero)) nuevoProg.completadas.push(clase.numero);
        if (r.graduado) nuevoProg.graduado = true;
        else if (r.avanzo) nuevoProg.clase_actual = clase.numero + 1;
        onSuperada({ ...curso, progreso: nuevoProg });
      }
    } catch (err) {
      setResultado({ ok: false, msg: err instanceof ApiError ? err.message : "No se pudo revisar." });
    } finally {
      setVerificando(false);
    }
  };

  if (yaHecha && !abierto) {
    return (
      <div className="flex items-center justify-center gap-2 border-t border-brand-100 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-800">
        <CircleCheckBig className="h-4 w-4 text-brand-600" strokeWidth={2} />
        {g.claseSuperada}
        <button onClick={() => setAbierto(true)} className="text-xs font-medium text-brand-700 underline">
          {g.repasar}
        </button>
      </div>
    );
  }

  // Plegado por defecto: el chat manda; el reto está a un clic cuando quiera.
  if (!expandido) {
    return (
      <button
        onClick={() => setExpandido(true)}
        className="flex w-full items-center justify-between border-t border-black/[0.07] bg-surface-sunken px-4 py-3 text-sm font-semibold text-ink-body transition hover:bg-surface-muted"
      >
        <span className="flex items-center gap-2">
          <Target className="h-4 w-4 text-brand-600" strokeWidth={2} />
          {g.listoSuperar}
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-brand-700">
          {g.abrirReto}
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.2} />
        </span>
      </button>
    );
  }

  return (
    <div className="border-t border-black/[0.07] bg-surface-muted p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="flex items-start gap-2 text-sm font-semibold text-ink">
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2} />
          <span>
            {g.paraAvanzar}: <span className="font-normal text-ink-body">{criterio.descripcion}</span>
          </span>
        </p>
        <button
          onClick={() => setExpandido(false)}
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-ink-faint transition hover:text-ink-body"
        >
          {g.ocultar}
          <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.2} />
        </button>
      </div>

      {/* Clase que exige tocar código: el aula es el sitio donde se hace, así
          que se le dice qué archivo y qué debería ver, y se le lleva allí. */}
      {esCambio && onIrAlAula && (
        <div className="mb-3 rounded border border-brand-200 bg-brand-50 p-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-800">
            <Wrench className="h-4 w-4 text-brand-600" strokeWidth={2} />
            {g.tocaCodigo}
          </p>
          {criterio.archivo && (
            <p className="mt-1.5 font-mono text-xs text-brand-700">{criterio.archivo}</p>
          )}
          {criterio.resultado_esperado && (
            <p className="mt-1.5 text-xs leading-snug text-ink-muted">
              <span className="font-semibold">{g.deberiasVer}:</span> {criterio.resultado_esperado}
            </p>
          )}
          <button
            onClick={() =>
              onIrAlAula({
                numero: clase.numero,
                titulo: clase.titulo,
                archivo: criterio.archivo,
                resultadoEsperado: criterio.resultado_esperado,
                pista: criterio.pista,
              })
            }
            className="mt-3 inline-flex items-center gap-1.5 rounded bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
          >
            {g.irAlAula}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
          </button>
        </div>
      )}

      {esQuiz && (
        // Las opciones son frases cortas: a todo el ancho quedaban perdidas en
        // un renglón de 1000px con el texto pegado al borde izquierdo.
        <div className="max-w-2xl space-y-3.5">
          {criterio.quiz.map((q, qi) => (
            <div key={qi}>
              <p className="mb-1.5 text-sm font-medium text-ink">{qi + 1}. {q.pregunta}</p>
              <div className="flex flex-col gap-1.5">
                {q.opciones.map((op, oi) => (
                  <label
                    key={oi}
                    className={`flex cursor-pointer items-center gap-2.5 rounded border px-3 py-2 text-sm transition ${
                      respuestas[qi] === oi
                        ? "border-brand-600 bg-brand-50 text-brand-800"
                        : "border-black/10 bg-white text-ink-body hover:border-brand-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${clase.numero}-${qi}`}
                      checked={respuestas[qi] === oi}
                      onChange={() => setRespuestas((r) => ({ ...r, [qi]: oi }))}
                      className="accent-brand-600"
                    />
                    {op}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <p
            className={`flex items-center gap-1 text-xs font-semibold ${
              quizCompleto ? "text-brand-700" : "text-ink-faint"
            }`}
          >
            {quizCompleto && <Check className="h-3.5 w-3.5" strokeWidth={2.4} />}
            {g.marcadas} {quizRespondidas}/{criterio.quiz.length}
          </p>
        </div>
      )}

      {(esTexto || esUrl || esRepo) && (
        <div className="max-w-2xl">
          {esUrl && <p className="mb-1.5 text-xs text-ink-muted">{g.pegaUrl}</p>}
          {esRepo && <p className="mb-1.5 text-xs text-ink-muted">{g.pegaRepo}</p>}
          {esUrl || esRepo ? (
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={esUrl ? "https://mi-pagina.netlify.app" : "https://github.com/tu-usuario/tu-proyecto"}
              className="w-full rounded border border-black/10 bg-white px-3.5 py-2.5 text-sm text-ink-body transition placeholder:text-ink-faint focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
            />
          ) : (
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={g.tuRespuesta}
              rows={2}
              className="w-full resize-y rounded border border-black/10 bg-white px-3.5 py-2.5 text-sm text-ink-body transition placeholder:text-ink-faint focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
            />
          )}
          {criterio.pista && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-ink-faint">
              <Lightbulb className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span>{criterio.pista}</span>
            </p>
          )}
        </div>
      )}

      <button
        onClick={() => void revisar()}
        disabled={verificando || !puedeRevisar}
        title={!puedeRevisar && esQuiz ? g.completaQuiz : undefined}
        className="mt-4 inline-flex items-center gap-1.5 rounded bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {verificando ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
        ) : (
          <FlaskConical className="h-3.5 w-3.5" strokeWidth={2.2} />
        )}
        {verificando ? g.revisando : g.revisame}
      </button>
      {!puedeRevisar && esQuiz && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-faint">
          <Lock className="h-3.5 w-3.5" strokeWidth={2} />
          {g.completaQuiz}
        </p>
      )}

      {resultado && (
        <div
          className={`mt-3 flex items-start gap-2.5 rounded p-3.5 text-sm font-medium ${
            resultado.ok ? "bg-brand-50 text-brand-800" : "bg-amber-50 text-amber-900"
          }`}
        >
          {resultado.ok ? (
            <CircleCheckBig className="mt-px h-4 w-4 shrink-0 text-brand-600" strokeWidth={2} />
          ) : (
            <Search className="mt-px h-4 w-4 shrink-0 text-amber-600" strokeWidth={2} />
          )}
          <span className="whitespace-pre-wrap">{resultado.msg}</span>
        </div>
      )}
    </div>
  );
}
