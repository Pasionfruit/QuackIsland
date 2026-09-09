/**
 * Which ground takes a footprint.
 *
 * Sand does and stone does not. The footprints module asks this through a
 * callback and has never heard of a rock, so the whole question lives here.
 */
import { describe, expect, it } from 'vitest'
import { onRockAt, solidify } from '../internal/collide'
import { getSolidRocks } from '../internal/field'
import type { Rock } from '../internal/rocks'

function rock(over: Partial<Rock> = {}): Rock {
  return {
    size: 'medium',
    x: 0,
    z: 0,
    y: 0,
    radius: 1,
    scaleX: 2,
    scaleY: 2,
    scaleZ: 2,
    turnX: 0,
    turnY: 0,
    turnZ: 0,
    tint: 0,
    ...over,
  }
}

describe('onRockAt', () => {
  const one = solidify([rock({ x: 10, z: 4, y: 0 })])

  it('is false on open ground', () => {
    expect(onRockAt(0, 0, one, 0)).toBe(false)
    expect(onRockAt(40, -40, one, 3)).toBe(false)
  })

  it('is true standing over a rock', () => {
    expect(onRockAt(10, 4, one, 0)).toBe(true)
  })

  it('is false just outside its edge', () => {
    // Girth is 2, so a step and a half away is off it.
    expect(onRockAt(13, 4, one, 0)).toBe(false)
  })

  it('is false over a rock that is buried', () => {
    // The ground has risen over the top of it. You are standing on the island,
    // and the island takes a print.
    expect(onRockAt(10, 4, one, 40)).toBe(false)
  })

  it('agrees with itself right at the rim', () => {
    // Exactly on the boundary the rock still counts, and a hair outside it
    // does not. Worth pinning because a footprint appearing and disappearing
    // as you shuffle on the spot is exactly the sort of flicker nobody can
    // reproduce on purpose.
    expect(onRockAt(12, 4, one, 0)).toBe(true)
    expect(onRockAt(12.0001, 4, one, 0)).toBe(false)
  })

  it('never answers true anywhere on the real island at sea level', () => {
    // Not a claim about rocks - a claim that the spawn is clear. Walking out
    // of the sea onto the beach at the origin should leave prints.
    expect(onRockAt(0, 0, getSolidRocks(), 0)).toBe(false)
  })

  it('finds rocks to stand on somewhere on the real island', () => {
    // If this ever found none, the footprint veto would be dead code that
    // still passed every other test in this file.
    const rocks = getSolidRocks()
    const standable = rocks.filter((r) => onRockAt(r.x, r.z, rocks, r.base))
    expect(standable.length).toBeGreaterThan(rocks.length * 0.9)
  })
})
