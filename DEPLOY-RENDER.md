# Desplegar el Meta-Agente en Render

Guía para subir **frontend + backend + base de datos** a
[dashboard.render.com](https://dashboard.render.com/).

El repositorio ya trae un `render.yaml` (Blueprint): Render lo lee y crea los
tres recursos de una vez, sin configurarlos uno por uno.

---

## Arquitectura en Render

```
┌─ Static Site ─────────┐   /api/*   ┌─ Web Service ────────┐   ┌─ PostgreSQL ─┐
│ metaagente-frontend   │ ─rewrite─▶ │ metaagente-backend   │──▶│ metaagente-db │
│ React + Vite (dist)   │            │ FastAPI (Docker)     │   │ (plan free)   │
└───────────────────────┘            └──────────┬───────────┘   └───────────────┘
                                                │
                                       ┌────────▼────────┐
                                       │ Redis (Key Value)│  ya creado
                                       └──────────────────┘
```

## Pasos

### 1. Crear el Blueprint

En el dashboard: **New + → Blueprint** → elige este repositorio → **Apply**.
Render crea la base de datos, el backend y el frontend.

### 2. Rellenar los secretos del backend

Los valores marcados `sync: false` en `render.yaml` **no se versionan** (son
secretos). Se cargan a mano en *metaagente-backend → Environment*:

| Variable | Valor |
|---|---|
| `LLM_PROVIDERS` | tu JSON con la cadena de proveedores gratuitos |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` | proveedor por defecto |
| `GOOGLE_CLIENT_ID` | el Client ID de Google OAuth |
| `SUPER_ADMIN_EMAILS` | tu correo (quien aprueba pagos) |
| `REDIS_URL` | `redis://red-d9e08hjtqb8s739ifllg:6379` |
| `CORS_ORIGINS` | `https://metaagente-frontend.onrender.com` |

`DATABASE_URL` **no hay que ponerla**: Render la inyecta desde la base de datos.

### 3. Ajustar las URLs reales

Si Render añadió un sufijo a los nombres de servicio, corrige:

- En `render.yaml`, el `destination` del rewrite `/api/*` → URL real del backend.
- En `CORS_ORIGINS`, la URL real del frontend.

### 4. Autorizar el dominio en Google

En Google Cloud Console → *Credenciales → tu cliente OAuth*, añade la URL del
frontend a **Orígenes autorizados de JavaScript**. Sin esto el login falla.

---

## Por qué PostgreSQL y no SQLite

En local la app persiste en un archivo SQLite. **En Render el disco es efímero:
se borra en cada deploy y en cada reinicio**, así que un archivo SQLite perdería
usuarios, cupos consumidos y licencias aprobadas.

La solución ya está implementada respetando la arquitectura hexagonal: hay un
adaptador PostgreSQL por cada puerto de persistencia, gemelo del de SQLite.

| Puerto | Local (SQLite) | Cloud (PostgreSQL) |
|---|---|---|
| `EvaluationRepositoryPort` | `sqlite_repository.py` | `postgres_repository.py` |
| `UserRepositoryPort` | `sqlite_user_repository.py` | `postgres_user_repository.py` |
| `UsageRepositoryPort` | `sqlite_usage_repository.py` | `postgres_usage_repository.py` |

**La app elige sola**: si existe `DATABASE_URL` usa PostgreSQL; si no, SQLite.
No hay que tocar código para cambiar de entorno.

---

## Limitación conocida: proyectos generados

El agente escribe los proyectos generados en disco y los **arranca localmente**
para darte la URL. En Render eso tiene dos topes:

1. Los archivos generados **se pierden** al reiniciar (disco efímero).
2. Render **no permite abrir puertos arbitrarios**, así que no se puede exponer
   cada proyecto generado en su propia URL.

Opciones según lo que necesites:

- **Descarga (recomendado en cloud)**: entregar el proyecto como ZIP o repo de
  GitHub en vez de una URL viva.
- **Disco persistente**: añadir un *Persistent Disk* al backend (plan de pago)
  para que al menos los archivos sobrevivan.
- **Local / escritorio**: el arranque automático con URL funciona tal cual.

## Nota sobre el plan free de Render

Los servicios gratuitos **se duermen tras ~15 min de inactividad**; la primera
petición luego tarda ~50 s en responder. La base de datos free expira a los 30
días. Para uso real, el backend conviene subirlo a un plan de pago.
