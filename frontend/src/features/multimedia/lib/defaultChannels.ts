import type { CustomChannel } from "../types";

/**
 * Canales de TV precargados — SOLO los verificados que reproducen (2026-07-26),
 * curados de la lista de DKEditor del usuario. Enfocados en lo que pidió:
 * películas, anime y dibujos clásicos. Se siembran/migran en el navegador; si el
 * usuario borra alguno, no reaparece.
 *
 * Nota: la app no distribuye canales propios; restaura/valida la lista personal.
 */
export const DEFAULT_CHANNELS: CustomChannel[] = [
  // --- 🎬 Películas y series ---
  { name: "FOX / Star Channel", url: "http://bantel-cdn1.iptvperu.tv:1935/btnscrtn/StarChannel.stream/playlist.m3u8", category: "Cine y series" },
  { name: "Mega Cine TV", url: "https://cnn.hostlagarto.com/megacinetv/playlist.m3u8", category: "Cine y series" },
  { name: "Xtrema Cine Clásico", url: "https://stmv6.voxtvhd.com.br/cineclasico/cineclasico/playlist.m3u8", category: "Cine y series" },
  { name: "Xtrema Terror", url: "https://stmv6.voxtvhd.com.br/cineterror/cineterror/playlist.m3u8", category: "Cine y series" },
  { name: "Comedy Central", url: "http://181.119.93.83:8000/play/a1di/index.m3u8", category: "Cine y series" },
  // --- 🌸 Anime ---
  { name: "MAX Anime", url: "https://cdnlive.klicgo.net/maxanime/live/playlist.m3u8", category: "Anime" },
  { name: "EnerGeek Anime", url: "https://backend.energeek.cl/webtv/egfanweb/index.m3u8?token=ZZDemoIPTVGH", category: "Anime" },
  // --- 📺 Dibujos clásicos (muñecos) ---
  { name: "Xtrema Cartoons (clásicos)", url: "https://stmv6.voxtvhd.com.br/xtremacartoons/xtremacartoons/playlist.m3u8", category: "Dibujos clásicos" },
];

/**
 * URLs que la app sembró en versiones ANTERIORES (algunas ya caídas: Caracol/RCN
 * por IP muerta, RTVE con geobloqueo, Rakuten sin señal). Se usan en la migración
 * para retirarlas SIN borrar los canales que el usuario haya agregado a mano.
 */
export const LEGACY_SEEDED_URLS: string[] = [
  "https://rtvelivestream.rtve.es/rtvesec/la1/la1_main_dvr.m3u8",
  "https://rtvelivestream.rtve.es/rtvesec/la2/la2_main_dvr.m3u8",
  "https://rtvelivestream.akamaized.net/rtvesec/24h/24h_main_dvr_720.m3u8",
  "http://138.121.15.230:9002/CARACOL/index.m3u8",
  "http://138.121.15.230:9002/RCN/index.m3u8",
  "http://138.121.15.230:9002/WIN-SPORT/index.m3u8",
  "http://181.119.93.83:8000/play/a0hf/index.m3u8", // ESPN
  "https://dc1644a9jazgj.cloudfront.net/beIN_Sports_Xtra_Espanol.m3u8",
  "https://6c849fb3.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/TEctbXhfRklGQVBsdXNTcGFuaXNoLTFfSExT/playlist.m3u8",
  "https://amg26268-amg26268c14-freelivesports-emea-10267.playouts.now.amagi.tv/ts-us-e2-n2/playlist/amg26268-sportsstudio-tycsports-freelivesportsemea/playlist.m3u8",
  "https://886bd3fbc782459f8de7555d32d7e9ce.mediatailor.us-west-2.amazonaws.com/v1/master/ba62fe743df0fe93366eba3a257d792884136c7f/LINEAR-957-WORBLATAMESFAST-WHALETVPLUS/957/whaletvplus/hls/master/playlist.m3u8",
  "https://ff335120300e4742a2b135ee9a9e7df8.mediatailor.eu-west-1.amazonaws.com/v1/master/0547f18649bd788bec7b67b746e47670f558b6b2/production-LiveChannel-5983/master.m3u8",
  "https://a9c57ec7ec5e4b7daeacc6316a0bb404.mediatailor.eu-west-1.amazonaws.com/v1/master/0547f18649bd788bec7b67b746e47670f558b6b2/production-LiveChannel-6069/master.m3u8",
  "https://71db867f03ce4d71a29e92155f07ab87.mediatailor.eu-west-1.amazonaws.com/v1/master/0547f18649bd788bec7b67b746e47670f558b6b2/production-LiveChannel-6180/master.m3u8",
  "https://stmv6.voxtvhd.com.br/cineclasico/cineclasico/playlist.m3u8",
  "https://stmv6.voxtvhd.com.br/cineterror/cineterror/playlist.m3u8",
  "https://cnn.hostlagarto.com/megacinetv/playlist.m3u8",
  "https://d2mr4fu91mjx9m.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-rb0tx75ojbc5u/CineFriki_ES.m3u8",
  "https://stmv6.voxtvhd.com.br/xtremacartoons/xtremacartoons/playlist.m3u8",
  "https://cdnlive.klicgo.net/maxanime/live/playlist.m3u8",
  "https://backend.energeek.cl/webtv/egfanweb/index.m3u8?token=ZZDemoIPTVGH",
  "http://bantel-cdn1.iptvperu.tv:1935/btnscrtn/StarChannel.stream/playlist.m3u8",
  "http://181.119.93.83:8000/play/a1di/index.m3u8",
];
