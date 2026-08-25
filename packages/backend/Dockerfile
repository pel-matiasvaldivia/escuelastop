# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Backend: API REST + agente Claude + canal de WhatsApp (open-wa).
# Imagen multi-stage. El contexto de build es la RAÍZ del repo (monorepo npm
# workspaces), por eso las rutas son packages/backend/...
# ---------------------------------------------------------------------------

# ---- Stage 1: build (compila TypeScript a dist/) ----
FROM node:20-slim AS builder
WORKDIR /app

# No hace falta descargar Chromium para compilar; se agrega en el runtime.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Manifiestos primero (mejor cache de capas). Se necesitan los de todos los
# workspaces para que `npm ci` resuelva contra el package-lock.
COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/dashboard/package.json packages/dashboard/
RUN npm ci

# Código y build del backend.
COPY packages/backend ./packages/backend
RUN npm run build --workspace @escuelastop/backend

# ---- Stage 2: runtime ----
FROM node:20-slim AS runtime
WORKDIR /app/packages/backend
ENV NODE_ENV=production \
    PORT=3001 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    WA_DOCKER=true

# Chromium + fuentes para open-wa (WhatsApp Web). tini para manejar señales.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

# Dependencias ya instaladas y el build.
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/backend/dist ./dist
COPY packages/backend/package.json ./package.json
COPY packages/backend/src/db/schema.sql ./src/db/schema.sql

# Directorios de datos (documentos subidos y sesión de WhatsApp).
RUN mkdir -p uploads whatsapp-session

EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
