# Current State — Indkøbsvogn

Canonical snapshot of the implemented app as of 2026-03-24.

This snapshot reflects the shipped v2 household-sync build with phone-first trip editing.

If the code changes, update this file first. Other docs should point here instead of restating the same implementation details.

---

## Implemented Now

- Magic-link sign-in and household setup gate the app before the store picker
- Local-first v2 household sync with background API writes, localStorage cache, offline retry, and phone-first trip editing
- App starts on the store picker after authentication and household selection
- Store-scoped model: `GroceryStore`, `Item`, `ListItem.storeId`, `Trip.storeId`, and `AppState.selectedStoreId`
- Store picker uses a dedicated add-store modal instead of browser prompts
- Store settings use a compact title row with an inline favorite chip, editable name/location rows, a dotted delete action, and loyalty-card controls
- Planning mode supports add, autocomplete, inline rename, quantity editing, and inline delete with undo
- Planning mode shows a loyalty-card preview when the selected store has one uploaded, and the preview opens the full loyalty screen when tapped; the mobile preview height was tuned so the settings CTA still fits on an iPhone screen
- The store picker focuses on store selection and store settings; raw JSON import/export is no longer exposed in the live household-sync UI
- Shopping mode supports check-off, done-section animation, haptic feedback, mid-trip adds, trip completion confirmation, and auto-opening the loyalty card after checkout when present
- The active shopping list stays local to the device; the server sync target is durable household data (`stores`, `items`, `trips`)
- Completing a trip clears that store's active list locally, while completed trip history and learned order sync to the server
- Loyalty cards are per-store images saved as global-only in the UI; older stored cards are normalized to `global`, while `selectedStoreId`, `isShopping`, `currentSequence`, and the active `list` stay local-only
- Route learning is per store, uses weighted position with recency weighting, and caps trip history at 200
- `store.ts` persists to localStorage with schema version 4, migration support, and sync metadata (`pendingSync`, `serverVersion`)
- localStorage quota failures are surfaced to the user so storage pressure does not crash ordinary edits
- The sync engine treats the phone as the immediate source of truth, quietly rebases onto newer server versions, and keeps normal version drift out of the UI
- The sync indicator is now effectively error-only; ordinary pending/sync/retry states do not show a visible badge
- API requests time out instead of leaving auth/bootstrap screens hanging forever
- The service worker checks for updates on focus and every few minutes, and controlled tabs reload when a newer version activates

## Manual Verification Still Pending

- Zero-network behavior after first load
- iPhone "Add to Home Screen" installability and install prompt behavior
- Delete/undo timing behavior
- localStorage size boundaries under real device usage
- Low-end mobile performance pass
- Store modal keyboard-only flow on mobile Safari
- Real-device verification that completed trips sync correctly while in-progress list edits remain device-local

## Key Source Files

- [src/App.tsx](../src/App.tsx)
- [src/domain/models.ts](../src/domain/models.ts)
- [src/domain/app-state.ts](../src/domain/app-state.ts)
- [src/domain/store.ts](../src/domain/store.ts)
- [src/api/client.ts](../src/api/client.ts)
- [src/sync/engine.ts](../src/sync/engine.ts)
- [src/components/StoresScreen.tsx](../src/components/StoresScreen.tsx)
- [src/components/AddStoreModal.tsx](../src/components/AddStoreModal.tsx)
- [src/components/PlanningScreen.tsx](../src/components/PlanningScreen.tsx)
- [src/components/ShoppingScreen.tsx](../src/components/ShoppingScreen.tsx)
- [src/components/StoreSettingsScreen.tsx](../src/components/StoreSettingsScreen.tsx)

---

## Repo workflow note

When asked to commit changes in this repo, also push and deploy unless explicitly told not to. Wrangler deploys should use `--commit-dirty=true`.
