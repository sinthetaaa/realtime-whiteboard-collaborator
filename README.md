# Realtime Whiteboard Collaborator

A production-deployed collaborative whiteboard for drawing, diagramming, chatting, and working with other users in real time.

The project focuses on realtime collaboration correctness, durable Yjs persistence, server-authoritative access control, presence, and production recovery behavior rather than treating the whiteboard as a frontend-only demo.

**Live application:** https://sayantika-whiteboard.vercel.app

## Engineering Approach

**Connect → Authenticate → Synchronize → Mutate → Persist → Recover**

The application separates transport connectivity from collaborative-document readiness.

A WebSocket connection being open is not enough to make the board writable. Mutations are enabled only after the Yjs document has completed synchronization, so reconnects cannot race against persisted state loading.

The system also keeps browser-local convenience state separate from server-authoritative state:

```text
Browser local state
→ recent-board registry
→ cached title / people / role

Server-authoritative state
→ authenticated identity
→ host ownership
→ removed-user enforcement
→ Yjs persistence
→ realtime presence
```

## Current Capabilities

- real-time multi-user drawing and editing
- freehand pen and eraser
- rectangles, ellipses, lines, arrows, triangles, diamonds, stars, hexagons, pentagons, and text
- selection, movement, duplication, deletion, formatting, and clear-board actions
- shared board title
- real-time chat
- collaborator presence
- shareable board URLs
- anonymous authenticated sessions
- host ownership and host transfer
- participant removal with realtime reconnect rejection
- durable Yjs document persistence in Upstash Redis
- restart recovery for shared board state
- homepage recent-board registry
- authoritative online/offline presence
- PNG/JPEG export
- light and dark workspace themes
- responsive/mobile support
- production deployment on Vercel and Railway

## Production

### Live application

```text
https://sayantika-whiteboard.vercel.app
```

### Realtime endpoint

```text
wss://realtime-production-1abf.up.railway.app
```

### Production topology

```text
Users
  |
  +------------------------------+
  |                              |
  v                              v
Vercel                       Railway
Next.js UI + API             Hocuspocus realtime service
  |                              |
  |                              |
  +------------+-----------------+
               |
               v
          Upstash Redis
          ├─ Yjs documents
          ├─ board metadata
          ├─ host / removed-user ACL
          └─ authoritative presence
```

Production services:

| Component | Provider | Role |
| --- | --- | --- |
| Frontend | Vercel | Public UI |
| Next.js API | Vercel | Sessions, board APIs, metadata, presence reads |
| Realtime server | Railway | Public WebSocket collaboration |
| Redis | Upstash | Persistence, ACL, metadata, presence |
| Source/deployment trigger | GitHub | `main` deploys to Vercel and Railway |

The Railway realtime service intentionally runs as **one replica in Singapore**.

See [Production Architecture](docs/architecture.md) for the detailed data flows, failure semantics, persistence model, and scaling constraint.

## Production Verification

The deployed system was validated end to end before deployment was considered complete.

| Check | Result |
| --- | --- |
| Vercel production frontend | PASS |
| Git-backed Railway deployment | PASS |
| Frontend HTTPS availability | PASS |
| Realtime endpoint availability | PASS |
| Two authenticated collaborative users | PASS |
| Bidirectional Yjs synchronization | PASS |
| Actual whiteboard stroke synchronization | PASS |
| Authoritative presence | PASS |
| Redis Yjs persistence | PASS |
| Railway process restart | PASS |
| Redis Yjs reload after restart | PASS |
| Shared title recovery | PASS |
| Whiteboard stroke durability after restart | PASS |
| Participant removal | PASS |
| Removed-user realtime reconnect rejection | PASS |
| Singapore replica count = 1 | PASS |
| Disposable production test-data cleanup | PASS |

## Current Stack

**Frontend / API:** Next.js 15.5.27 · React 19.1.0 · TypeScript · Tailwind CSS · Zustand · Konva · React Konva

**Realtime collaboration:** Yjs · Hocuspocus Provider · Hocuspocus Server 3.2.4

**Authentication:** JOSE · HS256 signed session and realtime JWTs

**State / persistence:** Upstash Redis

