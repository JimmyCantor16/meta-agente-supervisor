// Meta-Agente Móvil — Jamz Software (APK fase 2).
//
// "Solo instalar y listo": preconfigurada al backend del PC (IP fija, NO editable)
// y AUTO-CONECTA a su WebSocket de eventos con keep-alive. Cuando en CUALQUIER
// dispositivo (web/escritorio) se genera un proyecto, este teléfono lanza una
// NOTIFICACIÓN NATIVA de Android — los 3 al tiempo. Estado en vivo animado.

import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'diseno.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';

import 'auditor.dart';
import 'bandeja.dart';
import 'multimedia.dart';
import 'reproductor.dart';
import 'sesion.dart';
import 'package:web_socket_channel/io.dart';

// El backend COMPARTIDO en producción vive en `sesion.dart` (`servidorBase`):
// así el móvil ve en tiempo real lo mismo que la web y el escritorio (los 3
// conectados al mismo canal), y la sesión firma todas las llamadas.

final FlutterLocalNotificationsPlugin _fln = FlutterLocalNotificationsPlugin();
const _canal = AndroidNotificationChannel(
  'meta_agente', 'Meta-Agente',
  description: 'Avisos cuando tu sistema está listo',
  importance: Importance.high,
);

Future<void> _initNotis() async {
  const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
  await _fln.initialize(const InitializationSettings(android: androidInit));
  final a = _fln.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
  await a?.createNotificationChannel(_canal);
  await a?.requestNotificationsPermission();
}

int _notiId = 0;
Future<void> _mostrarNoti(String titulo, String cuerpo) async {
  await _fln.show(_notiId++, titulo, cuerpo,
      const NotificationDetails(
          android: AndroidNotificationDetails('meta_agente', 'Meta-Agente',
              importance: Importance.high, priority: Priority.high, icon: '@mipmap/ic_launcher')));
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await _initNotis();
  // audio_service se prepara ANTES de runApp (lo exige just_audio_background):
  // así la radio sigue sonando en segundo plano con controles en la
  // notificación y la pantalla de bloqueo. Es idempotente y nunca lanza.
  await prepararAudioFondo();
  runApp(const MetaAgenteApp());
}

class MetaAgenteApp extends StatelessWidget {
  const MetaAgenteApp({
    super.key,
    this.conectarAlArrancar = true,
    this.sesion,
    this.clienteHttp,
  });

  /// En los tests se apaga: el WebSocket real lanzado en el arranque dejaba
  /// timers pendientes y tumbaba el widget_test.
  final bool conectarAlArrancar;

  /// Sesión inyectable (tests). Si falta, la pantalla crea y carga la suya.
  final Sesion? sesion;

  /// Cliente HTTP inyectable (tests) para la bandeja de entregas.
  final http.Client? clienteHttp;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Meta-Agente · Jamz',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: marca, scaffoldBackgroundColor: fondo, brightness: Brightness.dark),
      home: HomeScreen(
        conectarAlArrancar: conectarAlArrancar,
        sesion: sesion,
        clienteHttp: clienteHttp,
      ),
    );
  }
}

