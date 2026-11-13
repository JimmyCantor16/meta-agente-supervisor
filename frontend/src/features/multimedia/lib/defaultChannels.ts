import type { CustomChannel } from "../types";

/**
 * Canales de TV precargados — SOLO fuentes OFICIALES que reproducen de verdad.
 *
 * Revisión del 2026-11-13 (CHANNELS_VER 6). Cada canal se abrió en Chrome REAL
 * (Playwright sobre el Chrome instalado, no el Chromium sin códecs) con hls.js,
 * desde una página servida en el ORIGEN DE PRODUCCIÓN, y avanzó >6 s
 * decodificando fotogramas de verdad (totalVideoFrames > 0). Ojo al repetir la
 * prueba: los ENT comparten CDN y en paralelo dan `fragLoadTimeOut`; probados
 * de uno en uno, todos van. Los http:// solo servirían en local (mixed-content
 * en HTTPS) y ya no queda ninguno.
 *
 * REGLA LEGAL (el cliente monetiza esto): solo canales FAST que distribuye su
 * dueño o un agregador con licencia (Amagi/Wurl/Rakuten, Zylo, Canal 13, las
 * señales ENT de 40media Group), señales públicas del propio canal y directos
 * del canal VERIFICADO de YouTube. Nada de restreams de terceros (listas
 * iptv-org con IPs sueltas, "bantel/iptvperu") ni de proxies para saltarse un
 * CORS que el dueño cerró a propósito (Pluto). Lo que no se puede incrustar
 * legalmente se abre en la app oficial (`sala/lib/canalesOficiales.ts`).
 *
 * El ORDEN es el número del canal en el control remoto. El 1 es el que más
 * se teclea: va un canal adaptativo y rápido en arrancar.
 *
 * Retirados el 2026-11-13:
 * - Star Channel (FOX): restream http:// de bantel-cdn1.iptvperu.tv — un canal
 *   de PAGO retransmitido por un tercero. Fuera por la regla legal, no por caído.
 * - Mega Cine TV (hostlagarto): 404. RCN Novelas y MAX Anime (klicgo.net): a
 *   curl le responde 200, a Chrome 403. TeleQuindío (bozztv): conexión rechazada.
 *
 * Lo que NO está, y por qué (comprobado hoy):
 * - ENT Extreme (y ENT Comedy): estrenado el 16-oct-2026, pero su dueño aún no
 *   publica la señal: `ENT_Extreme`/`ENT_Comedy` dan 404 en cdn.40mediagroup.com
 *   (al que redirige elektamedia: el 302 no prueba nada), y la propia web de
 *   40media muestra en su lugar Totalmusic_Concerts/_Dance. Cuando exista será
 *   `.../c7eds/ENT_Extreme/SA_LIVE_hls_enc/master.m3u8`.
 * - Comedy Central / South Park: solo por Pluto TV Latam (comedy-central-ptv2,
 *   south-park-pvt2). El stitcher de Pluto responde
 *   `Access-Control-Allow-Origin: https://pluto.tv` a cualquier otro origen:
 *   bloqueo deliberado → van como «Ver en la app oficial».
 * - FOX: no hay señal FOX gratuita en español. El canal FOX de Disney es hoy
 *   Star Channel (de pago; su catálogo está en Disney+), FOX One es de pago y
 *   solo México, Tubi no opera aquí, y LiveNOW from FOX es en inglés.
 * - Caracol, RCN, Citytv: su señal web va con geobloqueo/DRM y sin CORS. Lo
 *   oficial y gratuito son sus directos 24/7 en YouTube (Noticias Caracol,
 *   Noticias RCN, Canal RCN, Citytv), que van en La Sala como YouTube, y sus
 *   páginas «en vivo» como enlace a la app oficial.
 * - Win Sports: canal de pago; los partidos solo por Win Play (enlace oficial).
 * - Teleantioquia, Telecaribe, Telecafé, Telemedellín, Canal Trece, Canal TRO,
 *   Tele Amiga (cdnmedia.tv), NTN24 (bitred.cl), France 24 y T13: sin
 *   `Access-Control-Allow-Origin` para el navegador. Canal 1 (mdstrm): 400.
 *
 * Nota: la app no distribuye canales propios; restaura/valida la lista personal.
 */
