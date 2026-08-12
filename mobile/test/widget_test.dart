// Tests de la app móvil, SIN red real.
//
// El smoke test original fallaba porque `main.dart` lanzaba el WebSocket en el
// arranque (IOWebSocketChannel.connect) y sus timers quedaban pendientes al
// terminar el test. Ahora la conexión es apagable (`conectarAlArrancar: false`)
// y la bandeja recibe un cliente HTTP falso, así que todo corre en seco.
import 'dart:async';
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

/// JWT de mentira (sin firma real): a la app solo le importa el payload,
/// de donde saca email y nombre para mostrarlos.
String _jwtFalso(String email, String nombre) {
  String b64(Map<String, dynamic> m) =>
      base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${b64({'alg': 'none'})}.${b64({'email': email, 'name': nombre})}.firma';
}

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

  testWidgets('Los botones de decisión obedecen a es_suyo, no al dueño (que es el SUB)',
      (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({
      'sesion.credential': 'token-de-prueba',
      'sesion.email': 'prueba@jamz.dev',
      'sesion.nombre': 'Prueba',
    });

    final falso = MockClient((req) async {
      if (req.method == 'GET' && req.url.path == '/api/v1/agent/entregas') {
        return _json([
          // El dueño llega como SUB de Google (nunca coincide con el email):
          // sin es_suyo, el dueño real no vería sus propios botones.
          {'slug': 'mia-con-sub', 'dueno': '108234567890123456789', 'es_suyo': true},
          {'slug': 'ajena', 'dueno': 'otro@jamz.dev', 'es_suyo': false},
          // Backend viejo sin es_suyo: cae a comparar dueño con el email.
          {'slug': 'backend-viejo', 'dueno': 'prueba@jamz.dev'},
        ]);
      }
      return _json({'detail': 'no existe'}, codigo: 404);
    });

    final sesion = Sesion(cliente: falso);
    await sesion.cargar();

    await tester.pumpWidget(MetaAgenteApp(
      conectarAlArrancar: false,
      sesion: sesion,
      clienteHttp: falso,
    ));
    await tester.pump();
    await tester.tap(find.text('Entregas'));
    await tester.pump();
    await tester.pump();

    // La suya (aunque el dueño sea el SUB) y la del backend viejo con botones;
    // la ajena, solo con el aviso de quién puede resolverla.
    expect(find.text('mia-con-sub'), findsOneWidget);
    expect(find.text('Aprobar'), findsNWidgets(2));
    expect(find.text('Rechazar'), findsNWidgets(2));
    expect(
      find.textContaining('otro@jamz.dev: solo su dueño puede resolverla'),
      findsOneWidget,
    );
  });

  testWidgets('Cambiar de cuenta vacía la bandeja y trae las entregas del nuevo usuario',
      (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({
      'sesion.credential': 'token-de-ana',
      'sesion.email': 'ana@jamz.dev',
      'sesion.nombre': 'Ana',
    });
    final jwtBeto = _jwtFalso('beto@jamz.dev', 'Beto');

    final falso = MockClient((req) async {
      if (req.method == 'GET' && req.url.path == '/api/v1/agent/entregas') {
        final auth = req.headers['Authorization'] ?? '';
        if (auth.contains('token-de-ana')) {
          return _json([
            {'slug': 'entrega-de-ana', 'dueno': 'ana@jamz.dev', 'es_suyo': true},
          ]);
        }
        if (auth.contains(jwtBeto)) {
          return _json([
            {'slug': 'entrega-de-beto', 'dueno': 'beto@jamz.dev', 'es_suyo': true},
          ]);
        }
        return _json(const []);
      }
      if (req.method == 'GET' && req.url.path == '/api/v1/auth/puente/recoger') {
        return _json({'credential': jwtBeto});
      }
      return _json({'detail': 'no existe'}, codigo: 404);
    });

    // El "navegador" siempre abre bien: el login de Beto llega por el sondeo.
    final sesion = Sesion(cliente: falso, abrir: (_) async => true);
    await sesion.cargar();

    await tester.pumpWidget(MetaAgenteApp(
      conectarAlArrancar: false,
      sesion: sesion,
      clienteHttp: falso,
    ));
    await tester.pump();
    await tester.tap(find.text('Entregas'));
    await tester.pump();
    await tester.pump();
    expect(find.text('entrega-de-ana'), findsOneWidget);

    // Ana cierra sesión: la lista se vacía en el acto (nada de enseñar
    // entregas ajenas al siguiente que entre).
    await sesion.cerrarSesion();
    await tester.pump();
    expect(find.text('entrega-de-ana'), findsNothing);

    // Entra Beto por el puente: primer sondeo a los 2 segundos.
    unawaited(sesion.entrar());
    await tester.pump();
    await tester.pump(const Duration(seconds: 2)); // recoge el credential
    await tester.pump(); // la bandeja recarga con la sesión nueva
    await tester.pump(); // y pinta la respuesta

    expect(sesion.email, 'beto@jamz.dev');
    expect(find.text('entrega-de-beto'), findsOneWidget);
    expect(find.text('entrega-de-ana'), findsNothing,
        reason: 'la bandeja de Ana no puede sobrevivir al cambio de cuenta');
  });
}
