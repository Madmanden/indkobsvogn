# Strategy — Indkøbsvogn

Canonical product direction for the app. Implementation details live in [CURRENT.md](CURRENT.md).

---

## Product Goal

Build an offline-first grocery list that learns the user's store route without manual categorization.

## Current Product Shape

- v2 is the current shipped shape: sign-in, household setup, store picker, planning, shopping, and background household sync
- The app stays local-first: each edit updates the device immediately, then sync catches up in the background
- Each store has its own current list and learning history
- The active trip belongs to the phone that is being used; the server is primarily for durable shared data such as stores, items, and completed trips
- Store creation uses a dedicated modal, while store settings keep inline editable name/location rows, an inline favorite chip, and a separated delete action
- Loyalty cards are per-store images; the UI saves them as global-only and normalizes older stored cards to `global`
- Households share state through magic-link auth plus household membership, not raw JSON export/import

## What We Value

- No unnecessary sync friction in v2
- Danish UI and one-handed mobile ergonomics
- Passive route learning from check-off order
- Store-scoped data, not one global list
- A clean persistence seam that keeps local-first behavior simple

## Version Direction

### v1
- Offline-first PWA
- localStorage persistence
- Route learning from shopping trips
- Manual export/import for sharing
- Optional loyalty-card images

### v2
- Household sync across devices
- Magic-link auth
- REST sync for durable household data
- LocalStorage remains the offline cache and immediate source of truth
- Local edits win locally; the phone remains the source of truth during an active trip and the server catches up in the background

### v3
- Real-time multi-user editing and shopping
- Live updates with a simple merge strategy

## Source-of-Truth Links

- [CURRENT.md](CURRENT.md) for the implemented snapshot
- [PLAN_V2.md](PLAN_V2.md) for the v2 reference architecture

---

## Repo workflow note

When asked to commit changes in this repo, also push and deploy unless explicitly told not to. Wrangler deploys should use `--commit-dirty=true`.
