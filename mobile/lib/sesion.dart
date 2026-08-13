/// Sesión del móvil: el login viaja por el PUENTE, igual que en el escritorio.
///
/// Google bloquea su login dentro de WebViews y apps embebidas, así que la
/// sesión NACE en el navegador del teléfono (la web de producción, cuyo origen
/// sí está autorizado en Google) y VIAJA hasta aquí: la app genera un código
/// de un solo uso, abre la web con `?puente=<código>`, y sondea al backend
/// cada 2 segundos hasta 5 minutos, que es lo que vive el código
/// (`auth.py: /puente/recoger`). El código corto visible (XXXX-XXXX) se
/// compara A OJO con el que muestra la web antes de autorizar: sin esa
/// comparación, un enlace ajeno podría llevarse la sesión. Es el MISMO
/// protocolo que usa la app de escritorio (GoogleLoginButton.tsx).
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import 'diseno.dart';

/// Backend COMPARTIDO en producción: el mismo canal que escuchan la web y el
/// escritorio. Para desarrollo local cambia por 'http://TU_IP_LAN:8000'
/// (el móvil no resuelve 'localhost').
const servidorBase = 'https://metaagente-backend.onrender.com';

/// La web de producción: el único origen autorizado para el login de Google.
const webProduccion = 'https://metaagente-frontend.onrender.com';

/// En qué punto está la sesión de este teléfono.
enum EstadoSesion { sinSesion, esperando, conSesion }

/// Código de un solo uso (alfanumérico, 32 de los 16-64 que exige el backend),
/// generado con aleatoriedad criptográfica: adivinarlo es inviable.
String nuevoCodigo() {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  final rnd = Random.secure();
  return List.generate(32, (_) => abc[rnd.nextInt(abc.length)]).join();
}

/// Código CORTO y legible para comparar a ojo con el que muestra la web
/// (como el emparejamiento de un televisor). MISMA derivación que
/// `codigoVisible` en AuthProvider.tsx: ambos lados parten del mismo secreto.
String codigoVisible(String codigo) {
  final base = codigo.replaceAll(RegExp(r'[^A-Za-z0-9]'), '').toUpperCase();
  return '${base.substring(0, 4)}-${base.substring(4, 8)}';
}

/// Clave que identifica un acontecimiento para repartir el aviso sonoro.
///
/// MISMA derivación que `claveDeAviso` de la web (NotificationProvider.tsx):
/// no usa el texto entero porque la URL o el intento cambian entre aparatos;
/// el tipo de acontecimiento más el minuto bastan para reconocerlo.
String claveDeAviso(String texto) {
  final tipo = RegExp(r'VIVO|🚀', caseSensitive: false).hasMatch(texto)
      ? 'listo'
      : RegExp(r'REVISI[ÓO]N PENDIENTE', caseSensitive: false).hasMatch(texto)
          ? 'revision'
          : 'fallo';
  return '$tipo:${DateTime.now().millisecondsSinceEpoch ~/ 60000}';
}

/// La sesión del teléfono: entra por el puente, se guarda en el aparato y
/// firma todas las llamadas. Notifica a quien la escucha en cada cambio.
class Sesion extends ChangeNotifier {
  /// El cliente HTTP y el abridor de URLs son inyectables para que los tests
  /// corran sin red y sin navegador.
  Sesion({http.Client? cliente, Future<bool> Function(Uri)? abrir})
      : _http = cliente ?? http.Client(),
        _abrir = abrir ?? _abrirEnNavegador;

  final http.Client _http;
  final Future<bool> Function(Uri) _abrir;

  String? _token;
  String _email = '';
  String _nombre = '';
  bool _esperando = false;
  bool _cancelado = false;
  bool _caducada = false;
  bool _desechada = false;
  String? _error;
  String _codigoMostrado = '';
  String? _aparato;

  static const _claveToken = 'sesion.credential';
  static const _claveEmail = 'sesion.email';
  static const _claveNombre = 'sesion.nombre';
  static const _claveAparato = 'app.aparato';

  /// El credential vigente, o null si no hay sesión.
  String? get token => _token;

  String get email => _email;
  String get nombre => _nombre;

  /// True si la última llamada con sesión devolvió 401: hay que volver a entrar.
  bool get caducada => _caducada;