export const DEFAULT_CHANNELS: CustomChannel[] = [
  // --- 🎬 Películas y series ---
  { name: "Zylo Cine Friki", url: "https://d2mr4fu91mjx9m.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-rb0tx75ojbc5u/CineFriki_ES.m3u8", category: "Cine y series" },
  { name: "Zylo Cine Western", url: "https://d2nq34q0i1r3la.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-awohw8g217ho8/CineWestern_ES.m3u8", category: "Cine y series" },
  { name: "ENT Channel", url: "https://cdn.global.elektamedia.com/live/c7eds/ENT_Channel/SA_LIVE_hls_enc/master.m3u8", category: "Cine y series" },
  // ENT Movies/Drama/Classics/Life: misma familia (40media Group), 2026-11-13.
  { name: "ENT Movies", url: "https://cdn.global.elektamedia.com/live/c7eds/ENT_Movies/SA_LIVE_hls_enc/master.m3u8", category: "Cine y series" },
  { name: "ENT Drama", url: "https://cdn.global.elektamedia.com/live/c7eds/ENT_Drama/SA_LIVE_hls_enc/master.m3u8", category: "Cine y series" },
  { name: "ENT Classics", url: "https://cdn.global.elektamedia.com/live/c7eds/ENT_Classics/SA_LIVE_hls_enc/master.m3u8", category: "Cine y series" },
  { name: "BBC Drama", url: "https://amg00793-amg00793c40-rakuten-es-5444.playouts.now.amagi.tv/playlist.m3u8", category: "Cine y series" },
  { name: "MyTime Cine", url: "https://appletree-mytimespain-rakuten.amagi.tv/playlist.m3u8", category: "Cine y series" },
  { name: "CINDIE TV (cine independiente)", url: "https://cc-hqw8u5r1nshjc.akamaized.net/scheduler/scheduleMaster/352.m3u8", category: "Cine y series" },
  { name: "Xtrema Cine Clásico", url: "https://stmv6.voxtvhd.com.br/cineclasico/cineclasico/playlist.m3u8", category: "Cine y series" },
  { name: "Xtrema Terror", url: "https://stmv6.voxtvhd.com.br/cineterror/cineterror/playlist.m3u8", category: "Cine y series" },
  // --- 📺 Novelas y entretenimiento ---
  { name: "13 Teleseries", url: "https://origin.dpsgo.com/ssai/event/f4TrySe8SoiGF8Lu3EIq1g/master.m3u8", category: "Novelas y entretenimiento" },
  { name: "13 Realities", url: "https://origin.dpsgo.com/ssai/event/g7_JOM0ORki9SR5RKHe-Kw/master.m3u8", category: "Novelas y entretenimiento" },
  { name: "RCN Más", url: "https://rcntv-rcnmas-1-us.plex.wurl.tv/playlist.m3u8", category: "Novelas y entretenimiento" },
  { name: "Zylo Todo Novelas", url: "https://dtsszjrztq9ti.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-yshah5p4v45g1/ToDoNovelas_ES.m3u8", category: "Novelas y entretenimiento" },
  { name: "Estrella TV", url: "https://estrellatv-oando.amagi.tv/playlist.m3u8", category: "Novelas y entretenimiento" },
  { name: "TVS Retro (series clásicas)", url: "https://cdn.streamhispanatv.net:3531/live/tvsretrogtlive.m3u8", category: "Novelas y entretenimiento" },
  // --- 👨‍👩‍👧 Familia y dibujos ---
  { name: "ENT Family", url: "https://cdn.global.elektamedia.com/live/c7eds/ENT_Family/SA_LIVE_hls_enc/master.m3u8", category: "Familia y dibujos" },
  { name: "ENT Life", url: "https://cdn.global.elektamedia.com/live/c7eds/ENT_Life/SA_LIVE_hls_enc/master.m3u8", category: "Familia y dibujos" },
  { name: "13 Kids", url: "https://origin.dpsgo.com/ssai/event/LhHrVtyeQkKZ-Ye_xEU75g/master.m3u8", category: "Familia y dibujos" },
  { name: "Mr. Bean Animado", url: "https://amg00627-amg00627c30-rakuten-es-3990.playouts.now.amagi.tv/playlist/amg00627-banijayfast-mrbeanescc-rakutenes/playlist.m3u8", category: "Familia y dibujos" },
  { name: "Xtrema Cartoons (clásicos)", url: "https://stmv6.voxtvhd.com.br/xtremacartoons/xtremacartoons/playlist.m3u8", category: "Familia y dibujos" },

  // --- 🇨🇴 Colombia (2026-10-06) ---
  // Los canales públicos y regionales que sirven por https con CORS abierto.
  // Señal Colombia e Institucional salen de RTVC (streaming.rtvc.gov.co).
  { name: "Señal Colombia", url: "https://streaming.rtvc.gov.co/TV_Senal_Colombia_live/smil:live.smil/playlist.m3u8", category: "Colombia" },
  { name: "Canal Institucional", url: "https://streaming.rtvc.gov.co/TV_CanalInstitucional_live/smil:live.smil/playlist.m3u8", category: "Colombia" },
  { name: "Canal Capital (Bogotá)", url: "https://mdstrm.com/live-stream-playlist/6952dc88cb62083467eb6ab4.m3u8", category: "Colombia" },
  { name: "Eureka (Canal Capital, infantil)", url: "https://mdstrm.com/live-stream-playlist/6952e02d19eabace52e2885f.m3u8", category: "Colombia" },
  { name: "Telepacífico (Cali)", url: "https://play.cdn.enetres.net/6E5C615AA5FF4123ACAF0DAB57B7B8DC021/022/playlist.m3u8", category: "Colombia" },
  { name: "Canal Más TV (Caldas)", url: "https://video.ejeserver.com/live/teledoradahd.m3u8", category: "Colombia" },

  // --- 📰 Noticias ---
  // Mismo filtro que el resto, con CORS comprobado contra el origen de
  // PRODUCCIÓN. Es la categoría que alimenta la fila «Infórmate» de La Sala.
  // Fuera desde oct-2026: France 24 y T13 (el navegador ya no recibe CORS) y
  // Canal 26 (los segmentos tardan más de lo que hls.js espera).
  { name: "DW Español", url: "https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/master.m3u8", category: "Noticias" },
  { name: "Red+ Noticias (Colombia)", url: "https://inforedvos.lcdn.claro.net.co/Content/HLS_HLS_DIR/Live/channel(REDMASHDWEB)/master.m3u8", category: "Noticias" },
  { name: "Noticiero 90 Minutos (Cali)", url: "https://play.cdn.enetres.net/621B146D29C541AFB1507809F038F471021/021/playlist.m3u8", category: "Noticias" },
  { name: "Estrella News", url: "https://estrella-news-oando.amagi.tv/playlist.m3u8", category: "Noticias" },
  { name: "Newsmax Español", url: "https://n1ottesorkatv.akamaized.net/hls/live/2113795/Live_1/index.m3u8", category: "Noticias" },
];

