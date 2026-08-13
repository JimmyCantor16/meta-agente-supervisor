# Backend del Meta-Agente (FastAPI + uvicorn).
FROM python:3.12-slim

WORKDIR /app

# Node.js: necesario para VERIFICAR y ARRANCAR los proyectos generados que usan
# Express/Node. Sin esto solo podríamos comprobar los proyectos Python, y los
# demás se entregarían sin verificar y sin URL.
# git: cada entrega del agente queda en una RAMA con su informe, para poder
# revisarla, ajustarla y revertirla como en cualquier equipo de desarrollo.
RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm git \
    && rm -rf /var/lib/apt/lists/*

# Instala dependencias primero (mejor cacheo de capas).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Chromium headless: el GATE DE RENDER. Antes de entregar la URL de un proyecto
# generado, un navegador real comprueba que la página SE VE y no revienta en
# JavaScript (React #31, imports rotos...). Un chequeo HTTP jamás ve eso, y el
# usuario final no sabe depurar una página en blanco. Pesa, pero es la
# diferencia entre entregar software y entregar un enlace roto.
# La última línea VERIFICA que Chromium quedó de verdad: si falta, el BUILD
# falla aquí mismo, en vez de producir una imagen que entrega URLs sin gate
# (el runtime lo degradaría a un ERROR en logs que nadie mira a tiempo).
RUN pip install --no-cache-dir playwright \
    && playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/* \
    && python -c "from pathlib import Path; from playwright.sync_api import sync_playwright; p = sync_playwright().start(); ruta = Path(p.chromium.executable_path); p.stop(); assert ruta.exists(), 'Chromium ausente: %s' % ruta; print('Gate de render verificado: chromium en %s' % ruta)"

# Copia el código (ver .dockerignore para lo excluido).
COPY . .

EXPOSE 8000

# Render (y otros PaaS) inyectan el puerto a escuchar en $PORT; en local no
# existe esa variable y se usa 8000, que es lo que espera docker-compose.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
