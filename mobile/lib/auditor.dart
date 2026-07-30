/// Auditor: traduce el canal en vivo a un estado que se entiende de un vistazo.
///
/// El móvil es el aparato que siempre llevas encima, así que es el mejor sitio
/// para vigilar lo que ocurre en la web y en el escritorio. Aquí los mensajes
/// crudos del servidor se convierten en fases, porcentaje y estado de los
/// modelos de IA — lo mismo que muestra el Monitor, pero en el bolsillo.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Una construcción YA terminada, guardada para poder mirarla después.
///
/// Por qué existe: un auditor que solo ve el presente no sirve para auditar.
/// La pregunta útil casi nunca es «qué está pasando» — es «cuántas de las
/// últimas salieron bien, y qué modelo nos está fallando».
class CorridaAuditada {
  CorridaAuditada({
    required this.cuando,
    required this.porcentaje,
    required this.desenlace,
    required this.url,
    required this.aciertos,
    required this.fallos,
    required this.modelos,
    required this.segundos,
  });

  final DateTime cuando;
  final int porcentaje;

  /// 'listo', 'avisos' o 'incompleta' (se cortó a medias).
  final String desenlace;
  final String url;
  final int aciertos;
  final int fallos;
  final List<String> modelos;
  final int segundos;

  bool get salioBien => desenlace == 'listo';

  /// Cuánto duró, en palabras: «3 min 20 s».
  String get duracion {
    if (segundos <= 0) return '—';
    if (segundos < 60) return '$segundos s';
    return '${segundos ~/ 60} min ${segundos % 60} s';
  }

  Map<String, dynamic> aJson() => {
        'cuando': cuando.toIso8601String(),
        'porcentaje': porcentaje,
        'desenlace': desenlace,
        'url': url,
        'aciertos': aciertos,
        'fallos': fallos,
        'modelos': modelos,
        'segundos': segundos,
      };

  /// Reconstruye desde el disco. Tolerante a propósito: un registro corrupto
  /// no puede impedir que el historial se abra.
  static CorridaAuditada? deJson(Map<String, dynamic> j) {
    final cuando = DateTime.tryParse('${j['cuando']}');
    if (cuando == null) return null;
    return CorridaAuditada(
      cuando: cuando,
      porcentaje: (j['porcentaje'] as num?)?.toInt() ?? 0,
      desenlace: '${j['desenlace'] ?? 'incompleta'}',
      url: '${j['url'] ?? ''}',
      aciertos: (j['aciertos'] as num?)?.toInt() ?? 0,
      fallos: (j['fallos'] as num?)?.toInt() ?? 0,
      modelos: (j['modelos'] as List?)?.map((e) => '$e').toList() ?? const [],
      segundos: (j['segundos'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Guarda y recupera el historial en el propio teléfono.
///
/// Se queda en el aparato a propósito: es un registro de lo que TÚ auditaste, y
/// no hace falta enviarlo a ningún sitio para que sirva.
class HistorialAuditoria {
  static const _clave = 'auditor.historial';
  static const _maximo = 30;

  static Future<List<CorridaAuditada>> cargar() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final crudo = prefs.getString(_clave);
      if (crudo == null || crudo.isEmpty) return [];
      final lista = jsonDecode(crudo);
      if (lista is! List) return [];
      return lista
          .whereType<Map<String, dynamic>>()
          .map(CorridaAuditada.deJson)
          .whereType<CorridaAuditada>()
          .toList();
    } catch (_) {
      return []; // historial ilegible: se empieza de nuevo, sin molestar
    }
  }

  static Future<void> guardar(List<CorridaAuditada> corridas) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final recortado = corridas.take(_maximo).map((c) => c.aJson()).toList();
      await prefs.setString(_clave, jsonEncode(recortado));
    } catch (_) {
      // Sin espacio o sin permiso: el historial en memoria sigue sirviendo.
    }
  }
}

/// Saca la URL de un mensaje del canal, sin la puntuación de la frase.
///
/// Hace falta porque el mensaje amable acaba en signo de admiración — «¡Tu
/// sistema está VIVO en http://…:5301!» — y el `!` se pegaba a la dirección.
/// El resultado era un enlace que no abría nada: el peor final posible para una
/// construcción que sí había salido bien.
String? urlDelTexto(String texto) {
  final m = RegExp(r'https?://\S+').firstMatch(texto);
  if (m == null) return null;
  final crudo = m.group(0) ?? '';
  final limpio = crudo.replaceAll(RegExp(r'''[!?.,;:)\]}«»"']+$'''), '');
  return limpio.isEmpty ? null : limpio;
}

/// En qué punto está una fase de la construcción.
enum EstadoFase { pendiente, enCurso, hecha, fallida }

class Fase {
  Fase(this.nombre, this.icono);
  final String nombre;
  final IconData icono;
  EstadoFase estado = EstadoFase.pendiente;
  String detalle = '';
}

/// Cuántas veces respondió y falló cada modelo de la cadena.
class Proveedor {
  Proveedor(this.nombre);
  final String nombre;
  int aciertos = 0;
  int fallos = 0;
}

/// Todo lo que el auditor sabe de la construcción en curso.
class EstadoAuditoria {
  final List<Fase> fases = [
    Fase('Entendiendo la idea', Icons.lightbulb_outline),
    Fase('Diseñando', Icons.architecture_outlined),
    Fase('Escribiendo código', Icons.edit_note_outlined),
    Fase('Instalando', Icons.inventory_2_outlined),
    Fase('Verificando', Icons.verified_outlined),
    Fase('Publicando', Icons.rocket_launch_outlined),
  ];
  final Map<String, Proveedor> proveedores = {};
  int porcentaje = 0;
  String faseActual = '';
  String detalle = '';
  String urlFinal = '';
  bool terminado = false;
  bool conAvisos = false;

