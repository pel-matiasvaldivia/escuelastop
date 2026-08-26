# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Backend: API REST + agente Claude + canal de WhatsApp (open-wa).
#
# Imagen multi-stage optimizada para tamaño:
#  - stage `builder`  → compila TypeScript (necesita devDependencies).
#  - stage `deps`     → instala SOLO las dependencias de producción del backend
#                       (sin devDeps ni los paquetes del dashboard).
#  - stage `runtime`  → Chromium + dist/ + node_modules de producción.
#
# El contexto de build es la RAÍZ del repo (monorepo npm workspaces), por eso
# las rutas son packages/backend/...
# ---------------------------------------------------------------------------

# Nunca descargar el Chromium de puppeteer: en runtime usamos el del sistema.
# (Ahorra ~170 MB de node_modules.)
ARG NO_PPTR_DOWNLOAD=true

# ---- Stage 1: build (compila TypeScript a dist/) ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ARG NO_PPTR_DOWNLOAD
ENV PUPPETEER_SKIP_DOWNLOAD=$NO_PPTR_DOWNLOAD \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=$NO_PPTR_DOWNLOAD

# Manifiestos primero (mejor cache de capas). Se necesitan los de todos los
# workspaces para que `npm ci` resuelva contra el package-lock.
COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/dashboard/package.json packages/dashboard/
RUN npm ci --no-audit --no-fund

# Código y build del backend.
COPY packages/backend ./packages/backend
RUN npm run build --workspace @escuelastop/backend

# ---- Stage 2: dependencias de producción (solo backend) ----
# Sin este paso, la imagen arrastraría next/react/typescript y todas las
# devDependencies del monorepo, que en runtime no se usan.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
ARG NO_PPTR_DOWNLOAD
ENV PUPPETEER_SKIP_DOWNLOAD=$NO_PPTR_DOWNLOAD \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=$NO_PPTR_DOWNLOAD

COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/dashboard/package.json packages/dashboard/
RUN npm ci --omit=dev --no-audit --no-fund \
      --workspace @escuelastop/backend --include-workspace-root \
    && npm cache clean --force \
    && rm -rf /root/.npm /tmp/*

# ---- Stage 3: runtime ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app/packages/backend
ENV NODE_ENV=production \
    PORT=3001 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    WA_DOCKER=true

# Chromium + librerías que necesita en headless + fuentes para open-wa
# (WhatsApp Web). tini para manejar señales.
# Se limpian caches de apt y archivos prescindibles (docs, locales) para
# achicar la capa.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium ca-certificates tini \
      fonts-liberation fonts-noto-color-emoji \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 \
    && apt-get purge -y --auto-remove \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/* \
              /usr/share/doc /usr/share/man /usr/share/locale \
              /usr/share/chromium/locales /tmp/*

# node_modules de producción + build.
COPY --from=deps    /app/node_modules       /app/node_modules
COPY --from=builder /app/packages/backend/dist ./dist
COPY packages/backend/package.json ./package.json
COPY packages/backend/src/db/schema.sql ./src/db/schema.sql

# Directorios de datos (documentos subidos y sesión de WhatsApp).
RUN mkdir -p uploads whatsapp-session

EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
