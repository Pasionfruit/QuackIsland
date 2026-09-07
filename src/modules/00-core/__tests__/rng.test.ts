import { describe, expect, it } from 'vitest'
import { createRng, hashSeed } from '../internal/rng'
import { CONVENTIONS, PRIORITY } from '../internal/conventions'

describe('seeded randomness', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(1337)
    const b = createRng(1337)
    const left = Array.from({ length: 200 }, () => a())
    const right = Array.from({ length: 200 }, () => b())
    expect(left).toEqual(right)
  })

  it('gives different streams for different seeds', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(Array.from({ length: 20 }, () => a())).not.toEqual(Array.from({ length: 20 }, () => b()))
  })

  it('stays inside [0, 1)', () => {
    const r = createRng(99)
    for (let i = 0; i < 5000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('derives stable sub-seeds per label', () => {
    expect(hashSeed(1337, 'terrain')).toBe(hashSeed(1337, 'terrain'))
    expect(hashSeed(1337, 'terrain')).not.toBe(hashSeed(1337, 'trees'))
    expect(Number.isInteger(hashSeed(1337, 'terrain'))).toBe(true)
  })
})

describe('conventions', () => {
  // Sea level being exactly zero is relied on by every module that places
  // anything against the ground; it is not a tunable.
  it('puts sea level at exactly zero', () => {
    expect(CONVENTIONS.seaLevelY).toBe(0)
  })

  it('orders frame bands so world work precedes camera and rendering', () => {
    expect(PRIORITY.simulation).toBeLessThan(PRIORITY.world)
    expect(PRIORITY.world).toBeLessThan(PRIORITY.camera)
    expect(PRIORITY.camera).toBeLessThan(PRIORITY.post)
  })
})
