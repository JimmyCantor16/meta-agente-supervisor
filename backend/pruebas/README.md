# Pruebas ejecutables del backend

No son pruebas unitarias con framework: son **guiones que demuestran** que las
piezas delicadas hacen lo que prometen, escritos para poder correrlos delante de
alguien y leer el resultado sin interpretarlo.

```bash
cd backend
PYTHONIOENCODING=utf-8 python pruebas/circuito_del_alumno.py
PYTHONIOENCODING=utf-8 python pruebas/agente_experto.py
PYTHONIOENCODING=utf-8 python pruebas/datos_de_ejemplo.py
```

(En Windows, `PYTHONIOENCODING=utf-8` evita que la consola se atragante con los
acentos y las flechas.)

| Guion | Qué demuestra |
|---|---|
| `circuito_del_alumno.py` | El cambio del alumno queda como commit con su nombre; «volver atrás» recupera el estado anterior; y **no** puede borrar la entrega del agente. |
| `datos_de_ejemplo.py` | Que la app no se entregue vacía: los ejemplos mal formados se descartan sin tumbar la generación, los números se leen bien en todos los formatos, y el modo visita solo se ofrece si hay algo que ver. |
| `agente_experto.py` | Qué plan usa experto y en qué momento; que cuando entra mejora algo comprobable; que el tope de gasto corta de verdad; y que sin clave el sistema sigue funcionando. |

El del agente experto usa el experto **simulado**: prueba toda la mecánica sin
gastar un centavo ni necesitar clave.

El del móvil vive aparte, con el framework de Flutter:

```bash
cd mobile && flutter test test/auditor_test.dart
```
