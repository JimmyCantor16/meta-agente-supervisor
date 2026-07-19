# Backend del Meta-Agente (FastAPI + uvicorn).
FROM python:3.12-slim

WORKDIR /app

# Instala dependencias primero (mejor cacheo de capas).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia el código (ver .dockerignore para lo excluido).
COPY . .

EXPOSE 8000

# Render (y otros PaaS) inyectan el puerto a escuchar en $PORT; en local no
# existe esa variable y se usa 8000, que es lo que espera docker-compose.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
