/**
 * The lake: the bites, how the rod bends, and what a set of pulls lands.
 */
import { describe, expect, it } from 'vitest'
import { BITE, FISH, LENGTH, ODDS, RECAST, bendAt, bitesFor, fishFor, hooked, playBack, type Bite } from '../internal/pond'

const SEED = 2468

describe('the bites', () => {
  it('are the same for the same seed and player, and different for another player', () => {
    expect(bitesFor(SEED, 0)).toEqual(bitesFor(SEED, 0))
    expect(JSON.stringify(bitesFor(SEED, 1))).not.toBe(JSON.stringify(bitesFor(SEED, 0)))
  })

  it('come one at a time through the round, each a fish of one of the four sizes and its weight', () => {
    for (let player = 0; player < 8; player++) {
      const bites = bitesFor(SEED, player)
      expect(bites.length).toBeGreaterThan(3)
      bites.forEach((b, i) => {
        expect(b.k).toBe(i)
        expect(b.end).toBeGreaterThan(b.start)
        expect(b.end).toBeLessThanOrEqual(LENGTH)
        if (i > 0) expect(b.start).toBeGreaterThan(bites[i - 1].end + BITE.release)
        const w = FISH[b.size].weight
        expect(b.weight).toBeGreaterThanOrEqual(w[0])
        expect(b.weight).toBeLessThanOrEqual(w[1])
      })
    }
  })

  it('are mostly small fish, sometimes big, and do not promise the biggest', () => {
    const counts = [0, 0, 0, 0]
    let without = 0
    for (let seed = 1; seed <= 60; seed++) {
      const bites = bitesFor(seed, 0)
      bites.forEach((b) => counts[b.size]++)
      if (!bites.some((b) => b.size === 3)) without++
    }
    expect(counts[0]).toBeGreaterThan(counts[1])
    expect(counts[1]).toBeGreaterThan(counts[2])
    expect(counts[2]).toBeGreaterThan(counts[3])
    expect(counts[3]).toBeGreaterThan(0)
    expect(without).toBeGreaterThan(10)
    expect(ODDS.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
    expect(fishFor(0)).toBe(0)
    expect(fishFor(0.999)).toBe(3)
  })

  it('weigh more the bigger the fish, and bend the rod further', () => {
    for (let s = 1; s < FISH.length; s++) {
      expect(FISH[s].weight[0]).toBeGreaterThan(FISH[s - 1].weight[1])
      expect(FISH[s].bend).toBeGreaterThan(FISH[s - 1].bend)
    }
  })
})

describe('the rod', () => {
  const bites = bitesFor(SEED, 0)
  const b = bites[0]

  it('is straight with nothing on, bends over as a fish takes it - as far as that fish bends it - and straightens as it lets go', () => {
    expect(bendAt(bites, [], b.start - 0.01)).toMatchObject({ bend: 0, bite: -1 })
    const early = bendAt(bites, [], b.start + BITE.ramp * 0.3).bend
    const full = bendAt(bites, [], b.start + BITE.ramp + 0.2)
    expect(early).toBeGreaterThan(0)
    expect(early).toBeLessThan(full.bend)
    expect(full.bite).toBe(0)
    expect(full.bend).toBeGreaterThan(FISH[b.size].bend * 0.85)
    expect(full.bend).toBeLessThan(FISH[b.size].bend * 1.15)
    expect(bendAt(bites, [], b.end + BITE.release * 0.5).bend).toBeLessThan(full.bend)
    expect(bendAt(bites, [], b.end + BITE.release + 0.01).bend).toBe(0)
  })

  it('tells the fish apart: at full bend every bigger fish bends it further than any smaller one can tug it', () => {
    for (let s = 1; s < FISH.length; s++) expect(FISH[s].bend * 0.89).toBeGreaterThan(FISH[s - 1].bend * 1.11)
  })

  it('is straight while the line is being cast, and for a fish already landed', () => {
    const at = b.start + 0.5
    expect(bendAt(bites, [at], at + 0.1)).toMatchObject({ bend: 0, casting: true })
    // After the cast, that fish is in the bucket: whatever bends the rod now is another one, or nothing.
    const after = bendAt(bites, [at], at + RECAST + 0.01)
    expect(after.bite).not.toBe(0)
  })
})

describe('a pull', () => {
  const bites = bitesFor(SEED, 0)
  const [a, b] = bites

  it('lands the fish on the hook, nothing on a straight rod, and nothing too soon after a bite', () => {
    expect(playBack(bites, [a.start + 0.5]).landed).toEqual([a])
    expect(playBack(bites, [a.start - 0.3]).landed).toEqual([null])
    expect(playBack(bites, [a.start + BITE.hook / 2]).landed).toEqual([null])
    expect(playBack(bites, [a.end + 0.01]).landed).toEqual([null])
    expect(hooked(a, a.start + BITE.hook)).toBe(true)
  })

  it('does not count at all while the line is being cast, and cannot land the same fish twice', () => {
    const p = [a.start + 0.2, a.start + 0.2 + RECAST / 2, a.start + 0.2 + RECAST + 0.01]
    const played = playBack(bites, p)
    expect(played.pulls).toEqual([p[0], p[2]])
    expect(played.landed[0]).toBe(a)
    expect(played.landed[1]).not.toBe(a)
  })

  it('lands two fish with two pulls, a cast apart', () => {
    const played = playBack(bites, [a.start + 0.3, Math.max(a.start + 0.3 + RECAST, b.start + 0.3)])
    expect(played.landed).toEqual([a, b] as Bite[])
  })
})
