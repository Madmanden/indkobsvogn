export interface StoreRef {
  id: string
}

export function resolveSelectedStoreId(stores: StoreRef[], preferredStoreId: string): string {
  return stores.some((store) => store.id === preferredStoreId) ? preferredStoreId : stores[0]?.id ?? ''
}
