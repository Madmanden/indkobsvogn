# V2 Reference — Backend + Sync

**Status:** implemented. This is the reference architecture for the shared code mirrored in this public repository.

Current public snapshot: [CURRENT.md](CURRENT.md).

## Goal

Keep Indkøbsvogn instant and useful offline while giving a household durable shared data across devices.

The core boundary is intentional:

- the **active shopping list and in-progress trip stay on the device**
- durable household data — stores, item catalog/learning data and completed trips — syncs through the backend

## Stack

- React + Vite frontend
- Hono API designed for Cloudflare Pages Functions
- Cloudflare D1
- Custom email authentication with a 6-digit code as the PWA-friendly primary flow and magic links as an alternative
- HTTP-only session cookie
- localStorage as the immediate device cache/state store

Production Cloudflare bindings and deployment configuration are deliberately omitted from this public mirror.

## Architecture

```text
React app
  │
  ├─ localStorage
  │    ├─ active list (local only)
  │    ├─ selected store / shopping state (local only)
  │    └─ durable state + sync metadata
  │
  └─ /api/*
       │
       ▼
Pages Functions / Hono
       │
       ▼
Cloudflare D1
  ├─ users / sessions / verification tokens
  ├─ households / members
  ├─ rate limits
  └─ household state JSON + monotonic version
```

## State boundary

### Local-only

- `selectedStoreId`
- `isShopping`
- `currentSequence`
- active `list`
- manual positions carried by that active list

### Durable household sync target

- `stores`
- `items`
- completed `trips`

The phone is the immediate source of truth during shopping. The backend is a durable sync target, not a remote state store for every tap.

## Sync protocol

`GET /api/state` returns durable household state plus a monotonic version.

`PUT /api/state` sends:

```ts
{ state: SyncableState, version: number }
```

The server accepts only its current version, increments on success and returns the new state/version. A stale client receives `409` with the current server state/version.

Shipped client behavior includes:

- local writes first
- debounced pushes
- exponential backoff for transient failures
- preserving edits made while a push is in flight
- unauthorized propagation into auth handling
- automatic conflict recovery with `ConflictModal` fallback after repeated failures
- offline, pending, syncing, unauthorized and error sync states
- request timeouts so bootstrap cannot hang indefinitely

## Manual ordering and route learning

Planning supports persisted drag-and-drop order on the active local list.

When shopping starts:

1. manual order is captured as a synthetic store-specific trip
2. weighted route positions are recalculated
3. manual positions are cleared
4. shopping begins in learned mode

Manual correction therefore becomes training data instead of a second permanent sorting system.

## Authentication

### Code flow

1. `POST /api/auth/sign-in` validates/rate-limits the email and creates one-time credentials
2. email contains a 6-digit code and a magic-link alternative
3. `POST /api/auth/sign-in/verify-code` atomically consumes the code token and creates a session

The code flow is preferred for an installed iOS PWA because Mail/Safari and the installed PWA may not share the same browser storage/cookie context.

### Magic-link flow

A GET to `/api/auth/sign-in/verify` does **not** consume the token. It renders a confirmation page so mail-client prefetch cannot invalidate login. The subsequent POST consumes the token atomically and creates a session.

Local fallback requires explicit `ALLOW_LOCAL_SIGNIN`.

## Database model

D1 uses relational tables for auth/membership plus a JSON household-state blob for the durable sync payload.

Real Cloudflare D1 reports affected rows under `meta.changes`. Repository writes use one helper that reads that shape (with a top-level compatibility fallback for mocks), including token consumption, household join and optimistic state updates.

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/sign-in` | Request code + magic link |
| `GET` | `/api/auth/sign-in/verify` | Show confirmation without consuming token |
| `POST` | `/api/auth/sign-in/verify` | Consume magic-link token and create session |
| `POST` | `/api/auth/sign-in/verify-code` | Verify 6-digit code and create session |
| `POST` | `/api/auth/sign-out` | Invalidate session |
| `GET` | `/api/household/me` | Current user + household state |
| `POST` | `/api/household/create` | Create household |
| `POST` | `/api/household/join` | Join household by code |
| `GET` | `/api/state` | Fetch durable state/version |
| `PUT` | `/api/state` | Versioned durable-state update |

## Repository layout

```text
src/                         React app
├── api/client.ts            typed browser API client
├── auth/                    auth bootstrap + login draft
├── domain/                  models, migrations, learning, trip lifecycle
├── sync/engine.ts           background sync/retry/conflict handling
└── components/              product UI

api/src/                     shared Hono API
├── index.ts
├── routes/                  auth / household / state
└── lib/                     repository / bootstrap / auth / rate limiting

functions/api/[[route]].ts   Pages Functions adapter source
public/sw.js                 service worker
```

The public tree intentionally does not include production `wrangler.toml`, Cloudflare project/database IDs or deploy scripts.

## PWA/update behavior

- service-worker cache version is generated during build
- registration includes the generated version
- update checks run on load/focus and periodically
- old caches are removed on activation
- the app avoids a forced update reload while a login draft is in progress

## Deferred beyond v2

- real-time collaborative shopping
- granular server-side item/trip queries
- normalized durable household domain tables if useful
- dedicated image storage if loyalty-card payload size becomes a real constraint

## Maintenance rule

`CURRENT.md` describes the exact mirrored behavior. Update this reference only when the architecture or its boundaries change.
