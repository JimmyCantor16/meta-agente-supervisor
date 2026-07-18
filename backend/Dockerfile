# Backend del Meta-Agente (FastAPI + uvicorn).
FROM python:3.12-slim

WORKDIR /app

# Instala dependencias primero (mejor cacheo de capas).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia el código (ver .dockerignore para lo excluido).
COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
