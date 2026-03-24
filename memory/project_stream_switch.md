---
name: stream-switch project overview
description: Architecture decisions and stack for the stream-switch monorepo
type: project
---

Dockerized monorepo: Fastify 4 backend + React/Vite frontend.

**Why:** User is building a YouTube stream-switching app with admin/user roles, live forwarding via ffmpeg (not yet implemented), and real-time updates over WebSocket.

**Stack pins (host npm can't build native modules on Windows — Docker-only workflow):**
- Backend: fastify ^4.28, @fastify/session ^10.9, @fastify/websocket ^8.3, drizzle-orm ^0.45, better-sqlite3 ^12 (needs apk build tools in container)
- Frontend: React 18, Vite 5, tailwindcss 3, react-router-dom 6, shadcn/ui components hand-written

**How to apply:** When adding packages, pin to the same major versions above. Never suggest `npm install` on the host — only inside Docker containers or `docker compose run`.

**Not yet implemented (explicitly deferred):**
- YouTube API integration
- ffmpeg process management
- Stream forwarding logic
