# Indkøbsvogn

Indkøbsvogn er en dansk, lokal-først indkøbsapp til husstande, der vil have en mere rolig og intelligent måde at planlægge indkøb på. Appen lærer rækkefølgen i hver butik, holder den aktive tur lokal på telefonen og synkroniserer de varige husstandsdata i baggrunden.

## Derfor Indkøbsvogn

- Den aktive indkøbstur bliver på telefonen, så du kan bruge appen hurtigt i butikken uden at vente på sync
- Appen lærer varernes rækkefølge ud fra afsluttede ture, så den bliver bedre over tid
- Fælles husstandsdata synkroniseres automatisk med magic links og en 6-cifret kode
- Hver butik har sit eget flow, sin egen læring og sin egen historik
- Appen er offline-først og optimeret til mobil brug

## Det kan den

- Butiksbevidst planlægning og indkøb
- Automatisk læring af varernes rækkefølge fra gennemførte ture
- Telefon-først redigering, hvor den aktive liste forbliver lokal på telefonen
- Husstandslogin med magic links og 6-cifret kode
- Loyalitetskort pr. butik
- Hurtig brug offline og på langsomme forbindelser

## Kom i gang

```bash
bun install
bun run dev
```

Åbn den lokale URL, som udviklingsserveren viser i terminalen.

Hvis du vil bruge lokal levering af magic links, så kopiér `.dev.vars.example` til `.dev.vars` og sæt `RESEND_API_KEY`.

## Byg og test

```bash
bun run build
bun run test
bun run preview
```

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
- Hono i `api/`
