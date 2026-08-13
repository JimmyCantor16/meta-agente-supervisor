/// Radio Browser en Dart: buscar emisoras de TODO el mundo, gratis y sin clave.
///
/// Es el mismo cliente que usa el panel web
/// (`frontend/src/features/multimedia/lib/radioBrowser.ts`), portado a Dart con
/// las mismas decisiones: NO depende de un solo servidor — pide la lista de
/// réplicas vivas a `all.api.radio-browser.info`, las prueba en cascada hasta
/// que una responda y recuerda la que funcionó. Timeout real por petición.
///
/// Diferencia a favor del móvil: aquí SÍ podemos mandar `User-Agent` (el
/// navegador lo prohíbe), y Radio Browser lo pide por cortesía.
library;

import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Una emisora reproducible: la unidad que entienden el buscador, los
/// favoritos y el reproductor.
class EmisoraNet {
  const EmisoraNet({
    required this.nombre,
    required this.subtitulo,
    required this.url,
    this.favicon = '',
  });

  final String nombre;
  final String subtitulo;
  final String url;
  final String favicon;

  Map<String, dynamic> aJson() => {
        'nombre': nombre,
        'subtitulo': subtitulo,
        'url': url,
        'favicon': favicon,
      };

  static EmisoraNet? desdeJson(Map<String, dynamic> m) {
    final nombre = (m['nombre'] as String?)?.trim() ?? '';
    final url = (m['url'] as String?)?.trim() ?? '';
    if (nombre.isEmpty || url.isEmpty) return null;
    return EmisoraNet(
      nombre: nombre,
      subtitulo: (m['subtitulo'] as String?) ?? '',
      url: url,
      favicon: (m['favicon'] as String?) ?? '',
    );
  }
}

/// Endpoint que lista los servidores Radio Browser VIVOS ahora mismo (DNS
/// round-robin). Es lo recomendado: las réplicas individuales van y vienen.
const _urlServidores = 'https://all.api.radio-browser.info/json/servers';

/// Fallbacks fijos por si el listado de servidores falla.
const _basesFijas = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
];

const _tiempoLimite = Duration(seconds: 9);

/// Radio Browser pide identificarse; así saben quién los usa.
const _agente = 'MetaAgenteJamz/1.0 (movil)';

String? _baseBuena;
List<String>? _basesVivas;

/// Países frecuentes (ISO-2 → etiqueta) para el filtro rápido, como en la web.
const List<({String codigo, String etiqueta})> paisesRadio = [
  (codigo: '', etiqueta: 'Mundo'),
  (codigo: 'CO', etiqueta: 'CO'),
  (codigo: 'MX', etiqueta: 'MX'),
  (codigo: 'ES', etiqueta: 'ES'),
  (codigo: 'AR', etiqueta: 'AR'),
  (codigo: 'US', etiqueta: 'US'),
];

Future<dynamic> _traerJson(Uri url) async {
  final res = await http
      .get(url, headers: {'User-Agent': _agente})
      .timeout(_tiempoLimite);
  if (res.statusCode != 200) throw http.ClientException('http ${res.statusCode}', url);
  return jsonDecode(utf8.decode(res.bodyBytes));
}

/// Resuelve (y cachea) los servidores vivos. Si falla, devuelve los fallbacks.
Future<List<String>> _resolverBasesVivas() async {
  final ya = _basesVivas;
  if (ya != null) return ya;
  try {
    final data = await _traerJson(Uri.parse(_urlServidores));
    if (data is List) {
      final nombres = data
          .whereType<Map<String, dynamic>>()
          .map((s) => (s['name'] as String? ?? '').trim())
          .where((n) => n.isNotEmpty)
          .toSet()
          .map((n) => 'https://$n')
          .toList();
      if (nombres.isNotEmpty) {
        _basesVivas = nombres;
        return nombres;
      }
    }
  } catch (_) {
    // usamos fallbacks
  }
  _basesVivas = [..._basesFijas];
  return _basesVivas!;
}

