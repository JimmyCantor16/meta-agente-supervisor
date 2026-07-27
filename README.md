# 🤖 Meta-Agente Supervisor de Desarrollo Autónomo

Plataforma web con IA (100% gratis) que convierte una **idea en lenguaje natural**
en un **sistema de software real**, y además **enseña** al usuario a completarlo.
Inspirada en el flujo de herramientas tipo Skywork, pero orientada a generar
proyectos de código y a formar a quien los usa.

> Escribe tu idea → el agente la **evalúa y optimiza** → **genera el proyecto**
> (front + back + base de datos + docker) → lo **audita** y sugiere mejoras →
> y en **Modo Profesor** te explica el código para que aprendas haciéndolo tú.

---

## ✨ Características

| Feature | Descripción |
|---|---|
| 🧠 **Evaluar idea** | Un "Ingeniero de Requerimientos Senior" critica la idea y devuelve un prompt de ingeniería optimizado. |
| 🚀 **Generar proyecto** | Genera un proyecto ejecutable de forma **iterativa** (planifica → escribe cada archivo → autocompleta → repara). |
| 🔍 **Auditar** | Lee el código generado y propone mejoras priorizadas (seguridad, tests, rendimiento…). |
| 🎓 **Modo Profesor** | En vez de hacerlo todo, **enseña**: explica el proyecto y propone retos para el aprendiz. |
| 🔁 **Multi-modelo con fallback** | Encadena varios proveedores de IA **gratuitos** (Groq, Gemini, OpenRouter…); si uno se queda sin cupo, salta al siguiente. |
| 🧾 **Memoria + feedback (RAG)** | Recuerda evaluaciones marcadas como útiles y las reutiliza como ejemplos. |
| 🔒 **Licencia** | N generaciones gratis, luego activación por clave. |
| 🔐 **Login con Google** | Autenticación con la cuenta de Google (OAuth / ID token). |
| 📺 **Free TV & Radio (Jamz Software)** | Reproductor gratuito integrado (panel izquierdo): TV en vivo (HLS) y Radio, con mini-tele estilo Simpsons que puedes **sacar del navegador** (Picture-in-Picture) y ver **mientras el sistema trabaja** en tu proyecto. |
| 🔔 **Notificaciones en tiempo real** | Te **avisa** (aviso del sistema) cuando tu proyecto termina de generarse, para que puedas ver tele/oír radio mientras tanto y volver cuando esté listo. |
| 🌐 **i18n ES/EN** | Interfaz bilingüe. |

---

## 🏗️ Arquitectura

**Backend — Arquitectura Hexagonal (Puertos y Adaptadores)** con FastAPI:

```
backend/src/
├── domain/            # Núcleo puro: entities.py (modelos), ports.py (contratos)
├── application/       # Casos de uso (orquestan el dominio)
└── infrastructure/
    ├── adapters/      # Implementaciones: LLM (multi-modelo), SQLite, filesystem, mocks
    └── entrypoints/   # API HTTP (FastAPI): api.py, auth.py
```

La regla de oro: **el dominio no depende de nada externo**; los detalles (IA,
base de datos, HTTP) viven en adaptadores detrás de puertos. Cambiar de proveedor
de IA o de base de datos no toca la lógica de negocio.

**Frontend — Feature-Driven** con React + TypeScript + Tailwind:

```
frontend/src/
├── components/            # UI común (Sidebar, TopBar, Card, Button…)
├── features/
│   ├── auth/             # Login con Google
│   └── workspace/        # Evaluar, generar, auditar, profesor (hooks + componentes)
├── i18n/                 # Traducciones ES/EN
└── lib/api.ts            # Cliente HTTP
```

---

## 🚀 Puesta en marcha (Docker)

Requisitos: **Docker** y **Docker Compose**.

```bash
# 1. Copia la plantilla de entorno y complétala
cp backend/.env.example backend/.env      # Windows: copy backend\.env.example backend\.env

# 2. Levanta todo (frontend + backend)
docker compose up --build
```

- **Frontend:** http://localhost:8080
- **API / Swagger:** http://localhost:8000/docs

### Configuración mínima (`backend/.env`)

```env
# IA gratis con Groq (https://console.groq.com/keys)
DEEPSEEK_API_KEY=gsk_tu_key_de_groq
DEEPSEEK_BASE_URL=https://api.groq.com/openai/v1
DEEPSEEK_MODEL=llama-3.3-70b-versatile
USE_MOCK_LLM=false

# (Opcional) Multi-modelo con fallback: JSON en UNA línea
LLM_PROVIDERS=[{"name":"groq-70b","base_url":"https://api.groq.com/openai/v1","api_key":"gsk_...","model":"llama-3.3-70b-versatile"}]

# (Opcional) Login con Google
GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com

# Licencia
FREE_GENERATION_LIMIT=3
LICENSE_KEYS=META-PRO-2026
```

> 💡 **Modo sin coste / sin conexión:** pon `USE_MOCK_LLM=true` para usar respuestas
> simuladas (útil para probar la mecánica sin gastar cupo de IA).

---

## 🧩 IA gratis (proveedores)

Este proyecto usa el SDK de OpenAI apuntando a endpoints **compatibles**, así que
funciona con cualquier proveedor gratis. Recomendado: **Groq** (rápido y estable).
Añade más a `LLM_PROVIDERS` para **sumar cupos gratis**:

- **Groq** — `https://api.groq.com/openai/v1`
- **Google Gemini** — `https://generativelanguage.googleapis.com/v1beta/openai/`
- **OpenRouter** — `https://openrouter.ai/api/v1`

Si un proveedor se queda sin cupo o da *rate-limit*, el agente **salta al siguiente**.

---

## 📡 Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/agent/evaluate` | Evalúa y optimiza una idea. |
| POST | `/api/v1/agent/generate` | Genera un proyecto (gate de licencia). |
| POST | `/api/v1/agent/audit` | Audita un proyecto generado. |
| POST | `/api/v1/agent/explain` | Modo Profesor: explica un proyecto. |
| POST | `/api/v1/agent/feedback` | Feedback 👍/👎 (aprendizaje). |
| GET  | `/api/v1/agent/projects` | Lista proyectos generados. |
| GET/POST | `/api/v1/agent/usage` · `/license` | Uso y activación de licencia. |
| GET/POST | `/api/v1/auth/config` · `/google` | Login con Google. |

---

## 🤝 Contribuir

Este repo está preparado para colaborar **con ayuda de Claude** — ver
[`CLAUDE.md`](./CLAUDE.md) para las convenciones y cómo añadir features siguiendo
la arquitectura hexagonal.

## 📄 Licencia

Uso interno / educativo. Ajusta según tu caso antes de distribuir.
