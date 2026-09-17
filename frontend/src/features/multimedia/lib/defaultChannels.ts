import type { CustomChannel } from "../types";

/**
 * Canales de TV precargados — SOLO los que reproducen de verdad (2026-09-16):
 * cada uno se abrió en Chrome con hls.js y avanzó >8 s decodificando vídeo y
 * audio, con fotograma real (no pantalla negra ni aviso de región). Todos los
 * https:// sirven también en producción (CORS abierto); los http:// solo en
 * local, porque en HTTPS el navegador los bloquea por mixed-content.
 *
 * Se priorizan canales FAST con catálogo grande (Zylo, Canal 13, RCN, ENT,
 * Rakuten) para que no repitan siempre las mismas películas.
 *
 * Pluto TV (Comedy Central en español, Paramount, MTV…) NO sirve en la web: su
 * API y su stitcher solo dan CORS a pluto.tv, y aunque se reenvíe la lista por
 * el backend, su CDN responde 403 a cualquier navegador que no venga de
 * pluto.tv. Es un bloqueo deliberado; no vale la pena volver a intentarlo.
 *
 * Nota: la app no distribuye canales propios; restaura/valida la lista personal.
 */
export const DEFAULT_CHANNELS: CustomChannel[] = [
  // --- 🎬 Películas y series ---
  { name: "Star Channel (FOX)", url: "http://bantel-cdn1.iptvperu.tv:1935/btnscrtn/StarChannel.stream/playlist.m3u8", category: "Cine y series" },
  { name: "ENT Channel", url: "https://cdn.global.elektamedia.com/live/c7eds/ENT_Channel/SA_LIVE_hls_enc/master.m3u8", category: "Cine y series" },
  { name: "BBC Drama", url: "https://amg00793-amg00793c40-rakuten-es-5444.playouts.now.amagi.tv/playlist.m3u8", category: "Cine y series" },
  { name: "MyTime Cine", url: "https://appletree-mytimespain-rakuten.amagi.tv/playlist.m3u8", category: "Cine y series" },
  { name: "Zylo Cine Friki", url: "https://d2mr4fu91mjx9m.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-rb0tx75ojbc5u/CineFriki_ES.m3u8", category: "Cine y series" },
  { name: "Zylo Cine Western", url: "https://d2nq34q0i1r3la.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-awohw8g217ho8/CineWestern_ES.m3u8", category: "Cine y series" },
  { name: "CINDIE TV (cine independiente)", url: "https://cc-hqw8u5r1nshjc.akamaized.net/scheduler/scheduleMaster/352.m3u8", category: "Cine y series" },
  { name: "Mega Cine TV", url: "https://cnn.hostlagarto.com/megacinetv/playlist.m3u8", category: "Cine y series" },
  { name: "Xtrema Cine Clásico", url: "https://stmv6.voxtvhd.com.br/cineclasico/cineclasico/playlist.m3u8", category: "Cine y series" },
  { name: "Xtrema Terror", url: "https://stmv6.voxtvhd.com.br/cineterror/cineterror/playlist.m3u8", category: "Cine y series" },
  // --- 📺 Novelas y entretenimiento ---
  { name: "13 Teleseries", url: "https://origin.dpsgo.com/ssai/event/f4TrySe8SoiGF8Lu3EIq1g/master.m3u8", category: "Novelas y entretenimiento" },
  { name: "13 Realities", url: "https://origin.dpsgo.com/ssai/event/g7_JOM0ORki9SR5RKHe-Kw/master.m3u8", category: "Novelas y entretenimiento" },
  { name: "RCN Novelas", url: "https://cdnlive.klicgo.net/rcnnovelas/live/playlist.m3u8", category: "Novelas y entretenimiento" },
  { name: "RCN Más", url: "https://rcntv-rcnmas-1-us.plex.wurl.tv/playlist.m3u8", category: "Novelas y entretenimiento" },
  { name: "Zylo Todo Novelas", url: "https://dtsszjrztq9ti.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-yshah5p4v45g1/ToDoNovelas_ES.m3u8", category: "Novelas y entretenimiento" },
  { name: "Estrella TV", url: "https://estrellatv-oando.amagi.tv/playlist.m3u8", category: "Novelas y entretenimiento" },
  { name: "TVS Retro (series clásicas)", url: "https://cdn.streamhispanatv.net:3531/live/tvsretrogtlive.m3u8", category: "Novelas y entretenimiento" },
  { name: "Historia HD", url: "https://d1k3vzh2ivy22k.cloudfront.net/Historia1080.m3u8", category: "Novelas y entretenimiento" },
  // --- 👨‍👩‍👧 Familia y dibujos ---
  { name: "ENT Family", url: "https://cdn.global.elektamedia.com/live/c7eds/ENT_Family/SA_LIVE_hls_enc/master.m3u8", category: "Familia y dibujos" },
  { name: "13 Kids", url: "https://origin.dpsgo.com/ssai/event/LhHrVtyeQkKZ-Ye_xEU75g/master.m3u8", category: "Familia y dibujos" },
  { name: "Mr. Bean Animado", url: "https://amg00627-amg00627c30-rakuten-es-3990.playouts.now.amagi.tv/playlist/amg00627-banijayfast-mrbeanescc-rakutenes/playlist.m3u8", category: "Familia y dibujos" },
  { name: "Xtrema Cartoons (clásicos)", url: "https://stmv6.voxtvhd.com.br/xtremacartoons/xtremacartoons/playlist.m3u8", category: "Familia y dibujos" },
  // --- 🌸 Anime ---
  { name: "MAX Anime", url: "https://cdnlive.klicgo.net/maxanime/live/playlist.m3u8", category: "Anime" },
  { name: "EnerGeek Anime", url: "https://backend.energeek.cl/webtv/egfanweb/index.m3u8?token=ZZDemoIPTVGH", category: "Anime" },
];

