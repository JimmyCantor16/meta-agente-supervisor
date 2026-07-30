// Prueba del auditor: que el historial registre lo que pasó, no solo el ahora.
//
// Se comprueba lo que de verdad importa para auditar: que una construcción
// buena quede como buena, que una cortada a medias NO desaparezca, y que el
// porcentaje jamás retroceda (verlo bajar destruye la confianza en el panel).

import 'package:flutter_test/flutter_test.dart';
import 'package:metaagente_movil/auditor.dart';

void main() {
  test('una construcción que llega a estar viva queda archivada como buena', () {
    final a = EstadoAuditoria();
    a.aplicar('🧠 Cerebro IA listo: 8 modelos en cadena');
    a.aplicar('🤖 IA «groq» respondió (rol code)');
    a.aplicar('✍️ Escribiendo 5 de 10: web.py');
    a.aplicar('✅ ¡Verificación superada! Tu sistema compila y arranca.');
    a.aplicar('🚀 ¡Tu sistema está VIVO en http://localhost:5301!');

    expect(a.terminado, isTrue);
    expect(a.porcentaje, 100);
    expect(a.historial, hasLength(1));
    expect(a.historial.first.salioBien, isTrue);
    expect(a.historial.first.url, 'http://localhost:5301');
    expect(a.historial.first.modelos, contains('groq'));
  });

  test('una construcción cortada a medias no desaparece del historial', () {
    final a = EstadoAuditoria();
    a.aplicar('🧠 Cerebro IA listo: 8 modelos en cadena');
    a.aplicar('✍️ Escribiendo 3 de 12: db.py');
    // Empieza otra sin que la anterior terminara.
    a.aplicar('🧠 Cerebro IA listo: 8 modelos en cadena');

    expect(a.historial, hasLength(1));
    expect(a.historial.first.desenlace, 'incompleta');
    expect(a.historial.first.salioBien, isFalse);
    expect(a.porcentaje, 5, reason: 'la nueva empieza de cero');
  });

  test('lo retenido se archiva con avisos, no como éxito', () {
    final a = EstadoAuditoria();
    a.aplicar('🧠 Cerebro IA listo: 8 modelos en cadena');
    a.aplicar('⚠️ IA «gemini» falló → salto a la siguiente');
    a.aplicar('🛡️ La página no pasó la inspección del navegador: no se entrega rota.');

    expect(a.historial.first.desenlace, 'avisos');
    expect(a.historial.first.fallos, 1);
    expect(a.conAvisos, isTrue);
  });

  test('el porcentaje nunca retrocede', () {
    final a = EstadoAuditoria();
    a.aplicar('🧠 Cerebro IA listo: 8 modelos en cadena');
    a.aplicar('📦 Instalando las dependencias del proyecto…'); // 68
    a.aplicar('✍️ Escribiendo 1 de 40: main.py'); // pediría ~21
    expect(a.porcentaje, greaterThanOrEqualTo(68));
  });

  test('lo archivado sobrevive al viaje a disco y vuelta', () {
    final original = CorridaAuditada(
      cuando: DateTime(2026, 7, 29, 15, 4),
      porcentaje: 100,
      desenlace: 'listo',
      url: 'https://ejemplo.onrender.com',
      aciertos: 7,
      fallos: 2,
      modelos: const ['groq', 'gemini'],
      segundos: 200,
    );
    final vuelta = CorridaAuditada.deJson(original.aJson())!;
    expect(vuelta.desenlace, 'listo');
    expect(vuelta.modelos, ['groq', 'gemini']);
    expect(vuelta.duracion, '3 min 20 s');
    expect(vuelta.cuando, original.cuando);
  });

  test('un registro corrupto no rompe el historial', () {
    expect(CorridaAuditada.deJson({'cuando': 'no-es-una-fecha'}), isNull);
  });
}