class _Evento {
  _Evento(this.texto) : hora = TimeOfDay.now();
  final String texto;
  final TimeOfDay hora;
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    this.conectarAlArrancar = true,
    this.sesion,
    this.clienteHttp,
  });

  final bool conectarAlArrancar;
  final Sesion? sesion;
  final http.Client? clienteHttp;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  final _idea = TextEditingController();
  bool _cargando = false;
  String? _resultado;
  String? _error;

  WebSocketChannel? _ws;
  StreamSubscription? _suscripcion;
  Timer? _reintento;
  int _intentos = 0;
  bool _conectando = false;
  bool _conectado = false;
  bool _generando = false;
  final List<_Evento> _feed = [];
  final EstadoAuditoria _auditoria = EstadoAuditoria();
  int _pestana = 0;

  // Se crea en initState (no como `late` perezoso): si nunca llegaba a haber
  // conexión, nadie tocaba el campo hasta `dispose()`, y crearlo AHÍ buscaba
  // ancestros de un widget ya desmontado (crash al cerrar y en los tests).
  late final AnimationController _pulso;

  // La sesión del teléfono. Si nadie la inyecta (tests), es nuestra: la
  // creamos, la cargamos del disco y la liberamos al morir la pantalla.
  late final Sesion _sesion = widget.sesion ?? Sesion();
  late final bool _sesionPropia = widget.sesion == null;

  /// Con qué token se abrió el canal actual: si la sesión cambia, se reconecta.
  String? _tokenWs;

  String get _wsUrl {
    final base = '${servidorBase.replaceFirst(RegExp(r'^http'), 'ws')}/api/v1/ws/progreso';
    final token = _sesion.token;
    // La sesión viaja en la URL porque un WebSocket no lleva cabeceras al
    // abrirse (igual que canal.ts en la web). Sin ella se escucha igual, pero
    // solo los eventos generales: los pasos de una generación son de su dueño.
    return token == null ? base : '$base?token=${Uri.encodeComponent(token)}';
  }

  @override
  void initState() {
    super.initState();
    _pulso = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1100))
      ..repeat(reverse: true);
    // Observa el ciclo de vida: al volver del segundo plano hay que revisar la
    // conexión (el sistema corta los sockets ociosos y la píldora se quedaba
    // diciendo "EN VIVO" sobre un canal muerto).
    WidgetsBinding.instance.addObserver(this);
    // El historial vive en el teléfono: lo que auditaste ayer sigue ahí hoy,
    // aunque la app se haya cerrado.
    _auditoria.alArchivar = () => HistorialAuditoria.guardar(_auditoria.historial);
    HistorialAuditoria.cargar().then((corridas) {
      if (!mounted || corridas.isEmpty) return;
      setState(() => _auditoria.historial.addAll(corridas));
    });
    _sesion.addListener(_alCambiarSesion);
    if (_sesionPropia) unawaited(_sesion.cargar());
    if (widget.conectarAlArrancar) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _conectarWs());
    }
  }

  /// La sesión cambió (entró, salió o caducó): la pantalla se repinta y el
  /// canal se reabre con (o sin) el token nuevo, para ver lo que es suyo.
  void _alCambiarSesion() {
    if (!mounted) return;
    setState(() {});
    if (widget.conectarAlArrancar && _tokenWs != _sesion.token) {
      _intentos = 0;
      _conectarWs();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState estado) {
    if (!widget.conectarAlArrancar) return;
    if (estado == AppLifecycleState.resumed) {
      _intentos = 0;
      if (!_conectado) _conectarWs();
    }
  }

  /// Espera CRECIENTE entre reintentos (5 s, 10 s, 20 s… hasta 1 min). Antes
  /// reintentaba cada 5 s para siempre: con el servidor dormido, eso vaciaba
  /// la batería y los datos del teléfono.
  void _reintentar() {
    if (!widget.conectarAlArrancar) return;
    _reintento?.cancel();
    final espera = Duration(seconds: (5 * (1 << _intentos)).clamp(5, 60));
    _intentos = (_intentos + 1).clamp(0, 4);
    _reintento = Timer(espera, () {
      if (mounted && !_conectado) _conectarWs();
    });
  }

  Future<void> _conectarWs() async {
    // Guardia: sin ella, dos intentos solapados dejaban un canal huérfano con
    // su oyente vivo, que DUPLICABA las notificaciones.
    if (_conectando) return;
    _conectando = true;
    try {
      await _suscripcion?.cancel();
      _suscripcion = null;
      _ws?.sink.close();
    } catch (_) {}
    try {
      _tokenWs = _sesion.token; // el token con el que nace ESTE canal
      final c = IOWebSocketChannel.connect(Uri.parse(_wsUrl),
          pingInterval: const Duration(seconds: 15), connectTimeout: const Duration(seconds: 8));
      _ws = c;
      await c.ready;
      if (!mounted) return;
      _intentos = 0; // conexión buena: la próxima espera vuelve a empezar corta
      setState(() => _conectado = true);
      _suscripcion = c.stream.listen(
        (data) {
          final txt = data.toString();
          if (!mounted) return;
          setState(() {
            _auditoria.aplicar(txt);
            _feed.insert(0, _Evento(txt));
            if (_feed.length > 60) _feed.removeLast();
            // "en generación" mientras llegan pasos; termina en VIVO/retenida.
            if (RegExp(r'VIVO|🚀|RETENIDA|no se entrega').hasMatch(txt)) {
              _generando = false;
            } else if (RegExp(r'construy|Escribiendo|Plano|Instalando|Compilando|reparando|arquetipo').hasMatch(txt)) {
              _generando = true;
            }
          });
          if (RegExp(r'VIVO|🚀').hasMatch(txt)) {
            _notificarConTurno('¡Tu sistema está listo! 🎉', txt.replaceAll('🚀', '').trim(), txt);
          } else if (RegExp(r'REVISI[ÓO]N PENDIENTE').hasMatch(txt)) {
            // El agente dejó su entrega en una rama: hay algo que revisar.
            _notificarConTurno('📬 Listo para revisión', txt.replaceAll('📬', '').trim(), txt);
          } else if (RegExp(r'RETENIDA|no se entrega').hasMatch(txt)) {
            _notificarConTurno('La generación no terminó', txt, txt);
          }
        },
        onError: (_) {
          if (mounted) setState(() => _conectado = false);
          _reintentar();
        },
        onDone: () {
          if (mounted) setState(() => _conectado = false);
          _reintentar();
        },
        cancelOnError: true,
      );
    } catch (_) {
      if (mounted) setState(() => _conectado = false);
      _reintentar();
    } finally {
      _conectando = false;
    }
  }

  /// Con sesión, pide TURNO antes de sonar (mismo reparto que la web,
  /// canal.ts): con los tres aparatos abiertos suena UNO; los demás guardan la
  /// noticia en el feed, en silencio. Sin sesión, suena siempre (falla abierto).
  void _notificarConTurno(String titulo, String cuerpo, String textoOriginal) {
    unawaited(() async {
      if (!await _sesion.meTocaAvisar(claveDeAviso(textoOriginal))) return;
      await _mostrarNoti(titulo, cuerpo);
    }());
  }

  Future<void> _evaluar() async {
    final idea = _idea.text.trim();
    if (idea.isEmpty) return;
    setState(() {
      _cargando = true;
      _resultado = null;
      _error = null;
    });
    try {
      final res = await http
          .post(Uri.parse('$servidorBase/api/v1/agent/evaluate'),
              headers: _sesion.cabeceras(),
              body: utf8.encode(jsonEncode({'prompt': idea, 'language': 'es'})))
          .timeout(const Duration(seconds: 60));
      if (res.statusCode == 401) {
        // La sesión ya no vale: se avisa en una línea, sin tumbar nada.
        _sesion.marcarCaducada();
        throw 'Tu sesión caducó: vuelve a entrar desde el icono de sesión.';
      }
      if (res.statusCode == 429) throw 'Demasiadas peticiones seguidas; espera un minuto.';
      if (res.statusCode != 200) throw 'El servidor respondió ${res.statusCode}';
      final data = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      final estado = data['status'] ?? '';
      final critica = data['analisis_critico'] ?? '';
      final sugerencias = (data['sugerencias_mejora'] as List?) ?? const [];
      final extra = sugerencias.isNotEmpty ? '\n\n💡 Sugerencias:\n• ${sugerencias.take(4).join('\n• ')}' : '';
      // Tras un `await` largo la pantalla puede haberse cerrado: sin esta
      // comprobación saltaba "setState() called after dispose()".
      if (!mounted) return;
      setState(() => _resultado = '🔎 Estado: $estado\n\n$critica$extra');
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'No pude conectar con el sistema.\n$e');
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  @override
  void dispose() {
    // Se liberan TODOS los recursos: antes quedaban vivos el oyente del canal y
    // el reintento pendiente, que seguían trabajando sobre una pantalla muerta.
    WidgetsBinding.instance.removeObserver(this);
    _reintento?.cancel();
    _suscripcion?.cancel();
    _idea.dispose();
    _pulso.dispose();
    _ws?.sink.close();
    _sesion.removeListener(_alCambiarSesion);
    if (_sesionPropia) _sesion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final paginas = [
      // Agente: pedir una idea y ver el resultado
      ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          _cabecera(),
          const SizedBox(height: 16),
          _tarjetaEstado(),
          if (_sesion.caducada) ...[
            const SizedBox(height: 10),
            _bloque(
              tarjeta,
              const Row(children: [
                Icon(Icons.info_outline, size: 16, color: aviso),
                SizedBox(width: 8),
                Expanded(
                  child: Text('Tu sesión caducó: vuelve a entrar desde el icono de arriba.',
                      style: TextStyle(color: aviso, fontSize: 12.5)),
                ),
              ]),
            ),
          ],
          const SizedBox(height: 16),
          _cajaIdea(),
          const SizedBox(height: 12),
          if (_error != null) _bloque(tarjeta, Text(_error!, style: const TextStyle(color: alerta))),
          if (_resultado != null) _bloque(tarjeta, Text(_resultado!, style: const TextStyle(height: 1.45, color: Colors.white70))),
          const SizedBox(height: 8),
          _seccionEnVivo(),
        ],
      ),
      // Auditor: lo que ocurre en la web y el escritorio, paso a paso
      PanelAuditor(estado: _auditoria, conectado: _conectado),
      // Multimedia: acompanar la espera
      const PanelMultimedia(),
      // Entregas: aprobar o rechazar el trabajo del agente desde el teléfono
      PanelEntregas(sesion: _sesion, cliente: widget.clienteHttp),
    ];

    return Scaffold(
      body: SafeArea(child: paginas[_pestana]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _pestana,
        onDestinationSelected: (i) => setState(() => _pestana = i),
        backgroundColor: tarjeta,
        indicatorColor: marca.withValues(alpha: 0.2),
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.auto_awesome_outlined),
              selectedIcon: Icon(Icons.auto_awesome),
              label: 'Agente'),
          NavigationDestination(
              icon: Icon(Icons.radar_outlined),
              selectedIcon: Icon(Icons.radar),
              label: 'Auditor'),
          NavigationDestination(
              icon: Icon(Icons.play_circle_outline),
              selectedIcon: Icon(Icons.play_circle),
              label: 'Multimedia'),
          NavigationDestination(
              icon: Icon(Icons.inbox_outlined),
              selectedIcon: Icon(Icons.inbox),
              label: 'Entregas'),
        ],
      ),
    );
  }

  Widget _cabecera() => Row(
        children: [
          Container(
            width: 42, height: 42,
            decoration: BoxDecoration(color: marca, borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.auto_awesome, color: Colors.white),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Meta-Agente', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
              Text('Jamz Software', style: TextStyle(fontSize: 12, color: Colors.white38)),
            ]),
          ),
          _pill(),
          // La sesión, siempre a un toque: entrar, ver el código o salir.
          IconButton(
            tooltip: 'Sesión',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => PantallaSesion(sesion: _sesion)),
            ),
            icon: Icon(
              _sesion.estado == EstadoSesion.conSesion
                  ? Icons.account_circle
                  : Icons.account_circle_outlined,
              color: _sesion.estado == EstadoSesion.conSesion
                  ? acento
                  : (_sesion.caducada ? aviso : Colors.white54),
            ),
          ),
        ],
      );

  // Pastilla de estado con punto que PULSA cuando está en vivo.
  Widget _pill() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: _conectado ? tarjeta : tarjeta,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: _conectado ? marca : Colors.white12),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          FadeTransition(
            opacity: _conectado ? _pulso : const AlwaysStoppedAnimation(0.4),
            child: Container(width: 9, height: 9, decoration: BoxDecoration(shape: BoxShape.circle, color: _conectado ? exito : Colors.white38)),
          ),
          const SizedBox(width: 7),
          Text(_conectado ? 'EN VIVO' : 'Conectando…',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: .5, color: _conectado ? acento : Colors.white54)),
        ]),
      );

  // Tarjeta "conectado a tu sistema" — IP FIJA, no editable.
  Widget _tarjetaEstado() => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: marca,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white10),
        ),
        child: Row(children: [
          Icon(_conectado ? Icons.wifi_tethering : Icons.wifi_tethering_off, color: _conectado ? exito : Colors.white38, size: 30),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_conectado ? 'Conectado a tu sistema' : 'Buscando tu sistema…',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Colors.white)),
              const SizedBox(height: 2),
              Text(_generando ? '⚙️ Generando un proyecto…' : 'Te avisaré aquí cuando algo esté listo.',
                  style: const TextStyle(color: Colors.white54, fontSize: 12)),
            ]),
          ),
          const Icon(Icons.lock, size: 15, color: Colors.white24),
        ]),
      );

  Widget _cajaIdea() => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: tarjeta, borderRadius: BorderRadius.circular(18), border: Border.all(color: Colors.white10)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Evalúa tu idea', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
          const SizedBox(height: 10),
          TextField(
            controller: _idea,
            minLines: 2, maxLines: 4,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Ej: una tienda online con carrito y pagos',
              hintStyle: const TextStyle(color: Colors.white30),
              filled: true, fillColor: fondo,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: marca, minimumSize: const Size.fromHeight(48)),
            onPressed: _cargando ? null : _evaluar,
            icon: _cargando
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.auto_awesome),
            label: Text(_cargando ? 'Evaluando…' : 'Evaluar idea'),
          ),
          const SizedBox(height: 8),
          TextButton.icon(
            onPressed: () => _mostrarNoti('Prueba de aviso 🔔', 'Así se verán las notificaciones de tu sistema.'),
            icon: const Icon(Icons.notifications_active, size: 18),
            label: const Text('Probar notificación'),
          ),
        ]),
      );

  Widget _seccionEnVivo() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        const Text('📡 Actividad en vivo', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
        const Spacer(),
        if (_generando)
          const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: marca)),
      ]),
      const SizedBox(height: 10),
      if (_feed.isEmpty)
        _bloque(tarjeta, const Row(children: [
          Icon(Icons.hourglass_empty, color: Colors.white30, size: 18),
          SizedBox(width: 10),
          Expanded(child: Text('Sin actividad todavía. Genera un proyecto en el PC y verás cada paso aquí, en vivo.', style: TextStyle(color: Colors.white54, fontSize: 13))),
        ]))
      else
        ..._feed.take(14).map(_lineaEvento),
    ]);
  }

  // Cada evento como una "línea de tiempo" con acento lateral y hora.
  Widget _lineaEvento(_Evento e) {
    final listo = RegExp(r'VIVO|🚀').hasMatch(e.texto);
    final malo = RegExp(r'RETENIDA|no se entrega|falló').hasMatch(e.texto);
    final color = listo ? exito : malo ? alerta : marca;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: tarjeta,
        borderRadius: BorderRadius.circular(12),
        border: Border(left: BorderSide(color: color, width: 3)),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(child: Text(e.texto, style: const TextStyle(color: Colors.white, fontSize: 13, height: 1.35))),
        const SizedBox(width: 8),
        Text('${e.hora.hour.toString().padLeft(2, '0')}:${e.hora.minute.toString().padLeft(2, '0')}',
            style: const TextStyle(color: Colors.white24, fontSize: 11)),
      ]),
    );
  }

  Widget _bloque(Color color, Widget child) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.white10)),
        child: child,
      );
}
