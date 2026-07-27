import { useEffect, useRef, useState } from "react";

// Monitor EN VIVO del pipeline de generación: se conecta al mismo WebSocket de
// progreso del backend y traduce cada mensaje a un estado estructurado (fases,
// proveedores de IA usados/fallidos, métricas de acierto/fallo, log).

export type EstadoFase = "idle" | "run" | "ok" | "fail";
export interface Fase {
  id: string;
  nombre: string;
  icono: string;
  estado: EstadoFase;
  detalle?: string;
}
export interface ProvStat {
  nombre: string;
  ok: number;
  fail: number;
}
export type Resultado = "idle" | "generando" | "exito" | "retenido" | "fallo";
export interface LogLine {
  texto: string;
  ts: number;
  tipo: "info" | "ok" | "warn" | "fail" | "ia";
}

export interface MonitorState {
  conectado: boolean;
  fases: Fase[];
  proveedorActual: string | null;
  proveedores: ProvStat[];
  saltos: number;
  reparaciones: number;
  archivos: { hechos: number; total: number } | null;
  resultado: Resultado;
  url: string | null;
  inicio: number | null;
  fin: number | null;
  log: LogLine[];
}

const FASES_BASE: Fase[] = [
  { id: "plan", nombre: "Planificar", icono: "🧬", estado: "idle" },
  { id: "escribir", nombre: "Escribir código", icono: "✍️", estado: "idle" },
  { id: "instalar", nombre: "Instalar", icono: "📦", estado: "idle" },
  { id: "compilar", nombre: "Compilar", icono: "🏗️", estado: "idle" },
  { id: "verificar", nombre: "Verificar", icono: "🛡️", estado: "idle" },
  { id: "reparar", nombre: "Reparar", icono: "🩹", estado: "idle" },
  { id: "arrancar", nombre: "Arrancar", icono: "🚀", estado: "idle" },
];

function estadoInicial(): MonitorState {
  return {
    conectado: false,
    fases: FASES_BASE.map((f) => ({ ...f })),
    proveedorActual: null,
    proveedores: [],
    saltos: 0,
    reparaciones: 0,
    archivos: null,
    resultado: "idle",
    url: null,
    inicio: null,
    fin: null,
    log: [],
  };
}

