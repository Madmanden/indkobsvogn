# Handoff — Indkøbsvogn

**Last updated:** 2026-03-24

Current implementation snapshot: [CURRENT.md](CURRENT.md)

V2 reference: [PLAN_V2.md](PLAN_V2.md)

---

## Quick Start

```bash
bun install
bun run dev       # Full Pages Functions app at localhost:8788
bun run build     # Production build to dist/
bun run test      # Run tests
bun run deploy:pages  # Manual Cloudflare Pages deploy from this machine
```

When asked to commit changes, also push and deploy unless explicitly told not to. Wrangler deploys should use `--commit-dirty=true`.

---

## Architecture Overview

```
src/
├── main.tsx              # Entry point
├── App.tsx               # Auth gate, screen routing, top-level handlers
├── App.css               # Main app stylesheet (single source of truth)
├── components/           # Screen components
│   ├── AddStoreModal.tsx     # Dedicated add-store modal
│   ├── PlanningScreen.tsx    # Add items, inline rename, quantity editing, delete/undo
│   ├── ShoppingScreen.tsx    # Check-off items, trip completion, loyalty card button
│   ├── StoresScreen.tsx      # Store selection, favorites-first ordering, open store settings
│   ├── StoreSettingsScreen.tsx   # Store identity, favorite toggle, loyalty card config, delete
│   ├── LoyaltyScreen.tsx     # Fullscreen loyalty card display
│   ├── ConfirmScreen.tsx     # Trip end confirmation
│   ├── LoginScreen.tsx       # Magic-link sign-in
│   ├── HouseholdSetupScreen.tsx # Create/join household
│   ├── ConflictModal.tsx     # Legacy fallback UI, currently not surfaced in normal phone-first flow
│   └── SyncIndicator.tsx     # Error-only sync status pill
├── domain/               # Business logic (no React dependencies)
│   ├── models.ts             # TypeScript interfaces
│   ├── type-guards.ts        # Shared runtime type guards (extracted from store.ts)
│   ├── store.ts              # localStorage persistence + migrations + sync metadata
│   ├── app-state.ts          # State transformations
│   ├── learning.ts           # Route learning algorithm
│   ├── trips.ts              # Trip history management
│   └── default-state.ts      # Empty initial state
├── hooks/
│   └── useAppState.ts        # React hook for state + persistence
├── auth/
│   └── AuthContext.tsx       # Magic-link session and household bootstrap
├── sync/
│   └── engine.ts             # Local-first background sync engine
└── utils/
    ├── id.ts                 # UUID generation
    ├── fuzzy.ts              # Levenshtein distance, similarity
    ├── list.ts               # List sorting helpers
    └── importExport.ts       # Legacy JSON migration helpers kept off the live UI
api/
├── src/                     # Shared Hono app used by Pages Functions
│   ├── index.ts              # Shared Hono app entry point + security headers
│   ├── lib/                  # Auth, repository, bootstrap, rate-limiter helpers
│   └── routes/               # auth, household, state
│   ├── db/
│       └── schema.sql        # D1 schema (users, sessions, households, rate_limits)
functions/
└── api/[[route]].ts          # Pages Functions entrypoint
wrangler.toml                 # Pages config + D1 binding
scripts/
└── deploy-pages.sh           # Manual build + Pages deploy helper
```

---

## Current Snapshot

The live app model, flow, and algorithm details now live in [CURRENT.md](CURRENT.md).

Use this file for:
- Repo layout
- Quick start and testing
- Sync/auth orientation

Keep `CURRENT.md` in sync with code first, then update any handoff notes that need to reflect the new shape.

Recent changes worth knowing:

