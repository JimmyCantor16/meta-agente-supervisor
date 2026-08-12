// Tests de la app móvil, SIN red real.
//
// El smoke test original fallaba porque `main.dart` lanzaba el WebSocket en el
// arranque (IOWebSocketChannel.connect) y sus timers quedaban pendientes al
// terminar el test. Ahora la conexión es apagable (`conectarAlArrancar: false`)
// y la bandeja recibe un cliente HTTP falso, así que todo corre en seco.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:metaagente_movil/main.dart';
import 'package:metaagente_movil/sesion.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Respuesta JSON con los bytes en UTF-8 (los acentos llegan bien).
http.Response _json(Object cuerpo, {int codigo = 200}) => http.Response.bytes(
      utf8.encode(jsonEncode(cuerpo)),
      codigo,
      headers: {'content-type': 'application/json'},
    );

void main() {
  testWidgets('La app arranca y muestra el título (sin conectar el WebSocket)',
      (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(const MetaAgenteApp(conectarAlArrancar: false));
    await tester.pump(); // deja resolver las cargas locales (preferencias)

    expect(find.text('Meta-Agente'), findsWidgets);
    expect(find.text('Evaluar idea'), findsOneWidget);
    expect(find.text('Entregas'), findsOneWidget); // la 4.ª pestaña existe
  });

  testWidgets('La pestaña Entregas lista, muestra el veredicto y aprueba, sin red',
      (WidgetTester tester) async {
    // Sesión ya iniciada, como si el puente hubiera corrido ayer.
    SharedPreferences.setMockInitialValues({
      'sesion.credential': 'token-de-prueba',
      'sesion.email': 'prueba@jamz.dev',
      'sesion.nombre': 'Prueba',
    });

    final llamadas = <http.Request>[];
    final falso = MockClient((req) async {
      llamadas.add(req);
      if (req.method == 'GET' && req.url.path == '/api/v1/agent/entregas') {
        return _json([
          {
            'slug': 'tienda-mascotas',
            'rama': 'agente/tienda-mascotas',
            'fecha': '2026-08-12T10:30:00Z',
            'resumen_informe': 'CRUD de productos con carrito y login.',
            'veredicto': {
              'aprobar': true,
              'calidad': 8,
              'resumen': 'Sólida y usable tal cual.',
              'mejoras': ['Añadir filtro por categoría en la pantalla principal.'],
            },
            'dueno': 'prueba@jamz.dev',
            'es_suyo': true,
          },
        ]);
      }
      if (req.method == 'POST' &&
          req.url.path == '/api/v1/agent/entregas/tienda-mascotas/aprobar') {
        return _json({'estado': 'aprobada'});
      }
      return _json({'detail': 'no existe'}, codigo: 404);
    });

    final sesion = Sesion(cliente: falso);
    await sesion.cargar();
    expect(sesion.estado, EstadoSesion.conSesion);

    await tester.pumpWidget(MetaAgenteApp(
      conectarAlArrancar: false,
      sesion: sesion,
      clienteHttp: falso,
    ));
    await tester.pump();

    // A la bandeja: la carga sale sola al entrar en la pestaña.
    await tester.tap(find.text('Entregas'));
    await tester.pump(); // cambia de pestaña y dispara el GET
    await tester.pump(); // pinta la respuesta del cliente falso

    expect(find.text('tienda-mascotas'), findsOneWidget);
    expect(find.textContaining('8/10'), findsOneWidget);
    expect(find.textContaining('Sólida y usable'), findsOneWidget);
    expect(find.text('Aprobar'), findsOneWidget);
    expect(find.text('Rechazar'), findsOneWidget);

    // El botón APROBAR pide confirmación y recién entonces lanza el POST.
    // (Pumps discretos, no pumpAndSettle: la píldora "EN VIVO" pulsa en bucle
    // y un pumpAndSettle nunca se asentaría.)
    await tester.tap(find.text('Aprobar'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300)); // animación del diálogo
    expect(find.textContaining('¿Aprobar «tienda-mascotas»?'), findsOneWidget);

    await tester.tap(find.text('Sí, aprobar'));
    await tester.pump(); // cierra el diálogo
    await tester.pump(); // resuelve el POST y el refresco

    expect(
      llamadas.any((r) =>
          r.method == 'POST' &&
          r.url.path == '/api/v1/agent/entregas/tienda-mascotas/aprobar'),
      isTrue,
      reason: 'debe llamarse el endpoint del contrato al confirmar',
    );

    // El SnackBar de confirmación tiene su propio timer: se deja expirar para
    // que el test no termine con timers pendientes.
    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(seconds: 1));
  });
}
