/// Reproductores INCRUSTADOS de multimedia.
///
/// Antes las emisoras se abrían en el reproductor externo del teléfono y en
/// muchos Android no había ninguno que entendiera el stream ("No se pudo
/// abrir"). Ahora la radio suena DENTRO de la app con just_audio y sigue
/// sonando en segundo plano con controles en la notificación y la pantalla de
/// bloqueo (audio_service vía just_audio_background); la tele se ve dentro con
/// video_player + chewie (HLS nativo en Android). El reproductor externo queda
/// como fallback en el menú contextual.
library;

import 'package:chewie/chewie.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:just_audio/just_audio.dart';
import 'package:just_audio_background/just_audio_background.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';

import 'diseno.dart';
import 'radios.dart';

bool _audioFondoListo = false;

/// Prepara audio_service: los controles de la radio en la notificación y la
/// pantalla de bloqueo. Idempotente a propósito — `main()` la llama al
/// arrancar (lo documentado), y el reproductor la vuelve a llamar antes de
/// crear el primer `AudioPlayer` por si la integración en `main()` faltara;
/// solo la primera llamada hace trabajo.
Future<void> prepararAudioFondo() async {
  if (_audioFondoListo) return;
  _audioFondoListo = true;
  try {
    await JustAudioBackground.init(
      androidNotificationChannelId: 'com.jamzsoftware.metaagente_movil.radio',
      androidNotificationChannelName: 'Radio Meta-Agente',
      androidNotificationOngoing: true,
    );
  } catch (_) {
    // En tests o plataformas sin soporte, la radio suena igual pero sin
    // controles del sistema; no es motivo para tumbar la app.
  }
}

/// El reproductor de radio de TODA la app: uno solo, para que nunca suenen dos
/// emisoras a la vez y para que la barra "sonando" sea la misma desde
/// cualquier pantalla.
class ReproductorRadio {
  ReproductorRadio._();
  static final ReproductorRadio instancia = ReproductorRadio._();

  AudioPlayer? _player;

  /// La emisora cargada (aunque esté en pausa). `null` = nada sonando.
  final ValueNotifier<EmisoraNet?> emisora = ValueNotifier(null);

  /// `true` mientras el stream avanza (no en pausa ni detenido).
  final ValueNotifier<bool> reproduciendo = ValueNotifier(false);

  /// `true` mientras el stream carga o rebufferiza.
  final ValueNotifier<bool> cargando = ValueNotifier(false);

  /// Un solo listenable para que la interfaz se redibuje con cualquier cambio.
  Listenable get cambios => Listenable.merge([emisora, reproduciendo, cargando]);

  Future<AudioPlayer> _asegurarPlayer() async {
    final ya = _player;
    if (ya != null) return ya;
    await prepararAudioFondo();
    final p = AudioPlayer();
    p.playerStateStream.listen((estado) {
      cargando.value = estado.processingState == ProcessingState.loading ||
          estado.processingState == ProcessingState.buffering;
      reproduciendo.value = estado.playing &&
          estado.processingState != ProcessingState.idle &&
          estado.processingState != ProcessingState.completed;
    });
    // Si el stream se cae a mitad (la radio en vivo se cae a veces), no se
    // borra la emisora: la barra queda en pausa y un toque la reintenta.
    p.playbackEventStream.listen((_) {}, onError: (Object _, StackTrace _) {
      cargando.value = false;
      reproduciendo.value = false;
    });
    _player = p;
    return p;
  }

  /// Reproduce la emisora dentro de la app. Devuelve `null` si arrancó, o un
  /// mensaje listo para enseñar si no se pudo.
  Future<String?> reproducir(EmisoraNet e) async {
    try {
      final p = await _asegurarPlayer();
      emisora.value = e;
      cargando.value = true;
      await p.stop();
      // El `tag` MediaItem es lo que audio_service pinta en la notificación.
      await p.setAudioSource(AudioSource.uri(
        Uri.parse(e.url),
        tag: MediaItem(
          id: e.url,
          title: e.nombre,
          artist: e.subtitulo.isEmpty ? 'Radio · Meta-Agente' : e.subtitulo,
          artUri: e.favicon.isNotEmpty ? Uri.tryParse(e.favicon) : null,
        ),
      ));
      // Sin await: play() de un stream en vivo no "termina" nunca.
      p.play();
      return null;
    } catch (_) {
      cargando.value = false;
      if (emisora.value?.url == e.url) emisora.value = null;
      return 'No se pudo reproducir ${e.nombre}. Prueba abrirla en el reproductor externo (mantén pulsada la emisora).';
    }
  }