  /// Construcciones anteriores, la más reciente primero.
  final List<CorridaAuditada> historial = [];

  /// Cuándo empezó la construcción en curso (para medir cuánto tardó).
  DateTime? _inicio;

  /// Se llama cuando el historial cambia, para que quien nos usa lo guarde.
  void Function()? alArchivar;

  int get aciertos => proveedores.values.fold(0, (a, p) => a + p.aciertos);
  int get fallos => proveedores.values.fold(0, (a, p) => a + p.fallos);

  /// Porcentaje de acierto de la cadena de IA, o null si aún no hubo llamadas.
  int? get tasaAcierto {
    final total = aciertos + fallos;
    return total == 0 ? null : ((aciertos / total) * 100).round();
  }

  void reiniciar() {
    for (final f in fases) {
      f.estado = EstadoFase.pendiente;
      f.detalle = '';
    }
    proveedores.clear();
    porcentaje = 0;
    faseActual = '';
    detalle = '';
    urlFinal = '';
    terminado = false;
    conAvisos = false;
    _inicio = null;
  }

  /// Cierra la construcción actual y la guarda en el historial.
  ///
  /// `desenlace` distingue las tres formas de acabar: bien, con avisos, o
  /// cortada por el camino — que es la más interesante para auditar, porque
  /// suele significar que la cadena de modelos se quedó sin cupo.
  void _archivar(String desenlace) {
    if (porcentaje <= 0) return; // nada que archivar
    historial.insert(
      0,
      CorridaAuditada(
        cuando: DateTime.now(),
        porcentaje: porcentaje,
        desenlace: desenlace,
        url: urlFinal,
        aciertos: aciertos,
        fallos: fallos,
        modelos: proveedores.keys.toList(),
        segundos: _inicio == null ? 0 : DateTime.now().difference(_inicio!).inSeconds,
      ),
    );
    if (historial.length > 30) historial.removeRange(30, historial.length);
    alArchivar?.call();
  }

  void _marcar(int indice, EstadoFase estado, {String? detalle}) {
    for (var i = 0; i < indice; i++) {
      if (fases[i].estado == EstadoFase.enCurso) fases[i].estado = EstadoFase.hecha;
    }
    fases[indice].estado = estado;
    if (detalle != null) fases[indice].detalle = detalle;
  }

