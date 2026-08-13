/// Bandeja de entregas: aprobar o rechazar el trabajo del agente DESDE EL
/// TELÉFONO, que es donde te pilla la notificación de «listo para revisión».
///
/// Contrato compartido con la web y el escritorio (lo cablea el integrador en
/// api.py):
///   GET  /api/v1/agent/entregas
///     -> [{slug, rama, fecha, resumen_informe,
///          veredicto: {aprobar, calidad, resumen, mejoras} | null, dueno}]
///   POST /api/v1/agent/entregas/{slug}/aprobar        -> {estado: "aprobada"}
///   POST /api/v1/agent/entregas/{slug}/rechazar
///        (body {motivo?})                             -> {estado: "rechazada"}
/// Misma auth Bearer que el resto; solo el dueño puede resolver su entrega.
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'diseno.dart';
import 'sesion.dart';

// ---------------------------------------------------------------------------
// Modelos (tolerantes a propósito: un campo que falte no tumba la bandeja)
// ---------------------------------------------------------------------------

/// El juicio del revisor automático sobre una entrega, si ya existe.
class VeredictoEntrega {
  VeredictoEntrega({
    required this.aprobar,
    required this.calidad,
    required this.resumen,
    required this.mejoras,
  });

  final bool aprobar;
  final int calidad;
  final String resumen;
  final List<String> mejoras;

  static VeredictoEntrega deJson(Map<String, dynamic> j) => VeredictoEntrega(
        aprobar: j['aprobar'] == true,
        calidad: (j['calidad'] as num?)?.toInt() ?? 0,
        resumen: '${j['resumen'] ?? ''}',
        mejoras: (j['mejoras'] as List?)?.map((m) => '$m').toList() ?? const [],
      );
}

/// Una entrega del agente esperando la decisión humana.
class Entrega {
  Entrega({
    required this.slug,
    required this.rama,
    required this.fecha,
    required this.resumenInforme,
    required this.veredicto,
    required this.dueno,
    required this.esSuyo,
  });

  final String slug;
  final String rama;
  final String fecha;
  final String resumenInforme;
  final VeredictoEntrega? veredicto;
  final String dueno;

  /// Si el backend no manda `es_suyo`, se decide comparando `dueno` con el
  /// email de la sesión (y en última instancia decide el servidor: un POST
  /// ajeno vuelve rechazado).
  final bool? esSuyo;

  static Entrega deJson(Map<String, dynamic> j) => Entrega(
        slug: '${j['slug'] ?? ''}',
        rama: '${j['rama'] ?? ''}',
        fecha: '${j['fecha'] ?? ''}',
        resumenInforme: '${j['resumen_informe'] ?? ''}',
        veredicto: j['veredicto'] is Map<String, dynamic>
            ? VeredictoEntrega.deJson(j['veredicto'] as Map<String, dynamic>)
            : null,
        dueno: '${j['dueno'] ?? ''}',
        esSuyo: j['es_suyo'] is bool ? j['es_suyo'] as bool : null,
      );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

/// La pestaña «Entregas»: lista, veredicto del revisor y botones de decisión.
class PanelEntregas extends StatefulWidget {
  const PanelEntregas({super.key, required this.sesion, this.cliente});

  final Sesion sesion;

  /// Cliente HTTP inyectable: los tests pintan la bandeja sin red real.
  final http.Client? cliente;

  @override
  State<PanelEntregas> createState() => _PanelEntregasState();
}

class _PanelEntregasState extends State<PanelEntregas> {
  late final http.Client _http = widget.cliente ?? http.Client();
  bool _cargando = false;
  String? _error;
  List<Entrega> _entregas = const [];
  final Set<String> _resolviendo = {};

  /// Con qué sesión se llenó la lista: si el token cambia (entró OTRA cuenta,
  /// o se cerró la sesión), lo listado pertenece al usuario anterior.
  String? _tokenVisto;

  @override
  void initState() {
    super.initState();
    _tokenVisto = widget.sesion.token;
    widget.sesion.addListener(_alCambiarSesion);
    if (widget.sesion.estado == EstadoSesion.conSesion) unawaited(_cargar());
  }

  @override
  void dispose() {
    widget.sesion.removeListener(_alCambiarSesion);
    super.dispose();
  }

