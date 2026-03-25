import { useState } from 'react'
import { appStore } from '../domain/store'
import type { AppState } from '../domain/models'
import { notifyStateChanged } from '../sync/engine'
import { persistAppState } from './state-persistence'

const STORAGE_QUOTA_MESSAGE =
  'Kan ikke gemme ændringen, fordi browserens lager er fuldt.'

export function useAppState() {
  const [state, setState] = useState<AppState>(() => appStore.getState())

  function commit(nextState: AppState): void {
    if (!persistAppState(nextState)) {
      window.alert(STORAGE_QUOTA_MESSAGE)
      return
    }

    setState(nextState)
    notifyStateChanged(nextState)
  }

  function replace(
    nextState: AppState,
    options?: { serverVersion?: number | null; householdId?: string | null },
  ): void {
    if (!persistAppState(nextState, {
      markDirty: false,
      pendingSync: false,
      serverVersion: options?.serverVersion ?? appStore.getServerVersion(),
      householdId: options?.householdId,
    })) {
      window.alert(STORAGE_QUOTA_MESSAGE)
      return
    }

    setState(nextState)
  }

  return { state, commit, replace } as const
}