/**
 * TODAS las URLs que la app ha sembrado alguna vez (las caídas y las vigentes).
 * La migración las usa para distinguir lo sembrado de lo que el usuario agregó
 * a mano: al retirar un canal de DEFAULT_CHANNELS, su URL ya está aquí y se
 * quita del navegador sin tocar los canales propios del usuario.
 *
 * REGLA: toda URL que entre en DEFAULT_CHANNELS entra TAMBIÉN aquí, el mismo
 * día. Las de noticias de sep-2026 no se apuntaron, y al retirar France 24 y
 * T13 se habrían quedado en los navegadores como si el usuario las hubiera
 * agregado él.
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
  // Noticias (sembradas en sep-2026, v4)
  "https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/master.m3u8",
  "https://live.france24.com/hls/live/2037220-b/F24_ES_HI_HLS/master_5000.m3u8",
  "https://inforedvos.lcdn.claro.net.co/Content/HLS_HLS_DIR/Live/channel(REDMASHDWEB)/master.m3u8",
  "https://redirector.dps.live/hls/t13/playlist.m3u8",
  "https://stream-gtlc.telecentro.net.ar/hls/canal26hls/main.m3u8",
  "https://estrella-news-oando.amagi.tv/playlist.m3u8",
  "https://n1ottesorkatv.akamaized.net/hls/live/2113795/Live_1/index.m3u8",
  // Colombia y noticias (sembradas en oct-2026, v5)
  "https://streaming.rtvc.gov.co/TV_Senal_Colombia_live/smil:live.smil/playlist.m3u8",
  "https://streaming.rtvc.gov.co/TV_CanalInstitucional_live/smil:live.smil/playlist.m3u8",
  "https://mdstrm.com/live-stream-playlist/6952dc88cb62083467eb6ab4.m3u8",
  "https://mdstrm.com/live-stream-playlist/6952e02d19eabace52e2885f.m3u8",
  "https://play.cdn.enetres.net/6E5C615AA5FF4123ACAF0DAB57B7B8DC021/022/playlist.m3u8",
  "https://live20.bozztv.com/akamaissh101/ssh101/telequindio/playlist.m3u8",
  "https://video.ejeserver.com/live/teledoradahd.m3u8",
  "https://play.cdn.enetres.net/621B146D29C541AFB1507809F038F471021/021/playlist.m3u8",
  // ENT (40media Group), sembradas el 2026-11-13, v6
  "https://cdn.global.elektamedia.com/live/c7eds/ENT_Movies/SA_LIVE_hls_enc/master.m3u8",
  "https://cdn.global.elektamedia.com/live/c7eds/ENT_Drama/SA_LIVE_hls_enc/master.m3u8",
  "https://cdn.global.elektamedia.com/live/c7eds/ENT_Classics/SA_LIVE_hls_enc/master.m3u8",
  "https://cdn.global.elektamedia.com/live/c7eds/ENT_Life/SA_LIVE_hls_enc/master.m3u8",
];
