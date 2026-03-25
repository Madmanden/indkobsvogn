import { recalculateWeightedPositions } from './learning'
import type { AppState, ListItem, Trip } from './models'
import { appendTripCapped } from './trips'
import { createId } from '../utils/id'

function getListKey(listItem: Pick<ListItem, 'itemId' | 'storeId'>): string {
  return `${listItem.storeId}::${listItem.itemId}`
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
    list: completed.list.filter((listItem) => listItem.storeId !== state.selectedStoreId),
  }
}
