"""Generador de proyectos SIMULADO (sin DeepSeek).

Devuelve un starter full-stack REAL y auto-instalable: frontend estático +
FastAPI + PostgreSQL, orquestado con docker-compose. Al clonar el proyecto y
ejecutar `docker compose up`, queda funcionando.

Sirve para probar toda la mecánica del "agente que construye" sin gastar saldo.
El prompt del usuario se incrusta en CONFIGURE.md para que otra IA termine la
configuración (login, reCAPTCHA, carrito, etc.).
"""

from __future__ import annotations

import logging

from src.domain.entities import GeneratedFile, GeneratedProject
from src.domain.ports import ProjectGeneratorPort

logger = logging.getLogger(__name__)


# --- Contenidos de los archivos del starter (plantillas fijas y funcionales) ---

_DOCKER_COMPOSE = """\
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: apppass
      POSTGRES_DB: appdb
    volumes:
      - dbdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser -d appdb"]
      interval: 5s
      timeout: 3s
      retries: 12

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://appuser:apppass@db:5432/appdb
    depends_on:
      db:
        condition: service_healthy
    expose:
      - "8000"

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

volumes:
  dbdata:
"""

_BACKEND_MAIN = """\
import os
import time
import logging
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://appuser:apppass@db:5432/appdb"
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("app")


def get_conn(retries: int = 30):
    # Reintenta la conexion mientras Postgres termina de arrancar.
    last = None
    for i in range(retries):
        try:
            return psycopg.connect(DATABASE_URL)
        except Exception as exc:  # noqa: BLE001
            last = exc
            log.info("Esperando a la base de datos... intento %d", i + 1)
            time.sleep(2)
    raise last


def init_db() -> None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "CREATE TABLE IF NOT EXISTS products ("
            "id SERIAL PRIMARY KEY, name TEXT NOT NULL, price NUMERIC NOT NULL)"
        )
        cur.execute("SELECT COUNT(*) FROM products")
        if cur.fetchone()[0] == 0:
            cur.executemany(
                "INSERT INTO products (name, price) VALUES (%s, %s)",
                [("Zapatos deportivos", 59.90), ("Camiseta basica", 19.90), ("Gorra", 14.50)],
            )
        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Starter Shop API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/products")
def products():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, name, price FROM products ORDER BY id")
        rows = cur.fetchall()
    return [{"id": r[0], "name": r[1], "price": float(r[2])} for r in rows]
"""

_BACKEND_DOCKERFILE = """\
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
"""

_BACKEND_REQUIREMENTS = """\
fastapi>=0.111.0
uvicorn[standard]>=0.30.0
psycopg[binary]>=3.1.0
"""

_FRONTEND_INDEX = """\
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Starter Shop</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
      header { padding: 20px; background: #1e293b; font-weight: 700; }
      main { max-width: 720px; margin: 0 auto; padding: 24px; }
      .card { display: flex; justify-content: space-between; padding: 14px 18px; margin: 10px 0;
              background: #1e293b; border-radius: 12px; }
      .price { color: #34d399; font-weight: 700; }
      button { background: #6366f1; color: white; border: 0; padding: 8px 14px; border-radius: 8px; cursor: pointer; }
    </style>
  </head>
  <body>
    <header>🛒 Starter Shop</header>
    <main>
      <h2>Productos</h2>
      <div id="list">Cargando…</div>
    </main>
    <script>
      fetch("/api/products")
        .then((r) => r.json())
        .then((items) => {
          document.getElementById("list").innerHTML = items
            .map(
              (p) =>
                `<div class="card"><span>${p.name}</span>` +
                `<span class="price">$${p.price.toFixed(2)}</span>` +
                `<button>Agregar</button></div>`
            )
            .join("");
        })
        .catch(() => (document.getElementById("list").innerText = "No se pudo cargar el catálogo."));
    </script>
  </body>
</html>
"""

