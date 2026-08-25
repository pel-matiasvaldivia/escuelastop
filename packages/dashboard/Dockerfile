# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Dashboard: panel de administración (Next.js 14, output standalone).
# Contexto de build: RAÍZ del repo (monorepo npm workspaces).
#
# NEXT_PUBLIC_API_URL se hornea en tiempo de build (lo usa el navegador), así que
# se pasa como build-arg. Debe ser una URL alcanzable DESDE EL NAVEGADOR del
# operador (no un hostname interno de Docker).
# ---------------------------------------------------------------------------

# ---- Stage 1: build ----
FROM node:20-slim AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/dashboard/package.json packages/dashboard/
RUN npm ci

COPY packages/dashboard ./packages/dashboard
RUN npm run build --workspace @escuelastop/dashboard

# ---- Stage 2: runtime ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

# El build standalone incluye un server.js autocontenido con sus node_modules.
COPY --from=builder /app/packages/dashboard/.next/standalone ./
COPY --from=builder /app/packages/dashboard/.next/static ./packages/dashboard/.next/static

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "packages/dashboard/server.js"]
