# Pruebas ejecutables del backend

No son pruebas unitarias con framework: son **guiones que demuestran** que las
piezas delicadas hacen lo que prometen, escritos para poder correrlos delante de
alguien y leer el resultado sin interpretarlo.

```bash
cd backend
PYTHONIOENCODING=utf-8 python pruebas/circuito_del_alumno.py
PYTHONIOENCODING=utf-8 python pruebas/agente_experto.py
PYTHONIOENCODING=utf-8 python pruebas/datos_de_ejemplo.py
PYTHONIOENCODING=utf-8 python pruebas/contrato_en_el_fallback.py
PYTHONIOENCODING=utf-8 python pruebas/base_de_datos_pedida.py
```

(En Windows, `PYTHONIOENCODING=utf-8` evita que la consola se atragante con los
acentos y las flechas.)

Esos cinco son **offline**: no tocan la red ni gastan cupo de ningún modelo.

| Guion | Qué demuestra |
|---|---|
| `circuito_del_alumno.py` | El cambio del alumno queda como commit con su nombre; «volver atrás» recupera el estado anterior; y **no** puede borrar la entrega del agente. |
| `datos_de_ejemplo.py` | Que la app no se entregue vacía: los ejemplos mal formados se descartan sin tumbar la generación, los números se leen bien en todos los formatos, y el modo visita solo se ofrece si hay algo que ver. |
| `agente_experto.py` | Qué plan usa experto y en qué momento; que cuando entra mejora algo comprobable; que el tope de gasto corta de verdad; y que sin clave el sistema sigue funcionando. |
| `contrato_en_el_fallback.py` | Que un proveedor que devuelve JSON con la FORMA equivocada no tumba la petición: cuenta como fallo suyo y el siguiente lo intenta. |
| `base_de_datos_pedida.py` | Que quien pide MySQL reciba MySQL: driver declarado, compose, conexión leída del entorno, prefijo normalizado al driver, y que el verificador le preste el motor correcto. |

## La prueba end to end (sí usa red y cupo)

```bash
python pruebas/e2e_idea_a_curso.py                  # idea → MVP → curso
python pruebas/e2e_idea_a_curso.py --proyecto tal   # solo la mitad docente
```

Recorre el camino completo del usuario y **falla si la URL entregada viene
vacía**. Esa regla no es un capricho: los registros de julio de 2026 tienen dos
generaciones que terminaron en `URL ENTREGADA: None` y aun así imprimieron
`=== FIN OK ===`. Un verde falso es peor que un rojo, porque nadie lo mira.

Necesita el backend en marcha y `AUTH_DEV_BYPASS=1` en `backend/.env` (solo se
activa en local; ver `_bypass_local_activo` en `api.py`). Deja el detalle en
`data/e2e_reporte.json` para poder comparar ejecuciones al tocar un prompt.

## Tasa de éxito (sí usa red; sin mock gasta MUCHO cupo)

```bash
python pruebas/harness_tasa_exito.py             # los 9 pedidos canónicos
python pruebas/harness_tasa_exito.py --solo 3    # sondeo corto y representativo
python pruebas/harness_tasa_exito.py --api https://mi-backend --token <ID token>
```

Convierte la "tasa de éxito" de anécdota a número: lanza los mismos ~9 pedidos
canónicos (uno por cada arquetipo de `instanciador_bases.py` — gestion,
catalogo, reservas, educativo, contenido, landing, dashboard — más 2 ideas
libres que no calzan en ninguno) contra `/api/v1/agent/generate`, y comprueba
**desde fuera** que la URL entregada sirve una portada real (>200 bytes).
Imprime el % FUNCIONA global y por ruta (esqueleto / base_dorada / libre /
degradado_a_*), y deja el detalle en `data/tasa_exito.json` para comparar
corridas cuando se toque un prompt o una base. Contra un backend viejo que aún
no devuelva `estado_entrega`/`ruta`, esas columnas quedan en "desconocido" y la
medición sigue valiendo.

Cómo correrlo:

- **Local, ensayo mecánico**: `docker compose up --build` con `USE_MOCK_LLM=true`
  en `backend/.env`. Verifica la mecánica del arnés y del circuito sin gastar
  un token. El número que salga NO es la tasa real (el mock siempre coopera).
- **Local, medición real**: mismo compose pero `USE_MOCK_LLM=false` y
  `AUTH_DEV_BYPASS=1` (el token por defecto `dev-local` solo abre en local).
- **Producción**: `--api https://…` y `--token` con una sesión real de Google;
  sin ella el primer POST corta con 401 y no se mide nada.

**Advertencia de cuota**: el tier gratis de Groq da ~12k tokens/min y límites
diarios. La corrida completa sin mock son ~9 generaciones de 1-3 min cada una
y puede agotar el cupo a mitad de camino (los últimos casos saldrían FALLO por
cuota, no por el agente — la tasa quedaría mentirosa). Para sondeos usa
`--solo 3`; reserva la corrida completa para cuando de verdad se quiera el
número, idealmente con más de un proveedor en `LLM_PROVIDERS`.

El del agente experto usa el experto **simulado**: prueba toda la mecánica sin
gastar un centavo ni necesitar clave.

El del móvil vive aparte, con el framework de Flutter:

```bash
cd mobile && flutter test test/auditor_test.dart
```
