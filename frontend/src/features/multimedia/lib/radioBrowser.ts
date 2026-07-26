// Cliente REST de Radio Browser (comunidad, GRATIS, sin API key). Robusto: NO
// depende de un solo servidor — prueba varias réplicas en cascada hasta que una
// responda, y recuerda la que funcionó. Timeout real por petición (AbortController).
//
// Nota web: el navegador no permite fijar User-Agent, pero Radio Browser responde
// con CORS habilitado sin él.

import type { StreamItem } from "../types";

// Endpoint que lista los servidores Radio Browser VIVOS ahora mismo (DNS
// round-robin). Es lo recomendado: las réplicas individuales van y vienen.
const SERVERS_URL = "https://all.api.radio-browser.info/json/servers";
// Fallbacks fijos por si el listado de servidores falla.
const FALLBACK_BASES = ["https://de1.api.radio-browser.info", "https://de2.api.radio-browser.info"];
const TIMEOUT = 9000;

let goodBase: string | null = null;
let liveBases: string[] | null = null;

/** Resuelve (y cachea) los servidores vivos. Si falla, devuelve los fallbacks. */
async function resolveLiveBases(): Promise<string[]> {
  if (liveBases) return liveBases;
  try {
    const data = await fetchJson(SERVERS_URL);
    if (Array.isArray(data)) {
      const names = data
        .map((s) => (s && typeof s === "object" ? String((s as any).name || "").trim() : ""))
        .filter(Boolean);
      const uniq = Array.from(new Set(names)).map((n) => `https://${n}`);
      if (uniq.length) {
        liveBases = uniq;
        return liveBases;
      }
    }
  } catch {
    /* usamos fallbacks */
  }
  liveBases = [...FALLBACK_BASES];
  return liveBases;
}

/** Réplicas ordenadas: la que ya funcionó primero, luego vivas, luego fallbacks. */
function orderedBases(live: string[]): string[] {
  const all = [...(goodBase ? [goodBase] : []), ...live, ...FALLBACK_BASES];
  return Array.from(new Set(all));
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Convierte el JSON de estaciones de Radio Browser en `StreamItem`s. */
function parseStations(list: unknown): StreamItem[] {
  if (!Array.isArray(list)) return [];
  const items: StreamItem[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const url = (str(r.url_resolved) || str(r.url)).trim();
    const name = str(r.name).trim();
    if (!url || !name) continue;
    const tags = str(r.tags).trim();
    const country = str(r.country).trim();
    const bitrate = Number(r.bitrate) || 0;
    const favicon = str(r.favicon).trim();
    const subtitle = [tags, country, bitrate > 0 ? `${bitrate} kbps` : ""]
      .filter(Boolean)
      .join("  ·  ");
    items.push({
      title: name,
      subtitle,
      url,
      artwork: favicon || undefined,
      kind: "radio",
    });
  }
  return items;
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const id = window.setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return await res.json();
  } finally {
    window.clearTimeout(id);
  }
}

/** Prueba el `path` en cada réplica viva hasta que una responda; cachea la buena. */
async function getStations(path: string): Promise<StreamItem[]> {
  const live = await resolveLiveBases();
  let lastErr: unknown = null;
  for (const base of orderedBases(live)) {
    try {
      const data = await fetchJson(base + path);
      goodBase = base; // recordar la que funcionó
      return parseStations(data);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("radio unreachable");
}

/** Emisoras más populares (al abrir Radio). Si se pasa `countryCode` (ISO-2), filtra. */
export function topRadio(countryCode?: string): Promise<StreamItem[]> {
  const cc = countryCode?.trim();
  if (cc) {
    const q = "limit=80&hidebroken=true&order=clickcount&reverse=true";
    return getStations(`/json/stations/bycountrycodeexact/${cc}?${q}`);
  }
  return getStations("/json/stations/topclick/80");
}

/** Busca emisoras por nombre/etiqueta, ordenadas por popularidad. */
export function searchRadio(query: string): Promise<StreamItem[]> {
  const q = query.trim();
  if (!q) return Promise.resolve([]);
  const params = new URLSearchParams({
    name: q,
    limit: "80",
    hidebroken: "true",
    order: "clickcount",
    reverse: "true",
  });
  return getStations(`/json/stations/search?${params}`);
}

/** Países frecuentes (ISO-2 → etiqueta) para el filtro rápido de radio. */
export const RADIO_COUNTRIES: Array<{ code: string; label: string }> = [
  { code: "", label: "🌍" },
  { code: "CO", label: "🇨🇴 CO" },
  { code: "MX", label: "🇲🇽 MX" },
  { code: "ES", label: "🇪🇸 ES" },
  { code: "AR", label: "🇦🇷 AR" },
  { code: "US", label: "🇺🇸 US" },
];