  /// Qué contarle al usuario si el puente falló (una línea, no un crash).
  String? get error => _error;

  /// El código corto que la persona compara con el de la web mientras espera.
  String get codigoMostrado => _codigoMostrado;

  EstadoSesion get estado => _token != null
      ? EstadoSesion.conSesion
      : (_esperando ? EstadoSesion.esperando : EstadoSesion.sinSesion);

  /// Cabeceras para TODAS las llamadas REST: con sesión, van firmadas.
  Map<String, String> cabeceras() => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  static Future<bool> _abrirEnNavegador(Uri uri) =>
      launchUrl(uri, mode: LaunchMode.externalApplication);

  void _avisarCambio() {
    if (!_desechada) notifyListeners();
  }

  @override
  void dispose() {
    _desechada = true;
    _cancelado = true;
    super.dispose();
  }

  /// Recupera la sesión guardada en el teléfono (si la hay).
  Future<void> cargar() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final guardado = prefs.getString(_claveToken);
      if (guardado == null || guardado.isEmpty) return;
      _token = guardado;
      _email = prefs.getString(_claveEmail) ?? '';
      _nombre = prefs.getString(_claveNombre) ?? '';
      _avisarCambio();
    } catch (_) {
      // Sin almacenamiento no hay sesión persistida; la app sigue sirviendo.
    }
  }

  /// El flujo puente completo: código → navegador → sondeo → sesión.
  Future<void> entrar() async {
    if (_esperando || _token != null) return;
    // El cerrojo se echa SÍNCRONO, antes del primer await: si se pusiera tras
    // abrir el navegador, un doble toque lanzaría dos flujos con dos códigos
    // distintos y anularía la comparación anti-phishing a ojo.
    _esperando = true;
    _cancelado = false;
    _error = null;
    final codigo = nuevoCodigo();
    _codigoMostrado = codigoVisible(codigo);
    _avisarCambio();
    try {
      var abierto = false;
      try {
        abierto = await _abrir(Uri.parse('$webProduccion/?puente=$codigo'));
      } catch (_) {
        abierto = false;
      }
      if (!abierto) {
        _error = 'No pude abrir el navegador. Ábrelo tú y entra en $webProduccion';
        return;
      }

      // Hasta 5 minutos (lo que vive el código), comprobando cada 2 segundos —
      // el mismo ritmo que el puente del escritorio.
      for (var i = 0; i < 150 && !_cancelado; i++) {
        await Future<void>.delayed(const Duration(seconds: 2));
        if (_cancelado) break;
        final credential = await _recoger(codigo);
        if (credential == null) continue;
        await _adoptar(credential);
        return;
      }
      if (!_cancelado) {
        _error = 'El código caducó sin completar el login. Inténtalo de nuevo.';
      }
    } finally {
      // Pase lo que pase (éxito, caducidad, cancelación o excepción), el
      // cerrojo se suelta y se avisa a la UI.
      _esperando = false;
      _avisarCambio();
    }
  }

  /// Corta el sondeo (el usuario se arrepintió o cerró la pantalla).
  void cancelarEspera() {
    if (!_esperando) return;
    _cancelado = true;
    _esperando = false;
    _avisarCambio();
  }

  /// Recoge el credential depositado por la web. El backend lo entrega UNA
  /// única vez y lo destruye (GET /api/v1/auth/puente/recoger, auth.py).
  Future<String?> _recoger(String codigo) async {
    try {
      final res = await _http
          .get(Uri.parse('$servidorBase/api/v1/auth/puente/recoger?estado=$codigo'))
          .timeout(const Duration(seconds: 10));
      if (res.statusCode != 200) return null; // 404 = aún no hay sesión
      final data = jsonDecode(utf8.decode(res.bodyBytes));
      final credential = data is Map<String, dynamic> ? data['credential'] : null;
      return credential is String && credential.isNotEmpty ? credential : null;
    } catch (_) {
      return null; // sin red o servidor dormido: el sondeo sigue intentando
    }
  }

  /// Guarda el credential y saca email/nombre de su payload (es un JWT).
  Future<void> _adoptar(String credential) async {
    _token = credential;
    _caducada = false;
    final payload = _payloadDeJwt(credential);
    _email = '${payload['email'] ?? ''}';
    _nombre = '${payload['name'] ?? _email}';
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_claveToken, credential);
      await prefs.setString(_claveEmail, _email);
      await prefs.setString(_claveNombre, _nombre);
    } catch (_) {
      // Sin almacenamiento la sesión vive lo que viva la app: aceptable.
    }
  }

  /// Cierra la sesión de este teléfono (el token de Google caduca solo).
  Future<void> cerrarSesion() async {
    _token = null;
    _email = '';
    _nombre = '';
    _caducada = false;
    _error = null;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_claveToken);
      await prefs.remove(_claveEmail);
      await prefs.remove(_claveNombre);
    } catch (_) {}
    _avisarCambio();
  }

  /// El backend respondió 401: la sesión ya no vale. Se retira el token (para
  /// no seguir mandando uno muerto) pero se conserva el email, así la UI puede
  /// decir de quién era la sesión que caducó.
  void marcarCaducada() {
    if (_token == null) return;
    _token = null;
    _caducada = true;
    unawaited(() async {
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(_claveToken);
      } catch (_) {}
    }());
    _avisarCambio();
  }

  /// Identificador estable de ESTE teléfono, para el turno de aviso.
  Future<String> idAparato() async {
    if (_aparato != null) return _aparato!;
    try {
      final prefs = await SharedPreferences.getInstance();
      final guardado = prefs.getString(_claveAparato);
      if (guardado != null && guardado.isNotEmpty) return _aparato = guardado;
      final nuevo = 'movil-${nuevoCodigo().substring(0, 8).toLowerCase()}';
      await prefs.setString(_claveAparato, nuevo);
      return _aparato = nuevo;
    } catch (_) {
      return _aparato = 'movil';
    }
  }

  /// ¿Le toca a este teléfono hacer sonar el aviso? Mismo reparto que la web
  /// (canal.ts / POST /api/v1/agent/eventos/aviso): con los tres aparatos
  /// abiertos suena UNO. Falla abierto: sin sesión o sin red, avisa — es mejor
  /// un aviso repetido que perderse que tu sistema ya está listo.
  Future<bool> meTocaAvisar(String clave) async {
    if (_token == null) return true;
    try {
      final res = await _http
          .post(
            Uri.parse('$servidorBase/api/v1/agent/eventos/aviso'),
            headers: cabeceras(),
            body: utf8.encode(jsonEncode({'clave': clave, 'cliente': await idAparato()})),
          )
          .timeout(const Duration(seconds: 8));
      if (res.statusCode == 401) {
        marcarCaducada();
        return true;
      }
      if (res.statusCode != 200) return true;
      final data = jsonDecode(utf8.decode(res.bodyBytes));
      return data is! Map || data['avisar'] != false;
    } catch (_) {
      return true;
    }
  }

  /// Payload de un JWT sin verificar firma (la verificación es del backend;
  /// aquí solo se leen email y nombre para mostrarlos).
  static Map<String, dynamic> _payloadDeJwt(String jwt) {
    try {
      final partes = jwt.split('.');
      if (partes.length < 2) return const {};
      var s = partes[1].replaceAll('-', '+').replaceAll('_', '/');
      s = s.padRight(s.length + (4 - s.length % 4) % 4, '=');
      final data = jsonDecode(utf8.decode(base64Decode(s)));
      return data is Map<String, dynamic> ? data : const {};
    } catch (_) {
      return const {};
    }
  }
}