  /// Aplica un mensaje del canal. Devuelve true si algo cambió.
  bool aplicar(String texto) {
    if (texto.startsWith('👋')) return false;

    if (RegExp(r'Cerebro IA listo').hasMatch(texto)) {
      // Empieza otra: si la anterior no llegó a puerto, queda registrada como
      // cortada en vez de desaparecer sin dejar rastro.
      if (!terminado) _archivar('incompleta');
      reiniciar();
      porcentaje = 5;
      faseActual = 'Despertando los modelos';
      _inicio = DateTime.now();
      return true;
    }
    if (RegExp(r'arquetipo|Idea única|diseñando').hasMatch(texto)) {
      _marcar(0, EstadoFase.hecha);
      porcentaje = _subir(12);
      faseActual = 'Entendiendo tu idea';
    }
    if (RegExp(r'Plano listo|Plan: \d+ archivo').hasMatch(texto)) {
      _marcar(1, EstadoFase.hecha);
      porcentaje = _subir(20);
      faseActual = 'Estructura diseñada';
    }

    final escritura = RegExp(r'Escribiendo (\d+) de (\d+)').firstMatch(texto);
    if (escritura != null) {
      final hechos = int.tryParse(escritura.group(1) ?? '') ?? 0;
      final total = int.tryParse(escritura.group(2) ?? '') ?? 1;
      _marcar(2, EstadoFase.enCurso, detalle: '$hechos de $total');
      porcentaje = _subir(20 + ((hechos / total) * 35).round());
      faseActual = 'Escribiendo el código';
      detalle = 'archivo $hechos de $total';
    }
    if (RegExp(r'Instalando').hasMatch(texto)) {
      _marcar(3, EstadoFase.enCurso);
      porcentaje = _subir(68);
      faseActual = 'Instalando dependencias';
      detalle = '';
    }
    if (RegExp(r'intento (\d+)|reparando|Arreglo automático').hasMatch(texto)) {
      _marcar(4, EstadoFase.enCurso, detalle: 'corrigiendo');
      porcentaje = _subir(80);
      faseActual = 'Corrigiendo detalles';
    }
    if (RegExp(r'Verificación superada').hasMatch(texto)) {
      _marcar(3, EstadoFase.hecha);
      _marcar(4, EstadoFase.hecha);
      porcentaje = _subir(90);
      faseActual = 'Verificado';
    }
    if (RegExp(r'VIVO|🚀').hasMatch(texto)) {
      _marcar(5, EstadoFase.hecha);
      porcentaje = 100;
      faseActual = '¡Listo!';
      urlFinal = urlDelTexto(texto) ?? urlFinal;
      if (!terminado) {
        terminado = true;
        _archivar('listo');
      }
    }
    if (RegExp(r'RETENIDA|no se entrega|fallaron').hasMatch(texto)) {
      _marcar(5, EstadoFase.fallida);
      porcentaje = 100;
      faseActual = 'Terminó con avisos';
      conAvisos = true;
      if (!terminado) {
        terminado = true;
        _archivar('avisos');
      }
    }

    // Estado de la cadena de IA: quién respondió y quién falló.
    final ok = RegExp(r'IA «(.+?)» respondió').firstMatch(texto);
    if (ok != null) {
      final n = ok.group(1)!;
      proveedores.putIfAbsent(n, () => Proveedor(n)).aciertos++;
    }
    final mal = RegExp(r'IA «(.+?)» (falló|sin respuesta|respuesta cortada|formato inválido)')
        .firstMatch(texto);
    if (mal != null) {
      final n = mal.group(1)!;
      proveedores.putIfAbsent(n, () => Proveedor(n)).fallos++;
    }
    return true;
  }

