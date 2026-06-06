# Indkøbsvogn

Indkøbsvogn is a Danish, local-first grocery app for households that want calmer, smarter shopping. It learns the route through each store, keeps the active shopping trip on the phone, and syncs durable household data quietly in the background.

## Why Indkøbsvogn

- Active shopping trips stay on the phone, so the app stays fast in the store without waiting for sync
- Item order improves over time from completed trips, with no manual aisle setup
- Household data syncs automatically with magic links and a 6-digit code
- Each store has its own list flow, learned order, trip history, and loyalty card
- The app is offline-first and designed for one-handed mobile use

## Features

- Store-aware planning and shopping flows
- Automatic route learning from completed trips
- Phone-first editing, where the active list remains local to the device
- Household sign-in with magic links and a 6-digit code
- Per-store loyalty cards, including quick access during planning and after checkout
- Fast use offline and on slow connections

## Getting Started

```bash
bun install
bun run dev
```

Open the local URL shown by the development server.

To enable local delivery of magic links, copy `.dev.vars.example` to `.dev.vars` and set `RESEND_API_KEY`.

## Build And Test

```bash
bun run build
bun run test
bun run preview
```

## Documentation

- [Current implementation](docs/CURRENT.md)
- [Product strategy](docs/STRATEGY.md)
- [V2 reference architecture](docs/PLAN_V2.md)
- [Handoff notes](docs/HANDOFF.md)
- [Verification tasks](docs/tasks.md)

## Stack

- React 19
- Vite 8
- TypeScript
- Plain CSS
- Hono in `api/`
