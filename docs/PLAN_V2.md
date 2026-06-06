# V2 Reference — Indkøbsvogn Backend + Sync

**Goal:** Household device sync with a local-first offline cache.

**Stack:** Hono + Cloudflare Pages Functions + D1 + magic-link auth

**Status:** Implemented in the current codebase. This doc now serves as the reference architecture for the shipped v2 build, with one important shipped refinement: the active shopping list is now device-local, while durable household data syncs through the backend.

Current implementation snapshot: [CURRENT.md](CURRENT.md).

---

## Architecture

```
React App (src/)          Pages Functions (functions/)
┌──────────────────┐      ┌─────────────────────────┐
│  store.ts        │─────▶│  GET/PUT /api/state      │
│  localStorage +  │      │  POST /api/auth/*        │
│  background sync │      │  POST /api/household/*  │
└──────────────────┘      └───────────┬─────────────┘
                                      │
                                      ▼
                              ┌───────────────────┐
                              │  Turso D1 (SQLite) │
                              │  per-household data │
                              └───────────────────┘
```

**Key principle:** Keep the React layer simple: localStorage updates immediately, and background sync follows behind.

---

## Decisions

### API: Full-state REST for durable household data
- `GET /api/state` → fetch household state
- `PUT /api/state` → replace household state
- Simplest mapping from existing `getState()`/`saveState()` pattern
- Granular sync is v3 (real-time)

### Hosting: Hono on Cloudflare Pages Functions
- Free tier, global edge, no cold starts
- Same-origin `/api/*` routes keep cookie handling simple
- D1 database bound to the Pages project

### Auth: Magic links with an HTTP-only session cookie
- Magic link sign-in gates access to the household flow
- Household formation: login → create/join via code
- The current codebase uses a lightweight custom auth/session layer that matches the intended magic-link behavior
- Session cookies use `SameSite=Lax` because the frontend and API share the Pages origin

### Offline: localStorage as source of truth for the UI, API as sync target
- Read from localStorage immediately (instant render)
- Background fetch from API on load, reconcile
- Single `pendingSync: boolean` flag in localStorage envelope (not a queue — full-state PUT means only latest state matters)
- On `saveState()`: set `pendingSync = true`, fire async PUT
- On successful PUT: set `pendingSync = false`
- On `navigator.online` event: if `pendingSync === true`, flush PUT
- PUT background requests are debounced by **2 seconds trailing**
- When the server is ahead, the client tries to reconcile automatically and keeps local edits first
- The shipped build keeps the active shopping `list` local to the device; only durable shared state (`stores`, `items`, `trips`) is part of the server sync contract
- **NOT Turso embedded replica** — adds complexity for minimal benefit at v2 stage

### Sync: Optimistic concurrency with equality check
- `household.version` — strictly monotonic integer (no ties, no clock skew)
- Client sends `{ state, version }` where `version` is the version it last saw
- Server accepts if `client.version == server.version`, increments to `server.version + 1`, returns new version
- If `client.version < server.version` → 409 Conflict with server's `{ state, version }`
- A stale client with `version < server.version` would overwrite newer data — equality check prevents this
- Client resolves drift automatically and quietly in the shipped build; normal version mismatches do not surface badges or modals during phone-first use
- `isShopping`, `currentSequence`, `selectedStoreId`, and the active `list` are **local-only** — never sync (ephemeral UI state + per-device preference)

### Household join: Code after magic link
- Both users log in via magic link (separate email)
- First user creates household → gets code (e.g., `HOLM-42`)
- Shares code with second user
- Second user enters code to join
- Code is join mechanism, not auth mechanism

---

## Database Schema (Turso D1)

**Simplicity decision: JSON blob per household, not normalized tables.**

Rationale: Full-state PUT replaces the entire household state anyway. Normalizing to 5+ tables means serializing/deserializing between `AppState` and per-table rows on every read/write — that mapping code is cost you pay for a feature v2 doesn't need. Granular server-side queries are a v3 concern.

```sql
CREATE TABLE households (
  id TEXT PRIMARY KEY,
  household_code TEXT UNIQUE NOT NULL,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(household_id, email)
);
```

