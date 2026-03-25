# Indkøbsvogn
A shopping list app that learns the route you actually walk through the store.

> **Status:** Finished and in weekly use. Does exactly what it was built to do.  
> **Note:** The app interface is in Danish only.

---

## Background

Most shopping apps are glorified to-do lists. I wanted one that sorts my list by the route I actually walk through the store — and shows my loyalty card even when the signal is terrible. So I built it.

It's designed for a single household with multiple phones. The active shopping trip lives locally on your device. Stores, items, and completed trips sync in the background when connected.

---

## Features

**Route learning**  
Indkøbsvogn tracks the order you check off items. After a few trips, your list is automatically sorted to match the route you actually walk through the store.

**Offline-first during shopping**  
While you're in the store, the app works without a network connection. Loyalty cards are accessible even with no signal — which was the specific problem that started this project. Data syncs when you're done.

**Household sharing**  
Login via magic links — no passwords. Everyone in the household shares the same stores and item lists. The active trip belongs to whichever phone is currently shopping.

**Per-store loyalty cards**  
Save your Coop card to Coop, your Lidl card to Lidl. They appear automatically when you're in the right store.

---

## Screenshots

| Store | Settings | Planning |
|-------|----------|----------|
| ![Store screen](screenshots/1_indkob_store.jpg) | ![Settings screen](screenshots/2_indkob_settings.jpg) | ![Planning screen](screenshots/3_indkob_planning.jpg) |

---

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Plain CSS |
| Backend | Hono on Cloudflare Pages Functions |
| Database | Cloudflare D1 (SQLite) |
| Auth | Magic links via Resend |

No heavy backend infrastructure. The entire project runs on Cloudflare's edge network.

---

## Getting Started

```bash
bun install
bun run dev
```

Open the local URL shown in the terminal.

Copy `.env.example` to `.env` and `.dev.vars.example` to `.dev.vars`. The latter requires a [Resend](https://resend.com) API key for local magic link delivery.

```bash
bun run build    # Production build
bun run test     # Run tests
bun run preview  # Preview production build
```

### Optional: running your own instance

This project was built for my own Cloudflare setup, so it isn’t packaged as a one-command deploy.

If you want to run it yourself, you’ll need:

- a [Cloudflare](https://cloudflare.com) account with Pages and D1
- a [Resend](https://resend.com) account for magic link emails
- enough familiarity to wire the environment variables and deployment settings to your setup

The code is straightforward to adapt, but this README stays focused on the app itself rather than deployment documentation.