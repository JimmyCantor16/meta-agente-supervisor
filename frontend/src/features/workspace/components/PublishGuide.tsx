import { useState } from "react";
import { Card } from "../../../components/Card";
import { useLanguage } from "../../../i18n/LanguageProvider";
import type { ProjectSummary } from "../types";

/**
 * Guía del profesor: de tu computador al mundo. Tres clases guiadas:
 * 1) correr tu sistema en localhost SIN Docker, 2) subirlo a TU GitHub,
 * 3) publicarlo GRATIS en Render. Escrita para alguien que nunca programó:
 * cada comando se copia con un clic y cada paso dice su porqué.
 */
export function PublishGuide({ projects }: { projects: ProjectSummary[] }) {
  const { t } = useLanguage();
  const [proyecto, setProyecto] = useState(projects[0]?.name ?? "mi-proyecto");
  const [paso, setPaso] = useState<1 | 2 | 3>(1);

  const g = t.publish;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">🚀 {g.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">{g.intro}</p>
      </div>

      {/* Selector de proyecto: personaliza cada comando de la guía */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-slate-600" htmlFor="sel-proyecto">
          {g.forProject}
        </label>
        <select
          id="sel-proyecto"
          value={proyecto}
          onChange={(e) => setProyecto(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-brand-300 focus:outline-none"
        >
          {projects.length === 0 && <option value="mi-proyecto">mi-proyecto</option>}
          {projects.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Pasos */}
      <div className="flex flex-wrap gap-2">
        {[
          { n: 1 as const, label: g.step1Tab, icon: "💻" },
          { n: 2 as const, label: g.step2Tab, icon: "🐙" },
          { n: 3 as const, label: g.step3Tab, icon: "🌍" },
        ].map(({ n, label, icon }) => (
          <button
            key={n}
            onClick={() => setPaso(n)}
            className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              paso === n
                ? "bg-brand-600 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:border-brand-300"
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {paso === 1 && (
        <Card title={`💻 ${g.step1Title}`} icon={<span>1️⃣</span>}>
          <Leccion concepto={g.step1Why}>
            <Punto n="a" texto={g.step1a} />
            <Comando texto="node --version" nota={g.step1aNote} />
            <Punto n="b" texto={g.step1b(proyecto)} />
            <Comando texto={`cd ${g.projectsPath}\\${proyecto}\\backend`} />
            <Punto n="c" texto={g.step1c} />
            <Comando texto="npm install" nota={g.step1cNote} />
            <Punto n="d" texto={g.step1d} />
            <Comando texto="npm start" nota={g.step1dNote} />
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              🎉 {g.step1Done}
            </div>
          </Leccion>
        </Card>
      )}

      {paso === 2 && (
        <Card title={`🐙 ${g.step2Title}`} icon={<span>2️⃣</span>}>
          <Leccion concepto={g.step2Why}>
            <Punto n="a" texto={g.step2a} enlace={{ href: "https://github.com/signup", label: "github.com/signup" }} />
            <Punto n="b" texto={g.step2b} enlace={{ href: "https://github.com/new", label: "github.com/new" }} />
            <p className="ml-6 text-sm text-slate-500">{g.step2bNote(proyecto)}</p>
            <Punto n="c" texto={g.step2c} />
            <Comando texto={`cd ${g.projectsPath}\\${proyecto}`} />
            <Comando
              texto={`git init\ngit add .\ngit commit -m "Mi primer sistema con Meta-Agente"`}
              nota={g.step2cNote}
            />
            <Punto n="d" texto={g.step2d} />
            <Comando
              texto={`git remote add origin https://github.com/TU-USUARIO/${proyecto}.git\ngit branch -M main\ngit push -u origin main`}
              nota={g.step2dNote}
            />
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              🎉 {g.step2Done}
            </div>
          </Leccion>
        </Card>
      )}

      {paso === 3 && (
        <Card title={`🌍 ${g.step3Title}`} icon={<span>3️⃣</span>}>
          <Leccion concepto={g.step3Why}>
            <Punto n="a" texto={g.step3a} enlace={{ href: "https://render.com", label: "render.com" }} />
            <Punto n="b" texto={g.step3b} />
            <Punto n="c" texto={g.step3c} />
            <ul className="ml-6 list-disc space-y-1 text-sm text-slate-600">
              <li><b>Build command:</b> <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">cd backend && npm install</code></li>
              <li><b>Start command:</b> <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">cd backend && npm start</code></li>
              <li>{g.step3cFree}</li>
            </ul>
            <Punto n="d" texto={g.step3d} />
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              🌍 {g.step3Done}
            </div>
            <p className="mt-2 text-xs text-slate-400">{g.step3Note}</p>
          </Leccion>
        </Card>
      )}
    </div>
  );
}

function Leccion({ concepto, children }: { concepto: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm text-brand-900">
        🎓 {concepto}
      </p>
      {children}
    </div>
  );
}

function Punto({
  n,
  texto,
  enlace,
}: {
  n: string;
  texto: string;
  enlace?: { href: string; label: string };
}) {
  return (
    <p className="flex gap-2 text-sm text-slate-700">
      <span className="font-bold text-brand-600">{n})</span>
      <span>
        {texto}{" "}
        {enlace && (
          <a
            className="font-semibold text-brand-600 underline"
            href={enlace.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {enlace.label}
          </a>
        )}
      </span>
    </p>
  );
}

function Comando({ texto, nota }: { texto: string; nota?: string }) {
  const { t } = useLanguage();
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="ml-6">
      <div className="relative">
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(texto);
              setCopiado(true);
              window.setTimeout(() => setCopiado(false), 1800);
            } catch {
              setCopiado(false);
            }
          }}
          className="absolute right-2 top-2 rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
        >
          {copiado ? t.dashboard.copied : t.dashboard.copy}
        </button>
        <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 pr-20 font-mono text-xs leading-relaxed text-emerald-300">
          {texto}
        </pre>
      </div>
      {nota && <p className="mt-1 text-xs text-slate-400">{nota}</p>}
    </div>
  );
}