**Notes:**
- `state_json` stores the full durable household state minus local-only UI fields and the active `list` — `selectedStoreId` is local preference per device, and the in-progress list is also device-local in the shipped build
- `version` is a monotonic integer (1, 2, 3...) — strictly incrementing, no ties possible
- `household_code` format: `XXXX-YY` — 4 letters, dash, 2 digits (1.7M combos)
- On `INSERT households` with duplicate code: retry up to 5 times with a fresh random code; after 5 failures, return error (extremely unlikely — 1.7M combos)
- Loyalty card images: the shipped app keeps them inline in household state, but client-side upload optimization scales large images down and compresses them before persistence. The current code keeps one card per store and still relies on `state_json`; if this ever becomes too heavy, v3 can move images to R2 + URL reference and keep only metadata in D1.
- **Defer normalization to v3** when/if granular queries (e.g., "how many trips this month?") are needed

---

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/state` | Required | Fetch household state |
| PUT | `/api/state` | Required | Replace household state |
| POST | `/api/auth/sign-in` | None | Request magic link |
| GET | `/api/auth/sign-in/verify` | None | Verify magic link token |
| POST | `/api/auth/sign-out` | Required | Invalidate session |
| POST | `/api/household/create` | Required | Create household, get code |
| POST | `/api/household/join` | Required | Join via code |
| GET | `/api/household/me` | Required | Get household info + code |

### Sync protocol
```typescript
// PUT /api/state body
{ state: SyncableState, version: number }

// Response
{ state: SyncableState, version: number, conflict: boolean }
```

---

## File Structure

```
/
├── api/                          # Shared Hono app source
│   ├── src/
│   │   ├── index.ts              # Shared Hono app entry point
│   │   ├── routes/
│   │   │   ├── state.ts          # GET/PUT /api/state
│   │   │   ├── auth.ts           # magic-link auth
│   │   │   └── household.ts      # household create/join
│   │   ├── lib/
│   │   │   ├── auth.ts           # session helpers
│   │   │   ├── bootstrap.ts      # D1 schema bootstrap
│   │   │   ├── rate-limiter.ts   # sign-in throttling
│   │   │   └── repository.ts     # D1 repository helpers
│   │   └── db/
│   │       └── schema.sql        # D1 schema
│   └── package.json
├── functions/
│   └── api/[[route]].ts          # Pages Functions entrypoint
├── wrangler.toml                 # Pages config + D1 binding
├── scripts/
│   └── deploy-pages.sh           # Manual deploy helper
├── src/                          # React app (existing)
│   ├── domain/
│   │   └── store.ts              # Modified: localStorage + background sync
│   └── api/
│       └── client.ts             # New: API fetch wrapper
```

---

## Implementation Phases

### Phase 1: API Foundation
1. Hono app exposed through Pages Functions
2. D1 schema and repository helpers
3. `/api/state` GET/PUT with versioned compare-and-swap

### Phase 2: Auth
1. Magic-link sign-in and verification
2. Session cookie and protected routes

### Phase 3: Household Management
1. `POST /api/household/create` — create household + generate code
2. `POST /api/household/join` — join via code
3. `GET /api/household/me` — get household info

### Phase 4: React Integration
1. `src/api/client.ts` — fetch wrapper with `credentials: 'include'`
2. `src/sync/engine.ts` — background sync with `pendingSync`, `serverVersion`, and phone-first retries for durable state
3. `src/components/SyncIndicator.tsx` — compact error-only indicator in the current build

### Phase 5: v1 → v2 Migration
1. On first v2 login: "Create household" or "Join with code" screen
2. If localStorage has existing v1-style data, the household setup screen can include that local state when creating the household
3. After creation, push the local state to the server as part of household creation

---

## Decisions (implemented)

- **One household per email for v2** — simplest UX, no "which household" selector needed
- **No member removal** — two-person household, rare edge case, defer
- **No code regeneration** — code is only shown once at creation; if lost, the other member can see it from their session
- **Offline-first** — if API is down, fall back to localStorage-only and resync later
- **Session revocation** — handled by the custom session layer

---

## Verified Compatible
- `src/hooks/useAppState.ts` — `commit(nextState)` stays synchronous (localStorage first, async background PUT)
- `src/domain/models.ts` — TypeScript interfaces map directly to DB schema
- `src/utils/importExport.ts` — v1 JSON import still works for migration
- `src/domain/app-state.ts` — `completeTrip()`, `persistWeightedPositions()` are pure business logic, unchanged

---

## Repo workflow note

When asked to commit changes in this repo, also push and deploy unless explicitly told not to. Wrangler deploys should use `--commit-dirty=true`.
