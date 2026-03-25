export type LoyaltyCardScope = 'local' | 'global'

export interface GroceryStore {
  id: string
  name: string
  subtitle: string
  icon: string
  isFavorite?: boolean
  loyaltyLabel?: string
  loyaltyCardImage?: string
  loyaltyCardScope?: LoyaltyCardScope
  createdAt: number
}

export interface Item {
  id: string
  name: string
  defaultQuantity: number
  createdAt: number
  lastUsedAt: number
}

export interface ListItem {
  itemId: string
  storeId: string
  quantity: number
  addedAt: number
  weightedPosition: number
}

export interface Trip {
  id: string
  storeId: string
  completedAt: number
  sequence: string[]
}

export interface AppState {
  stores: GroceryStore[]
  selectedStoreId: string
  items: Item[]
  list: ListItem[]
  trips: Trip[]
  isShopping: boolean
  currentSequence: string[]
}

export type SyncableState = Omit<AppState, 'selectedStoreId' | 'isShopping' | 'currentSequence' | 'list'>

export interface AuthUser {
  id: string
  email: string
}

export interface Household {
  id: string
  code: string
  version: number
  createdAt: number
  updatedAt: number
}

export interface HouseholdMember {
  id: string
  householdId: string
  email: string
  createdAt: number
}

export interface HouseholdWithState {
  household: Household
  state: SyncableState
  members: HouseholdMember[]
}

export interface Session {
  token: string
  userId: string
  expiresAt: number
  createdAt: number
}

export interface VerificationToken {
  token: string
  email: string
  expiresAt: number
  createdAt: number
  consumedAt: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

export function isStore(value: unknown): value is GroceryStore {
  if (!isRecord(value)) return false

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.subtitle === 'string' &&
    typeof value.icon === 'string' &&
    (typeof value.isFavorite === 'undefined' || typeof value.isFavorite === 'boolean') &&
    (typeof value.loyaltyLabel === 'undefined' || typeof value.loyaltyLabel === 'string') &&
    (typeof value.loyaltyCardImage === 'undefined' || typeof value.loyaltyCardImage === 'string') &&
    (typeof value.loyaltyCardScope === 'undefined' ||
      value.loyaltyCardScope === 'local' ||
      value.loyaltyCardScope === 'global') &&
    isFiniteNumber(value.createdAt)
  )
}

export function isItem(value: unknown): value is Item {
  if (!isRecord(value)) return false

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.defaultQuantity) &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.lastUsedAt)
  )
}

export function isListItem(value: unknown): value is ListItem {
  if (!isRecord(value)) return false

  return (
    typeof value.itemId === 'string' &&
    typeof value.storeId === 'string' &&
    isFiniteNumber(value.quantity) &&
    isFiniteNumber(value.addedAt) &&
    isFiniteNumber(value.weightedPosition)
  )
}

export function isTrip(value: unknown): value is Trip {
  if (!isRecord(value)) return false

  return (
    typeof value.id === 'string' &&
    typeof value.storeId === 'string' &&
    isFiniteNumber(value.completedAt) &&
    isStringArray(value.sequence)
  )
}

export function isSyncableState(value: unknown): value is SyncableState {
  if (!isRecord(value)) return false

  return (
    Array.isArray(value.stores) &&
    value.stores.every(isStore) &&
    Array.isArray(value.items) &&
    value.items.every(isItem) &&
    Array.isArray(value.trips) &&
    value.trips.every(isTrip)
  )
}

export function sanitizeSyncableState(value: unknown): SyncableState | null {
  if (!isRecord(value)) return null

  const candidate = {
    stores: value.stores,
    items: value.items,
    trips: value.trips,
  }

  return isSyncableState(candidate) ? candidate : null
}

export function stripLocalOnlyFields(state: AppState): SyncableState {
  return {
    stores: state.stores,
    items: state.items,
    trips: state.trips,
  }
}