  /// El porcentaje nunca retrocede: verlo bajar destruye la confianza.
  int _subir(int nuevo) => nuevo > porcentaje ? nuevo : porcentaje;
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

const _fondo = Color(0xFF0E141A);
const _tarjeta = Color(0xFF161E26);
const _linea = Color(0xFF26333F);
const _tinta = Color(0xFFE4EAF0);
const _tinta2 = Color(0xFF9BA9B5);
const _acento = Color(0xFF5CC4C4);
const _ok = Color(0xFF4ADE80);
const _aviso = Color(0xFFE9A24C);

/// Panel del auditor: avance, fases y estado de la cadena de IA.
class PanelAuditor extends StatelessWidget {
  const PanelAuditor({super.key, required this.estado, required this.conectado});

  final EstadoAuditoria estado;
  final bool conectado;

  @override
  Widget build(BuildContext context) {
    final hayActividad = estado.porcentaje > 0;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _Avance(estado: estado, conectado: conectado),
        const SizedBox(height: 16),
        if (hayActividad) ...[
          _Seccion(titulo: 'Fases', hijo: _Fases(fases: estado.fases)),
          const SizedBox(height: 14),
          _Seccion(titulo: 'Cerebro IA', hijo: _Cadena(estado: estado)),
        ] else
          const _SinActividad(),
        if (estado.historial.isNotEmpty) ...[
          const SizedBox(height: 14),
          _Seccion(
            titulo: 'Historial · últimas ${estado.historial.length}',
            hijo: _Historial(corridas: estado.historial),
          ),
        ],
      ],
    );
  }
}

class _Avance extends StatelessWidget {
  const _Avance({required this.estado, required this.conectado});
  final EstadoAuditoria estado;
  final bool conectado;

  @override
  Widget build(BuildContext context) {
    final color = estado.conAvisos ? _aviso : (estado.terminado ? _ok : _acento);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _tarjeta,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _linea),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: conectado ? _ok : _tinta2,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                conectado ? 'AUDITANDO EN VIVO' : 'SIN CONEXIÓN',
                style: const TextStyle(
                  color: _tinta2, fontSize: 11, letterSpacing: 1.4, fontWeight: FontWeight.w700),
              ),
              const Spacer(),
              Text('${estado.porcentaje}%',
                  style: TextStyle(
                      color: color, fontSize: 26, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: estado.porcentaje / 100,
              minHeight: 8,
              backgroundColor: _linea,
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
          if (estado.faseActual.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(estado.faseActual,
                style: const TextStyle(
                    color: _tinta, fontSize: 15, fontWeight: FontWeight.w600)),
          ],
          if (estado.detalle.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(estado.detalle,
                  style: const TextStyle(color: _tinta2, fontSize: 12)),
            ),
        ],
      ),
    );
  }
}

class _Fases extends StatelessWidget {
  const _Fases({required this.fases});
  final List<Fase> fases;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: fases.map((f) {
        final (color, icono) = switch (f.estado) {
          EstadoFase.hecha => (_ok, Icons.check_circle),
          EstadoFase.enCurso => (_acento, Icons.autorenew),
          EstadoFase.fallida => (_aviso, Icons.error_outline),
          EstadoFase.pendiente => (_tinta2, Icons.circle_outlined),
        };
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: Row(
            children: [
              Icon(icono, size: 17, color: color),
              const SizedBox(width: 10),
              Expanded(
                child: Text(f.nombre,
                    style: TextStyle(
                        color: f.estado == EstadoFase.pendiente ? _tinta2 : _tinta,
                        fontSize: 14)),
              ),
              if (f.detalle.isNotEmpty)
                Text(f.detalle,
                    style: const TextStyle(color: _tinta2, fontSize: 11)),
            ],
          ),
        );
      }).toList(),
    );
  }
}

class _Cadena extends StatelessWidget {
  const _Cadena({required this.estado});
  final EstadoAuditoria estado;

