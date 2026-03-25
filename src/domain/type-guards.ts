/**
 * Shared runtime type guards for domain models.
 *
 * These guards validate data read from storage or external sources,
 * ensuring type safety at runtime.
 */
import type { AppState, GroceryStore, Item, ListItem, Trip } from './models'

// === Primitive Guards ===

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

// === Domain Model Guards ===

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

export function isAppState(value: unknown): value is AppState {
  if (!isRecord(value)) return false

  return (
    Array.isArray(value.stores) &&
    value.stores.every(isStore) &&
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

// === Legacy Types (for migrations) ===

export interface LegacyListItemV3 {
  itemId: string
  quantity: number
  addedAt: number
  weightedPosition: number
}

export interface LegacyTripV3 {
  id: string
  completedAt: number
  sequence: string[]
}

export interface LegacyAppStateV3 {
  stores: GroceryStore[]
  selectedStoreId: string
  items: Item[]
  list: LegacyListItemV3[]
  trips: LegacyTripV3[]
  isShopping: boolean
  currentSequence: string[]
}

export function isLegacyListItemV3(value: unknown): value is LegacyListItemV3 {
  if (!isRecord(value)) return false

  return (
    typeof value.itemId === 'string' &&
    isFiniteNumber(value.quantity) &&
    isFiniteNumber(value.addedAt) &&
    isFiniteNumber(value.weightedPosition)
  )
}

export function isLegacyTripV3(value: unknown): value is LegacyTripV3 {
  if (!isRecord(value)) return false

  return (
    typeof value.id === 'string' &&
    isFiniteNumber(value.completedAt) &&
    isStringArray(value.sequence)
  )
}

export function isLegacyAppStateV3(value: unknown): value is LegacyAppStateV3 {
  if (!isRecord(value)) return false

  return (
    Array.isArray(value.stores) &&
    value.stores.every(isStore) &&
    typeof value.selectedStoreId === 'string' &&
    Array.isArray(value.items) &&
    value.items.every(isItem) &&
    Array.isArray(value.list) &&
    value.list.every(isLegacyListItemV3) &&
    Array.isArray(value.trips) &&
    value.trips.every(isLegacyTripV3) &&
    typeof value.isShopping === 'boolean' &&
    isStringArray(value.currentSequence)
  )
}
