/**
 * Local storage persistence layer for app state.
 *
 * Handles:
 * - Schema versioning and migrations
 * - Type-safe reads with runtime validation
 * - Sync metadata (pending flag, server version)
 */
import { createDefaultStores, createInitialState } from './default-state'
import {
  isAppState,
  isFiniteNumber,
  isItem,
  isLegacyAppStateV3,
  isListItem,
  isRecord,
  isStringArray,
  isTrip,
} from './type-guards'
import type { AppState, GroceryStore, Item, ListItem, Trip } from './models'
import { resolveSelectedStoreId } from '../utils/selected-store'

// === Constants ===

const STORAGE_KEY = 'indkobsvogn-app-state'
const SCHEMA_VERSION = 5

// === Types ===

interface PersistedEnvelope {
  schemaVersion: number
  state: AppState
  pendingSync: boolean
  serverVersion: number | null
  householdId: string | null
}

interface SaveStateOptions {
  markDirty?: boolean
  pendingSync?: boolean
  serverVersion?: number | null
  householdId?: string | null
}

// === Legacy Types (V1, V2 - unique to this file) ===

interface LegacyAppStateV1 {
  items: Item[]
  list: ListItem[]
  trips: Trip[]
  isShopping: boolean
  currentSequence: string[]
}

interface LegacyAppStateV2 extends LegacyAppStateV1 {
  stores: Array<
    Omit<GroceryStore, 'loyaltyCardImage' | 'loyaltyCardScope'> & {
      loyaltyCardImage?: never
      loyaltyCardScope?: never
    }
  >
  selectedStoreId: string
}

function isLegacyAppStateV1(value: unknown): value is LegacyAppStateV1 {
  if (!isRecord(value)) return false

  return (
    Array.isArray(value.items) &&
    value.items.every(isItem) &&
    Array.isArray(value.list) &&
    value.list.every(isListItem) &&
    Array.isArray(value.trips) &&
    value.trips.every(isTrip) &&
    typeof value.isShopping === 'boolean' &&
    isStringArray(value.currentSequence)
  )
}

function isLegacyAppStateV2(value: unknown): value is LegacyAppStateV2 {
  if (!isRecord(value)) return false

  return (
    Array.isArray(value.stores) &&
    value.stores.every(
      (store) =>
        isRecord(store) &&
        typeof store.id === 'string' &&
        typeof store.name === 'string' &&
        typeof store.subtitle === 'string' &&
        typeof store.icon === 'string' &&
        (typeof store.isFavorite === 'undefined' || typeof store.isFavorite === 'boolean') &&
        (typeof store.loyaltyLabel === 'undefined' || typeof store.loyaltyLabel === 'string') &&
        isFiniteNumber(store.createdAt),
    ) &&
    typeof value.selectedStoreId === 'string' &&
    Array.isArray(value.items) &&
    value.items.every(isItem) &&
    Array.isArray(value.list) &&
    value.list.every(isListItem) &&
    Array.isArray(value.trips) &&
    value.trips.every(isTrip) &&
    typeof value.isShopping === 'boolean' &&
    isStringArray(value.currentSequence)
  )
}

// === State Sanitization ===

function sanitizeState(state: AppState): AppState {
  const stores = state.stores
  const selectedStoreId = resolveSelectedStoreId(stores, state.selectedStoreId)
  const validStoreIds = new Set(stores.map((store) => store.id))
  const normalizedStores = stores.map((store) =>
    store.loyaltyCardImage
      ? {
          ...store,
          loyaltyCardScope: 'global' as const,
        }
      : store,
  )

  return {
    ...state,
    stores: normalizedStores,
    selectedStoreId,
    items: state.items.filter((item) => item.defaultQuantity > 0),
    list: state.list
      .filter((listItem) => listItem.quantity > 0)
      .map((listItem) => ({
        ...listItem,
        storeId: validStoreIds.has(listItem.storeId) ? listItem.storeId : selectedStoreId,
      })),
    trips: state.trips.map((trip) => ({
      ...trip,
      storeId: validStoreIds.has(trip.storeId) ? trip.storeId : selectedStoreId,
    })),
  }
}

// === Schema Migration ===

