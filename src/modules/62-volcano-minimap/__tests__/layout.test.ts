import { describe, expect, it } from 'vitest'
import { minimapDots, playerColour, routePercent } from '../internal/layout'

describe('Volcano minimap layout', () => {
  it('maps the start, summit, and out-of-range positions onto the route', () => {
    expect(routePercent(0, 120)).toBe(0)
    expect(routePercent(119, 120)).toBe(100)
    expect(routePercent(-4, 120)).toBe(0)
    expect(routePercent(999, 120)).toBe(100)
  })

  it('gives each player id a repeatable colour', () => {
    expect(playerColour('guest-a')).toBe(playerColour('guest-a'))
    expect(playerColour('guest-a')).not.toBe('')
  })

  it('separates players sharing a tile without moving them along the route', () => {
    const dots = minimapDots([{ id: 'a', position: 8 }, { id: 'b', position: 8 }], 120)
    expect(dots.map((dot) => dot.percent)).toEqual([routePercent(8, 120), routePercent(8, 120)])
    expect(dots.map((dot) => dot.lane)).toEqual([-0.5, 0.5])
  })
})