  void _alCambiarSesion() {
    if (!mounted) return;
    final token = widget.sesion.token;
    if (token == _tokenVisto) {
      setState(() {});
      return;
    }
    // La sesión CAMBIÓ de verdad (otra cuenta o cierre): se vacía la lista
    // SIEMPRE — quedarse con las entregas del usuario anterior enseña datos
    // ajenos y aprobar daría 404 — y, si hay sesión nueva, se recarga.
    _tokenVisto = token;
    setState(() {
      _entregas = const [];
      _error = null;
    });
    if (widget.sesion.estado == EstadoSesion.conSesion) unawaited(_cargar());
  }

  // ------------------------------------------------------------------ red --

  Future<void> _cargar() async {
    if (!mounted) return;
    // Si la sesión cambia mientras la petición viaja, la respuesta ya no es de
    // este usuario y se descarta al llegar.
    final tokenAlPedir = widget.sesion.token;
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final res = await _http
          .get(Uri.parse('$servidorBase/api/v1/agent/entregas'),
              headers: widget.sesion.cabeceras())
          .timeout(const Duration(seconds: 20));
      if (res.statusCode == 401) {
        widget.sesion.marcarCaducada();
        throw 'Tu sesión caducó: vuelve a entrar.';
      }
      if (res.statusCode != 200) throw 'El servidor respondió ${res.statusCode}.';
      final data = jsonDecode(utf8.decode(res.bodyBytes));
      final entregas = (data is List ? data : const [])
          .whereType<Map<String, dynamic>>()
          .map(Entrega.deJson)
          .where((e) => e.slug.isNotEmpty)
          .toList();
      if (!mounted || widget.sesion.token != tokenAlPedir) return;
      setState(() => _entregas = entregas);
    } catch (e) {
      if (!mounted || widget.sesion.token != tokenAlPedir) return;
      setState(() => _error = e is String ? e : 'No pude traer las entregas. Revisa tu conexión.');
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  Future<void> _resolver(Entrega e, {required bool aprobar, String motivo = ''}) async {
    setState(() => _resolviendo.add(e.slug));
    try {
      final accion = aprobar ? 'aprobar' : 'rechazar';
      final res = await _http
          .post(
            Uri.parse('$servidorBase/api/v1/agent/entregas/${e.slug}/$accion'),
            headers: widget.sesion.cabeceras(),
            body: utf8.encode(jsonEncode(
                aprobar ? const <String, String>{} : {if (motivo.isNotEmpty) 'motivo': motivo})),
          )
          .timeout(const Duration(seconds: 30));
      if (res.statusCode == 401) {
        widget.sesion.marcarCaducada();
        throw 'Tu sesión caducó: vuelve a entrar.';
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        // El backend redacta el porqué en `detail` (p. ej. el 409 de conflicto
        // de merge trae la guía de qué hacer): eso vale más que el número solo.
        throw _detalleDe(res) ??
            'No se pudo resolver: el servidor respondió ${res.statusCode}.';
      }
      _avisarEnPantalla(aprobar ? '«${e.slug}» aprobada ✅' : '«${e.slug}» rechazada');
      await _cargar(); // la lista fresca es la única verdad tras resolver
    } catch (err) {
      _avisarEnPantalla(err is String ? err : 'No se pudo resolver la entrega. Inténtalo de nuevo.');
    } finally {
      if (mounted) setState(() => _resolviendo.remove(e.slug));
    }
  }

  /// El `detail` del cuerpo de error (así lo manda FastAPI), truncado a un
  /// tamaño de SnackBar; null si el cuerpo no trae nada legible.
  static String? _detalleDe(http.Response res) {
    try {
      final data = jsonDecode(utf8.decode(res.bodyBytes));
      final detail = data is Map ? data['detail'] : null;
      final texto = detail is String ? detail.trim() : '';
      if (texto.isEmpty) return null;
      return texto.length > 300 ? '${texto.substring(0, 300)}…' : texto;
    } catch (_) {
      return null;
    }
  }

  void _avisarEnPantalla(String texto) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(texto)));
  }

  // -------------------------------------------------------------- diálogos --

  Future<void> _confirmarAprobar(Entrega e) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: tarjeta,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radioTarjeta)),
        title: Text('¿Aprobar «${e.slug}»?',
            style: const TextStyle(color: tinta, fontSize: 17, fontWeight: FontWeight.w700)),
        content: const Text(
          'La entrega se dará por buena y seguirá su camino. Esta decisión no se deshace desde aquí.',
          style: TextStyle(color: tintaSuave, fontSize: 13.5, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar', style: TextStyle(color: tintaSuave)),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: marca,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radio)),
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Sí, aprobar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _resolver(e, aprobar: true);
  }

  Future<void> _pedirRechazo(Entrega e) async {
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: tarjeta,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radioTarjeta)),
        title: Text('¿Rechazar «${e.slug}»?',
            style: const TextStyle(color: tinta, fontSize: 17, fontWeight: FontWeight.w700)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Si cuentas el motivo, el agente sabrá qué mejorar en el siguiente intento.',
              style: TextStyle(color: tintaSuave, fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: ctrl,
              minLines: 2,
              maxLines: 4,
              style: const TextStyle(color: tinta, fontSize: 13.5),
              decoration: InputDecoration(
                hintText: 'Motivo (opcional)',
                hintStyle: const TextStyle(color: tintaTenue),
                filled: true,
                fillColor: fondo,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(radio),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar', style: TextStyle(color: tintaSuave)),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: alerta,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radio)),
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Rechazar'),
          ),
        ],
      ),
    );
    final motivo = ctrl.text.trim();
    ctrl.dispose();
    if (ok != true || !mounted) return;
    await _resolver(e, aprobar: false, motivo: motivo);
  }

  // ------------------------------------------------------------------- UI --

  @override
  Widget build(BuildContext context) {
    if (widget.sesion.estado != EstadoSesion.conSesion) return _invitacion(context);
    return RefreshIndicator(
      color: marca,
      backgroundColor: tarjeta,
      onRefresh: _cargar,
      child: _contenido(),
    );
  }

  /// Sin sesión no hay bandeja: las entregas son de quien las pidió.
  Widget _invitacion(BuildContext context) {
    final caducada = widget.sesion.caducada;
    final esperando = widget.sesion.estado == EstadoSesion.esperando;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const SizedBox(height: 48),
        const Icon(Icons.inbox_outlined, size: 44, color: tintaSuave),
        const SizedBox(height: 12),
        const Center(
          child: Text('Tus entregas, en el bolsillo',
              style: TextStyle(color: tinta, fontSize: 16, fontWeight: FontWeight.w700)),
        ),
        const SizedBox(height: 6),
        Center(
          child: Text(
            esperando
                ? 'Esperando el login en el navegador… El código de verificación está en la pantalla de sesión.'
                : caducada
                    ? 'Tu sesión caducó: vuelve a entrar para ver y resolver tus entregas.'
                    : 'Inicia sesión para ver lo que el agente dejó listo para revisión, y aprobarlo o rechazarlo desde aquí.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: tintaSuave, fontSize: 13, height: 1.4),
          ),
        ),
        const SizedBox(height: 18),
        Center(
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: marca,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radio)),
            ),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => PantallaSesion(sesion: widget.sesion)),
            ),
            icon: const Icon(Icons.login, size: 18),
            label: Text(esperando ? 'Ver el código' : 'Iniciar sesión'),
          ),
        ),
      ],
    );
  }

  Widget _contenido() {
    // Siempre ListView desplazable: sin eso el pull-to-refresh no agarra.
    if (_cargando && _entregas.isEmpty && _error == null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 160),
          Center(child: CircularProgressIndicator(color: marca)),
        ],
      );
    }
    if (_error != null && _entregas.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          const SizedBox(height: 48),
          const Icon(Icons.cloud_off, size: 40, color: tintaSuave),
          const SizedBox(height: 12),
          Center(
            child: Text(_error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: aviso, fontSize: 13, height: 1.4)),
          ),
          const SizedBox(height: 14),
          Center(
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: tinta,
                side: const BorderSide(color: linea),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radio)),
              ),
              onPressed: _cargar,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Reintentar'),
            ),
          ),
        ],
      );
    }
    if (_entregas.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: const [
          SizedBox(height: 48),
          Icon(Icons.inbox_outlined, size: 40, color: tintaSuave),
          SizedBox(height: 12),
          Center(
            child: Text('No hay entregas esperando revisión',
                style: TextStyle(color: tinta, fontSize: 15, fontWeight: FontWeight.w600)),
          ),
          SizedBox(height: 6),
          Center(
            child: Text(
              'Cuando el agente termine un encargo y lo deje en su rama, aparecerá aquí para que lo apruebes o lo rechaces.',
              textAlign: TextAlign.center,
              style: TextStyle(color: tintaSuave, fontSize: 13, height: 1.4),
            ),
          ),
        ],
      );
    }
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        Row(
          children: [
            const Text('📬 Entregas del agente',
                style: TextStyle(color: tinta, fontWeight: FontWeight.w700)),
            const Spacer(),
            if (_cargando)
              const SizedBox(
                  width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: marca)),
          ],
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(_error!, style: const TextStyle(color: aviso, fontSize: 12)),
          ),
        const SizedBox(height: 12),
        ..._entregas.map(_tarjeta),
      ],
    );
  }

  Widget _tarjeta(Entrega e) {
    final v = e.veredicto;
    final ocupado = _resolviendo.contains(e.slug);
    final esSuya = e.esSuyo ?? (e.dueno.isEmpty || e.dueno == widget.sesion.email);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: tarjeta,
        borderRadius: BorderRadius.circular(radioTarjeta),
        border: Border.all(color: linea),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(e.slug,
                    style: const TextStyle(color: tinta, fontSize: 15, fontWeight: FontWeight.w700)),
              ),
              Text(_fechaCorta(e.fecha), style: const TextStyle(color: tintaTenue, fontSize: 11)),
            ],
          ),
          if (e.rama.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(e.rama, style: const TextStyle(color: tintaTenue, fontSize: 11)),
          ],
          if (e.resumenInforme.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(e.resumenInforme,
                style: const TextStyle(color: tintaSuave, fontSize: 13, height: 1.4)),
          ],
          if (v != null) ...[const SizedBox(height: 10), _cajaVeredicto(v)],
          const SizedBox(height: 12),
          if (!esSuya)
            Text(
              'Entrega de ${e.dueno.isEmpty ? 'otro usuario' : e.dueno}: solo su dueño puede resolverla.',
              style: const TextStyle(color: tintaTenue, fontSize: 12),
            )
          else
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: alerta,
                      side: const BorderSide(color: linea),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radio)),
                    ),
                    onPressed: ocupado ? null : () => _pedirRechazo(e),
                    child: const Text('Rechazar'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: marca,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radio)),
                    ),
                    onPressed: ocupado ? null : () => _confirmarAprobar(e),
                    child: ocupado
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Aprobar'),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }

  /// El juicio del revisor, con el color diciendo lo esencial de un vistazo.
  Widget _cajaVeredicto(VeredictoEntrega v) {
    final color = v.aprobar ? exito : aviso;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: fondo,
        borderRadius: BorderRadius.circular(radio),
        border: Border(left: BorderSide(color: color, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(v.aprobar ? Icons.thumb_up_alt_outlined : Icons.thumb_down_alt_outlined,
                  size: 15, color: color),
              const SizedBox(width: 6),
              Text(
                'Revisor: ${v.aprobar ? 'aprueba' : 'no aprueba'} · calidad ${v.calidad}/10',
                style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700),
              ),
            ],
          ),
          if (v.resumen.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(v.resumen, style: const TextStyle(color: tintaSuave, fontSize: 12.5, height: 1.4)),
          ],
          if (v.mejoras.isNotEmpty) ...[
            const SizedBox(height: 6),
            ...v.mejoras.map((m) => Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text('• $m',
                      style: const TextStyle(color: tintaTenue, fontSize: 12, height: 1.35)),
                )),
          ],
        ],
      ),
    );
  }

  static const _meses = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ];

  /// Fecha corta y humana; si el backend manda algo raro, se muestra tal cual.
  String _fechaCorta(String iso) {
    final d = DateTime.tryParse(iso)?.toLocal();
    if (d == null) return iso;
    final hora = '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    final hoy = DateTime.now();
    final esHoy = d.year == hoy.year && d.month == hoy.month && d.day == hoy.day;
    return esHoy ? 'hoy $hora' : '${d.day} ${_meses[d.month - 1]} · $hora';
  }
}
