// Meta-Agente Móvil — Jamz Software (APK fase 1, modo pruebas).
//
// Cliente Android NATIVO (Flutter) del Meta-Agente. Fase 1:
//  1) Habla con nuestro backend: evalúa una idea (/api/v1/agent/evaluate).
//  2) "Modo pruebas de sockets": abre un WebSocket y muestra mensajes en vivo
//     (prueba de la capa de tiempo real que usaremos para las notificaciones
//     entre dispositivos en la fase 2).
//  3) Avisos in-app cuando un trabajo termina.
//
// NO publica en Play Store ni requiere pagar los 25 USD: se instala el APK de
// depuración directamente en el teléfono (flutter build apk --debug).

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';

void main() => runApp(const MetaAgenteApp());

// Paleta de marca (mismo azul-lila de la web / la tele Jamz).
const _brand = Color(0xFF6366F1);
const _brandDark = Color(0xFF4F46E5);

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
  // En emulador Android, 10.0.2.2 = localhost del PC. En un teléfono real,
  // pon la IP LAN del PC (p. ej. http://192.168.1.10:8000).
  final _url = TextEditingController(text: 'http://10.0.2.2:8000');
  final _idea = TextEditingController();
  bool _cargando = false;
  String? _resultado;
  String? _error;

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
      if (res.statusCode != 200) {
        throw 'El servidor respondió ${res.statusCode}';
      }
      final data = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      final estado = data['status'] ?? '';
      final critica = data['analisis_critico'] ?? '';
      final sugerencias = (data['sugerencias_mejora'] as List?) ?? const [];
      final extra = sugerencias.isNotEmpty
          ? '\n\n💡 Sugerencias:\n• ${sugerencias.take(4).join('\n• ')}'
          : '';
      setState(() {
        _resultado = '🔎 Estado: $estado\n\n$critica$extra';
      });
      _aviso('¡Evaluación lista! 🎉');
    } catch (e) {
      setState(() => _error = 'No pude conectar con el sistema.\n$e');
    } finally {
      setState(() => _cargando = false);
    }
  }

  void _aviso(String texto) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(texto),
        backgroundColor: _brandDark,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: _brand,
        foregroundColor: Colors.white,
        title: const Text('Meta-Agente · Jamz',
            style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: const Icon(Icons.wifi_tethering),
            tooltip: 'Modo pruebas de sockets',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                  builder: (_) => SocketsScreen(baseUrl: _url.text.trim())),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Convierte tu idea en un sistema real',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          const Text('Fase 1 de la app — modo pruebas',
              style: TextStyle(color: Colors.black54)),
          const SizedBox(height: 16),
          TextField(
            controller: _url,
            decoration: const InputDecoration(
              labelText: 'Servidor del Meta-Agente',
              helperText: 'Emulador: 10.0.2.2 · Teléfono real: la IP del PC',
              border: OutlineInputBorder(),
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
            style: FilledButton.styleFrom(
                backgroundColor: _brand,
                minimumSize: const Size.fromHeight(48)),
            onPressed: _cargando ? null : _evaluar,
            icon: _cargando
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.auto_awesome),
            label: Text(_cargando ? 'Evaluando…' : 'Evaluar idea'),
          ),
          const SizedBox(height: 16),
          if (_error != null)
            _Tarjeta(
                color: const Color(0xFFFDECEC),
                child: Text(_error!,
                    style: const TextStyle(color: Color(0xFFB42318)))),
          if (_resultado != null)
            _Tarjeta(
                color: Colors.white,
                child: Text(_resultado!,
                    style: const TextStyle(height: 1.4, fontSize: 14))),
        ],
      ),
    );
  }
}

/// Pantalla "modo pruebas de sockets": abre un WebSocket y muestra los mensajes
/// en tiempo real. Prueba la capa que usaremos para notificaciones entre
/// dispositivos (fase 2). Por defecto usa un eco público para validar la
/// plomería; luego apuntará a nuestro backend cuando exponga /ws.
class SocketsScreen extends StatefulWidget {
  const SocketsScreen({super.key, required this.baseUrl});
  final String baseUrl;
  @override
  State<SocketsScreen> createState() => _SocketsScreenState();
}

class _SocketsScreenState extends State<SocketsScreen> {
  final _wsUrl = TextEditingController(text: 'wss://echo.websocket.events');
  final _msg = TextEditingController(text: 'Hola desde Meta-Agente móvil 👋');
  WebSocketChannel? _canal;
  final List<String> _log = [];
  bool _conectado = false;

  void _conectar() {
    try {
      final c = WebSocketChannel.connect(Uri.parse(_wsUrl.text.trim()));
      _canal = c;
      setState(() {
        _conectado = true;
        _log.insert(0, '✅ Conectado a ${_wsUrl.text.trim()}');
      });
      c.stream.listen(
        (data) => setState(() => _log.insert(0, '⬇️ $data')),
        onError: (e) => setState(() => _log.insert(0, '⚠️ error: $e')),
        onDone: () => setState(() {
          _conectado = false;
          _log.insert(0, '🔌 desconectado');
        }),
      );
    } catch (e) {
      setState(() => _log.insert(0, '⚠️ no pude conectar: $e'));
    }
  }

  void _enviar() {
    if (_canal == null) return;
    _canal!.sink.add(_msg.text);
    setState(() => _log.insert(0, '⬆️ ${_msg.text}'));
  }

  @override
  void dispose() {
    _canal?.sink.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: _brand,
        foregroundColor: Colors.white,
        title: const Text('Sockets · modo pruebas'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _wsUrl,
              decoration: const InputDecoration(
                  labelText: 'WebSocket', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: _brand),
                  onPressed: _conectado ? null : _conectar,
                  icon: const Icon(Icons.link),
                  label: Text(_conectado ? 'Conectado' : 'Conectar'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _conectado ? _enviar : null,
                  icon: const Icon(Icons.send),
                  label: const Text('Enviar'),
                ),
              ),
            ]),
            const SizedBox(height: 10),
            TextField(
              controller: _msg,
              decoration: const InputDecoration(
                  labelText: 'Mensaje', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            const Text('En vivo:', style: TextStyle(fontWeight: FontWeight.bold)),
            Expanded(
              child: ListView.builder(
                itemCount: _log.length,
                itemBuilder: (_, i) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Text(_log[i]),
                ),
              ),
            ),
          ],
        ),
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
