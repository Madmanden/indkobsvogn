# Strategy — Indkøbsvogn

Product direction for the shared app mirrored in this public repository. Exact implementation details live in [CURRENT.md](CURRENT.md).

## Product Goal

Build an offline-first grocery list that learns the user's route through each store without requiring manual categorization.

## Current Product Shape

- v2 is the shipped product: email sign-in, household setup, store picker, planning, shopping and background household sync
- The 6-digit email code is the PWA-friendly primary login flow; magic links remain an alternative
- The app is local-first: every user edit updates the phone immediately and durable sync catches up in the background
- The active shopping list and in-progress trip belong to the phone being used; stores, item/learning data and completed trips are the durable household sync target
- Route learning is store-specific and trained from completed trips
- Planning supports manual drag-and-drop correction. Starting a trip turns that manual order into learning evidence and then returns the list to learned mode
- Store creation uses a dedicated modal; store settings support name/location, favorite state, deletion and loyalty-card management
- Household sharing happens through authenticated membership and background sync, not manual JSON exchange

## What We Value

- Minimal sync friction
- Danish UI and one-handed mobile ergonomics
- Passive route learning from real shopping behavior
- Manual correction that improves future learned order instead of creating a second permanent sorting system
- Store-scoped data and learning
- Local-first reliability when the network is slow or absent
- A small, understandable persistence/sync boundary

## Version Direction

### v1

- Offline-first PWA
- localStorage persistence
- Route learning from shopping trips
- Manual export/import for sharing
- Optional loyalty-card images

### v2 — current

- Household sync across devices
- 6-digit code + magic-link auth
- Cloudflare Pages Functions + D1 backend architecture
- Versioned REST sync for durable household data
- localStorage remains the immediate device cache/source of truth for active use
- Active lists remain device-local
- Manual planning order feeds route learning when shopping starts
- Background retry, offline status, auth recovery and conflict fallback

### v3 — only if product need justifies it

- Real-time multi-user editing/shopping
- More granular backend data/querying
- Dedicated image storage if loyalty-card payload size becomes a real constraint

## Source-of-Truth Links

- [CURRENT.md](CURRENT.md) — exact mirrored implementation snapshot
- [PLAN_V2.md](PLAN_V2.md) — v2 reference architecture
- [HANDOFF.md](HANDOFF.md) — public/private repository boundary

The private repository is canonical for production; this public tree is a sanitized mirror of shared application/API behavior.
