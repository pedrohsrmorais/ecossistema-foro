# ════════════════════════════════════════════════════════════════════════════
# Foro — imagem única (frontend React + API Node) — contexto de build: foro_app/
#   docker compose up -d --build     →  sobe MySQL + aplicação em http://localhost:3040
# ════════════════════════════════════════════════════════════════════════════

# ── Estágio 1: build do frontend (Vite gera em ../backend/dist) ──────────────
FROM node:20-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Estágio 2: API + frontend estático ───────────────────────────────────────
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/ ./
COPY --from=frontend /build/backend/dist ./dist
USER node
EXPOSE 3040
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3040/health || exit 1
CMD ["node", "server.js"]
