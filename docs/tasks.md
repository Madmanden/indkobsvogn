# Tasks — Current Verification

Derived from [CURRENT.md](CURRENT.md). Checked items are implemented in the mirrored code/tests; unchecked items are real-device/browser verification or mirror-maintenance work.

## Core product

- [x] Store-scoped planning and shopping flow
- [x] Add/autocomplete/rename/quantity/delete + undo
- [x] Per-store route learning with recency weighting
- [x] Trip history capped at 200
- [x] Mid-trip adds, cancellation and completion
- [x] Per-store loyalty card with explicit X close
- [x] App-level error boundary

## Manual sorting and learning

- [x] Always-visible drag handles
- [x] Touch activation deadzone + haptic/visual feedback
- [x] Persist `sortMode` and `manualPosition`
- [x] Preserve a valid manual order when adding/restoring items
- [x] Learn manual order when shopping starts
- [x] Clear manual override after the learning handoff

## Authentication

- [x] Magic-link authentication
- [x] 6-digit verification-code authentication
- [x] Code-first PWA login UI
- [x] Preserve login draft during the mail/app round-trip
- [x] Typed frontend API errors
- [x] Sign-in and code-verification rate limiting
- [x] GET does not consume magic-link tokens
- [x] Atomic verification-token consumption
- [x] Invalidate old tokens and clean expired tokens/sessions
- [x] Fail closed when mail delivery is unavailable unless local fallback is explicitly enabled
- [x] Restricted CORS
- [x] Recover auth/database bootstrap after transient failures
- [x] Optimistic offline sign-out
- [ ] Verify code login in an installed iPhone PWA
- [ ] Verify magic-link confirmation in Safari

## Local-first sync

- [x] Active list remains device-local
- [x] Stores/items/completed trips form the durable sync target
- [x] Preserve edits made while a push is in flight
- [x] Catch failed flush/conflict paths
- [x] Exponential retry backoff
- [x] Unauthorized propagation to auth handling
- [x] Offline/pending/syncing/unauthorized/error states
- [x] Conflict modal after repeated automatic conflict failures
- [x] Real D1 affected-row handling via `meta.changes`
- [ ] Verify reconnect after a cold offline start
- [ ] Verify two-device local-list/shared-history behavior
- [ ] Exercise a repeated real conflict and conflict-modal recovery

## PWA / offline

- [x] Manifest and service worker
- [x] Build-time service-worker cache/version hash
- [x] Update checks on focus and periodically
- [x] Cleanup of old caches
- [ ] Verify zero-network behavior after first successful load
- [ ] Verify offline boot with an existing cache/session
- [ ] Verify iPhone Add to Home Screen
- [ ] Verify installed-PWA update after a production deploy

## Public mirror

- [x] Public README states the sanitized-mirror boundary
- [x] `bun run dev` documented truthfully as frontend-only in public
- [x] Production deploy wiring omitted
- [x] Public environment example contains placeholders only
- [x] CI verifies lint, tests and build on PRs/main
- [x] Current D1/auth/sync/manual-order fixes mirrored
- [ ] For every future shared private change: sync, sanitize-review and pass CI before calling public current

## Notes

- Remaining unchecked work is mostly real-device/browser verification, not hidden implementation backlog.
- The public repository intentionally cannot reproduce the production Cloudflare deployment without supplying separate development configuration.
