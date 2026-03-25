import type { AppState, GroceryStore } from './models'

export function createDefaultStores(): GroceryStore[] {
  return []
}

export function createInitialState(): AppState {
  return {
    stores: [],
    selectedStoreId: '',
    items: [],
    list: [],
    trips: [],
    isShopping: false,
    currentSequence: [],
  }
}
