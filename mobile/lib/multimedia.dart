/// Multimedia: tele y radio para acompañar la espera.
///
/// Construir un sistema tarda minutos. La promesa del producto es que puedas
/// hacer otra cosa mientras tanto, y el móvil es donde eso tiene más sentido:
/// dejas el sonido puesto y sigues la construcción de reojo.
///
/// La radio suena DENTRO de la app (just_audio + audio_service): sigue sonando
/// en segundo plano y con la pantalla apagada, con controles en la
/// notificación. La tele se ve dentro con video_player + chewie. Además del
/// puñado de emisoras "de la casa", se puede buscar cualquier emisora del
/// mundo (Radio Browser, igual que en el panel web) y guardar favoritas en el
/// teléfono. El reproductor externo de antes queda como plan B en el menú de
/// cada emisora (mantener pulsado).
library;

import 'dart:async';

import 'package:flutter/material.dart';

import 'diseno.dart';
import 'radios.dart';
import 'reproductor.dart';

class Emisora {
  const Emisora(this.nombre, this.descripcion, this.url, this.icono);
  final String nombre;
  final String descripcion;
  final String url;
  final IconData icono;

  /// La misma emisora como la entiende el reproductor y los favoritos.
  EmisoraNet get net => EmisoraNet(nombre: nombre, subtitulo: descripcion, url: url);
}

