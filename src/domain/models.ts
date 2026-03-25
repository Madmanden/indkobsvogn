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