_FRONTEND_NGINX = """\
server {
    listen 80;

    # Proxy de la API al backend a traves de la red de docker-compose.
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
    }

    # Sirve el frontend estatico.
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri /index.html;
    }
}
"""

_FRONTEND_DOCKERFILE = """\
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
"""

_GITIGNORE = """\
__pycache__/
*.pyc
.env
node_modules/
"""

_README = """\
# Starter Shop (generado automáticamente)

Proyecto full-stack de ejemplo: **frontend estático + FastAPI + PostgreSQL**,
listo para levantar con un solo comando.

## Requisitos
- Docker y Docker Compose.

## Instalación autónoma
```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- API:      http://localhost:3000/api/products

Eso es todo: la base de datos se crea y se llena sola al arrancar.

## Estructura
- `backend/`  — API FastAPI conectada a PostgreSQL.
- `frontend/` — página servida por Nginx que consume la API.
- `docker-compose.yml` — orquesta db + backend + frontend.

Para terminar de configurarlo (login, reCAPTCHA, carrito real…), ver `CONFIGURE.md`.
"""


class MockProjectGenerator(ProjectGeneratorPort):
    """Generador falso que entrega un starter full-stack real y auto-instalable."""

    def generate(self, prompt: str, language: str = "es") -> GeneratedProject:
        logger.info("[MOCK] Generando proyecto starter (sin DeepSeek).")

        # El prompt del usuario se conserva para que una IA termine la config.
        configure = (
            "# CONFIGURE.md\n\n"
            "Este proyecto es un **starter auto-instalable**. Para terminarlo según "
            "lo que se pidió, entrega el siguiente prompt a una IA de código "
            "(Claude, DeepSeek, etc.) dentro de este repositorio:\n\n"
            "---\n\n"
            "## Prompt para la IA que finaliza la configuración\n\n"
            f"{prompt}\n\n"
            "---\n\n"
            "### Tareas concretas sugeridas\n"
            "1. Añadir autenticación (login/registro) con hash de contraseñas y JWT.\n"
            "2. Integrar Google reCAPTCHA v3 en el formulario de registro/login.\n"
            "3. Implementar el carrito de compras (agregar, quitar, total, checkout).\n"
            "4. Migrar el frontend estático a un framework moderno (React/Vue) si se desea.\n"
            "5. Definir variables sensibles en `.env` (claves reCAPTCHA, JWT secret).\n"
        )

        files = [
            GeneratedFile(path="README.md", content=_README),
            GeneratedFile(path="CONFIGURE.md", content=configure),
            GeneratedFile(path="docker-compose.yml", content=_DOCKER_COMPOSE),
            GeneratedFile(path=".gitignore", content=_GITIGNORE),
            GeneratedFile(path="backend/main.py", content=_BACKEND_MAIN),
            GeneratedFile(path="backend/Dockerfile", content=_BACKEND_DOCKERFILE),
            GeneratedFile(path="backend/requirements.txt", content=_BACKEND_REQUIREMENTS),
            GeneratedFile(path="frontend/index.html", content=_FRONTEND_INDEX),
            GeneratedFile(path="frontend/nginx.conf", content=_FRONTEND_NGINX),
            GeneratedFile(path="frontend/Dockerfile", content=_FRONTEND_DOCKERFILE),
        ]

        return self._starter(prompt, configure, files)

    def repair_with_error(self, project: GeneratedProject, error: str) -> GeneratedProject:
        """El mock no corrige nada: devuelve el proyecto tal cual."""
        logger.info("[MOCK] repair_with_error ignorado (modo simulado).")
        return project

    @staticmethod
    def _starter(prompt: str, configure: str, files: list[GeneratedFile]) -> GeneratedProject:
        return GeneratedProject(
            name="starter-shop",
            summary=(
                "Starter full-stack (frontend + FastAPI + PostgreSQL) auto-instalable "
                "con docker-compose. Incluye CONFIGURE.md con el prompt para completarlo."
            ),
            files=files,
            run_instructions="cd <carpeta> && docker compose up --build  →  http://localhost:3000",
        )
