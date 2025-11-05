# 🧠 Realtime Whiteboard Collaborator

A real-time collaborative whiteboard built with **Next.js**, **Hocuspocus**, and **Yjs**. The project currently runs locally: the frontend serves on `http://localhost:3000` and the WebSocket server runs on `ws://localhost:4000` so you can collaborate in real time without deploying anything to Vercel.

---

## Highlights
- Real-time drawing, selection, and editing that sync instantly across browsers.
- Shareable rooms via `/room/[roomId]` routes; copy the URL and invite collaborators.
- Autosave support through Upstash Redis when credentials are provided (falls back to in-memory storage locally).
- Export and import boards as PNG, JPEG, or JSON to preserve ideas between sessions.
- Built with modern tooling: Next.js App Router, Tailwind CSS, Zustand, and Konva.

---

## Architecture
- `web/` – Next.js 15 frontend. Handles routing, rendering the canvas UI, exposing API routes for persistence, and connecting to Hocuspocus.
- `server/` – Lightweight Node service booting `@hocuspocus/server` to relay Yjs document updates between participants.
- The frontend connects to the server via `NEXT_PUBLIC_WS_URL`. Keep them aligned (default `ws://localhost:4000`) for local collaboration.

---

## Prerequisites
- Node.js ≥ 18.18 (Next.js 15 requirement).
- `pnpm` ≥ 8 (recommended). You can substitute `npm` or `yarn`, but the scripts below use `pnpm`.
- An Upstash Redis database if you want persistence across restarts (optional for local demos).

---

## Setup
1. Install dependencies for each package:
   ```bash
   pnpm install --prefix web
   pnpm install --prefix server
   ```
2. Create environment files:
   - `web/.env.local`
     ```env
     NEXT_PUBLIC_WS_URL=ws://localhost:4000
     UPSTASH_REDIS_REST_URL= # optional
     UPSTASH_REDIS_REST_TOKEN= # optional
     ```
     If the Redis variables are omitted, the API routes store board snapshots in memory (reset on restart).
   - `server/.env` (optional)
     ```env
     PORT=4000
     HOST=0.0.0.0
     ```
     Omit these to use the defaults shown above.

3. Ensure both directories have their own `node_modules` after installation. The repo is not configured as a monorepo workspace, so dependencies stay isolated per package.

---

## Running Locally
Start the WebSocket server first so the frontend can connect:
```bash
pnpm --prefix server dev      # ws://localhost:4000
```

In another terminal, start the Next.js app:
```bash
pnpm --prefix web dev         # http://localhost:3000
```

The terminal output will confirm:
- `✅ Hocuspocus running at ws://localhost:4000`
- `ready - started server on http://localhost:3000`

Open `http://localhost:3000` in multiple browser tabs or machines on the same network. Each room URL (e.g. `http://localhost:3000/room/abc123`) keeps participants in sync through the local Hocuspocus server.

---

## How Collaboration Works
1. Loading a room mounts the `Whiteboard` client component, which spins up a Yjs document.
2. The document connects to the WebSocket server at `NEXT_PUBLIC_WS_URL`, broadcasting changes made with the drawing tools.
3. The toolbar dispatches lightweight window events (`wb-undo`, `wb-save`, etc.) to keep the canvas responsive without recreating providers.
4. Every few seconds, mutations trigger an autosave to `/api/boards/[roomId]`. If Redis credentials exist, the snapshot is persisted; otherwise, it stays in memory.
5. Export/import options let you save the current board as JSON or image files so you can continue work after restarting the local stack.

---

## Project Structure
```
WhiteBoard-Collaborator/
├── web/                       # Next.js frontend
│   ├── app/
│   │   ├── page.tsx           # Landing page with “New Board” button
│   │   └── room/[roomId]/     # Dynamic room route
│   ├── components/
│   │   └── Whiteboard.tsx     # Core canvas + collaboration logic
│   ├── lib/
│   │   └── redis.ts           # Upstash Redis client helper
│   └── public/                # Static assets
└── server/                    # Hocuspocus WebSocket server
    └── src/index.ts           # Server bootstrap (port, host, logging)
```

---

## Useful Scripts
- `pnpm --prefix web dev` – Start the frontend in development mode.
- `pnpm --prefix web build` and `pnpm --prefix web start` – Production build and serve (still local).
- `pnpm --prefix web lint` – Run ESLint across the Next.js app.
- `pnpm --prefix server dev` – Run the Hocuspocus server with live reload (`tsx watch`).
- `pnpm --prefix server start` – Start the Hocuspocus server without file watching.

---

## Troubleshooting
- **Frontend shows “connecting…”** – Confirm the Hocuspocus server is running and that `NEXT_PUBLIC_WS_URL` matches its host and port.
- **Boards disappear after restart** – Configure Upstash Redis credentials in `web/.env.local` to persist data between sessions.
- **Port already in use** – Change `PORT` in `server/.env` (e.g. `4100`) and update `NEXT_PUBLIC_WS_URL` accordingly.
- **Slow canvas performance** – Reduce the number of simultaneous collaborators or clear unused layers via the toolbar; Konva renders all shapes on each frame.

Enjoy collaborating!
