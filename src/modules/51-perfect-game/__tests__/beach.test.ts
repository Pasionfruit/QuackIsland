/**
 * The beach: the column, the coconut, and which crabs a throw hits.
 */
import { describe, expect, it } from 'vitest'
import { BEACH, BOX, COCONUT, COLUMN, clampThrow, coconutAt, columnFor, columnX, crabAt, heading, hits, travel, type Throw } from '../internal/beach'

const SEED = 777

/** Whether a coconut and a crab come within reach of each other at any moment of a throw - by stepping, finely, the slow way. */
function slowHit(seed: number, turn: number, t: Throw, crab: number): boolean {
  const column = columnFor(seed, turn)
  const end = t.at + travel(t)
  for (let tau = t.at; tau <= end; tau += 0.0005) {
    const c = coconutAt(t, tau)!
    const k = crabAt(column, crab, tau)
    if (Math.hypot(c.x - k.x, c.z - k.z) < COCONUT.reach - 0.01) return true
  }
  return false
}

describe('the column', () => {
  it('is thirty crabs from its near end to its far end, bent, the same for the same seed and turn', () => {
    const column = columnFor(SEED, 0)
    expect(column.crabs).toHaveLength(COLUMN.crabs)
    expect(column.crabs[0].z).toBeCloseTo(COLUMN.near, 6)
    expect(column.crabs[COLUMN.crabs - 1].z).toBeCloseTo(COLUMN.far, 6)
    expect(Math.max(...column.crabs.map((c) => Math.abs(c.x)))).toBeGreaterThan(COLUMN.bend[0] * 0.6)
    expect(columnFor(SEED, 0)).toEqual(column)
  })

  it('comes in all three shapes, bent either way, a new one each turn', () => {
    const shapes = new Set<string>()
    const ways = new Set<number>()
    for (let turn = 0; turn < 30; turn++) {
      const c = columnFor(SEED, turn)
      shapes.add(c.shape)
      ways.add(Math.sign(c.crabs[Math.floor(COLUMN.crabs / 4)].x))
    }
    expect(shapes).toEqual(new Set(['arc', 'ess', 'hook']))
    expect(ways.size).toBe(2)
  })

  it('marches left to right, starting off the left of the beach', () => {
    expect(columnX(0)).toBeLessThan(-BEACH.halfX + 2)
    expect(columnX(5)).toBeGreaterThan(columnX(0))
    expect(columnX(10) - columnX(9)).toBeCloseTo(COLUMN.speed, 6)
  })
})

describe('the coconut', () => {
  it('rolls straight the way it is aimed, from the roll until it leaves the beach', () => {
    const t = { x: 2, z: 3, angle: 0.3, at: 4 }
    expect(coconutAt(t, 3.9)).toBe(null)
    const h = heading(0.3)
    const at = coconutAt(t, 5)!
    expect(at.x).toBeCloseTo(2 + h.x * COCONUT.speed, 6)
    expect(at.z).toBeCloseTo(3 + h.z * COCONUT.speed, 6)
    const end = coconutAt(t, 4 + travel(t) + 5)!
    expect(end.z).toBeGreaterThanOrEqual(BEACH.far - 1e-6)
  })

  it('stays in the box, and turns no further than it may', () => {
    expect(clampThrow(-50, 50, 3)).toEqual({ x: BOX.x0, z: BOX.z1, angle: COCONUT.turn })
  })
})

describe('the hits', () => {
  it('are exactly the crabs it comes within reach of, as stepping it through finely finds', () => {
    for (const [turn, t] of [
      [0, { x: -3, z: 3, angle: -0.2, at: 5 }],
      [1, { x: 4, z: 2, angle: 0.15, at: 7.5 }],
      [2, { x: 0, z: 3, angle: 0.05, at: 6 }],
    ] as const) {
      const got = new Set(hits(columnFor(SEED, turn), t).map((h) => h.crab))
      for (let i = 0; i < COLUMN.crabs; i++) {
        // Only disagree right at the edge of reach - the stepper's own margin.
        if (slowHit(SEED, turn, t, i)) expect(got.has(i)).toBe(true)
      }
      for (const i of got) {
        const column = columnFor(SEED, turn)
        const h = hits(column, t).find((x) => x.crab === i)!
        const c = coconutAt(t, h.at)!
        const k = crabAt(column, i, h.at)
        expect(Math.hypot(c.x - k.x, c.z - k.z)).toBeCloseTo(COCONUT.reach, 3)
      }
    }
  })

  it('come in the order it meets them, never before the roll', () => {
    const t = { x: -4, z: 3, angle: -0.1, at: 6 }
    const got = hits(columnFor(SEED, 0), t)
    for (let i = 1; i < got.length; i++) expect(got[i].at).toBeGreaterThanOrEqual(got[i - 1].at)
    for (const h of got) expect(h.at).toBeGreaterThanOrEqual(t.at)
  })

  it('are none rolled straight away, with the column still off the beach', () => {
    expect(hits(columnFor(SEED, 0), { x: 10, z: 3, angle: 0, at: 0 })).toEqual([])
  })

  it('can be all thirty on a gently bent column - a perfect game - but never more', () => {
    let best = 0
    for (let seed = 1; seed <= 40 && best < COLUMN.crabs; seed++) {
      const column = columnFor(seed, 0)
      for (let x = -10; x <= 10; x += 1) for (let a = -0.7; a <= 0.7; a += 0.02) for (let at = 1; at <= 10; at += 0.5) best = Math.max(best, hits(column, { x, z: 3, angle: a, at }).length)
    }
    expect(best).toBe(COLUMN.crabs)
  }, 30000)
})
