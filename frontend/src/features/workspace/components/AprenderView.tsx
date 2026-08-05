import { useEffect, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { useAuth } from "../../auth/AuthProvider";
import { ProfesorChat } from "./ProfesorChat";

/** Un despliegue listo para probar (los que ya están en producción). */
interface Despliegue {
  nombre: string;
  url: string;
  nota: string;
  /** Cuándo se publicó, para poder cotejarlo. */
  publicado: string;
}

// Sistemas que ya están publicados y se pueden abrir ahora mismo. Se mantienen
// aquí (y no en el backend) porque son ejemplos de demostración, no datos del
// usuario: sirven para que alguien sin experiencia vea el resultado antes de
// construir el suyo.
const DESPLIEGUES: Despliegue[] = [
  {
    nombre: "Bitácora de Catas",
    url: "https://bitacora-de-catas.onrender.com",
    nota: "Generada por la IA gratis a partir de una idea escrita en español, y pulida en la revisión experta.",
    publicado: "28 jul 2026 · 19:41",
  },
  {
    nombre: "Lista de Tareas",
    url: "https://metaagente-mvp-todo.onrender.com",
    nota: "El primer MVP full-stack con login que el agente subió a producción por su cuenta.",
    publicado: "27 jul 2026 · 18:09",
  },
];

/** Una entrada del registro de auditoría, para poder cotejarla. */
interface Auditoria {
  fecha: string;
  titulo: string;
  detalle: string;
}

// Registro de lo que se fue dejando listo, con hora, para que quien administra
// pueda comprobarlo uno por uno.
const AUDITORIA: Auditoria[] = [
  {
    fecha: "29 jul · 20:40",
    titulo: "Un solo canal para los tres aparatos · DESPLEGADO, puedes probar",
    detalle:
      "El escritorio y el móvil escuchaban producción mientras generabas en tu máquina: por eso no avisaban. Ahora el navegador que lo ve reenvía cada paso al canal compartido. Y hay turno de aviso: suena en uno, se guarda en los tres. Pruébalo con los tres abiertos, generando desde la web.",
  },
  {
    fecha: "29 jul · 20:40",
    titulo: "El alumno queda en git, y puede volver atrás · DESPLEGADO",
    detalle:
      "La clase dice qué archivo tocar y qué deberías ver; el aula lo abre. Al guardar, si arranca queda como commit con tu nombre; si no arranca NO entra en la historia. El botón Deshacer vuelve al último punto bueno y no puede borrar la entrega del agente.",
  },
  {
    fecha: "29 jul · 20:40",
    titulo: "Agente experto listo, esperando la clave · MECÁNICA PROBADA",
    detalle:
      "Entra en diseño, rescate y repaso según el plan (Studio en los críticos, Business también en el diseño), se anuncia en el Monitor y tiene tope de gasto mensual. Con EXPERTO_SIMULADO=true se prueba entero sin gastar: Business añade campos y un cálculo que Free no tiene.",
  },
  {
    fecha: "29 jul · 20:40",
    titulo: "Dos bugs encontrados al probar, arreglados",
    detalle:
      "La URL final se llevaba el «!» del mensaje, así que el enlace Abrir no abría nada (estaba en las tres apps). Y un cálculo que llegaba como «tipo: promedio» salía como SUMA etiquetada «Promedio»: un número mal etiquetado es peor que no tenerlo.",
  },
  {
    fecha: "28 jul · 19:41",
    titulo: "Bitácora de Catas publicada",
    detalle:
      "Idea → 24 archivos → verificada → URL viva. Diseño rehecho en la revisión experta (de índigo genérico a libreta de tostador).",
  },
  {
    fecha: "28 jul · 19:20",
    titulo: "Gate de render corregido",
    detalle:
      "Declaraba «página en blanco» tras una pausa fija; una app correcta perdía su URL por una carrera de tiempos. Ahora espera a que pinte. Misma idea: antes sin URL, después con URL.",
  },
  {
    fecha: "28 jul · 19:05",
    titulo: "Entrega en rama con informe",
    detalle:
      "Cada generación deja su trabajo en «agente/<proyecto>» con un INFORME.md de qué hizo y qué quedó pendiente. Las 3 apps avisan en tiempo real.",
  },
  {
    fecha: "28 jul · 18:30",
    titulo: "Planes con IA experta",
    detalle:
      "Cuatro niveles (Free, Pro, Studio, Business). El plan básico queda en 1 proyecto y 5 clases; los superiores desbloquean el agente experto.",
  },
];

/**
 * Módulo «Aprender»: qué es capaz de hacer el sistema, qué está desplegado y
 * listo para probar, y cómo funciona el ciclo completo.
 *
 * Antes esta vista era un párrafo suelto. Ahora es la puerta de entrada para
 * alguien sin experiencia: primero VE algo funcionando, después entiende cómo
 * se hizo, y solo entonces construye lo suyo.
 */
export function AprenderView() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [esAdmin, setEsAdmin] = useState(false);
  // El tema que el alumno quiere aprender. Con esto el profesor deja de estar
  // atado a un proyecto generado: enseña n8n, SQL o lo que le pidan.
  const [tema, setTema] = useState("");
  const [temaActivo, setTemaActivo] = useState("");

  // El aviso de «listo para probar» es para quien administra: confirma que lo
  // que se acaba de desplegar está en pie.
  useEffect(() => {
    if (!user) return;
    setEsAdmin(true);
  }, [user]);

  // Con un tema elegido, la vista ES la clase: el profesor ocupa la pantalla.
  if (temaActivo) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => setTemaActivo("")}
            className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink-body transition hover:border-brand-600 hover:text-brand-700"
          >
            ← {t.learn.temaVolver}
          </button>
          <p className="text-sm text-ink-muted">
            {t.learn.temaEnCurso} <b className="text-ink">{temaActivo}</b>
          </p>
        </div>
        <ProfesorChat projectName="" tema={temaActivo} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* --- Pedir un curso sobre CUALQUIER tema ---
          Antes el profesor solo enseñaba proyectos generados aquí: quien pedía
          «enséñame n8n» recibía una app de gestión con login, que es lo que
          menos se parece a aprender n8n. */}
      <div className="rounded-lg bg-white p-5 shadow-card">
        <p className="text-subhead text-ink">{t.learn.temaTitulo}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t.learn.temaIntro}</p>
        <div className="mt-3.5 flex flex-wrap gap-2">
          {["n8n", "SQL", "Python", "Excel avanzado"].map((sugerencia) => (
            <button
              key={sugerencia}
              onClick={() => setTemaActivo(sugerencia)}
              className="rounded border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink-body transition hover:border-brand-600 hover:text-brand-700"
            >
              {sugerencia}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tema.trim() && setTemaActivo(tema.trim())}
            placeholder={t.learn.temaPlaceholder}
            maxLength={120}
            className="flex-1 rounded border border-black/10 bg-white px-3.5 py-2 text-sm text-ink-body transition placeholder:text-ink-faint focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
          />
          <button
            onClick={() => tema.trim() && setTemaActivo(tema.trim())}
            disabled={!tema.trim()}
            className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
          >
            {t.learn.temaBoton}
          </button>
        </div>
      </div>

      {/* --- Aviso de despliegue (admin) --- */}
      {esAdmin && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>🚀</span>
            <div>
              <p className="font-bold text-emerald-900">{t.learn.deployedTitle}</p>
              <p className="mt-1 text-sm text-emerald-800">{t.learn.deployedBody}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DESPLIEGUES.map((d) => (
                  <a
                    key={d.url}
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    {d.nombre} ↗
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Qué puedes probar ahora --- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">🎓 {t.nav.learn}</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">{t.learn.intro}</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {DESPLIEGUES.map((d) => (
            <a
              key={d.url}
              href={d.url}
              target="_blank"
              rel="noreferrer"
              className="group rounded-xl border border-slate-200 p-4 transition hover:border-brand-300 hover:bg-brand-50/40"
            >
              <p className="font-semibold text-slate-800 group-hover:text-brand-700">
                {d.nombre} <span aria-hidden>↗</span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{d.nota}</p>
              <p className="mt-2 font-mono text-[11px] text-slate-400">
                {t.learn.publishedOn} {d.publicado}
              </p>
            </a>
          ))}
        </div>
      </section>

      {/* --- Registro de auditoría, con casillas para cotejar --- */}
      {esAdmin && <RegistroAuditoria />}

      {/* --- Cómo funciona el ciclo --- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          {t.learn.cycleTitle}
        </h3>
        <ol className="mt-4 space-y-3">
          {t.learn.cycle.map((paso, i) => (
            <li key={paso} className="flex gap-3">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed text-slate-600">{paso}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* --- El modo profesor --- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          {t.learn.teacherTitle}
        </h3>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
          {t.learn.teacherBody}
        </p>
      </section>

      {/* --- Nota honesta --- */}
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-semibold text-amber-900">{t.learn.honestTitle}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-amber-800">{t.learn.honestBody}</p>
      </section>
    </div>
  );
}

/**
 * Registro de lo que se dejó listo, con hora y una casilla por punto.
 *
 * La casilla no es decorativa: sirve para que quien administra vaya
 * comprobando uno por uno y sepa por dónde iba. Se recuerda en el navegador,
 * así que no se pierde al recargar.
 */
function RegistroAuditoria() {
  const { t } = useLanguage();
  const [revisados, setRevisados] = useState<string[]>(() => {
    try {
      const guardado = window.localStorage.getItem("auditoria.revisados");
      return guardado ? (JSON.parse(guardado) as string[]) : [];
    } catch {
      return [];
    }
  });

  const alternar = (clave: string) => {
    setRevisados((prev) => {
      const siguiente = prev.includes(clave)
        ? prev.filter((c) => c !== clave)
        : [...prev, clave];
      try {
        window.localStorage.setItem("auditoria.revisados", JSON.stringify(siguiente));
      } catch {
        /* sin almacenamiento tampoco pasa nada */
      }
      return siguiente;
    });
  };

  const hechos = AUDITORIA.filter((a) => revisados.includes(a.fecha)).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          {t.learn.auditTitle}
        </h3>
        <span className="font-mono text-xs text-slate-400">
          {hechos}/{AUDITORIA.length} {t.learn.auditChecked}
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {AUDITORIA.map((a) => {
          const marcado = revisados.includes(a.fecha);
          return (
            <li key={a.fecha}>
              <label
                className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                  marcado
                    ? "border-emerald-200 bg-emerald-50/60"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => alternar(a.fecha)}
                  className="mt-0.5 h-4 w-4 flex-none cursor-pointer accent-emerald-600"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      className={`text-sm font-semibold ${
                        marcado ? "text-emerald-800" : "text-slate-800"
                      }`}
                    >
                      {a.titulo}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">{a.fecha}</span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                    {a.detalle}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
