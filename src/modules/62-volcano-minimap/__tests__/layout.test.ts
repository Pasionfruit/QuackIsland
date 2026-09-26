import { describe, expect, it } from 'vitest'
import { minimapDots, playerColour, routePercent, spiralPoint, spiralRoute } from '../internal/layout'

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

  it('projects the whole board route into a padded spiral map', () => {
    const route = spiralRoute(120)
    expect(route).toHaveLength(120)
    expect(route.every((point) => point.x >= 7 && point.x <= 93 && point.y >= 7 && point.y <= 93)).toBe(true)
    expect(spiralPoint(-9, 120)).toEqual(route[0])
    expect(spiralPoint(999, 120)).toEqual(route[119])
  })

  it('separates players sharing a tile without moving them along the route', () => {
    const dots = minimapDots([{ id: 'a', position: 8 }, { id: 'b', position: 8 }], 120)
    expect(dots.map((dot) => dot.percent)).toEqual([routePercent(8, 120), routePercent(8, 120)])
    expect(dots.map((dot) => dot.lane)).toEqual([-0.5, 0.5])
  })

  it('keeps each player\'s selected avatar colour on their dot', () => {
    const [dot] = minimapDots([{ id: 'a', position: 8, colour: '#1d9bf0' }], 120)
    expect(dot.colour).toBe('#1d9bf0')
  })
})
