# Indkøbsvogn

Indkøbsvogn er en dansk, lokal-først indkøbsplanlægger, der lærer din rute gennem butikken og synkroniserer varige husstandsdata i baggrunden, mens den aktive tur forbliver lokal på telefonen.

## Hvad den gør
- Butiksbevidst planlægnings- og indkøbsflow
- Lærer varernes rækkefølge ud fra afsluttede ture
- Husstandslogin med magic links
- Telefon-først redigering af ture: den igangværende indkøbsliste forbliver lokal, mens butikker/varer/afsluttede ture synkroniseres
- Loyalitetskort pr. butik
- Offline-først, mobilvenlig brugerflade

## Hurtig start

```bash
bun install
bun run dev
```

Åbn `http://localhost:8788`, når udviklingsserveren er startet.

Hvis du vil have lokal levering af magic links, så kopiér `.dev.vars.example` til `.dev.vars` og sæt `RESEND_API_KEY`.

## Byg og test

```bash
bun run build
bun run test
bun run preview
```

## Deploy

- Cloudflare Pages til frontend
- Cloudflare Pages Functions til API'et
- Cloudflare D1 til husstandens data
- `bun run deploy:pages` til manuel deploy fra denne maskine
- Når der bliver bedt om at committe ændringer, så skal der også pushes og deployes, medmindre andet er aftalt

## Dokumentation

- [Nuværende implementering](docs/CURRENT.md)
- [Produktstrategi](docs/STRATEGY.md)
- [V2 referencearkitektur](docs/PLAN_V2.md)
- [Handoff-noter](docs/HANDOFF.md)
- [Verifikationsopgaver](docs/tasks.md)

## Stack

- React 19
- Vite 8
- TypeScript
- Plain CSS
- Hono på Cloudflare Pages Functions

---

## Repo workflow note

When asked to commit changes in this repo, also push and deploy unless explicitly told not to. Wrangler deploys should use `--commit-dirty=true`.
