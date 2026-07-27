# 📱 Meta-Agente Móvil — Jamz Software (APK fase 1)

App **Android nativa (Flutter)** del Meta-Agente. Fase 1 en **modo pruebas**
(sin publicar en Play Store, sin pagar los 25 USD de Google): se instala el APK
de depuración directo en el teléfono.

## Qué hace la fase 1
- **Evaluar idea**: habla con nuestro backend (`POST /api/v1/agent/evaluate`) y
  muestra la crítica del agente. Prueba que el móvil se conecta al sistema.
- **Modo pruebas de sockets** (icono 📡 arriba): abre un **WebSocket** y muestra
  mensajes en vivo — prueba la capa de tiempo real que usaremos para las
  **notificaciones entre dispositivos** (fase 2: el PC genera → suena en el móvil).
- **Avisos in-app** al terminar un trabajo.

Marca y colores alineados con la web / la tele Jamz (azul-lila `#6366F1`).

## Requisitos para compilar el APK (solo una vez, en el PC que compila)
- **Flutter** ✅ ya instalado (`C:\flutter`, canal stable 3.44).
- **Android SDK + JDK** ⛔ FALTA. La forma más fácil y confiable:
  1. Instala **Android Studio** (https://developer.android.com/studio) — en el
     primer arranque instala el SDK, el JDK y las build-tools.
  2. Acepta las licencias:  `flutter doctor --android-licenses`
  3. Verifica:  `flutter doctor`  (debe salir `[√] Android toolchain`).

## Construir e instalar (test, sin publicar)
```bash
cd mobile
flutter pub get
flutter build apk --debug          # genera build/app/outputs/flutter-apk/app-debug.apk
```
- Copia el `app-debug.apk` al teléfono e instálalo (permite "orígenes
  desconocidos"), **o** con el teléfono conectado por USB (depuración USB):
  `flutter install`  /  `flutter run`.

## Conectar con tu backend
El backend corre en tu PC (`http://localhost:8000`). Desde el teléfono usa la
**IP LAN del PC** (p. ej. `http://192.168.1.10:8000`) en el campo "Servidor".
En el **emulador** de Android, usa `http://10.0.2.2:8000` (ya viene por defecto).

## Estado
- ✅ App fase 1 escrita y validada (`flutter analyze` limpio, `flutter test` pasa).
- ⏳ Falta el **Android SDK** para producir el `.apk` (ver requisitos arriba).
- 🔜 Fase 2: WebSocket en el backend + notificaciones push entre dispositivos.