// ---------------------------------------------------------------------------
// Pantalla de sesión (los "Ajustes" del teléfono): entrar, esperar con el
// código visible, y salir.
// ---------------------------------------------------------------------------

class PantallaSesion extends StatelessWidget {
  const PantallaSesion({super.key, required this.sesion});

  final Sesion sesion;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: fondo,
      appBar: AppBar(
        title: const Text('Sesión'),
        backgroundColor: tarjeta,
        foregroundColor: tinta,
      ),
      body: ListenableBuilder(
        listenable: sesion,
        builder: (context, _) => ListView(
          padding: const EdgeInsets.all(16),
          children: [_segunEstado(context)],
        ),
      ),
    );
  }

  Widget _segunEstado(BuildContext context) {
    switch (sesion.estado) {
      case EstadoSesion.conSesion:
        return _conSesion(context);
      case EstadoSesion.esperando:
        return _esperando(context);
      case EstadoSesion.sinSesion:
        return _sinSesion(context);
    }
  }

  Widget _caja({required List<Widget> hijos}) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: tarjeta,
          borderRadius: BorderRadius.circular(radioTarjeta),
          border: Border.all(color: linea),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: hijos),
      );

  Widget _conSesion(BuildContext context) => _caja(hijos: [
        const Icon(Icons.verified_user, color: exito, size: 34),
        const SizedBox(height: 10),
        Center(
          child: Text(
            sesion.nombre.isEmpty ? 'Sesión iniciada' : sesion.nombre,
            style: const TextStyle(color: tinta, fontSize: 16, fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(height: 2),
        Center(
          child: Text(sesion.email, style: const TextStyle(color: tintaSuave, fontSize: 13)),
        ),
        const SizedBox(height: 14),
        const Text(
          'Con la sesión activa, el teléfono ve TUS generaciones en vivo y puede '
          'aprobar o rechazar las entregas del agente desde la pestaña Entregas.',
          style: TextStyle(color: tintaSuave, fontSize: 12.5, height: 1.4),
        ),
        const SizedBox(height: 14),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(
            foregroundColor: alerta,
            side: const BorderSide(color: linea),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radio)),
            minimumSize: const Size.fromHeight(44),
          ),
          onPressed: () => sesion.cerrarSesion(),
          icon: const Icon(Icons.logout, size: 18),
          label: const Text('Cerrar sesión'),
        ),
      ]);

  Widget _esperando(BuildContext context) => _caja(hijos: [
        const Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2.5, color: marca),
          ),
        ),
        const SizedBox(height: 14),
        const Text(
          'Termina el login en el navegador',
          textAlign: TextAlign.center,
          style: TextStyle(color: tinta, fontSize: 16, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 6),
        const Text(
          'Antes de autorizar, comprueba que la web muestra EXACTAMENTE este código. '
          'Si no coincide, cancela: alguien podría estar intentando llevarse tu sesión.',
          textAlign: TextAlign.center,
          style: TextStyle(color: tintaSuave, fontSize: 12.5, height: 1.4),
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: fondo,
            borderRadius: BorderRadius.circular(radio),
            border: Border.all(color: marca),
          ),
          child: Center(
            child: Text(
              sesion.codigoMostrado,
              style: const TextStyle(
                color: acento,
                fontSize: 28,
                fontWeight: FontWeight.w800,
                letterSpacing: 6,
                fontFamily: 'monospace',
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextButton(
          onPressed: sesion.cancelarEspera,
          child: const Text('Cancelar', style: TextStyle(color: tintaSuave)),
        ),
      ]);

  Widget _sinSesion(BuildContext context) => _caja(hijos: [
        const Icon(Icons.account_circle_outlined, color: tintaSuave, size: 34),
        const SizedBox(height: 10),
        const Text(
          'Entra con tu cuenta',
          textAlign: TextAlign.center,
          style: TextStyle(color: tinta, fontSize: 16, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 6),
        const Text(
          'El login se hace en el navegador del teléfono (Google no permite entrar '
          'desde dentro de la app). Al terminar, la sesión vuelve sola aquí.',
          textAlign: TextAlign.center,
          style: TextStyle(color: tintaSuave, fontSize: 12.5, height: 1.4),
        ),
        if (sesion.caducada) ...[
          const SizedBox(height: 10),
          Text(
            'Tu sesión${sesion.email.isEmpty ? '' : ' de ${sesion.email}'} caducó: vuelve a entrar.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: aviso, fontSize: 12.5),
          ),
        ],
        if (sesion.error != null) ...[
          const SizedBox(height: 10),
          Text(
            sesion.error!,
            textAlign: TextAlign.center,
            style: const TextStyle(color: alerta, fontSize: 12.5),
          ),
        ],
        const SizedBox(height: 14),
        FilledButton.icon(
          style: FilledButton.styleFrom(
            backgroundColor: marca,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radio)),
            minimumSize: const Size.fromHeight(46),
          ),
          onPressed: () => sesion.entrar(),
          icon: const Icon(Icons.login, size: 18),
          label: const Text('Entrar con Google'),
        ),
      ]);
}
