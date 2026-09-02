import { recalculateWeightedPositions } from './learning'
import type { AppState, ListItem, Trip } from './models'
import { appendTripCapped } from './trips'
import { createId } from '../utils/id'

function getListKey(listItem: Pick<ListItem, 'itemId' | 'storeId'>): string {
  return `${listItem.storeId}::${listItem.itemId}`
}

function clearManualPosition(listItem: ListItem): ListItem {
  return listItem.manualPosition === -1 ? listItem : { ...listItem, manualPosition: -1 }
}

function getSelectedStoreManualItemIds(state: AppState): string[] {
  return state.list
    .filter((li) => li.storeId === state.selectedStoreId && li.manualPosition >= 0)
    .sort((a, b) => a.manualPosition - b.manualPosition)
    .map((li) => li.itemId)
}

export function switchSortMode(
  state: AppState,
  mode: 'learned' | 'manual',
): AppState {
  if (mode === state.sortMode) return state

  if (mode === 'manual') {
    const storeList = state.list.filter((li) => li.storeId === state.selectedStoreId)
      .sort((a, b) => a.weightedPosition - b.weightedPosition || a.addedAt - b.addedAt)

    const manualList = new Map<string, ListItem>()
    storeList.forEach((li, i) => {
      manualList.set(getListKey(li), { ...li, manualPosition: i })
    })

    return {
      ...state,
      sortMode: 'manual',
      list: state.list.map((li) => manualList.get(getListKey(li)) ?? li),
    }
  }

  return {
    ...state,
    sortMode: 'learned',
    list: state.list.map((li) => clearManualPosition(li)),
  }
}

export function persistWeightedPositions(state: AppState, now = Date.now()): AppState {
  const weightedByKey = new Map<string, ListItem>()
  const storeIds = new Set(state.list.map((listItem) => listItem.storeId))

  for (const storeId of storeIds) {
    const storeList = state.list.filter((listItem) => listItem.storeId === storeId)
    const storeTrips = state.trips.filter((trip) => trip.storeId === storeId)

    for (const weightedItem of recalculateWeightedPositions(storeList, storeTrips, now)) {
      weightedByKey.set(getListKey(weightedItem), weightedItem)
    }
  }

  return {
    ...state,
    list: state.list.map((listItem) => weightedByKey.get(getListKey(listItem)) ?? listItem),
  }
}

export function reorderList(state: AppState, orderedItemIds: string[]): AppState {
  const positionByItemId = new Map(orderedItemIds.map((itemId, index) => [itemId, index]))

  return {
    ...state,
    sortMode: 'manual',
    list: state.list.map((listItem) => {
      if (listItem.storeId !== state.selectedStoreId) return listItem

      const pos = positionByItemId.get(listItem.itemId)
      return { ...listItem, manualPosition: pos ?? -1 }
    }),
  }
}

export function startTrip(state: AppState): AppState {
  const hasManualOrder = getSelectedStoreManualItemIds(state).length > 0
  const prepared: AppState = hasManualOrder
    ? {
        ...state,
        sortMode: 'manual',
      }
    : {
        ...state,
        sortMode: 'learned',
        list: state.list.map((li) => clearManualPosition(li)),
      }

  return {
    ...prepared,
    isShopping: true,
    currentSequence: [],
  }
}

export function cancelTrip(state: AppState): AppState {
  return {
    ...state,
    isShopping: false,
    currentSequence: [],
  }
}

export function completeTrip(state: AppState, now = Date.now()): AppState {
  const trips =
    state.currentSequence.length > 0
      ? appendTripCapped(state.trips, {
          id: createId('trip'),
          storeId: state.selectedStoreId,
          completedAt: now,
          sequence: [...state.currentSequence],
        } satisfies Trip)
      : state.trips

  const completed = persistWeightedPositions(
    {
      ...state,
      isShopping: false,
      currentSequence: [],
      trips,
    },
    now,
  )

  return {
    ...completed,
    sortMode: 'learned',
    list: completed.list.map((li) => ({ ...li, manualPosition: -1 }))
      .filter((listItem) => listItem.storeId !== state.selectedStoreId),
  }
}