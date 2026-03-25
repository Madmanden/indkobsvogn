/**
 * Sync engine for coordinating local state with remote server.
 *
 * Handles:
 * - Optimistic local updates with debounced push
 * - Conflict detection and automatic retry with backoff
 * - Online/offline awareness
 * - Initial hydration from server
 */
import { appStore } from '../domain/store'
import type { AppState, SyncableState } from '../domain/models'
import {
  fetchState,
  mergeServerStateIntoLocal,
  pushState,
  toSyncableState,
} from '../api/client'

// === Types ===

export interface SyncConflict {
  localState: AppState
  serverState: Awaited<ReturnType<typeof fetchState>>['state']
  serverVersion: number
}

export interface SyncStatus {
  online: boolean
  pending: boolean
  syncing: boolean
  retryingConflict: boolean
  lastError: string | null
}

interface SyncHandlers {
  applyRemoteState: (state: AppState, serverVersion: number) => void
  onConflict?: (conflict: SyncConflict) => void
  onStatusChange?: (status: SyncStatus) => void
}

interface ConflictRetryJob {
  desiredState: SyncableState
  serverVersion: number
}

// === Internal State ===

let latestState: AppState | null = null
let handlers: SyncHandlers | null = null
let debounceTimer: number | null = null
let flushInProgress: Promise<void> | null = null
let flushRequested = false
let hydrationPendingPushVersion: number | null = null
let conflictRetryTimer: number | null = null
let conflictRetryDelayMs = 1500
let initialized = false
let hydrationPromise: Promise<void> | null = null
let online = typeof navigator !== 'undefined' ? navigator.onLine : true
let pending = appStore.getSyncMeta().pendingSync
let syncing = false
let retryingConflict = false
let lastError: string | null = null
let boundOnlineHandler: (() => void) | null = null
let boundOfflineHandler: (() => void) | null = null

// === Helper Functions ===

function isEmptySyncableState(state: SyncableState): boolean {
  return state.stores.length === 0 && state.items.length === 0 && state.trips.length === 0
}

function areSyncableStatesEqual(left: SyncableState, right: SyncableState): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function shouldUseServerWithoutPrompt(localState: AppState, serverState: SyncableState): boolean {
  const localSyncable = toSyncableState(localState)
  return isEmptySyncableState(localSyncable) || areSyncableStatesEqual(localSyncable, serverState)
}

function shouldAcceptServerVersionOnly(desiredState: SyncableState, serverState: SyncableState): boolean {
  return isEmptySyncableState(desiredState) || areSyncableStatesEqual(desiredState, serverState)
}

function emitStatus(): void {
  handlers?.onStatusChange?.({
    online,
    pending,
    syncing,
    retryingConflict,
    lastError,
  })
}

function applySuccessfulRemoteState(state: SyncableState, serverVersion: number): void {
  if (!handlers || !latestState) return

  const merged = mergeServerStateIntoLocal(latestState, state)
  latestState = merged
  handlers.applyRemoteState(merged, serverVersion)
}

function clearTimer(): void {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

function clearConflictRetryTimer(): void {
  if (conflictRetryTimer !== null) {
    window.clearTimeout(conflictRetryTimer)
    conflictRetryTimer = null
  }
}

function scheduleFlush(): void {
  clearTimer()

  debounceTimer = window.setTimeout(() => {
    void flush()
  }, 2000)
}

function installNetworkListeners(): void {
  if (initialized) return
  initialized = true

  boundOnlineHandler = () => {
    online = true
    emitStatus()
    void flush()
  }

  boundOfflineHandler = () => {
    online = false
    emitStatus()
  }

  window.addEventListener('online', boundOnlineHandler)
  window.addEventListener('offline', boundOfflineHandler)
}

// === Public API ===

export function registerSyncHandlers(nextHandlers: SyncHandlers): void {
  handlers = nextHandlers
  installNetworkListeners()
  emitStatus()
}

export function resetSyncEngine(): void {
  clearTimer()
  clearConflictRetryTimer()
  hydrationPromise = null
  flushInProgress = null
  flushRequested = false
  hydrationPendingPushVersion = null
  latestState = null
  pending = appStore.getSyncMeta().pendingSync
  syncing = false
  retryingConflict = false
  lastError = null
  conflictRetryDelayMs = 1500

  if (boundOnlineHandler) {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('online', boundOnlineHandler)
    }
    boundOnlineHandler = null
  }
  if (boundOfflineHandler) {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('offline', boundOfflineHandler)
    }
    boundOfflineHandler = null
  }
  initialized = false

  emitStatus()
}