/// Emisoras con enlace directo y verificado. Todas por HTTPS: en el móvil el
/// tráfico sin cifrar se bloquea, así que una emisora http no sonaría.
const List<Emisora> radios = [
  Emisora('Radiónica', 'Bogotá · alternativa', 'https://streaming.rtvc.gov.co/radionicahd', Icons.radio),
  Emisora('Radio Nacional', 'Colombia · cultural', 'https://streaming.rtvc.gov.co/rnc-hd', Icons.podcasts),
  Emisora('Radio Paradise', 'Mundial · sin anuncios', 'https://stream.radioparadise.com/aac-320', Icons.music_note),
  Emisora('KEXP Seattle', 'Indie · descubrimiento', 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3', Icons.headphones),
  Emisora('FIP', 'Francia · ecléctica', 'https://icecast.radiofrance.fr/fip-midfi.mp3', Icons.library_music),
  Emisora('BBC World', 'Reino Unido · noticias', 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service', Icons.public),
];

const List<Emisora> canales = [
  Emisora('Xtrema Cine Clásico', 'Películas de siempre',
      'https://stmv6.voxtvhd.com.br/cineclasico/cineclasico/playlist.m3u8', Icons.movie),
  Emisora('MAX Anime', 'Animación japonesa',
      'https://cdnlive.klicgo.net/maxanime/live/playlist.m3u8', Icons.animation),
  Emisora('Xtrema Cartoons', 'Dibujos clásicos',
      'https://stmv6.voxtvhd.com.br/xtremacartoons/xtremacartoons/playlist.m3u8', Icons.tv),
];

class PanelMultimedia extends StatefulWidget {
  const PanelMultimedia({super.key});

  @override
  State<PanelMultimedia> createState() => _PanelMultimediaState();
}

class _PanelMultimediaState extends State<PanelMultimedia> {
  final _radio = ReproductorRadio.instancia;
  final _busqueda = TextEditingController();
  Timer? _rebote;
  int _peticion = 0; // descarta respuestas viejas que llegan tarde

  String _pais = '';
  bool _buscando = false;
  String? _errorBusqueda;

  /// `null` = modo normal (favoritas + fijas). Con lista (aunque vacía) se
  /// muestran los resultados de la búsqueda o los populares del país.
  List<EmisoraNet>? _resultados;

  List<EmisoraNet> _favoritas = [];

  @override
  void initState() {
    super.initState();
    // Las favoritas viven en el teléfono, como el historial del auditor.
    Favoritas.cargar().then((lista) {
      if (mounted && lista.isNotEmpty) setState(() => _favoritas = lista);
    });
    _busqueda.addListener(_alTeclear);
  }

  @override
  void dispose() {
    _rebote?.cancel();
    _busqueda.removeListener(_alTeclear);
    _busqueda.dispose();
    super.dispose();
  }

  // --- Búsqueda (Radio Browser) ---------------------------------------------

  void _alTeclear() {
    _rebote?.cancel();
    _rebote = Timer(const Duration(milliseconds: 500), _buscar);
  }

  Future<void> _buscar() async {
    final q = _busqueda.text.trim();
    final id = ++_peticion;
    if (q.isEmpty && _pais.isEmpty) {
      // Sin consulta ni país: volver a la vista normal.
      setState(() {
        _resultados = null;
        _errorBusqueda = null;
        _buscando = false;
      });
      return;
    }
    setState(() {
      _buscando = true;
      _errorBusqueda = null;
    });
    try {
      final lista = q.isNotEmpty
          ? await buscarRadios(q)
          : await radiosPopulares(codigoPais: _pais);
      if (!mounted || id != _peticion) return;
      setState(() {
        _resultados = lista;
        _buscando = false;
      });
    } catch (_) {
      if (!mounted || id != _peticion) return;
      setState(() {
        _errorBusqueda = 'No se pudo buscar emisoras. Revisa la conexión e inténtalo otra vez.';
        _buscando = false;
      });
    }
  }

  void _elegirPais(String codigo) {
    setState(() => _pais = codigo);
    _rebote?.cancel();
    _buscar();
  }

  // --- Reproducción y favoritas ----------------------------------------------

  Future<void> _tocar(EmisoraNet e) async {
    // La misma emisora: el toque pausa/reanuda. Otra: cambia de emisora.
    if (_radio.esLaQueSuena(e.url)) {
      await _radio.alternarPausa();
      return;
    }
    final error = await _radio.reproducir(e);
    if (error != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
    }
  }

  bool _esFavorita(String url) => _favoritas.any((f) => f.url == url);

  void _alternarFavorita(EmisoraNet e) {
    setState(() {
      final i = _favoritas.indexWhere((f) => f.url == e.url);
      if (i >= 0) {
        _favoritas.removeAt(i);
      } else {
        _favoritas.insert(0, e);
      }
    });
    Favoritas.guardar(_favoritas);
  }

  /// Menú contextual de una emisora o canal (mantener pulsado): favorita,
  /// reproductor externo (el plan B) y copiar enlace.
  void _menu(EmisoraNet e, {bool conFavorita = true}) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: tarjeta,
      builder: (contexto) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text(e.nombre,
                  style: const TextStyle(color: tinta, fontWeight: FontWeight.w600)),
              subtitle: e.subtitulo.isEmpty
                  ? null
                  : Text(e.subtitulo, style: const TextStyle(color: tintaSuave, fontSize: 12)),
            ),
            const Divider(color: linea, height: 1),
            if (conFavorita)
              ListTile(
                leading: Icon(_esFavorita(e.url) ? Icons.star : Icons.star_border, color: aviso),
                title: Text(_esFavorita(e.url) ? 'Quitar de favoritas' : 'Guardar en favoritas',
                    style: const TextStyle(color: tinta)),
                onTap: () {
                  Navigator.pop(contexto);
                  _alternarFavorita(e);
                },
              ),
            ListTile(
              leading: const Icon(Icons.open_in_new, color: tintaSuave),
              title: const Text('Abrir en reproductor externo', style: TextStyle(color: tinta)),
              onTap: () {
                Navigator.pop(contexto);
                abrirEnExterno(context, e.nombre, e.url);
              },
            ),
            ListTile(
              leading: const Icon(Icons.copy, color: tintaSuave),
              title: const Text('Copiar enlace', style: TextStyle(color: tinta)),
              onTap: () {
                Navigator.pop(contexto);
                copiarEnlace(context, e.url);
              },
            ),
          ],
        ),
      ),
    );
  }

  void _verTv(Emisora c) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => PantallaTv(titulo: c.nombre, url: c.url)),
    );
  }

  // --- Interfaz ----------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    // Todo el panel escucha al reproductor: la barra "sonando" y los
    // indicadores por fila cambian solos al pausar desde la notificación.
    return ListenableBuilder(
      listenable: _radio.cambios,
      builder: (context, _) {
        final enBusqueda = _resultados != null || _buscando || _errorBusqueda != null;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_radio.emisora.value != null) ...[
              _barraSonando(_radio.emisora.value!),
              const SizedBox(height: 12),
            ],
            const _Nota(),
            const SizedBox(height: 14),
            _buscador(),
            const SizedBox(height: 14),
            if (enBusqueda)
              _seccionResultados()
            else ...[
              if (_favoritas.isNotEmpty) ...[
                _grupo('Favoritas',
                    _favoritas.map((e) => _fila(e, icono: Icons.star, colorIcono: aviso))),
                const SizedBox(height: 14),
              ],
              _grupo('Radio', radios.map((r) => _fila(r.net, icono: r.icono))),
              const SizedBox(height: 14),
              _grupo('Televisión', canales.map(_filaTv)),
            ],
          ],
        );
      },
    );
  }

  /// La barra fija de "esto está sonando": nombre, carga, pausa/reanuda y stop.
  Widget _barraSonando(EmisoraNet e) {
    final cargando = _radio.cargando.value;
    final sonando = _radio.reproduciendo.value;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: marca.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(radioTarjeta),
        border: Border.all(color: marca.withValues(alpha: 0.45)),
      ),
      child: Row(
        children: [
          if (cargando)
            const SizedBox(
                width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: acento))
          else
            Icon(sonando ? Icons.graphic_eq : Icons.pause_circle_outline, color: acento, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(e.nombre,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: tinta, fontWeight: FontWeight.w600, fontSize: 14)),
                Text(
                  cargando ? 'Sintonizando…' : (sonando ? 'Sonando ahora' : 'En pausa'),
                  style: const TextStyle(color: tintaSuave, fontSize: 11.5),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: sonando ? 'Pausar' : 'Reanudar',
            onPressed: _radio.alternarPausa,
            icon: Icon(sonando ? Icons.pause : Icons.play_arrow, color: tinta),
          ),
          IconButton(
            tooltip: 'Detener',
            onPressed: _radio.detener,
            icon: const Icon(Icons.stop, color: tintaSuave),
          ),
        ],
      ),
    );
  }

  Widget _buscador() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: tarjeta,
        borderRadius: BorderRadius.circular(radioTarjeta),
        border: Border.all(color: linea),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _busqueda,
            style: const TextStyle(color: tinta, fontSize: 14),
            decoration: InputDecoration(
              hintText: 'Busca emisoras del mundo (nombre o género)',
              hintStyle: const TextStyle(color: tintaTenue, fontSize: 13.5),
              prefixIcon: const Icon(Icons.search, color: tintaSuave, size: 20),
              suffixIcon: _busqueda.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Limpiar',
                      icon: const Icon(Icons.close, color: tintaSuave, size: 18),
                      onPressed: () {
                        _busqueda.clear();
                        _elegirPais('');
                      },
                    ),
              isDense: true,
              filled: true,
              fillColor: fondo,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(radio),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            children: paisesRadio.map((p) {
              final activo = _pais == p.codigo;
              return ChoiceChip(
                label: Text(p.etiqueta,
                    style: TextStyle(
                        fontSize: 12,
                        color: activo ? Colors.white : tintaSuave,
                        fontWeight: activo ? FontWeight.w600 : FontWeight.w400)),
                selected: activo,
                onSelected: (_) => _elegirPais(activo ? '' : p.codigo),
                selectedColor: marca,
                backgroundColor: fondo,
                side: BorderSide(color: activo ? marca : linea),
                showCheckmark: false,
                visualDensity: VisualDensity.compact,
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _seccionResultados() {
    final resultados = _resultados ?? const <EmisoraNet>[];
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: tarjeta,
        borderRadius: BorderRadius.circular(radioTarjeta),
        border: Border.all(color: linea),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_busqueda.text.trim().isEmpty ? 'POPULARES' : 'RESULTADOS',
              style: const TextStyle(
                  color: tintaSuave, fontSize: 11, letterSpacing: 1.3, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (_buscando)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 18),
              child: Center(
                  child: SizedBox(
                      width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: marca))),
            )
          else if (_errorBusqueda != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_errorBusqueda!,
                      style: const TextStyle(color: alerta, fontSize: 13, height: 1.4)),
                  TextButton.icon(
                    onPressed: _buscar,
                    icon: const Icon(Icons.refresh, size: 16),
                    label: const Text('Reintentar'),
                  ),
                ],
              ),
            )
          else if (resultados.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('Ninguna emisora coincide. Prueba con otro nombre o género.',
                  style: TextStyle(color: tintaSuave, fontSize: 13)),
            )
          else
            // Se muestran hasta 40: suficientes para elegir sin hacer la lista pesada.
            ...resultados.take(40).map((e) => _fila(e)),
        ],
      ),
    );
  }

  Widget _grupo(String titulo, Iterable<Widget> filas) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: tarjeta,
        borderRadius: BorderRadius.circular(radioTarjeta),
        border: Border.all(color: linea),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(titulo.toUpperCase(),
              style: const TextStyle(
                  color: tintaSuave, fontSize: 11, letterSpacing: 1.3, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          ...filas,
        ],
      ),
    );
  }

  /// Una emisora de radio: toque = sonar/pausar dentro de la app; mantener
  /// pulsado = menú (favorita, externo, copiar).
  Widget _fila(EmisoraNet e, {IconData icono = Icons.radio, Color colorIcono = marca}) {
    final suena = _radio.esLaQueSuena(e.url);
    final favorita = _esFavorita(e.url);
    return InkWell(
      onTap: () => _tocar(e),
      onLongPress: () => _menu(e),
      borderRadius: BorderRadius.circular(radioTarjeta),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Row(
          children: [
            Icon(icono, size: 20, color: suena ? acento : colorIcono),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(e.nombre,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: suena ? acento : tinta,
                          fontSize: 14.5,
                          fontWeight: FontWeight.w600)),
                  if (e.subtitulo.isNotEmpty)
                    Text(e.subtitulo,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: tintaSuave, fontSize: 11.5)),
                ],
              ),
            ),
            IconButton(
              tooltip: favorita ? 'Quitar de favoritas' : 'Guardar en favoritas',
              onPressed: () => _alternarFavorita(e),
              icon: Icon(favorita ? Icons.star : Icons.star_border,
                  size: 20, color: favorita ? aviso : tintaTenue),
            ),
            if (suena && _radio.cargando.value)
              const SizedBox(
                  width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: acento))
            else
              Icon(
                suena
                    ? (_radio.reproduciendo.value ? Icons.pause_circle_outline : Icons.play_circle_fill)
                    : Icons.play_circle_outline,
                size: 22,
                color: suena ? acento : tintaSuave,
              ),
          ],
        ),
      ),
    );
  }

  /// Un canal de tele: toque = verlo dentro de la app; mantener pulsado = menú
  /// con el reproductor externo de siempre como fallback.
  Widget _filaTv(Emisora c) {
    return InkWell(
      onTap: () => _verTv(c),
      onLongPress: () => _menu(c.net, conFavorita: false),
      borderRadius: BorderRadius.circular(radioTarjeta),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Row(
          children: [
            Icon(c.icono, size: 20, color: marca),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(c.nombre,
                      style: const TextStyle(color: tinta, fontSize: 14.5, fontWeight: FontWeight.w600)),
                  Text(c.descripcion, style: const TextStyle(color: tintaSuave, fontSize: 11.5)),
                ],
              ),
            ),
            const Icon(Icons.smart_display_outlined, size: 22, color: tintaSuave),
          ],
        ),
      ),
    );
  }
}

class _Nota extends StatelessWidget {
  const _Nota();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: marca.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(radioTarjeta),
        border: Border.all(color: marca.withValues(alpha: 0.3)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 18, color: marca),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'La radio suena dentro de la app y sigue sonando con la pantalla apagada: contrólala desde la notificación. Mientras tanto, el auditor sigue vigilando.',
              style: TextStyle(color: tintaSuave, fontSize: 12.5, height: 1.45),
            ),
          ),
        ],
      ),
    );
  }
}

const fondoMultimedia = fondo;
