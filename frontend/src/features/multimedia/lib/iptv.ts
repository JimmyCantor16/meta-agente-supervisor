// Carga y parsea listas IPTV públicas de iptv-org (mantenidas por la comunidad,
// CORS habilitado). Sirve para traer "todos los canales de Colombia" sin que la
// app distribuya URLs propias: se leen en vivo del proyecto abierto iptv-org.

import type { StreamItem } from "../types";

/** Playlists de país (ISO-2) en iptv-org. */
const COUNTRY_URL = (cc: string) =>
  `https://iptv-org.github.io/iptv/countries/${cc.toLowerCase()}.m3u`;

/**
 * Parsea un M3U extendido en `StreamItem`s de TV. Formato típico:
 *   #EXTINF:-1 tvg-logo="..." group-title="Noticias",Caracol TV
 *   https://.../stream.m3u8
 */
export function parseM3U(text: string): StreamItem[] {
  const lines = text.split(/\r?\n/);
  const items: StreamItem[] = [];
  let pending: { title: string; logo?: string; group?: string } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("#EXTINF")) {
      const comma = line.indexOf(",");
      const title = comma >= 0 ? line.slice(comma + 1).trim() : "Canal";
      const logo = /tvg-logo="([^"]*)"/i.exec(line)?.[1];
      const group = /group-title="([^"]*)"/i.exec(line)?.[1];
      pending = { title: title || "Canal", logo: logo || undefined, group: group || undefined };
    } else if (line && !line.startsWith("#")) {
      if (pending && /^https?:\/\//i.test(line)) {
        items.push({
          title: pending.title,
          subtitle: pending.group || "IPTV",
          url: line,
          artwork: pending.logo,
          kind: "tv",
        });
      }
      pending = null;
    }
  }
  return items;
}

/** Descarga y parsea todos los canales de un país (por defecto Colombia). */
export async function loadCountryIptv(cc = "co"): Promise<StreamItem[]> {
  const res = await fetch(COUNTRY_URL(cc));
  if (!res.ok) throw new Error(`iptv ${res.status}`);
  const items = parseM3U(await res.text());
  // Dedup por URL y orden alfabético por título.
  const seen = new Set<string>();
  const uniq = items.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
  uniq.sort((a, b) => a.title.localeCompare(b.title, "es"));
  return uniq;
}
