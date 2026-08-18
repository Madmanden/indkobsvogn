# Handoff — Indkøbsvogn Public Mirror

**Last updated:** 2026-08-18

Current implementation: [CURRENT.md](CURRENT.md)

## Repository role

`Madmanden/indkobsvogn` is the sanitized public showcase mirror.

`Madmanden/indkobsvogn-private` is the canonical production repository. Shared runtime/API behavior should be mirrored here, but production deployment configuration and operational values must not be copied.

## Quick start

```bash
bun install
bun run dev
bun run lint
bun run test
bun run build
```

Important: `bun run dev` in this repository starts **Vite frontend only**. The production repository has Cloudflare Pages/D1 wiring that is intentionally absent here.

## Architecture

```text
src/
├── main.tsx                  # entry point + SW registration
├── App.tsx                   # auth gate, screens, offline/conflict handling
├── api/client.ts             # typed browser API client
├── auth/
│   ├── AuthContext.tsx       # auth bootstrap/offline behavior
│   ├── context.ts            # auth contract
│   └── loginDraft.ts         # PWA-safe login draft
├── components/
│   ├── PlanningScreen.tsx    # CRUD + persisted drag sorting
│   ├── ShoppingScreen.tsx
│   ├── LoginScreen.tsx       # 6-digit code + magic link UI
│   ├── SyncIndicator.tsx
│   └── ConflictModal.tsx
├── domain/
│   ├── models.ts
│   ├── store.ts              # localStorage schema/migrations/sync metadata
│   ├── app-state.ts          # manual ordering + trip lifecycle
│   └── learning.ts
└── sync/engine.ts            # retries, rebasing, auth/conflict handling

api/
├── src/index.ts
├── src/lib/repository.ts     # D1 access + meta.changes helper
├── src/lib/bootstrap.ts
├── src/routes/auth.ts
└── tests/

functions/api/[[route]].ts     # Pages Functions adapter source
public/sw.js                   # offline cache/service worker
vite.config.ts                 # build-time SW versioning
```

## What is deliberately different from private

Do not add these to public while syncing:

- `wrangler.toml`
- production Pages/D1 IDs
- production deploy scripts/workflows
- real `.dev.vars` values
- secrets or private operational metadata

Public `package.json` intentionally keeps only generic build/test/frontend-dev tooling; it does not expose the private deployment scripts. Public docs must therefore never claim that `bun run dev` or `bun run deploy:pages` starts/deploys the production-style stack.

## Sync boundaries

Expected to match canonical shared code:

- `src/`
- `api/`
- `functions/`
- `public/`
- `tests/`
- generic TypeScript/Vite/ESLint configuration

Expected to differ:

- README/HANDOFF wording
- root package/deployment tooling where production-specific
- environment examples (public placeholders only)
- deployment configuration

A shared private change makes this mirror stale until it has been copied, reviewed for sanitization and passed public CI.

## Authentication notes

- The 6-digit code is the installed-PWA-friendly primary flow
- Magic-link GET only presents a confirmation form; POST consumes the token
- Local fallback is development-only and must be explicitly enabled
- Public `.dev.vars.example` contains placeholders only
- Never publish a production Resend key, allowed-email list or Cloudflare project/database identifiers

## Data/sync boundary

Device-local:

- active list
- selected store
- shopping state
- current in-progress sequence

Durable household sync target:

- stores
- item catalog / learned positions
- completed trips

## Verification

GitHub Actions runs:

```bash
bun install --frozen-lockfile
bun run lint
bun run test
bun run build
```

Remaining real-device checks are tracked in [tasks.md](tasks.md).

## Documentation maintenance

1. `CURRENT.md` is the detailed snapshot of the public tree.
2. README gives the public/showcase overview and truthful local setup.
3. HANDOFF records mirror/sanitization boundaries and workflow.
4. `tasks.md` contains remaining verification work.
5. Never call the public mirror current if CI is red or shared private changes have not been reviewed here.