/// Réplicas ordenadas: la que ya funcionó primero, luego vivas, luego fallbacks.
List<String> _basesOrdenadas(List<String> vivas) {
  final todas = <String>{
    ?_baseBuena,
    ...vivas,
    ..._basesFijas,
  };
  return todas.toList();
}

/// Convierte el JSON de estaciones de Radio Browser en `EmisoraNet`s.
List<EmisoraNet> _parsearEstaciones(dynamic lista) {
  if (lista is! List) return [];
  final emisoras = <EmisoraNet>[];
  for (final crudo in lista) {
    if (crudo is! Map<String, dynamic>) continue;
    String texto(String clave) {
      final v = crudo[clave];
      return v is String ? v.trim() : '';
    }

    final url = texto('url_resolved').isNotEmpty ? texto('url_resolved') : texto('url');
    final nombre = texto('name');
    if (url.isEmpty || nombre.isEmpty) continue;
    final bitrate = crudo['bitrate'] is num ? (crudo['bitrate'] as num).toInt() : 0;
    final subtitulo = [
      texto('tags'),
      texto('country'),
      if (bitrate > 0) '$bitrate kbps',
    ].where((s) => s.isNotEmpty).join('  ·  ');
    emisoras.add(EmisoraNet(
      nombre: nombre,
      subtitulo: subtitulo,
      url: url,
      favicon: texto('favicon'),
    ));
  }
  return emisoras;
}

/// Prueba el `camino` en cada réplica viva hasta que una responda; cachea la buena.
Future<List<EmisoraNet>> _traerEstaciones(String camino) async {
  final vivas = await _resolverBasesVivas();
  Object? ultimoError;
  for (final base in _basesOrdenadas(vivas)) {
    try {
      final data = await _traerJson(Uri.parse(base + camino));
      _baseBuena = base; // recordar la que funcionó
      return _parsearEstaciones(data);
    } catch (e) {
      ultimoError = e;
    }
  }
  throw ultimoError ?? Exception('Radio Browser inalcanzable');
}

/// Emisoras más populares (al abrir la búsqueda). Si se pasa `codigoPais`
/// (ISO-2), filtra por país.
Future<List<EmisoraNet>> radiosPopulares({String codigoPais = ''}) {
  final cc = codigoPais.trim();
  if (cc.isNotEmpty) {
    const q = 'limit=80&hidebroken=true&order=clickcount&reverse=true';
    return _traerEstaciones('/json/stations/bycountrycodeexact/$cc?$q');
  }
  return _traerEstaciones('/json/stations/topclick/80');
}

/// Busca emisoras por nombre/etiqueta, ordenadas por popularidad.
Future<List<EmisoraNet>> buscarRadios(String consulta) {
  final q = consulta.trim();
  if (q.isEmpty) return Future.value(const []);
  final params = Uri(queryParameters: {
    'name': q,
    'limit': '80',
    'hidebroken': 'true',
    'order': 'clickcount',
    'reverse': 'true',
  }).query;
  return _traerEstaciones('/json/stations/search?$params');
}

/// Guarda y recupera las emisoras favoritas en el propio teléfono, con el
/// mismo patrón que el historial del auditor: si algo falla al leer o
/// escribir, la app sigue funcionando con lo que tenga en memoria.
class Favoritas {
  static const _clave = 'multimedia.favoritas';
  static const _maximo = 50;

  static Future<List<EmisoraNet>> cargar() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final crudo = prefs.getString(_clave);
      if (crudo == null || crudo.isEmpty) return [];
      final lista = jsonDecode(crudo);
      if (lista is! List) return [];
      return lista
          .whereType<Map<String, dynamic>>()
          .map(EmisoraNet.desdeJson)
          .whereType<EmisoraNet>()
          .toList();
    } catch (_) {
      return []; // favoritas ilegibles: se empieza de nuevo, sin molestar
    }
  }

  static Future<void> guardar(List<EmisoraNet> emisoras) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final recortado = emisoras.take(_maximo).map((e) => e.aJson()).toList();
      await prefs.setString(_clave, jsonEncode(recortado));
    } catch (_) {
      // Sin espacio o sin permiso: las favoritas en memoria siguen sirviendo.
    }
  }
}
