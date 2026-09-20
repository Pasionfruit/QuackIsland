/**
 * The circle's pace: it dawdles and darts rather than wandering at one speed - and is still the same circle on every screen.
 */
import { describe, expect, it } from 'vitest'
import { LIGHT, circleAt } from '../internal/rules'

/** How fast the middle of the circle is going, shares of the view a second, `dt` after `since`. */
function speedAt(seed: number, red: number, since: number, dt = 0.02): number {
  const a = circleAt(seed, red, since)
  const b = circleAt(seed, red, since + dt)
  return Math.hypot(b.x - a.x, b.y - a.y) / dt
}

describe('the circle', () => {
  it('goes at very different speeds during a red: the quickest it goes is at least twice the slowest, in nearly every red', () => {
    let varied = 0
    let reds = 0
    for (let seed = 1; seed <= 40; seed++) {
      for (let red = 0; red < 5; red++) {
        let slow = Infinity
        let fast = 0
        // A red lasts three to five seconds, all of it moving after the pointer grace.
        for (let since = LIGHT.pointerGrace + 1; since < 5; since += 0.05) {
          const v = speedAt(seed, red, since)
          slow = Math.min(slow, v)
          fast = Math.max(fast, v)
        }
        reds += 1
        if (fast >= slow * 2) varied += 1
      }
    }
    expect(varied / reds).toBeGreaterThan(0.75)
  })

  it('goes at a different pace in different reds, and does not turn round to do it', () => {
    const paces = new Set<number>()
    for (let seed = 1; seed <= 20; seed++) {
      let last = circleAt(seed, 0, LIGHT.pointerGrace + 1)
      let travelled = 0
      for (let since = LIGHT.pointerGrace + 1.05; since < 5; since += 0.05) {
        const now = circleAt(seed, 0, since)
        travelled += Math.hypot(now.x - last.x, now.y - last.y)
        last = now
      }
      paces.add(Math.round(travelled * 20))
    }
    expect(paces.size).toBeGreaterThan(5)
  })

  it('is still in the middle and still through the grace, and eases out from there rather than jumping', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const since of [0, 0.3, LIGHT.pointerGrace]) {
        const c = circleAt(seed, 2, since)
        expect(c.x).toBe(0.5)
        expect(c.y).toBe(0.5)
      }
      // No jump anywhere along the way: a twentieth of a second never moves it more than a twentieth of a view.
      let last = circleAt(seed, 2, LIGHT.pointerGrace)
      for (let since = LIGHT.pointerGrace + 0.05; since < 5; since += 0.05) {
        const c = circleAt(seed, 2, since)
        expect(Math.hypot(c.x - last.x, c.y - last.y)).toBeLessThan(0.05)
        last = c
      }
    }
  })

  it('stays inside where it may wander, at any speed', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (let since = 0; since < 8; since += 0.1) {
        const c = circleAt(seed, 1, since)
        expect(Math.abs(c.x - 0.5)).toBeLessThanOrEqual(LIGHT.wander.x + 1e-9)
        expect(Math.abs(c.y - 0.5)).toBeLessThanOrEqual(LIGHT.wander.y + 1e-9)
      }
    }
  })

  it('never stops and never turns its clock back: the two surges together stay under one', () => {
    expect(LIGHT.surge.depth[1] + LIGHT.flutter.depth[1]).toBeLessThan(1)
  })

  it('is the same on every screen: the same seed and moment give the same circle, and the size is as it was', () => {
    expect(circleAt(77, 3, 2.4)).toEqual(circleAt(77, 3, 2.4))
    const still = circleAt(77, 3, 0.1)
    expect(still.radius).toBeCloseTo(Math.max(LIGHT.circleMin, LIGHT.circle - 3 * LIGHT.circleShrink), 9)
  })
})