function migratePersistedEnvelope(parsed: unknown): PersistedEnvelope | null {
  if (!isRecord(parsed)) return null

  const envelopeVersion = parsed.schemaVersion
  const rawState = parsed.state

  if (!isFiniteNumber(envelopeVersion) || !isRecord(rawState)) return null
  if (envelopeVersion > SCHEMA_VERSION) return null

  if (envelopeVersion === 1 && isLegacyAppStateV1(rawState)) {
    const defaultStores = createDefaultStores()

    const migrated: AppState = {
      stores: defaultStores,
      selectedStoreId: defaultStores[0]?.id ?? '',
      items: rawState.items,
      list: rawState.list,
      trips: rawState.trips,
      isShopping: rawState.isShopping,
      currentSequence: rawState.currentSequence,
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      state: sanitizeState(migrated),
      pendingSync: false,
      serverVersion: null,
      householdId: null,
    }
  }

  if (envelopeVersion === 2 && isLegacyAppStateV2(rawState)) {
    const migrated: AppState = {
      ...rawState,
      stores: rawState.stores.map((store) => ({
        ...store,
        loyaltyCardScope: 'global',
      })),
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      state: sanitizeState(migrated),
      pendingSync: false,
      serverVersion: null,
      householdId: null,
    }
  }

  if (envelopeVersion === 3 && isLegacyAppStateV3(rawState)) {
    const fallbackStoreId = rawState.stores.some((store) => store.id === rawState.selectedStoreId)
      ? rawState.selectedStoreId
      : rawState.stores[0]?.id ?? ''

    const migrated: AppState = {
      ...rawState,
      list: rawState.list.map((listItem) => ({
        ...listItem,
        storeId: fallbackStoreId,
      })),
      trips: rawState.trips.map((trip) => ({
        ...trip,
        storeId: fallbackStoreId,
      })),
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      state: sanitizeState(migrated),
      pendingSync: false,
      serverVersion: null,
      householdId: null,
    }
  }

  if (!isAppState(rawState)) return null

  return {
    schemaVersion: SCHEMA_VERSION,
    state: sanitizeState(rawState),
    pendingSync: typeof parsed.pendingSync === 'boolean' ? parsed.pendingSync : false,
    serverVersion: isFiniteNumber(parsed.serverVersion) ? parsed.serverVersion : null,
    householdId: typeof parsed.householdId === 'string' ? parsed.householdId : null,
  }
}

// === Storage Read/Write ===

function readEnvelope(): PersistedEnvelope | null {
  const serialized = localStorage.getItem(STORAGE_KEY)
  if (!serialized) return null

  try {
    const parsed = JSON.parse(serialized) as unknown
    return migratePersistedEnvelope(parsed)
  } catch {
    return null
  }
}

function getEnvelopeMeta(): Pick<PersistedEnvelope, 'pendingSync' | 'serverVersion' | 'householdId'> {
  const current = readEnvelope()
  return {
    pendingSync: current?.pendingSync ?? false,
    serverVersion: current?.serverVersion ?? null,
    householdId: current?.householdId ?? null,
  }
}

function writeEnvelope(state: AppState, options: SaveStateOptions = {}): void {
  const currentMeta = getEnvelopeMeta()
  const envelope: PersistedEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    state: sanitizeState(state),
    pendingSync: options.pendingSync ?? currentMeta.pendingSync,
    serverVersion: options.serverVersion ?? currentMeta.serverVersion,
    householdId: options.householdId ?? currentMeta.householdId,
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
}

function getState(): AppState {
  const fromStorage = readEnvelope()
  if (fromStorage) return fromStorage.state

  const fallback = createInitialState()
  writeEnvelope(fallback, { pendingSync: false, serverVersion: null, householdId: null })
  return fallback
}

function saveState(state: AppState, options: SaveStateOptions = {}): AppState {
  writeEnvelope(state, {
    pendingSync:
      options.pendingSync ?? (options.markDirty === false ? false : true),
    serverVersion: options.serverVersion,
    householdId: options.householdId,
  })
  return state
}

function updateState(updater: (current: AppState) => AppState): AppState {
  const current = getState()
  const next = updater(current)
  saveState(next)
  return next
}

function getServerVersion(): number | null {
  return readEnvelope()?.serverVersion ?? null
}

function getSyncMeta(): { pendingSync: boolean; serverVersion: number | null; householdId: string | null } {
  const envelope = readEnvelope()
  return {
    pendingSync: envelope?.pendingSync ?? false,
    serverVersion: envelope?.serverVersion ?? null,
    householdId: envelope?.householdId ?? null,
  }
}

function setSyncMeta(meta: { pendingSync?: boolean; serverVersion?: number | null; householdId?: string | null }): void {
  const current = readEnvelope()
  const state = current?.state ?? getState()

  writeEnvelope(state, {
    pendingSync: meta.pendingSync ?? current?.pendingSync ?? false,
    serverVersion: meta.serverVersion ?? current?.serverVersion ?? null,
    householdId: meta.householdId ?? current?.householdId ?? null,
  })
}

function getStores(): GroceryStore[] {
  return getState().stores
}

function saveStores(stores: GroceryStore[]): GroceryStore[] {
  saveState({ ...getState(), stores })
  return stores
}

function getItems(): Item[] {
  return getState().items
}

function saveItems(items: Item[]): Item[] {
  saveState({ ...getState(), items })
  return items
}

function getList(): ListItem[] {
  return getState().list
}

function saveList(list: ListItem[]): ListItem[] {
  saveState({ ...getState(), list })
  return list
}

function getTrips(): Trip[] {
  return getState().trips
}

function saveTrips(trips: Trip[]): Trip[] {
  saveState({ ...getState(), trips })
  return trips
}

function clear(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// === Public API ===

export const appStore = {
  storageKey: STORAGE_KEY,
  schemaVersion: SCHEMA_VERSION,
  clear,
  getState,
  saveState,
  updateState,
  getServerVersion,
  getSyncMeta,
  setSyncMeta,
  getStores,
  saveStores,
  getItems,
  saveItems,
  getList,
  saveList,
  getTrips,
  saveTrips,
}
