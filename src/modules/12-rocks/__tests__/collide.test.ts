/**
 * The rock collision maths.
 *
 * Three failure modes worth naming, because every test here is aimed at one of
 * them: standing *inside* a rock, standing in the air *above* one, and being
 * unable to get back *off* one.
 */
import { describe, expect, it } from 'vitest'
import { Euler, Matrix4 } from 'three'
import {
  COLLISION,
  girthOf,
  halfExtents,
  resolveRocks,
  rotationXYZ,
  solidify,
  standHeightAt,
  topOf,
} from '../internal/collide'
import { getRocks, getSolidRocks } from '../internal/field'
import type { Rock } from '../internal/rocks'

function rock(over: Partial<Rock> = {}): Rock {
  return {
    size: 'medium',
    x: 0,
    z: 0,
    y: 0,
    radius: 1,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    turnX: 0,
    turnY: 0,
    turnZ: 0,
    tint: 0,
    ...over,
  }
}

describe('rotationXYZ', () => {
  it('is the same rotation three.js draws the rock with', () => {
    // The one test that has to exist. A collision shape at a different angle
    // from the thing you can see is the worst kind of wrong, and the only way
    // to know is to ask the library that actually draws it.
    for (const [x, y, z] of [
      [0, 0, 0],
      [0.3, 1.1, -2.4],
      [Math.PI / 2, Math.PI / 3, Math.PI / 5],
      [-1.9, 4.7, 0.8],
    ]) {
      const theirs = new Matrix4().makeRotationFromEuler(new Euler(x, y, z, 'XYZ'))
      const mine = rotationXYZ(x, y, z)
      // three stores column-major, so element(row, column) is the honest read.
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          expect(mine[row * 3 + col]).toBeCloseTo(theirs.elements[col * 4 + row], 12)
        }
      }
    }
  })
})

describe('halfExtents', () => {
  it('is the scale itself when the rock has not been turned', () => {
    const half = halfExtents(rock({ scaleX: 2, scaleY: 3, scaleZ: 4 }))
    expect(half.x).toBeCloseTo(2, 12)
    expect(half.y).toBeCloseTo(3, 12)
    expect(half.z).toBeCloseTo(4, 12)
  })

  it('swaps the axes when the rock is turned a quarter turn', () => {
    // Rolled onto its side: what was tall is now wide.
    const half = halfExtents(rock({ scaleX: 1, scaleY: 3, scaleZ: 1, turnX: Math.PI / 2 }))
    expect(half.y).toBeCloseTo(1, 12)
    expect(half.z).toBeCloseTo(3, 12)
  })

  it('keeps the rock the same size however it is tumbled', () => {
    // Turning a rock cannot change how big it is, and there is an exact
    // statement of that: each half-extent is a weighted mean of the squared
    // scales - so it always lands between the smallest and largest - and the
    // three of them together preserve `hypot(a, b, c)` exactly, because the
    // columns of a rotation are unit vectors.
    //
    // Worth stating precisely rather than approximately, because getting this
    // wrong sinks every rock on the island into the ground by the error.
    for (let i = 0; i < 200; i++) {
      const r = rock({
        scaleX: 0.4 + i * 0.01,
        scaleY: 1 + (i % 7) * 0.3,
        scaleZ: 0.6 + (i % 5) * 0.2,
        turnX: i * 0.31,
        turnY: i * 0.77,
        turnZ: i * 1.13,
      })
      const half = halfExtents(r)
      const smallest = Math.min(r.scaleX, r.scaleY, r.scaleZ)
      const largest = Math.max(r.scaleX, r.scaleY, r.scaleZ)
      for (const extent of [half.x, half.y, half.z]) {
        expect(extent).toBeGreaterThanOrEqual(smallest - 1e-9)
        expect(extent).toBeLessThanOrEqual(largest + 1e-9)
      }
      expect(Math.hypot(half.x, half.y, half.z)).toBeCloseTo(
        Math.hypot(r.scaleX, r.scaleY, r.scaleZ),
        12,
      )
    }
  })
})

describe('placement', () => {
  it('a rock that rests at y sits with its bottom at y, not floating', () => {
    // The bug this was written for: the view placed rocks at `y + scaleY`,
    // which is only the half-height of a rock that has not been turned.
    const r = rock({ y: 5, scaleY: 1, turnX: Math.PI / 2, scaleZ: 3 })
    const centre = r.y + halfExtents(r).y
    expect(centre - halfExtents(r).y).toBeCloseTo(5, 12)
    // With the old maths the bottom would have been two metres underground.
    expect(r.y + r.scaleY - halfExtents(r).y).toBeCloseTo(3, 12)
  })

  it('topOf is a whole rock above its base', () => {
    const r = rock({ y: 2, scaleY: 1.5, turnZ: 0.9 })
    expect(topOf(r) - r.y).toBeCloseTo(halfExtents(r).y * 2, 12)
  })
})

describe('girthOf', () => {
  it('is between the narrow and wide sides of the rock', () => {
    // A circle for an ellipse: the mean, not the larger, or a rock would have
    // an invisible wall round its narrow side.
    const r = rock({ scaleX: 1, scaleZ: 3 })
    expect(girthOf(r)).toBeCloseTo(2, 12)
  })
})

