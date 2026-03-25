import { describe, expect, it } from 'vitest'
import { scaleDimensions } from '../src/utils/images'

describe('image helpers', () => {
  it('keeps small images at their original size', () => {
    expect(scaleDimensions(1200, 800)).toEqual({ width: 1200, height: 800 })
  })

  it('scales large landscape images down proportionally', () => {
    expect(scaleDimensions(3200, 1800)).toEqual({ width: 1600, height: 900 })
  })

  it('scales large portrait images down proportionally', () => {
    expect(scaleDimensions(1200, 3000)).toEqual({ width: 640, height: 1600 })
  })
})
