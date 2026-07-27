// Smoke test básico de la app fase 1.
import 'package:flutter_test/flutter_test.dart';
import 'package:metaagente_movil/main.dart';

void main() {
  testWidgets('La app arranca y muestra el título', (WidgetTester tester) async {
    await tester.pumpWidget(const MetaAgenteApp());
    expect(find.text('Meta-Agente'), findsWidgets);
    expect(find.text('Evaluar idea'), findsOneWidget);
  });
}
