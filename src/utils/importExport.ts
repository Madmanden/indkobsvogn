import { isAppState, isLegacyAppStateV3 } from '../domain/type-guards'
import type { AppState, GroceryStore, Item, ListItem, Trip } from '../domain/models'
import { resolveSelectedStoreId } from './selected-store'

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of items) {
    map.set(item.id, item)
  }

  return [...map.values()]
}

function mergeListItems(current: ListItem[], imported: ListItem[], items: Item[], stores: GroceryStore[]): ListItem[] {
  const merged = new Map<string, ListItem>()

  for (const entry of current) {
    merged.set(`${entry.storeId}:${entry.itemId}`, entry)
  }

  for (const entry of imported) {
    merged.set(`${entry.storeId}:${entry.itemId}`, entry)
  }

  return sanitizeList([...merged.values()], items, stores)
}

function sanitizeList(list: ListItem[], items: Item[], stores: GroceryStore[]): ListItem[] {
  const itemIds = new Set(items.map((item) => item.id))
  const storeIds = new Set(stores.map((store) => store.id))

  return list
    .filter((entry) => itemIds.has(entry.itemId) && storeIds.has(entry.storeId) && entry.quantity > 0)
    .map((entry) => ({
      ...entry,
      quantity: Math.max(1, Math.round(entry.quantity)),
    }))
}

function sanitizeTrips(trips: Trip[], items: Item[], stores: GroceryStore[]): Trip[] {
  const itemIds = new Set(items.map((item) => item.id))
  const storeIds = new Set(stores.map((store) => store.id))

  return trips
    .filter((trip) => storeIds.has(trip.storeId))
    .map((trip) => ({
      ...trip,
      sequence: trip.sequence.filter((itemId) => itemIds.has(itemId)),
    }))
}

export function mergeImportedState(current: AppState, imported: AppState): AppState {
  const stores = uniqueById([...current.stores, ...imported.stores])
  const items = uniqueById([...current.items, ...imported.items])
  const list = mergeListItems(current.list, imported.list, items, stores)
  const trips = uniqueById([...current.trips, ...imported.trips])

  return {
    stores,
    selectedStoreId: resolveSelectedStoreId(stores, imported.selectedStoreId),
    items,
    list,
    trips: sanitizeTrips(trips, items, stores),
    isShopping: false,
    currentSequence: [],
  }
}

export function formatStateExport(state: AppState): string {
  return JSON.stringify(state, null, 2)
}

export function parseStateImport(raw: string): AppState | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (isAppState(parsed)) return parsed
    if (!isLegacyAppStateV3(parsed)) return null

    const fallbackStoreId = resolveSelectedStoreId(parsed.stores, parsed.selectedStoreId)

    return {
      ...parsed,
      list: parsed.list.map((listItem) => ({
        ...listItem,
        storeId: fallbackStoreId,
      })),
      trips: parsed.trips.map((trip) => ({
        ...trip,
        storeId: fallbackStoreId,
      })),
    }
  } catch {
    return null
  }
}