  /// Pausa/reanuda la emisora cargada (el botón de la barra "sonando").
  Future<void> alternarPausa() async {
    final p = _player;
    if (p == null) return;
    if (p.playing) {
      await p.pause();
    } else {
      p.play();
    }
  }

  /// Detiene y quita la barra (y la notificación del sistema).
  Future<void> detener() async {
    emisora.value = null;
    cargando.value = false;
    try {
      await _player?.stop();
    } catch (_) {}
  }

  bool esLaQueSuena(String url) => emisora.value?.url == url;
}

// --- Fallbacks compartidos (reproductor externo y copiar enlace) ------------

/// Abre el stream en el reproductor externo del teléfono (el comportamiento
/// antiguo, ahora como plan B).
Future<void> abrirEnExterno(BuildContext context, String nombre, String url) async {
  final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('No se pudo abrir $nombre.')),
    );
  }
}

/// Copia el enlace del stream, para pegarlo donde haga falta.
Future<void> copiarEnlace(BuildContext context, String url) async {
  await Clipboard.setData(ClipboardData(text: url));
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Enlace copiado.')),
    );
  }
}

// --- Televisión incrustada ---------------------------------------------------

/// Pantalla de un canal de TV: el `.m3u8` reproducido dentro de la app.
class PantallaTv extends StatefulWidget {
  const PantallaTv({super.key, required this.titulo, required this.url});

  final String titulo;
  final String url;

  @override
  State<PantallaTv> createState() => _PantallaTvState();
}

class _PantallaTvState extends State<PantallaTv> {
  VideoPlayerController? _video;
  ChewieController? _chewie;
  String? _error;

  @override
  void initState() {
    super.initState();
    // La tele y la radio no compiten por el sonido: si sonaba una emisora,
    // se detiene antes de arrancar el canal.
    ReproductorRadio.instancia.detener();
    _preparar();
  }

  Future<void> _preparar() async {
    try {
      final v = VideoPlayerController.networkUrl(Uri.parse(widget.url));
      _video = v;
      await v.initialize();
      if (!mounted) return; // la pantalla se cerró durante la carga
      _chewie = ChewieController(
        videoPlayerController: v,
        autoPlay: true,
        isLive: true, // sin barra de progreso: es emisión en vivo
        allowFullScreen: true,
        aspectRatio: v.value.aspectRatio > 0 ? v.value.aspectRatio : 16 / 9,
        materialProgressColors: ChewieProgressColors(
          playedColor: marca,
          handleColor: acento,
          bufferedColor: linea,
          backgroundColor: tarjeta,
        ),
      );
      setState(() {});
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Este canal no se pudo cargar dentro de la app.');
      }
    }
  }

  @override
  void dispose() {
    _chewie?.dispose();
    _video?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: fondo,
      appBar: AppBar(
        backgroundColor: tarjeta,
        foregroundColor: tinta,
        title: Text(widget.titulo, style: const TextStyle(fontSize: 16)),
        actions: [
          // El plan B siempre a mano, sin estorbar.
          PopupMenuButton<String>(
            color: tarjeta,
            onSelected: (accion) {
              if (accion == 'externo') {
                abrirEnExterno(context, widget.titulo, widget.url);
              } else if (accion == 'copiar') {
                copiarEnlace(context, widget.url);
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: 'externo',
                child: Text('Abrir en reproductor externo', style: TextStyle(color: tinta)),
              ),
              PopupMenuItem(
                value: 'copiar',
                child: Text('Copiar enlace', style: TextStyle(color: tinta)),
              ),
            ],
          ),
        ],
      ),
      body: Center(child: _cuerpo(context)),
    );
  }

  Widget _cuerpo(BuildContext context) {
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.tv_off, color: tintaSuave, size: 42),
            const SizedBox(height: 12),
            Text(_error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: tintaSuave, height: 1.4)),
            const SizedBox(height: 16),
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: marca),
              onPressed: () => abrirEnExterno(context, widget.titulo, widget.url),
              icon: const Icon(Icons.open_in_new, size: 18),
              label: const Text('Abrir en reproductor externo'),
            ),
            TextButton.icon(
              onPressed: () => copiarEnlace(context, widget.url),
              icon: const Icon(Icons.copy, size: 16),
              label: const Text('Copiar enlace'),
            ),
          ],
        ),
      );
    }
    final chewie = _chewie;
    if (chewie == null) {
      return const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(color: marca),
          SizedBox(height: 14),
          Text('Sintonizando…', style: TextStyle(color: tintaSuave)),
        ],
      );
    }
    return Chewie(controller: chewie);
  }
}