**Infrastructure:** Vercel · Railway · GitHub

## Collaboration Model

Each board is represented by a Yjs document.

The browser creates a local `Y.Doc` and connects to Hocuspocus using a short-lived room-bound token.

The application distinguishes:

```text
transport connected
```

from:

```text
Yjs document synchronized
```

Board mutations are allowed only when both are true.

That distinction matters during initial room load and reconnects because the WebSocket can be alive before persisted Yjs state has finished loading into the collaborative document.

## Authentication and Access Control

The application uses anonymous authenticated sessions rather than user accounts.

A session is created through:

```text
POST /api/auth/session
```

The signed session is stored in the `wb_session` cookie.

Session properties:

```text
algorithm:  HS256
issuer:     sayantika-whiteboard
audience:   whiteboard-session
lifetime:   30 days
cookie:     HttpOnly
same-site:  Lax
secure:     production only
```

Before joining a room, the browser requests:

```text
GET /api/auth/realtime-token?roomId=<roomId>
```

Realtime-token properties:

```text
algorithm:  HS256
issuer:     sayantika-whiteboard
audience:   whiteboard-realtime
scope:      exact room
lifetime:   5 minutes
```

The realtime service verifies both token validity and canonical removed-user state before admitting the connection.

Unsafe HTTP mutations also require same-origin requests.

## Board Ownership

Every board has one authoritative host.

The host can:

- manage participants
- transfer host ownership
- remove another participant

Host and removed-user state are stored in Redis:

```text
sayantika:whiteboard:v1:access:<roomId>:host
sayantika:whiteboard:v1:access:<roomId>:removed
```

Browser-local role information is not trusted as authorization authority.

## Removed-User Enforcement

A participant can still possess an unexpired room token after removal.

For that reason, token validity alone is not considered sufficient authorization.

The realtime service:

1. verifies the room-bound JWT
2. checks canonical Redis removal state
3. rejects removed users during authentication
4. checks the removal state again during connection establishment
5. closes active realtime sockets for users removed after they already connected

Production testing confirmed that a removed participant could still obtain a token from the web layer but was rejected by the realtime server.

## Yjs Persistence

Collaborative document state is persisted by Railway to:

```text
sayantika:whiteboard:v1:yjs:<roomId>
```

Persistence TTL:

```text
7 days
```

The realtime service:

1. reads the encoded document from Redis when the room opens
2. decodes the base64 Yjs update
3. applies it to a new `Y.Doc`
4. returns that document to Hocuspocus before client synchronization
5. stores the complete encoded Yjs state after document changes

Hocuspocus persistence timing is explicit:

```text
debounce:          2000 ms
maxDebounce:      10000 ms
unloadImmediately: true
```

Writes are serialized per room so an older asynchronous Redis `SET` cannot finish after a newer one and overwrite newer state.

Missing persistence configuration, invalid payloads, and empty/corrupt persisted updates fail closed rather than silently replacing durable state with an empty document.

## Metadata

Board metadata is stored separately from the Yjs document:

```text
sayantika:whiteboard:v1:meta:<roomId>
```

Keeping metadata separate allows lightweight HTTP reads without loading the collaborative document.

The shared title is also synchronized through the collaborative document for active users.

## Presence

Authoritative presence is written only by the authenticated realtime server.

Presence key:

```text
sayantika:whiteboard:v1:presence:<roomId>
```

Data structure:

```text
Redis sorted set
member = authenticated user ID
score  = last-seen timestamp
```

Timing:

```text
heartbeat interval: 10 seconds
stale threshold:    30 seconds
key TTL:            120 seconds
```

Presence writes are serialized per room so a final disconnect removal cannot be reordered behind an older in-flight heartbeat.

The homepage reads presence in batches through the Next.js API.

Presence is intentionally auxiliary: a transient presence failure is logged but does not intentionally take the collaborative document offline.

## Local Board Registry

The homepage keeps a browser-local recent-board registry in:

```text
localStorage: wb_boards
```

It stores up to 30 entries with information such as:

- room ID
- cached title
- created time
- last-opened time
- last-active time
- cached collaborators
- local role

This registry is a convenience/cache layer only.