describe('standHeightAt', () => {
  const solid = solidify([rock({ x: 10, z: 0, y: 0, scaleX: 2, scaleY: 1, scaleZ: 2 })])

  it('is the ground when you are nowhere near a rock', () => {
    expect(standHeightAt(0, 0, solid, 3)).toBe(3)
  })

  it('is the top of the rock when you are over one', () => {
    expect(standHeightAt(10, 0, solid, 0)).toBeCloseTo(2, 12)
  })

  it('is the ground again one step to the side', () => {
    expect(standHeightAt(10 + 2.5, 0, solid, 0)).toBe(0)
  })

  it('never lowers the ground', () => {
    // A rock in a hollow is buried, not a hole in the island.
    expect(standHeightAt(10, 0, solid, 40)).toBe(40)
  })
})

describe('resolveRocks', () => {
  const boulder = solidify([rock({ x: 0, z: 0, y: 0, scaleX: 2, scaleY: 2, scaleZ: 2 })])
  const pebble = solidify([rock({ x: 0, z: 0, y: 0, scaleX: 2, scaleY: 0.2, scaleZ: 2 })])

  it('pushes you out of a boulder you walked into', () => {
    const out = resolveRocks(1, 0, 0, 0.4, boulder)
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(2.4, 12)
  })

  it('leaves you alone when you are clear of it', () => {
    const out = resolveRocks(6, 0, 0, 0.4, boulder)
    expect(out).toEqual({ x: 6, z: 0 })
  })

  it('slides you round rather than stopping you dead', () => {
    // Walking in at an angle should come out at the same angle, further away -
    // which is what makes a boulder something you brush past.
    const out = resolveRocks(1, 1, 0, 0.4, boulder)
    expect(Math.atan2(out.z, out.x)).toBeCloseTo(Math.PI / 4, 12)
  })

  it('lets you step over anything shorter than a kerb', () => {
    expect(topOf(rock({ scaleY: 0.2 }))).toBeLessThan(COLLISION.stepUp)
    expect(resolveRocks(0.1, 0, 0, 0.4, pebble)).toEqual({ x: 0.1, z: 0 })
  })

  it('lets you walk across the top of a boulder you have landed on', () => {
    // Standing on it, the feet are at its top. If this pushed you off, a rock
    // would be impossible to stand on: you would be shoved sideways the
    // instant you landed.
    const top = boulder[0].top
    expect(resolveRocks(0, 0, top, 0.4, boulder)).toEqual({ x: 0, z: 0 })
    expect(resolveRocks(1.2, 0, top, 0.4, boulder)).toEqual({ x: 1.2, z: 0 })
  })

  it('lets you jump over one', () => {
    const above = boulder[0].top + 3
    expect(resolveRocks(0, 0, above, 0.4, boulder)).toEqual({ x: 0, z: 0 })
  })

  it('is solid again the moment you drop below its top', () => {
    const below = boulder[0].top - COLLISION.stepUp - 0.01
    const out = resolveRocks(1, 0, below, 0.4, boulder)
    expect(out.x).toBeGreaterThan(2)
  })

  it('never returns NaN, even dead in the middle of a rock', () => {
    const out = resolveRocks(0, 0, 0, 0.4, boulder)
    expect(Number.isFinite(out.x)).toBe(true)
    expect(Number.isFinite(out.z)).toBe(true)
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(2.4, 12)
  })

  it('gets somebody wedged between two rocks out of both', () => {
    const pair = solidify([
      rock({ x: -1.6, z: 0, scaleX: 2, scaleY: 2, scaleZ: 2 }),
      rock({ x: 1.6, z: 0, scaleX: 2, scaleY: 2, scaleZ: 2 }),
    ])
    const out = resolveRocks(0, 0.05, 0, 0.4, pair)
    for (const r of pair) {
      expect(Math.hypot(out.x - r.x, out.z - r.z)).toBeGreaterThanOrEqual(r.girth + 0.4 - 1e-9)
    }
  })
})

describe('the island as it actually is', () => {
  const rocks = getRocks()
  const solid = getSolidRocks()

  it('has one answer about where the rocks are', () => {
    expect(getRocks()).toBe(rocks)
    expect(getSolidRocks()).toBe(solid)
    expect(solid).toHaveLength(rocks.length)
  })

  it('leaves the spawn clear, so you never wake up inside a boulder', () => {
    expect(resolveRocks(0, 0, 0, 0.4, solid)).toEqual({ x: 0, z: 0 })
  })

  it('has some rocks you step over and some you cannot', () => {
    const kerbs = solid.filter((r) => r.top - r.base <= COLLISION.stepUp)
    const walls = solid.filter((r) => r.top - r.base > COLLISION.stepUp)
    expect(kerbs.length).toBeGreaterThan(0)
    expect(walls.length).toBeGreaterThan(0)
  })

  it('never pushes anybody outside the world', () => {
    for (const r of solid) {
      const out = resolveRocks(r.x, r.z, r.base, 0.4, solid)
      expect(Number.isFinite(out.x)).toBe(true)
      expect(Number.isFinite(out.z)).toBe(true)
    }
  })
})
