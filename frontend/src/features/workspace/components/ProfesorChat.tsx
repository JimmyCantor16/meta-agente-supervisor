import { useEffect, useRef, useState } from "react";
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
        { rol: "profesor", texto: "😅 " + (err instanceof ApiError ? err.message : "Algo falló, reintenta.") },
      ]);
    } finally {
      setEnviando(false);
    }
  };

  if (cargando && !curso) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-500" />
          <p className="mt-4 text-sm text-slate-500">{g.preparando}</p>
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
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
        ⚠ {error}
      </div>
    );
  }
  if (!curso) return null;

  const clase = curso.clases.find((c) => c.numero === claseActiva);
  const completadas = new Set(curso.progreso.completadas);
  const maxAbierta = curso.progreso.clase_actual;

  return (
    <div className="space-y-4">
      {/* Cabecera del curso */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-emerald-500 p-5 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/80">🎓 {g.tuCurso}</p>
        <h1 className="mt-1 text-xl font-bold">{curso.titulo_curso}</h1>
        <p className="mt-1 text-sm text-white/90">{curso.resumen}</p>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs font-semibold">
            <span>{g.progreso}</span>
            <span>
              {completadas.size}/{curso.progreso.total_clases}
              {curso.progreso.graduado && " · 🏆 " + g.graduado}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${(completadas.size / curso.progreso.total_clases) * 100}%` }}
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
        <aside className="space-y-1.5">
          {curso.clases.map((c) => {
            const hecha = completadas.has(c.numero);
            const bloqueada = c.numero > maxAbierta;
            const activa = c.numero === claseActiva;
            return (
              <button
                key={c.numero}
                onClick={() => !bloqueada && cambiarClase(c.numero)}
                disabled={bloqueada}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  activa
                    ? "border-brand-400 bg-brand-50 font-semibold text-brand-800"
                    : bloqueada
                      ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                      : "border-slate-200 bg-white text-slate-600 hover:border-brand-200"
                }`}
              >
                <span className="text-base">
                  {hecha ? "✅" : bloqueada ? "🔒" : activa ? "📖" : "⭕"}
                </span>
                <span className="flex-1">
                  <span className="block text-xs text-slate-400">{g.clase} {c.numero}</span>
                  {c.titulo}
                </span>
              </button>
            );
          })}
        </aside>

        {/* Chat de la clase */}
        <section className="flex min-h-[60vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "60vh" }}>
            {mensajes.map((m, i) => (
              <Burbuja key={i} mensaje={m} />
            ))}
            {enviando && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "300ms" }} />
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
          <div className="flex gap-2 border-t border-slate-200 p-3">
            <input
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviar()}
              placeholder={g.preguntaAlProfe}
              disabled={enviando}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-300 focus:bg-white focus:outline-none"
            />
            <button
              onClick={() => void enviar()}
              disabled={enviando || !entrada.trim()}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {g.enviar}
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
    funciona: { borde: "border-emerald-200", fondo: "bg-emerald-50", texto: "text-emerald-800", icono: "✅", titulo: g.diagFunciona },
    parcial: { borde: "border-amber-200", fondo: "bg-amber-50", texto: "text-amber-800", icono: "⚠️", titulo: g.diagParcial },
    vacio: { borde: "border-red-200", fondo: "bg-red-50", texto: "text-red-800", icono: "🛑", titulo: g.diagVacio },
  }[d.estado];

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
    <div className={`rounded-2xl border ${estilo.borde} ${estilo.fondo} p-4`}>
      <div className="flex items-start gap-3">
        <span className="text-xl">{estilo.icono}</span>
        <div className="flex-1">
          <p className={`text-sm font-bold ${estilo.texto}`}>
            {g.diagTitulo}: {estilo.titulo}
          </p>
          <p className={`mt-1 text-sm ${estilo.texto}`}>{d.veredicto}</p>
          {d.lo_que_ve_el_usuario && (
            <p className="mt-1 text-xs text-slate-500">👤 {g.diagVeUsuario}: {d.lo_que_ve_el_usuario}</p>
          )}
          {d.problemas.length > 0 && (
            <ul className={`mt-2 list-disc space-y-0.5 pl-5 text-xs ${estilo.texto}`}>
              {d.problemas.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          {d.siguiente_paso && (
            <p className={`mt-2 text-sm font-semibold ${estilo.texto}`}>👉 {d.siguiente_paso}</p>
          )}
          {d.estado !== "funciona" && (
            <button
              onClick={() => void relanzar()}
              disabled={relanzando}
              className="mt-3 rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-900 disabled:opacity-50"
            >
              {relanzando ? g.relanzando2 : "🔁 " + g.relanzar}
            </button>
          )}
          {aviso && <p className="mt-2 whitespace-pre-wrap text-xs font-medium text-slate-600">{aviso}</p>}
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
      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
        👨‍🏫 {msg}
      </div>
    );
  }

  const rapidas: [string, string][] = [
    [g.nivelNunca, g.nivelNuncaFrase],
    [g.nivelAlgo, g.nivelAlgoFrase],
    [g.nivelBastante, g.nivelBastanteFrase],
  ];

  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-700">👋 {g.nivelTitulo}</p>
      <p className="mt-1 text-sm text-slate-500">{g.nivelIntro}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {rapidas.map(([label, frase]) => (
          <button
            key={label}
            onClick={() => void enviar(frase)}
            disabled={enviando}
            className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:border-brand-300 disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void enviar(texto)}
          placeholder={g.nivelPlaceholder}
          disabled={enviando}
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-brand-300 focus:bg-white focus:outline-none"
        />
        <button
          onClick={() => void enviar(texto)}
          disabled={enviando || !texto.trim()}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {enviando ? "…" : g.enviar}
        </button>
      </div>
    </div>
  );
}

function Burbuja({ mensaje }: { mensaje: MensajeChat }) {
  const esProfe = mensaje.rol === "profesor";
  return (
    <div className={`flex ${esProfe ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          esProfe
            ? "rounded-tl-sm border border-brand-100 bg-brand-50 text-slate-700"
            : "rounded-br-sm bg-brand-600 text-white"
        }`}
      >
        {esProfe && <span className="mb-0.5 block text-xs font-semibold text-brand-500">👨‍🏫 Profe</span>}
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
      <div className="border-t border-emerald-200 bg-emerald-50 px-4 py-2.5 text-center text-sm font-semibold text-emerald-700">
        ✅ {g.claseSuperada}
        <button onClick={() => setAbierto(true)} className="ml-2 text-xs font-medium text-emerald-600 underline">
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
        className="flex w-full items-center justify-between border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
      >
        <span>🎯 {g.listoSuperar}</span>
        <span className="text-xs font-medium text-brand-600">{g.abrirReto} ▾</span>
      </button>
    );
  }

  return (
    <div className="border-t border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-slate-700">🎯 {g.paraAvanzar}: <span className="font-normal">{criterio.descripcion}</span></p>
        <button onClick={() => setExpandido(false)} className="shrink-0 text-xs font-medium text-slate-400 hover:text-slate-600">
          {g.ocultar} ▴
        </button>
      </div>

      {/* Clase que exige tocar código: el aula es el sitio donde se hace, así
          que se le dice qué archivo y qué debería ver, y se le lleva allí. */}
      {esCambio && onIrAlAula && (
        <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50/70 p-3">
          <p className="text-sm font-bold text-brand-800">🛠️ {g.tocaCodigo}</p>
          {criterio.archivo && (
            <p className="mt-1 font-mono text-xs text-brand-700">{criterio.archivo}</p>
          )}
          {criterio.resultado_esperado && (
            <p className="mt-1.5 text-xs leading-snug text-slate-600">
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
            className="mt-2.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-700"
          >
            {g.irAlAula} →
          </button>
        </div>
      )}

      {esQuiz && (
        <div className="space-y-3">
          {criterio.quiz.map((q, qi) => (
            <div key={qi}>
              <p className="mb-1 text-sm font-medium text-slate-700">{qi + 1}. {q.pregunta}</p>
              <div className="flex flex-col gap-1.5">
                {q.opciones.map((op, oi) => (
                  <label
                    key={oi}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
                      respuestas[qi] === oi
                        ? "border-brand-400 bg-brand-50 text-brand-800"
                        : "border-slate-200 bg-white text-slate-600 hover:border-brand-200"
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
          <p className={`text-xs font-semibold ${quizCompleto ? "text-emerald-600" : "text-slate-400"}`}>
            {quizCompleto ? "✓ " : ""}
            {g.marcadas} {quizRespondidas}/{criterio.quiz.length}
          </p>
        </div>
      )}

      {(esTexto || esUrl || esRepo) && (
        <div>
          {esUrl && <p className="mb-1 text-xs text-slate-500">{g.pegaUrl}</p>}
          {esRepo && <p className="mb-1 text-xs text-slate-500">{g.pegaRepo}</p>}
          {esUrl || esRepo ? (
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={esUrl ? "https://mi-pagina.netlify.app" : "https://github.com/tu-usuario/tu-proyecto"}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-brand-300 focus:outline-none"
            />
          ) : (
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={g.tuRespuesta}
              rows={2}
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-brand-300 focus:outline-none"
            />
          )}
          {criterio.pista && <p className="mt-1 text-xs text-slate-400">💡 {criterio.pista}</p>}
        </div>
      )}

      <button
        onClick={() => void revisar()}
        disabled={verificando || !puedeRevisar}
        title={!puedeRevisar && esQuiz ? g.completaQuiz : undefined}
        className="mt-3 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {verificando ? g.revisando : "🧪 " + g.revisame}
      </button>
      {!puedeRevisar && esQuiz && (
        <p className="mt-1.5 text-xs text-slate-400">🔒 {g.completaQuiz}</p>
      )}

      {resultado && (
        <p
          className={`mt-3 whitespace-pre-wrap rounded-xl p-3 text-sm font-semibold ${
            resultado.ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {resultado.ok ? "🎉 " : "🔍 "}
          {resultado.msg}
        </p>
      )}
    </div>
  );
}
