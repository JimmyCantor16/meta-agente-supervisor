// Meta-Agente Móvil — Jamz Software (APK fase 2).
//
// "Solo instalar y listo": viene preconfigurada para conectarse al backend del
// PC por Wi-Fi y AUTO-CONECTA a su WebSocket de eventos. Cuando en CUALQUIER
// dispositivo (web/escritorio) se genera un proyecto, el backend emite el evento
// y este teléfono lanza una NOTIFICACIÓN NATIVA de Android — los 3 al tiempo.

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';

const _brand = Color(0xFF6366F1);

// Backend del PC en la Wi-Fi de casa (preconfigurado; editable en la app).
const _servidorPorDefecto = 'http://192.168.1.16:8000';

final FlutterLocalNotificationsPlugin _fln = FlutterLocalNotificationsPlugin();
const _canal = AndroidNotificationChannel(
  'meta_agente',
  'Meta-Agente',
  description: 'Avisos cuando tu sistema está listo',
  importance: Importance.high,
);

Future<void> _initNotis() async {
  const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
  await _fln.initialize(const InitializationSettings(android: androidInit));
  final android = _fln.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
  await android?.createNotificationChannel(_canal);
  await android?.requestNotificationsPermission();
}

int _notiId = 0;
Future<void> _mostrarNoti(String titulo, String cuerpo) async {
  await _fln.show(
    _notiId++,
    titulo,
    cuerpo,
    const NotificationDetails(
      android: AndroidNotificationDetails(
        'meta_agente',
        'Meta-Agente',
        importance: Importance.high,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
      ),
    ),
  );
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
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: _brand,
        scaffoldBackgroundColor: const Color(0xFFF6F7FB),
      ),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _url = TextEditingController(text: _servidorPorDefecto);
  final _idea = TextEditingController();
  bool _cargando = false;
  String? _resultado;
  String? _error;

  // WebSocket de eventos (auto-conecta).
  WebSocketChannel? _ws;
  bool _conectado = false;
  final List<String> _feed = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _conectarWs());
  }

  String _wsUrl() {
    final base = _url.text.trim();
    final ws = base.replaceFirst(RegExp(r'^http'), 'ws');
    return '$ws/api/v1/ws/progreso';
  }

  void _conectarWs() {
    try {
      _ws?.sink.close();
      final c = WebSocketChannel.connect(Uri.parse(_wsUrl()));
      _ws = c;
      setState(() => _conectado = true);
      c.stream.listen(
        (data) {
          final txt = data.toString();
          setState(() {
            _feed.insert(0, txt);
            if (_feed.length > 40) _feed.removeLast();
          });
          // Evento "sistema listo" → notificación NATIVA de Android.
          if (RegExp(r'VIVO|🚀').hasMatch(txt)) {
            _mostrarNoti('¡Tu sistema está listo! 🎉', txt.replaceAll('🚀', '').trim());
          } else if (RegExp(r'RETENIDA|no se entrega').hasMatch(txt)) {
            _mostrarNoti('La generación no terminó', txt);
          }
        },
        onError: (_) => setState(() => _conectado = false),
        onDone: () {
          if (!mounted) return;
          setState(() => _conectado = false);
          Future.delayed(const Duration(seconds: 5), () {
            if (mounted && !_conectado) _conectarWs();
          });
        },
      );
    } catch (_) {
      setState(() => _conectado = false);
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
          .post(
            Uri.parse('${_url.text.trim()}/api/v1/agent/evaluate'),
            headers: {'Content-Type': 'application/json'},
            body: utf8.encode(jsonEncode({'prompt': idea, 'language': 'es'})),
          )
          .timeout(const Duration(seconds: 60));
      if (res.statusCode != 200) throw 'El servidor respondió ${res.statusCode}';
      final data = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      final estado = data['status'] ?? '';
      final critica = data['analisis_critico'] ?? '';
      final sugerencias = (data['sugerencias_mejora'] as List?) ?? const [];
      final extra = sugerencias.isNotEmpty
          ? '\n\n💡 Sugerencias:\n• ${sugerencias.take(4).join('\n• ')}'
          : '';
      setState(() => _resultado = '🔎 Estado: $estado\n\n$critica$extra');
    } catch (e) {
      setState(() => _error = 'No pude conectar con el sistema.\n$e');
    } finally {
      setState(() => _cargando = false);
    }
  }

  @override
  void dispose() {
    _ws?.sink.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: _brand,
        foregroundColor: Colors.white,
        title: const Text('Meta-Agente · Jamz', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Row(children: [
              Icon(Icons.circle, size: 12, color: _conectado ? Colors.greenAccent : Colors.white38),
              const SizedBox(width: 6),
              Text(_conectado ? 'En vivo' : 'Sin conexión', style: const TextStyle(fontSize: 12)),
            ]),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Tu sistema, en tu bolsillo',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          const Text('Te avisa aquí cuando tu proyecto esté listo — aunque lo generes en el PC.',
              style: TextStyle(color: Colors.black54)),
          const SizedBox(height: 16),
          TextField(
            controller: _url,
            onSubmitted: (_) => _conectarWs(),
            decoration: InputDecoration(
              labelText: 'Servidor del Meta-Agente',
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(icon: const Icon(Icons.refresh), onPressed: _conectarWs),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _idea,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Describe tu idea',
              hintText: 'Ej: una tienda online con carrito y pagos',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: _brand, minimumSize: const Size.fromHeight(48)),
            onPressed: _cargando ? null : _evaluar,
            icon: _cargando
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.auto_awesome),
            label: Text(_cargando ? 'Evaluando…' : 'Evaluar idea'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => _mostrarNoti('Prueba de aviso 🔔', 'Así se verán las notificaciones de tu sistema.'),
            icon: const Icon(Icons.notifications_active),
            label: const Text('Probar notificación'),
          ),
          const SizedBox(height: 16),
          if (_error != null)
            _Tarjeta(color: const Color(0xFFFDECEC), child: Text(_error!, style: const TextStyle(color: Color(0xFFB42318)))),
          if (_resultado != null)
            _Tarjeta(color: Colors.white, child: Text(_resultado!, style: const TextStyle(height: 1.4, fontSize: 14))),
          if (_feed.isNotEmpty) ...[
            const SizedBox(height: 8),
            const Text('📡 En vivo (desde tu sistema):', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            _Tarjeta(
              color: const Color(0xFF0D1117),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: _feed
                    .take(12)
                    .map((m) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2),
                          child: Text(m, style: const TextStyle(color: Color(0xFF9BE7A5), fontSize: 13)),
                        ))
                    .toList(),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Tarjeta extends StatelessWidget {
  const _Tarjeta({required this.child, required this.color});
  final Widget child;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE6E8F0)),
        ),
        child: child,
      );
}
