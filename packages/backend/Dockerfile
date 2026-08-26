# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Backend: API REST + agente Claude + canal de WhatsApp (Baileys).
#
# Imagen multi-stage optimizada para tamaño:
#  - stage `builder`  → compila TypeScript (necesita devDependencies).
#  - stage `deps`     → instala SOLO las dependencias de producción del backend
#                       (sin devDeps ni los paquetes del dashboard).
#  - stage `runtime`  → dist/ + node_modules de producción (sin navegador:
#                       Baileys habla el protocolo por WebSocket).
#
# El contexto de build es la RAÍZ del repo (monorepo npm workspaces), por eso
# las rutas son packages/backend/...
# ---------------------------------------------------------------------------

# ---- Stage 1: build (compila TypeScript a dist/) ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
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
    PORT=3001

# Baileys no necesita navegador: solo tini para manejar señales.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/* \
              /usr/share/doc /usr/share/man /tmp/*

# node_modules de producción + build.
COPY --from=deps    /app/node_modules       /app/node_modules
COPY --from=builder /app/packages/backend/dist ./dist
COPY packages/backend/package.json ./package.json
COPY packages/backend/src/db/schema.sql ./src/db/schema.sql
COPY packages/backend/src/db/schema.sql ./dist/db/schema.sql

# Directorios de datos (documentos subidos y sesión de WhatsApp).
RUN mkdir -p uploads whatsapp-session

EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
