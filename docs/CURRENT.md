# Current State — Indkøbsvogn Public Mirror

Snapshot of the shared implementation mirrored from the private canonical repository as of **2026-08-18**.

This file describes what the code in this public tree does. Production Cloudflare configuration and deployment wiring are intentionally not part of the public mirror.

## Implemented behavior

### Authentication

- Authentication gates the app before store/household use
- A 6-digit email code is the PWA-friendly primary flow; magic links remain an alternative
- Magic-link GET requests only show a confirmation page and do not consume one-time tokens
- Token consumption is atomic; older/expired verification tokens are cleaned up
- Login failures use structured API error codes
- Local fallback login requires explicit `ALLOW_LOCAL_SIGNIN`
- CORS is restricted to the configured frontend or same origin
- Auth bootstrap can recover after transient server/database failure
- Existing local household state can boot while the device is offline
- Sign-out clears local auth state optimistically even if the network request fails

### Planning and shopping

- Store-scoped planning/shopping model
- Store favorites, settings, add-store modal and loyalty cards
- Add/autocomplete/rename/quantity/delete-with-undo planning controls
- Always-visible drag handles with touch deadzone and haptic/visual position feedback
- Manual ordering persists through `sortMode` + `manualPosition`
- Starting a trip records a synthetic trip from the manual order so route learning can absorb it, then clears the manual override
- Learned positions use completed store-specific trip history with recency weighting
- Completing a trip clears that store's active list locally and persists the completed route in durable history
- Loyalty cards close with an explicit X button

### Local-first storage and sync

- Active list, selected store, shopping mode and in-progress sequence remain device-local
- Stores, item catalog/learning data and completed trips form the durable household sync target
- localStorage schema version 5 contains migrations and sync metadata
- Sync retries transient failures with exponential backoff
- Failed flush/conflict paths are caught so the engine cannot remain stuck in `syncing`
- Successful pushes do not overwrite local edits made while the request was in flight
- 401/403 responses propagate as an unauthorized state
- Repeated conflict-resolution failure surfaces the conflict modal
- Sync status can show offline, pending, syncing, unauthorized and error states
- API requests have a timeout instead of hanging bootstrap indefinitely

### API / D1 correctness

- API responses include security headers and sign-in endpoints are rate-limited
- The repository reads affected-row counts from real Cloudflare D1's `meta.changes` shape, with a compatibility fallback for mocks
- The affected-row helper is used by verification-token consumption, household joining and optimistic state updates
- Database bootstrap clears a failed cached promise so a transient failure can recover

### PWA

- App-level error boundary
- Service-worker update checks on focus and periodically
- Build-time service-worker version injection
- Old caches are removed on activation

## Public mirror limitations

The source for the Cloudflare API is present, but this repository deliberately omits production Pages/D1 bindings and deployment tooling. Therefore `bun run dev` is a frontend-only Vite session. A complete local stack requires your own development Cloudflare configuration.

No production database ID, Pages project ID, real mail-domain value or deployment credential should be added to the current public tree.

## Verification still pending on real devices

- Zero-network behavior after first successful load
- iPhone Add to Home Screen/install/update behavior
- 6-digit login from an installed iPhone PWA
- Offline boot with an existing session/cache
- Delete/undo timing on touch devices
- localStorage size boundaries
- Low-end mobile performance
- Store-modal keyboard-only flow on mobile Safari
- Reconnect after a cold offline start
- Two-device check that in-progress lists remain local while completed/durable data syncs
- Real repeated-conflict path and conflict-modal recovery UX

## Key source files

- [src/App.tsx](../src/App.tsx)
- [src/auth/AuthContext.tsx](../src/auth/AuthContext.tsx)
- [src/auth/loginDraft.ts](../src/auth/loginDraft.ts)
- [src/api/client.ts](../src/api/client.ts)
- [src/sync/engine.ts](../src/sync/engine.ts)
- [src/domain/app-state.ts](../src/domain/app-state.ts)
- [src/domain/store.ts](../src/domain/store.ts)
- [src/components/PlanningScreen.tsx](../src/components/PlanningScreen.tsx)
- [src/components/LoginScreen.tsx](../src/components/LoginScreen.tsx)
- [src/components/SyncIndicator.tsx](../src/components/SyncIndicator.tsx)
- [api/src/routes/auth.ts](../api/src/routes/auth.ts)
- [api/src/lib/repository.ts](../api/src/lib/repository.ts)
- [api/src/lib/bootstrap.ts](../api/src/lib/bootstrap.ts)
- [vite.config.ts](../vite.config.ts)
- [public/sw.js](../public/sw.js)

## Documentation contract

- This file is the detailed technical snapshot for the public tree
- README stays concise and points here
- HANDOFF documents the public/private boundary and contribution workflow rather than duplicating feature state
- Real-device verification belongs in `tasks.md`
