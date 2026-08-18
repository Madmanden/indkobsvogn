import type { AppState, ListItem } from '../domain/models'

export interface PlanningRow {
  id: string
  name: string
  qty: number
  hasLearnedPosition: boolean
  manualPosition: number
}

export function compareListItems(
  a: Pick<ListItem, 'manualPosition' | 'weightedPosition' | 'addedAt'>,
  b: Pick<ListItem, 'manualPosition' | 'weightedPosition' | 'addedAt'>,
): number {
  const aManual = a.manualPosition >= 0 ? a.manualPosition : Number.POSITIVE_INFINITY
  const bManual = b.manualPosition >= 0 ? b.manualPosition : Number.POSITIVE_INFINITY
  if (aManual !== bManual) return aManual - bManual

  return a.weightedPosition - b.weightedPosition || a.addedAt - b.addedAt
}

export function getPlanningRows(state: AppState): PlanningRow[] {
  const itemById = new Map(state.items.map((item) => [item.id, item]))

  return [...state.list]
    .filter((listItem) => listItem.storeId === state.selectedStoreId)
    .sort(compareListItems)
    .map((listItem) => {
      const item = itemById.get(listItem.itemId)
      if (!item) return null

      return {
        id: item.id,
        name: item.name,
        qty: listItem.quantity,
        hasLearnedPosition: listItem.weightedPosition < 1,
        manualPosition: listItem.manualPosition,
      }
    })
    .filter((entry): entry is PlanningRow => entry !== null)
}
