import { appStore } from '../domain/store'
import type { AppState } from '../domain/models'
import { isQuotaExceededError } from '../utils/storage'

export interface PersistStateOptions {
  markDirty?: boolean
  pendingSync?: boolean
  serverVersion?: number | null
  householdId?: string | null
}

export function persistAppState(nextState: AppState, options: PersistStateOptions = {}): boolean {
  try {
    appStore.saveState(nextState, options)
    return true
  } catch (error) {
    if (isQuotaExceededError(error)) {
      return false
    }

    throw error
  }
}