  @override
  Widget build(BuildContext context) {
    if (estado.proveedores.isEmpty) {
      return const Text('Ningún modelo ha respondido todavía.',
          style: TextStyle(color: _tinta2, fontSize: 13));
    }
    final tasa = estado.tasaAcierto;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (tasa != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text('$tasa % de acierto · ${estado.aciertos} ✓ · ${estado.fallos} ✕',
                style: const TextStyle(color: _acento, fontSize: 12, fontWeight: FontWeight.w700)),
          ),
        ...estado.proveedores.values.map((p) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                children: [
                  const Icon(Icons.memory, size: 15, color: _tinta2),
                  const SizedBox(width: 8),
                  Expanded(
                      child: Text(p.nombre,
                          style: const TextStyle(color: _tinta, fontSize: 13))),
                  Text('${p.aciertos}',
                      style: const TextStyle(color: _ok, fontSize: 12, fontWeight: FontWeight.w700)),
                  if (p.fallos > 0) ...[
                    const SizedBox(width: 8),
                    Text('${p.fallos}',
                        style: const TextStyle(
                            color: _aviso, fontSize: 12, fontWeight: FontWeight.w700)),
                  ],
                ],
              ),
            )),
      ],
    );
  }
}

/// Las construcciones anteriores, con el resumen que de verdad se consulta:
/// salió o no salió, cuánto tardó y qué modelos entraron.
class _Historial extends StatelessWidget {
  const _Historial({required this.corridas});
  final List<CorridaAuditada> corridas;

  static const _meses = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ];

  String _fecha(DateTime d) {
    final hora = '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    final hoy = DateTime.now();
    final esHoy = d.year == hoy.year && d.month == hoy.month && d.day == hoy.day;
    return esHoy ? 'hoy $hora' : '${d.day} ${_meses[d.month - 1]} · $hora';
  }

  @override
  Widget build(BuildContext context) {
    final buenas = corridas.where((c) => c.salioBien).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('$buenas de ${corridas.length} llegaron a estar en vivo',
            style: const TextStyle(color: _acento, fontSize: 12, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        ...corridas.map((c) {
          final (color, icono) = switch (c.desenlace) {
            'listo' => (_ok, Icons.check_circle),
            'avisos' => (_aviso, Icons.error_outline),
            _ => (_tinta2, Icons.remove_circle_outline),
          };
          final modelos = c.modelos.isEmpty ? 'sin modelos registrados' : c.modelos.join(' · ');
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 7),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icono, size: 17, color: color),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(_fecha(c.cuando),
                              style: const TextStyle(
                                  color: _tinta, fontSize: 13.5, fontWeight: FontWeight.w600)),
                          const SizedBox(width: 8),
                          Text(c.duracion,
                              style: const TextStyle(color: _tinta2, fontSize: 11.5)),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(modelos,
                          style: const TextStyle(color: _tinta2, fontSize: 11.5, height: 1.35)),
                      if (c.aciertos + c.fallos > 0)
                        Text('${c.aciertos} ✓ · ${c.fallos} ✕',
                            style: const TextStyle(color: _tinta2, fontSize: 11)),
                    ],
                  ),
                ),
                if (c.desenlace != 'listo')
                  Text('${c.porcentaje}%',
                      style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
              ],
            ),
          );
        }),
      ],
    );
  }
}

class _Seccion extends StatelessWidget {
  const _Seccion({required this.titulo, required this.hijo});
  final String titulo;
  final Widget hijo;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _tarjeta,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _linea),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(titulo.toUpperCase(),
              style: const TextStyle(
                  color: _tinta2, fontSize: 11, letterSpacing: 1.3, fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          hijo,
        ],
      ),
    );
  }
}

class _SinActividad extends StatelessWidget {
  const _SinActividad();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _linea, style: BorderStyle.solid),
      ),
      child: const Column(
        children: [
          Icon(Icons.radar, size: 40, color: _tinta2),
          SizedBox(height: 12),
          Text('Vigilando',
              style: TextStyle(color: _tinta, fontSize: 16, fontWeight: FontWeight.w600)),
          SizedBox(height: 6),
          Text(
            'Cuando alguien construya algo desde la web o el escritorio, lo verás aquí paso a paso.',
            textAlign: TextAlign.center,
            style: TextStyle(color: _tinta2, fontSize: 13, height: 1.4),
          ),
        ],
      ),
    );
  }
}

const fondoAuditor = _fondo;
