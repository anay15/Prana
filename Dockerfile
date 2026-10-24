# syntax=docker/dockerfile:1.7

# ---- Stage 1: build the web app and fetch the pose models ----
FROM node:22.12.0-alpine3.20 AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# Downloads pinned MediaPipe models (SHA-256 verified) + copies the WASM runtime
RUN npm run fetch-models && npm run build

# ---- Stage 2: Python API that also serves the static app ----
FROM python:3.12.8-slim-bookworm AS api
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    APP_ENV=production \
    STATIC_DIR=/app/static \
    DATABASE_URL=sqlite:////app/data/prana.db \
    PORT=8000
WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --require-hashes -r requirements.txt

COPY backend/app ./app
COPY --from=web /web/dist ./static

# Non-root runtime user; only the SQLite fallback directory is writable.
# (In production DATABASE_URL points at Postgres and this stays empty.)
RUN useradd --system --uid 10001 --no-create-home prana \
 && mkdir -p /app/data && chown prana /app/data
USER prana

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=2)"

# Render terminates TLS at its proxy; trust its X-Forwarded-* headers for client IPs.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*' --no-server-header"]
