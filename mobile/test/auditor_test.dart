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

  test('un evento JSON de fase avanza igual que su frase equivalente', () {
    // El backend emite las dos cosas en la misma corrida; si el JSON pintara
    // otros números, uno de los canales quedaría mudo. Aquí se exige que el
    // evento estructurado de escritura deje el panel EXACTAMENTE como la
    // frase «Escribiendo 5 de 10».
    final porFrase = EstadoAuditoria();
    porFrase.aplicar('🧠 Cerebro IA listo: 8 modelos en cadena');
    porFrase.aplicar('✍️ Escribiendo 5 de 10: web.py');

    final porEvento = EstadoAuditoria();
    porEvento.aplicar('🧠 Cerebro IA listo: 8 modelos en cadena');
    porEvento.aplicar(
        '{"t":"fase","fase":"escribir","indice":3,"total":5,"detalle":"Escribiendo el código de tu sistema","paso":5,"de":10}');

    expect(porEvento.porcentaje, porFrase.porcentaje);
    expect(porEvento.faseActual, porFrase.faseActual);
    expect(porEvento.detalle, porFrase.detalle);
    expect(porEvento.fases[2].estado, porFrase.fases[2].estado);
    expect(porEvento.fases[2].detalle, porFrase.fases[2].detalle);
  });

  test('los eventos JSON respetan que el porcentaje nunca retrocede', () {
    final a = EstadoAuditoria();
    a.aplicar('🧠 Cerebro IA listo: 8 modelos en cadena');
    a.aplicar('📦 Instalando las dependencias del proyecto…'); // 68
    // La primera pasada de verificación pediría menos: no puede bajar.
    a.aplicar(
        '{"t":"fase","fase":"verificar","indice":4,"total":5,"detalle":"Comprobando que arranca y responde","paso":1,"de":7}');
    expect(a.porcentaje, greaterThanOrEqualTo(68));
    expect(a.faseActual, 'Verificando');
  });

  test('una corrida contada solo con eventos JSON llega a puerto', () {
    final a = EstadoAuditoria();
    a.aplicar('🧠 Cerebro IA listo: 8 modelos en cadena');
    a.aplicar(
        '{"t":"fase","fase":"entender","indice":1,"total":5,"detalle":"Leyendo tu idea y decidiendo qué construir"}');
    a.aplicar(
        '{"t":"fase","fase":"escribir","indice":3,"total":5,"detalle":"Escribiendo el código de tu sistema"}');
    a.aplicar(
        '{"t":"fase","fase":"verificar","indice":4,"total":5,"detalle":"Comprobando que arranca y responde","paso":1,"de":7}');
    a.aplicar(
        '{"t":"fase","fase":"publicar","indice":5,"total":5,"detalle":"Arrancando tu sistema y preparando su dirección"}');

    // El evento de publicar NO cierra la corrida: el cierre (100, URL,
    // archivado) sigue siendo del mensaje final de VIVO.
    expect(a.terminado, isFalse);
    expect(a.porcentaje, 95);

    a.aplicar('🚀 ¡Tu sistema está VIVO en http://localhost:5301!');
    expect(a.terminado, isTrue);
    expect(a.porcentaje, 100);
    expect(a.historial, hasLength(1));
    expect(a.historial.first.salioBien, isTrue);
  });

  test('un JSON desconocido no rompe nada y cae al comportamiento previo', () {
    final a = EstadoAuditoria();
    a.aplicar('🧠 Cerebro IA listo: 8 modelos en cadena');
    a.aplicar('✍️ Escribiendo 3 de 12: db.py');
    final porcentajeAntes = a.porcentaje;
    final faseAntes = a.faseActual;

    // Tipo de evento que este móvil no conoce.
    a.aplicar('{"t":"telemetria","cpu":97}');
    // Fase que no está en el catálogo del panel.
    a.aplicar('{"t":"fase","fase":"bailar","indice":9,"total":5}');
    // JSON roto a medias.
    a.aplicar('{"t":"fase","fase":"escribir", sin cerrar');

    expect(a.porcentaje, porcentajeAntes);
    expect(a.faseActual, faseAntes);
    expect(a.terminado, isFalse);
    expect(a.historial, isEmpty);

    // Y las frases legadas siguen mandando después del ruido.
    a.aplicar('🚀 ¡Tu sistema está VIVO en http://localhost:5301!');
    expect(a.terminado, isTrue);
    expect(a.historial.first.url, 'http://localhost:5301');
  });
}