**Security hardening (2026-03-24):**
- API now sets security headers on all responses: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Strict-Transport-Security`
- `/api/auth/sign-in` is rate-limited to 5 requests per email per minute (D1-backed sliding window)
- Type guards were deduplicated: extracted from `store.ts` + `importExport.ts` into shared `domain/type-guards.ts`
- New `rate_limits` table added to D1 schema for distributed rate limiting

**UI/state changes:**
- `forest-theme.css` was removed; all active styling now lives in [App.css](App.css)
- Store creation now uses a dedicated modal with name + location fields instead of browser prompts
- Store settings now use a compact title row with an inline favorite chip, editable name/location rows, and a separated dotted delete action
- Store settings card treatment is now shared across breakpoints: same padding, border, fill, and shadow on mobile and desktop
- The loyalty preview box is now lighter and fills its container consistently, with only the mobile preview height still adapting
- The planning screen suggestions panel now has a compact labeled header and tighter suggestion rows instead of a bare dropdown list
- The planning header title was trimmed so the iPhone viewport reads less oversized without introducing mobile-only styling
- Store picker, planning, and shopping now share the same outer shell sizing
- Stores now support:
  - editable name + location from store settings (inline blur-save rows)
  - favorite/pinned stores that sort to the top of the store list
  - deletion from store settings with confirmation
- The planning quantity control is now a custom numeric text field instead of relying on browser number-input spinners
- `learning.ts` normalization was corrected so the last item in a multi-item trip maps to weighted position `1.0`
- Primary green CTA buttons were normalized to a single shared style across screens
- The loyalty-card helper copy now says exactly "Upload et screenshot eller billede af kortet.", and the preview was shortened on mobile so the CTA still fits on one iPhone screen
- The store picker copy now says "Vælg den butik du vil handle i."
- API requests now time out instead of leaving auth bootstrap on "Indlæser..."
- Household sync is now explicitly phone-first for trip editing: the active `list` stays local, while durable shared data (`stores`, `items`, `trips`) syncs in the background
- The sync indicator no longer shows routine pending/retry states; only real sync errors remain visible

---

## Testing

```bash
bun run test
```

For UI verification:
- Use Playwright MCP for repeatable browser flows, screenshots, and accessibility snapshots
- Use Chrome DevTools MCP for live inspection, layout debugging, console/network checks, and validating rendered spacing/typography
- For this project, visual QA has mostly been done against the local Pages app at `http://localhost:8788/`

Tests cover:
- Learning algorithm (weighted averaging, decay)
- Trip capping (max 200)
- Import/export merge logic
- Fuzzy matching
- Sync engine phone-first background sync, version rebasing, and local-list preservation
- API auth/household sync behavior

Current automated status:
- `bun run test` passes
- `bun run build` passes

---

## Known Limitations

- No real-time collaboration yet
- One household per email for now
- Local-only fields stay device-specific: `isShopping`, `currentSequence`, `selectedStoreId`, `list`
- The background sync layer is intentionally phone-first: in-progress shopping stays local, and the server is treated as the durable sync target for stores, items, and completed trips
- Loyalty cards are shown from shopping, not planning
- localStorage quota failures are surfaced to the user instead of crashing state edits
- Store creation uses a dedicated modal; store name/location editing in settings still uses lightweight inline blur-save inputs

**Fields never synced (local-only):** `isShopping`, `currentSequence`, `selectedStoreId`, `list`

---

## Sync Notes

The `store.ts` interface keeps the React layer simple:

- `commit()` stays synchronous
- localStorage is written immediately
- the sync engine marks the state dirty and schedules a debounced background PUT
- on reconnect, the app flushes the latest local state automatically
- the server is treated as a durable sync target, not the source of immediate in-trip UI state
- the active shopping list remains local; completed trips still feed shared route learning
- the sync indicator is now an error-only pill instead of a persistent status chip

This means the app stays usable offline without waiting for network round-trips; iPhone installability still needs a device pass.

See [STRATEGY.md](STRATEGY.md) for the product direction and [PLAN_V2.md](PLAN_V2.md) for the v2 reference architecture.

---

## Repo workflow note

When asked to commit changes in this repo, also push and deploy unless explicitly told not to. Wrangler deploys should use `--commit-dirty=true`.
