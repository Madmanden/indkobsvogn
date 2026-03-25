import type { AppState } from '../domain/models'

export interface PlanningRow {
  id: string
  name: string
  qty: number
}

export function getPlanningRows(state: AppState): PlanningRow[] {
  const itemById = new Map(state.items.map((item) => [item.id, item]))

  return [...state.list]
    .filter((listItem) => listItem.storeId === state.selectedStoreId)
    .sort((a, b) => a.weightedPosition - b.weightedPosition || a.addedAt - b.addedAt)
    .map((listItem) => {
      const item = itemById.get(listItem.itemId)
      if (!item) return null

      return {
        id: item.id,
        name: item.name,
        qty: listItem.quantity,
      }
    })
    .filter((entry): entry is PlanningRow => entry !== null)
}