It is not authoritative for authentication, host ownership, participant removal, durable document state, or realtime presence.

## Redis Data Model

```text
sayantika:whiteboard:v1:board:<roomId>
sayantika:whiteboard:v1:meta:<roomId>
sayantika:whiteboard:v1:yjs:<roomId>
sayantika:whiteboard:v1:presence:<roomId>
sayantika:whiteboard:v1:access:<roomId>:host
sayantika:whiteboard:v1:access:<roomId>:removed
```

The legacy `board` key remains for compatibility with the earlier REST snapshot path.

## Failure Model

The system deliberately separates critical document state from auxiliary state.

```text
Redis persistence unavailable
→ persisted collaborative state cannot be loaded safely
→ document path fails closed

WebSocket disconnect
→ provider reconnects
→ UI returns to syncing state
→ mutations remain disabled until Yjs resynchronizes

Presence write failure
→ failure is logged
→ collaboration remains active

Railway process restart
→ new process loads Yjs state from Redis
→ fresh client synchronizes from persisted document

Removed participant
→ active sockets are revoked
→ future realtime authentication is rejected
```

Production restart testing recovered the previously persisted collaboration marker, shared title, and a real drawable whiteboard stroke.

## Single-Replica Design Decision

The realtime backend deliberately runs as one Railway replica.

The current persistence model stores complete Yjs document state.

With two independent realtime replicas:

```text
Replica A loads state X
Replica B loads state X

A receives update A1
B receives update B1

A writes XA1
B writes XB1
```

Without cross-replica coordination, the later whole-document write could overwrite state produced by the other replica.

Presence also performs eager disconnect removal based on connections known to the local process.

Therefore the current one-replica topology is an explicit correctness decision rather than a missing deployment feature.

Possible future multi-replica designs include:

- append-only Yjs updates
- Redis Streams
- centralized persistence workers
- room affinity / sticky ownership
- distributed locking with version checks

## Production Security

Production hardening includes:

- signed HttpOnly anonymous sessions
- 30-day session expiry
- short-lived 5-minute realtime JWTs
- exact-room token binding
- server-authoritative host state
- server-authoritative removed-user enforcement
- active realtime socket revocation
- same-origin checks for unsafe HTTP mutations
- no persistent client bearer-token storage
- production secrets outside Git
- Redis key namespacing
- minimum 32-character shared signing secret

## Local Development

### Requirements

- Node.js 24 recommended
- pnpm 10
- Upstash Redis database

Install frontend dependencies:

```bash
cd web
pnpm install
```

Install realtime-server dependencies:

```bash
cd ../server
pnpm install
```

### Environment variables

Copy the checked-in example files and provide real values locally.

`web/.env.local`

```env
NEXT_PUBLIC_WS_URL=ws://localhost:4000
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
WHITEBOARD_AUTH_SECRET=
```

`server/.env.local`

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
WHITEBOARD_AUTH_SECRET=

# Optional local overrides
# WS_PORT=4000
# HOST=0.0.0.0
```

`WHITEBOARD_AUTH_SECRET` must be at least 32 characters and must match between `web` and `server`.

Both services must use the same Upstash Redis database.

### Run locally

Terminal 1:

```bash
cd server
pnpm dev
```

Terminal 2:

```bash
cd web
pnpm dev
```

Then open:

```text
http://localhost:3000
```

Local realtime defaults to:

```text
ws://localhost:4000
```

## Deployment

### Vercel

```text
Repository: sinthetaaa/realtime-whiteboard-collaborator
Branch:     main
Root:       web
```

Required environment variables:

```text
NEXT_PUBLIC_WS_URL
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
WHITEBOARD_AUTH_SECRET
```

### Railway

```text
Repository: sinthetaaa/realtime-whiteboard-collaborator
Branch:     main
Service:    realtime
Root:       /server
Region:     Southeast Asia / Singapore
Replicas:   1
```

Required environment variables:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
WHITEBOARD_AUTH_SECRET
NODE_ENV
```

Railway provides `PORT` automatically.

## Documentation

Detailed production architecture and engineering trade-offs are maintained under [`docs/`](docs/).

- [Production architecture](docs/architecture.md)