export function getSyncStatus(): SyncStatus {
  return {
    online,
    pending,
    syncing,
    retryingConflict,
    lastError,
  }
}

export function initializeSync(state: AppState): void {
  latestState = state
  pending = appStore.getSyncMeta().pendingSync
  emitStatus()
  hydrationPromise = hydrateFromServer().finally(() => {
    if (hydrationPromise) {
      hydrationPromise = null
    }
  })
}

export function notifyStateChanged(state: AppState): void {
  clearConflictRetryTimer()
  retryingConflict = false
  latestState = state
  pending = true
  lastError = null
  appStore.setSyncMeta({ pendingSync: true })
  emitStatus()

  if (online) {
    scheduleFlush()
  }
}

// === Hydration ===

async function hydrateFromServer(): Promise<void> {
  if (!latestState || !handlers) return

  try {
    const remote = await fetchState()
    const meta = appStore.getSyncMeta()

    if (meta.pendingSync) {
      hydrationPendingPushVersion = remote.version
      appStore.setSyncMeta({
        pendingSync: true,
        serverVersion: remote.version,
      })

      if (!flushInProgress) {
        await flush({ waitForHydration: false })
      }
      return
    }

    if (meta.serverVersion === null || remote.version > meta.serverVersion) {
      if (shouldUseServerWithoutPrompt(latestState, remote.state)) {
        const merged = mergeServerStateIntoLocal(latestState, remote.state)
        latestState = merged
        handlers.applyRemoteState(merged, remote.version)
        appStore.setSyncMeta({ pendingSync: false, serverVersion: remote.version })
        pending = false
        syncing = false
        lastError = null
        emitStatus()
        return
      }

      appStore.setSyncMeta({
        pendingSync: true,
        serverVersion: remote.version,
      })
      hydrationPendingPushVersion = remote.version
      pending = true
      lastError = null
      emitStatus()
      if (!flushInProgress) {
        await flush({ waitForHydration: false })
      }
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'sync_error'
    emitStatus()
  }
}

// === Conflict Resolution ===

function scheduleConflictRetry(job: ConflictRetryJob): void {
  clearConflictRetryTimer()
  retryingConflict = true
  emitStatus()

  conflictRetryTimer = window.setTimeout(() => {
    conflictRetryTimer = null
    void retryConflictInBackground(job)
  }, conflictRetryDelayMs)
}

async function retryConflictInBackground(job: ConflictRetryJob): Promise<void> {
  if (!handlers || !latestState) return

  const conflict = await resolveConflictAutomatically(job)

  if (conflict) {
    conflictRetryDelayMs = Math.min(conflictRetryDelayMs * 2, 30000)
    scheduleConflictRetry({
      desiredState: toSyncableState(conflict.localState),
      serverVersion: conflict.serverVersion,
    })
    return
  }

  conflictRetryDelayMs = 1500
  retryingConflict = false
  emitStatus()
}

async function resolveConflictAutomatically(job: ConflictRetryJob): Promise<SyncConflict | null> {
  if (!handlers) return null

  let currentVersion = job.serverVersion
  let attempts = 0
  let latestServerState: SyncableState | null = null

  while (attempts < 3) {
    attempts += 1

    appStore.setSyncMeta({
      pendingSync: true,
      serverVersion: currentVersion,
    })
    pending = true
    syncing = true
    lastError = null
    emitStatus()

    const result = await pushState(job.desiredState, currentVersion)

    if (result.ok) {
      appStore.setSyncMeta({
        pendingSync: false,
        serverVersion: result.version,
      })
      applySuccessfulRemoteState(result.state, result.version)
      pending = false
      syncing = false
      lastError = null
      emitStatus()
      return null
    }

    if (result.conflict && shouldAcceptServerVersionOnly(job.desiredState, result.state)) {
      appStore.setSyncMeta({
        pendingSync: false,
        serverVersion: result.version,
      })
      pending = false
      syncing = false
      lastError = null
      emitStatus()
      return null
    }

    if (!result.conflict) {
      lastError = result.message
      syncing = false
      emitStatus()
      return null
    }

    currentVersion = result.version
    latestServerState = result.state
  }

  if (!latestServerState) {
    return null
  }

  return {
    localState: latestState ?? appStore.getState(),
    serverState: latestServerState,
    serverVersion: currentVersion,
  }
}

// === Manual Sync Operations ===

/**
 * Flushes local state to the server, handling conflicts with exponential backoff retry.
 *
 * Flow:
 * 1. If already flushing, mark flushRequested=true and wait for existing flush to complete
 * 2. Wait for hydration if not explicitly disabled
 * 3. Push state with base version from hydration or server
 * 4. On success: apply server state and clear pending flag
 * 5. On conflict: schedule background retry with backoff
 * 6. Finally: if flushRequested was set, re-trigger flush
 */
export async function flush(options: { waitForHydration?: boolean } = {}): Promise<void> {
  if (!handlers || !latestState || !online) return

  // Already flushing - coalesce by requesting another flush after this one
  if (flushInProgress) {
    clearTimer()
    flushRequested = true
    return flushInProgress
  }

  flushInProgress = (async () => {
    try {
      if (options.waitForHydration !== false && hydrationPromise) {
        await hydrationPromise
      }

      clearTimer()
      syncing = true
      emitStatus()

      const baseVersion = hydrationPendingPushVersion ?? appStore.getServerVersion() ?? 0
      hydrationPendingPushVersion = null
      const desiredState = toSyncableState(latestState)
      const result = await pushState(desiredState, baseVersion)

      if (result.ok) {
        applySuccessfulRemoteState(result.state, result.version)
        appStore.setSyncMeta({
          pendingSync: false,
          serverVersion: result.version,
        })
        pending = false
        syncing = false
        lastError = null
        emitStatus()
        return
      }

      if (result.conflict) {
        if (shouldAcceptServerVersionOnly(desiredState, result.state)) {
          appStore.setSyncMeta({
            pendingSync: false,
            serverVersion: result.version,
          })
          pending = false
          syncing = false
          lastError = null
          emitStatus()
          return
        }

        pending = true
        syncing = false
        conflictRetryDelayMs = 1500
        appStore.setSyncMeta({
          pendingSync: true,
          serverVersion: result.version,
        })
        emitStatus()
        scheduleConflictRetry({
          desiredState: toSyncableState(latestState),
          serverVersion: result.version,
        })
        return
      }

      lastError = result.message
      syncing = false
      emitStatus()
    } finally {
      flushInProgress = null

      if (flushRequested) {
        flushRequested = false
        void flush({ waitForHydration: false })
      }
    }
  })()

  return flushInProgress
}

export async function resolveConflictKeepMine(conflict: SyncConflict): Promise<SyncConflict | null> {
  clearConflictRetryTimer()
  retryingConflict = false
  conflictRetryDelayMs = 1500
  latestState = conflict.localState
  appStore.setSyncMeta({
    pendingSync: true,
    serverVersion: conflict.serverVersion,
  })

  const result = await pushState(toSyncableState(conflict.localState), conflict.serverVersion)

  if (result.ok) {
    applySuccessfulRemoteState(result.state, result.version)
    appStore.setSyncMeta({
      pendingSync: false,
      serverVersion: result.version,
    })
    pending = false
    syncing = false
    lastError = null
    emitStatus()
    return null
  }

  if (result.conflict) {
    return {
      localState: conflict.localState,
      serverState: result.state,
      serverVersion: result.version,
    }
  }

  lastError = result.message
  syncing = false
  emitStatus()
  return null
}

export function resolveConflictUseServer(conflict: SyncConflict): void {
  clearConflictRetryTimer()
  retryingConflict = false
  conflictRetryDelayMs = 1500
  const local = latestState ?? appStore.getState()
  const merged = mergeServerStateIntoLocal(local, conflict.serverState)
  latestState = merged
  handlers?.applyRemoteState(merged, conflict.serverVersion)
  appStore.setSyncMeta({
    pendingSync: false,
    serverVersion: conflict.serverVersion,
  })
  pending = false
  syncing = false
  lastError = null
  emitStatus()
}
