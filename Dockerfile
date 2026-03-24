# ── frontend build (used by production stage) ─────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /build
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── development (tsx watch + vite, both hot-reloading) ────────────────────────
FROM node:20-alpine AS dev
RUN apk add --no-cache ffmpeg python3 make g++
RUN npm install -g concurrently

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

EXPOSE 3000 5173

CMD ["concurrently", "--kill-others", "--names", "back,front", \
     "sh -c 'cd /app/backend && npx tsx watch --clear-screen=false src/index.ts'", \
     "sh -c 'cd /app/frontend && npx vite --host 0.0.0.0'"]

# ── backend build (compile TS for production) ─────────────────────────────────
FROM node:20-alpine AS backend-build
WORKDIR /build
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npx tsc

# ── production (one process, static frontend baked in) ────────────────────────
FROM node:20-alpine AS production
RUN apk add --no-cache ffmpeg python3 make g++
WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY --from=backend-build /build/dist ./backend/dist
COPY --from=frontend-build /build/dist ./frontend/dist

EXPOSE 3000

CMD ["node", "backend/dist/index.js"]
