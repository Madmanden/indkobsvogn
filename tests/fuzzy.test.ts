import { describe, expect, it } from 'vitest'
import { normalizeItemName, similarity } from '../src/utils/fuzzy'

describe('normalizeItemName', () => {
  it('trims, lowers, and collapses repeated spaces', () => {
    expect(normalizeItemName('  Soed   Maelk  ')).toBe('soed maelk')
  })
})

describe('similarity', () => {
  it('treats normalized exact matches as identical', () => {
    expect(similarity('Soed  maelk', ' soed maelk ')).toBe(1)
  })

  it('drops below the duplicate threshold for clearly different items', () => {
    expect(similarity('maelk', 'rugbroed')).toBeLessThan(0.8)
  })

  it('stays above the duplicate threshold for a minor typo', () => {
    expect(similarity('bananer', 'bananerz')).toBeGreaterThanOrEqual(0.8)
  })
})
