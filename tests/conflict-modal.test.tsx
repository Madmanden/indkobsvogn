import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConflictModal } from '../src/components/ConflictModal'

describe('ConflictModal', () => {
  it('requires an explicit conflict resolution choice', () => {
    const html = renderToStaticMarkup(
      <ConflictModal
        conflict={{
          localState: {
            stores: [],
            selectedStoreId: '',
            items: [{ id: 'item-a', name: 'Mælk', defaultQuantity: 1, createdAt: 0, lastUsedAt: 0 }],
            list: [],
            trips: [],
            isShopping: false,
            currentSequence: [],
          },
          serverState: {
            stores: [],
            items: [],
            list: [],
            trips: [],
          },
          serverVersion: 7,
        }}
        onKeepMine={() => undefined}
        onUseServer={() => undefined}
      />,
    )

    expect(html).toContain('Vælg en version for at fortsætte synkroniseringen.')
    expect(html).toContain('Behold mine ændringer')
    expect(html).toContain('Brug serverens version')
    expect(html).not.toContain('Luk')
  })
})
