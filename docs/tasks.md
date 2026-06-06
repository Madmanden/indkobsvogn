# Tasks — Current Verification

Derived from `CURRENT.md` and `STRATEGY.md`.

This file tracks the current shipped app. Checked items are implemented in code; unchecked items still need manual verification or additional hardening.

## 0) Project foundation
- [x] Initialize React 19 + Vite app
- [x] Set app language/labels to Danish
- [x] Create base layout

## 1) Data layer (`store.ts`) + models
- [x] Define TypeScript models: `GroceryStore`, `Item`, `ListItem`, `Trip`, `AppState`
- [x] Implement `store.ts` interface (read/write methods) backed by localStorage
- [x] Add migration/version key for future schema changes
- [x] Add data validation + safe fallback if storage is corrupted
- [x] Scope `ListItem` and `Trip` by `storeId` and keep learning per store

## 2) Planning mode (core list management)
- [x] Build planning screen as default mode
- [x] Add free-text input to create items
- [x] Add quantity editing on list items
- [x] Show list sorted by learned order (`weightedPosition`)
- [x] Implement autocomplete from master item history
- [x] Update `lastUsedAt` when an item is reused
- [x] Add inline rename (name only, keep stable `id`)
- [x] Add inline delete from current list + 3s undo snackbar
- [x] Keep the item catalog shared across stores while each store keeps its own current list

## 3) Duplicate handling
- [x] Implement fuzzy match (Levenshtein, threshold ≥80%)
- [x] On likely duplicate, show “Mente du X?” flow
- [x] Support “link existing item” vs “create new item”

## 4) Shopping mode
- [x] Add “Start indkøb” transition into shopping mode
- [x] Build focused checklist UI
- [x] Tap item to check off and move to “Færdige” section
- [x] Add collapse/slide animation (CSS transitions)
- [x] Add haptic feedback via Vibration API
- [x] Allow adding items mid-trip (append bottom)
- [x] Add sticky “Afslut indkøb” footer
- [x] Add confirmation dialog: “Er du færdig?”
- [x] Auto-open loyalty card after checkout when the selected store has one

## 5) Learning algorithm
- [x] Persist `currentSequence` during active trip
- [x] On trip completion, create `Trip` record
- [x] Normalize check index by trip length
- [x] Apply exponential decay weight: `e^(-λ * days_ago)`, λ=0.05
- [x] Compute weighted average per item
- [x] Recompute and persist `weightedPosition` values
- [x] Append unseen/new items to bottom (default `1.0`)
- [x] Cap trip history at 200 entries (drop oldest first)

## 6) Loyalty card feature (optional per store, local-first)
- [x] Add store settings entry: “Tilføj loyalitetskort”
- [x] Add image picker + local base64 storage
- [x] Normalize loyalty card storage to global-only in the UI
- [x] Show card icon in shopping header only when card exists
- [x] Fullscreen card viewer + tap to dismiss
- [x] Attempt max brightness / wake lock where supported; restore on close
- [x] Polish store settings layout for mobile: inline favorite chip, dotted delete action, shorter loyalty preview

## 7) PWA + offline
- [x] Create `manifest.json` (name, icons 192/512, standalone, theme color)
- [x] Add service worker with cache-first strategy
- [ ] Ensure zero network dependency after first load
- [ ] Verify iPhone “Add to Home Screen” installability
- [x] Set `<html lang="da">`

## 8) Migration helpers
- [x] Keep JSON import/export helpers available in code for migration flows
- [x] Implement merge rules for imported data
  - [x] items = union
  - [x] current list entries = merge by `storeId + itemId`
  - [x] trips = union
- [x] Remove manual import/export controls from the live household-sync UI

## 9) QA + hardening
- [ ] Test full offline flow (airplane mode)
- [x] Test learning behavior over multiple simulated trips
- [x] Test rename not resetting learned position
- [x] Test duplicate detection edge cases
- [x] Handle localStorage quota failures with a user-facing alert
- [x] Replace prompt-based new-store creation with a modal
- [ ] Test delete/undo timing behavior
- [ ] Test phone-first sync on reconnect without interrupting the user
- [ ] Test localStorage size boundaries
- [ ] Performance pass on low-end mobile device

---

## Actual remaining work
- [x] Make StoresScreen the entry point (empty on fresh build), auto-navigate to PlanningScreen after first store added
- [x] Switch planning rows to inline editing controls and inline delete with undo
- [x] Add collapse/slide animation when items move into the "Færdige" section
- [x] Allow adding items during an active shopping trip and append them at the bottom
- [x] Persist recomputed `weightedPosition` values back into stored state
- [x] Add store settings entry for "Tilføj loyalitetskort"
- [x] Add loyalty card image picker with local base64 storage
- [x] Normalize loyalty card scope to global-only
- [x] Attempt max brightness / wake lock while loyalty card is open and restore on close
- [ ] Verify zero network dependency after first load
- [ ] Verify iPhone "Add to Home Screen" installability
- [ ] Test full offline flow in airplane mode
- [x] Test rename without resetting learned position
- [x] Test duplicate-detection edge cases
- [x] Handle localStorage quota failures gracefully
- [ ] Test delete/undo timing behavior
- [ ] Test localStorage size boundaries
- [ ] Run a low-end mobile performance pass
- [ ] Test background sync on reconnect from a cold start
- [ ] Verify on real devices that in-progress shopping list edits stay local while completed trips sync to the household

## Notes
- The core v1 feature set and v2 household sync are implemented locally and covered by automated `test` and `build` checks.
- The shipped sync model is now phone-first for the active trip: the live list stays local, while durable shared data syncs in the background.
- The remaining items above are mostly manual device / browser verification tasks and non-trivial QA passes.
- Storage-quota failures are now surfaced to the user, but real-device storage ceilings still need verification.
- JSON import/export helpers still exist in code for migration support, but they are no longer exposed in the live UI.

---

## Suggested implementation order
1. Foundation + `store.ts`
2. Planning mode CRUD + quantities + rename
3. Autocomplete + fuzzy duplicate linking
4. Shopping mode + checkoff + done section
5. Trip completion + learning algorithm
6. PWA/offline
7. Import/export
8. Loyalty card flow
9. QA polish + bugfix sprint

---

## Repo workflow note

When asked to commit changes in this repo, also push and deploy unless explicitly told not to. Wrangler deploys should use `--commit-dirty=true`.