/**
 * TODAS las URLs que la app ha sembrado alguna vez (las caídas y las vigentes).
 * La migración las usa para distinguir lo sembrado de lo que el usuario agregó
 * a mano: al retirar un canal de DEFAULT_CHANNELS, su URL ya está aquí y se
 * quita del navegador sin tocar los canales propios del usuario.
 */
export const LEGACY_SEEDED_URLS: string[] = [
  "https://rtvelivestream.rtve.es/rtvesec/la1/la1_main_dvr.m3u8",
  "https://rtvelivestream.rtve.es/rtvesec/la2/la2_main_dvr.m3u8",
  "https://rtvelivestream.akamaized.net/rtvesec/24h/24h_main_dvr_720.m3u8",
  "http://138.121.15.230:9002/CARACOL/index.m3u8",
  "http://138.121.15.230:9002/RCN/index.m3u8",
  "http://138.121.15.230:9002/WIN-SPORT/index.m3u8",
  "http://181.119.93.83:8000/play/a0hf/index.m3u8",
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
  "https://cdn.global.elektamedia.com/live/c7eds/ENT_Channel/SA_LIVE_hls_enc/master.m3u8",
  "https://amg00793-amg00793c40-rakuten-es-5444.playouts.now.amagi.tv/playlist.m3u8",
  "https://appletree-mytimespain-rakuten.amagi.tv/playlist.m3u8",
  "https://d2nq34q0i1r3la.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-awohw8g217ho8/CineWestern_ES.m3u8",
  "https://cc-hqw8u5r1nshjc.akamaized.net/scheduler/scheduleMaster/352.m3u8",
  "https://origin.dpsgo.com/ssai/event/f4TrySe8SoiGF8Lu3EIq1g/master.m3u8",
  "https://origin.dpsgo.com/ssai/event/g7_JOM0ORki9SR5RKHe-Kw/master.m3u8",
  "https://cdnlive.klicgo.net/rcnnovelas/live/playlist.m3u8",
  "https://rcntv-rcnmas-1-us.plex.wurl.tv/playlist.m3u8",
  "https://dtsszjrztq9ti.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-yshah5p4v45g1/ToDoNovelas_ES.m3u8",
  "https://estrellatv-oando.amagi.tv/playlist.m3u8",
  "https://cdn.streamhispanatv.net:3531/live/tvsretrogtlive.m3u8",
  "https://d1k3vzh2ivy22k.cloudfront.net/Historia1080.m3u8",
  "https://cdn.global.elektamedia.com/live/c7eds/ENT_Family/SA_LIVE_hls_enc/master.m3u8",
  "https://origin.dpsgo.com/ssai/event/LhHrVtyeQkKZ-Ye_xEU75g/master.m3u8",
  "https://amg00627-amg00627c30-rakuten-es-3990.playouts.now.amagi.tv/playlist/amg00627-banijayfast-mrbeanescc-rakutenes/playlist.m3u8",
];
