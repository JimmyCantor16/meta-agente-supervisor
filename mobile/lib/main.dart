// Meta-Agente Móvil — Jamz Software (APK fase 2).
//
// "Solo instalar y listo": preconfigurada al backend del PC (IP fija, NO editable)
// y AUTO-CONECTA a su WebSocket de eventos con keep-alive. Cuando en CUALQUIER
// dispositivo (web/escritorio) se genera un proyecto, este teléfono lanza una
// NOTIFICACIÓN NATIVA de Android — los 3 al tiempo. Estado en vivo animado.

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/io.dart';

const _brand = Color(0xFF6366F1);
const _bg = Color(0xFF0E1020);
const _panel = Color(0xFF1A1D33);

// Backend del PC en la Wi-Fi de casa. FIJO (el usuario no lo edita).
const _servidor = 'http://192.168.1.16:8000';

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
  runApp(const MetaAgenteApp());
}

class MetaAgenteApp extends StatelessWidget {
  const MetaAgenteApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Meta-Agente · Jamz',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: _brand, scaffoldBackgroundColor: _bg, brightness: Brightness.dark),
      home: const HomeScreen(),
    );
  }
}

class _Evento {
  _Evento(this.texto) : hora = TimeOfDay.now();
  final String texto;
  final TimeOfDay hora;
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with SingleTickerProviderStateMixin {
  final _idea = TextEditingController();
  bool _cargando = false;
  String? _resultado;
  String? _error;

  WebSocketChannel? _ws;
  bool _conectado = false;
  bool _generando = false;
  final List<_Evento> _feed = [];
  late final AnimationController _pulso =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat(reverse: true);

  String get _wsUrl => '${_servidor.replaceFirst(RegExp(r'^http'), 'ws')}/api/v1/ws/progreso';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _conectarWs());
  }

  void _reintentar() => Future.delayed(const Duration(seconds: 5), () {
        if (mounted && !_conectado) _conectarWs();
      });

  Future<void> _conectarWs() async {
    try {
      _ws?.sink.close();
    } catch (_) {}
    try {
      final c = IOWebSocketChannel.connect(Uri.parse(_wsUrl),
          pingInterval: const Duration(seconds: 15), connectTimeout: const Duration(seconds: 8));
      _ws = c;
      await c.ready;
      if (!mounted) return;
      setState(() => _conectado = true);
      c.stream.listen(
        (data) {
          final txt = data.toString();
          if (!mounted) return;
          setState(() {
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
            _mostrarNoti('¡Tu sistema está listo! 🎉', txt.replaceAll('🚀', '').trim());
          } else if (RegExp(r'RETENIDA|no se entrega').hasMatch(txt)) {
            _mostrarNoti('La generación no terminó', txt);
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
    }
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
          .post(Uri.parse('$_servidor/api/v1/agent/evaluate'),
              headers: {'Content-Type': 'application/json'},
              body: utf8.encode(jsonEncode({'prompt': idea, 'language': 'es'})))
          .timeout(const Duration(seconds: 60));
      if (res.statusCode != 200) throw 'El servidor respondió ${res.statusCode}';
      final data = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      final estado = data['status'] ?? '';
      final critica = data['analisis_critico'] ?? '';
      final sugerencias = (data['sugerencias_mejora'] as List?) ?? const [];
      final extra = sugerencias.isNotEmpty ? '\n\n💡 Sugerencias:\n• ${sugerencias.take(4).join('\n• ')}' : '';
      setState(() => _resultado = '🔎 Estado: $estado\n\n$critica$extra');
    } catch (e) {
      setState(() => _error = 'No pude conectar con el sistema.\n$e');
    } finally {
      setState(() => _cargando = false);
    }
  }

  @override
  void dispose() {
    _pulso.dispose();
    _ws?.sink.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            _cabecera(),
            const SizedBox(height: 16),
            _tarjetaEstado(),
            const SizedBox(height: 16),
            _cajaIdea(),
            const SizedBox(height: 12),
            if (_error != null) _bloque(const Color(0xFF3A1214), Text(_error!, style: const TextStyle(color: Color(0xFFFF9B9B)))),
            if (_resultado != null) _bloque(_panel, Text(_resultado!, style: const TextStyle(height: 1.45, color: Colors.white70))),
            const SizedBox(height: 8),
            _seccionEnVivo(),
          ],
        ),
      ),
    );
  }

  Widget _cabecera() => Row(
        children: [
          Container(
            width: 42, height: 42,
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [_brand, Color(0xFF22D3EE)]), borderRadius: BorderRadius.circular(12)),
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
        ],
      );

  // Pastilla de estado con punto que PULSA cuando está en vivo.
  Widget _pill() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: _conectado ? const Color(0xFF10331F) : const Color(0xFF2A2E45),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: _conectado ? const Color(0xFF1F7A46) : Colors.white12),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          FadeTransition(
            opacity: _conectado ? _pulso : const AlwaysStoppedAnimation(0.4),
            child: Container(width: 9, height: 9, decoration: BoxDecoration(shape: BoxShape.circle, color: _conectado ? const Color(0xFF34D399) : Colors.white38)),
          ),
          const SizedBox(width: 7),
          Text(_conectado ? 'EN VIVO' : 'Conectando…',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: .5, color: _conectado ? const Color(0xFF6EE7B7) : Colors.white54)),
        ]),
      );

  // Tarjeta "conectado a tu sistema" — IP FIJA, no editable.
  Widget _tarjetaEstado() => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [_panel, const Color(0xFF15182B)], begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white10),
        ),
        child: Row(children: [
          Icon(_conectado ? Icons.wifi_tethering : Icons.wifi_tethering_off, color: _conectado ? const Color(0xFF34D399) : Colors.white38, size: 30),
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
        decoration: BoxDecoration(color: _panel, borderRadius: BorderRadius.circular(18), border: Border.all(color: Colors.white10)),
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
              filled: true, fillColor: _bg,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: _brand, minimumSize: const Size.fromHeight(48)),
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
          const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: _brand)),
      ]),
      const SizedBox(height: 10),
      if (_feed.isEmpty)
        _bloque(_panel, const Row(children: [
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
    final color = listo ? const Color(0xFF34D399) : malo ? const Color(0xFFFF6B6B) : _brand;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _panel,
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