function esEscritorio(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}
function wsUrl(): string {
  if (esEscritorio()) return "ws://localhost:8000/api/v1/ws/progreso";
  const host = window.location.host;
  // En Render el proxy del sitio estático NO reenvía WebSocket → directo al backend.
  if (host.endsWith(".onrender.com")) return "wss://metaagente-backend.onrender.com/api/v1/ws/progreso";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${host}/api/v1/ws/progreso`;
}

/** Aplica un mensaje del WS al estado (heurística por el contenido traducido). */
function aplicar(s: MonitorState, txt: string): MonitorState {
  const set = (id: string, estado: EstadoFase, detalle?: string) => {
    s.fases = s.fases.map((f) => (f.id === id ? { ...f, estado, detalle: detalle ?? f.detalle } : f));
  };
  const cerrarPrevias = (id: string) => {
    // Marca como OK las fases anteriores que quedaron en "run".
    const idx = s.fases.findIndex((f) => f.id === id);
    s.fases = s.fases.map((f, i) => (i < idx && f.estado === "run" ? { ...f, estado: "ok" } : f));
  };

  let tipo: LogLine["tipo"] = "info";

  // --- Arranque de la generación ---
  if (/Cerebro IA listo/i.test(txt)) {
    Object.assign(s, estadoInicial(), { conectado: true, log: s.log, resultado: "generando", inicio: Date.now() });
  }
  // --- Fases ---
  if (/arquetipo|Idea única|diseñando/i.test(txt)) {
    s.resultado = s.resultado === "idle" ? "generando" : s.resultado;
    if (!s.inicio) s.inicio = Date.now();
    set("plan", "ok");
  }
  const mPlan = txt.match(/Plano listo: (\d+)/i);
  if (mPlan) {
    set("plan", "ok");
    s.archivos = { hechos: 0, total: parseInt(mPlan[1], 10) };
  }
  const mEsc = txt.match(/Escribiendo (\d+) de (\d+)/i);
  if (mEsc) {
    cerrarPrevias("escribir");
    set("escribir", "run", `${mEsc[1]}/${mEsc[2]}`);
    s.archivos = { hechos: parseInt(mEsc[1], 10), total: parseInt(mEsc[2], 10) };
  }
  if (/Instalando/i.test(txt)) {
    cerrarPrevias("instalar");
    set("instalar", "run");
  }
  if (/Compilando/i.test(txt)) {
    cerrarPrevias("compilar");
    set("compilar", "run");
  }
  if (/Verificación superada/i.test(txt)) {
    cerrarPrevias("verificar");
    set("instalar", "ok");
    set("compilar", "ok");
    set("verificar", "ok");
    tipo = "ok";
  }
  const mFall = txt.match(/falló.*intento (\d+)/i);
  if (mFall) {
    set("verificar", "fail");
    set("reparar", "run", `intento ${mFall[1]}`);
    s.reparaciones = Math.max(s.reparaciones, parseInt(mFall[1], 10));
    tipo = "warn";
  }
  if (/Arreglo automático/i.test(txt)) {
    set("reparar", "run");
  }
  if (/VIVO en (http)/i.test(txt)) {
    const m = txt.match(/https?:\/\/\S+/);
    s.fases = s.fases.map((f) => (f.estado === "run" || f.estado === "idle" ? { ...f, estado: f.id === "arrancar" ? "ok" : f.estado } : f));
    set("verificar", "ok");
    set("arrancar", "ok");
    s.resultado = "exito";
    s.url = m ? m[0] : null;
    s.fin = Date.now();
    tipo = "ok";
  }
  if (/no pasó la inspección|no se entrega|RETENIDA/i.test(txt)) {
    set("arrancar", "fail");
    s.resultado = "retenido";
    s.fin = Date.now();
    tipo = "fail";
  }
  // --- Cerebro IA (proveedores) ---
  const mOk = txt.match(/IA «(.+?)» respondió/i);
  if (mOk) {
    s.proveedorActual = mOk[1];
    const p = s.proveedores.find((x) => x.nombre === mOk[1]);
    if (p) p.ok += 1;
    else s.proveedores = [...s.proveedores, { nombre: mOk[1], ok: 1, fail: 0 }];
    tipo = "ia";
  }
  const mFa = txt.match(/IA «(.+?)» (falló|sin respuesta|respuesta cortada|formato inválido)/i);
  if (mFa) {
    s.saltos += 1;
    const p = s.proveedores.find((x) => x.nombre === mFa[1]);
    if (p) p.fail += 1;
    else s.proveedores = [...s.proveedores, { nombre: mFa[1], ok: 0, fail: 1 }];
    tipo = "warn";
  }
  if (/Todos los proveedores de IA fallaron/i.test(txt)) {
    s.resultado = "fallo";
    s.fin = Date.now();
    tipo = "fail";
  }

  s.log = [{ texto: txt, ts: Date.now(), tipo }, ...s.log].slice(0, 120);
  return { ...s };
}

export function useMonitor(): MonitorState {
  const [estado, setEstado] = useState<MonitorState>(estadoInicial);
  const ref = useRef(estado);
  ref.current = estado;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cerrado = false;
    let retry = 0;
    const conectar = () => {
      try {
        ws = new WebSocket(wsUrl());
        ws.onopen = () => setEstado((s) => ({ ...s, conectado: true }));
        ws.onmessage = (e: MessageEvent) => {
          const txt = String(e.data || "");
          if (/^👋/.test(txt)) return; // saludo de bienvenida
          setEstado((s) => aplicar({ ...s, conectado: true }, txt));
        };
        ws.onclose = () => {
          setEstado((s) => ({ ...s, conectado: false }));
          if (!cerrado) retry = window.setTimeout(conectar, 4000);
        };
        ws.onerror = () => {
          try {
            ws?.close();
          } catch {
            /* noop */
          }
        };
      } catch {
        retry = window.setTimeout(conectar, 4000);
      }
    };
    conectar();
    return () => {
      cerrado = true;
      window.clearTimeout(retry);
      try {
        ws?.close();
      } catch {
        /* noop */
      }
    };
  }, []);

  return estado;
}
