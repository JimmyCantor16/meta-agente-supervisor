/// Multimedia: tele y radio para acompañar la espera.
///
/// Construir un sistema tarda minutos. La promesa del producto es que puedas
/// hacer otra cosa mientras tanto, y el móvil es donde eso tiene más sentido:
/// dejas el sonido puesto y sigues la construcción de reojo.
///
/// Decisión de diseño: las emisoras se abren en el **reproductor del propio
/// teléfono** en vez de incrustar un reproductor aquí. Suena mejor de lo que
/// parece — el reproductor del sistema sigue sonando en segundo plano, con los
/// controles en la pantalla de bloqueo, mientras el auditor sigue vigilando.
library;

import 'package:flutter/material.dart';
import 'diseno.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

class Emisora {
  const Emisora(this.nombre, this.descripcion, this.url, this.icono);
  final String nombre;
  final String descripcion;
  final String url;
  final IconData icono;
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


class PanelMultimedia extends StatelessWidget {
  const PanelMultimedia({super.key});

  Future<void> _abrir(BuildContext context, Emisora e) async {
    final uri = Uri.parse(e.url);
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo abrir ${e.nombre}.')),
      );
    }
  }

  Future<void> _copiar(BuildContext context, Emisora e) async {
    await Clipboard.setData(ClipboardData(text: e.url));
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enlace copiado.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _Nota(),
        const SizedBox(height: 14),
        _Grupo(
          titulo: 'Radio',
          items: radios,
          onAbrir: (e) => _abrir(context, e),
          onCopiar: (e) => _copiar(context, e),
        ),
        const SizedBox(height: 14),
        _Grupo(
          titulo: 'Televisión',
          items: canales,
          onAbrir: (e) => _abrir(context, e),
          onCopiar: (e) => _copiar(context, e),
        ),
      ],
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
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: marca.withValues(alpha: 0.3)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 18, color: marca),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Suena en el reproductor de tu teléfono, así que sigue sonando aunque cambies de pantalla. Mientras tanto, el auditor sigue vigilando.',
              style: TextStyle(color: tintaSuave, fontSize: 12.5, height: 1.45),
            ),
          ),
        ],
      ),
    );
  }
}

class _Grupo extends StatelessWidget {
  const _Grupo({
    required this.titulo,
    required this.items,
    required this.onAbrir,
    required this.onCopiar,
  });

  final String titulo;
  final List<Emisora> items;
  final void Function(Emisora) onAbrir;
  final void Function(Emisora) onCopiar;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: tarjeta,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: linea),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(titulo.toUpperCase(),
              style: const TextStyle(
                  color: tintaSuave, fontSize: 11, letterSpacing: 1.3, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          ...items.map((e) => InkWell(
                onTap: () => onAbrir(e),
                onLongPress: () => onCopiar(e),
                borderRadius: BorderRadius.circular(10),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
                  child: Row(
                    children: [
                      Icon(e.icono, size: 20, color: marca),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(e.nombre,
                                style: const TextStyle(
                                    color: tinta, fontSize: 14.5, fontWeight: FontWeight.w600)),
                            Text(e.descripcion,
                                style: const TextStyle(color: tintaSuave, fontSize: 11.5)),
                          ],
                        ),
                      ),
                      const Icon(Icons.play_circle_outline, size: 22, color: tintaSuave),
                    ],
                  ),
                ),
              )),
        ],
      ),
    );
  }
}

const fondoMultimedia = fondo;
