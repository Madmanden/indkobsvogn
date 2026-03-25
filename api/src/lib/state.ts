import type { SyncableState } from './models'
import { sanitizeSyncableState, stripLocalOnlyFields, type AppState } from './models'

export function parseSyncableState(raw: unknown): SyncableState | null {
  return sanitizeSyncableState(raw)
}

export function toStoredState(appState: AppState): SyncableState {
  return stripLocalOnlyFields(appState)
}
