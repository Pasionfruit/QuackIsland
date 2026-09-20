/**
 * The beach: the column, the coconut, and which crabs a throw hits.
 */
import { describe, expect, it } from 'vitest'
import { BEACH, BOX, COCONUT, COLUMN, WALL, clampThrow, coconutAt, columnFor, columnX, crabAt, foldX, heading, headingAt, hits, legsOf, pathAt, travel, type Throw } from '../internal/beach'

const SEED = 777

/** Whether a coconut and a crab come within reach of each other at any moment of a throw - by stepping, finely, the slow way. */
function slowHit(seed: number, t: Throw, crab: number): boolean {
  const column = columnFor(seed)
  const end = t.at + travel(t)
  for (let tau = t.at; tau <= end; tau += 0.0005) {
    const c = coconutAt(t, tau)!
    const k = crabAt(column, crab, tau)
    if (Math.hypot(c.x - k.x, c.z - k.z) < COCONUT.reach - 0.01) return true
  }
  return false
}

describe('the column', () => {
  it('is thirty crabs from its near end to its far end, bent, the same for the same seed', () => {
    const column = columnFor(SEED)
    expect(column.crabs).toHaveLength(COLUMN.crabs)
    expect(column.crabs[0].z).toBeCloseTo(COLUMN.near, 6)
    expect(column.crabs[COLUMN.crabs - 1].z).toBeCloseTo(COLUMN.far, 6)
    expect(Math.max(...column.crabs.map((c) => Math.abs(c.x)))).toBeGreaterThan(COLUMN.bend[0] * 0.6)
    expect(columnFor(SEED)).toEqual(column)
  })

  it('is one column for the whole game, whoever is throwing: the same crabs in the same places every turn', () => {
    // There is no turn to ask for: the seed makes it. Everybody faces the same column.
    expect(columnFor.length).toBe(1)
    const first = columnFor(SEED)
    for (let turn = 0; turn < 8; turn++) {
      expect(columnFor(SEED)).toBe(first)
      for (let i = 0; i < COLUMN.crabs; i++) expect(crabAt(first, i, 3.5)).toEqual(crabAt(columnFor(SEED), i, 3.5))
    }
  })

  it('comes in all three shapes, bent either way, from one seed to another', () => {
    const shapes = new Set<string>()
    const ways = new Set<number>()
    for (let seed = 1; seed <= 40; seed++) {
      const c = columnFor(seed)
      shapes.add(c.shape)
      ways.add(Math.sign(c.crabs[Math.floor(COLUMN.crabs / 4)].x))
    }
    expect(shapes).toEqual(new Set(['arc', 'ess', 'hook']))
    expect(ways.size).toBe(2)
    expect(JSON.stringify(columnFor(SEED + 1))).not.toBe(JSON.stringify(columnFor(SEED)))
  })

  it('marches left to right, starting off the left of the beach', () => {
    expect(columnX(0)).toBeLessThan(-BEACH.halfX + 2)
    expect(columnX(5)).toBeGreaterThan(columnX(0))
    expect(columnX(10) - columnX(9)).toBeCloseTo(COLUMN.speed, 6)
  })
})

describe('the coconut', () => {
  it('rolls straight the way it is aimed, from the roll until it reaches the sea', () => {
    const t = { x: 2, z: 3, angle: 0.3, at: 4 }
    expect(coconutAt(t, 3.9)).toBe(null)
    const h = heading(0.3)
    const at = coconutAt(t, 5)!
    expect(at.x).toBeCloseTo(2 + h.x * COCONUT.speed, 6)
    expect(at.z).toBeCloseTo(3 + h.z * COCONUT.speed, 6)
    const end = coconutAt(t, 4 + travel(t) + 5)!
    expect(end.z).toBeGreaterThanOrEqual(BEACH.far - 1e-6)
  })

  it('bounces off the wall down each side of the beach, and never gets past one', () => {
    // From the east end of the box, aimed hard west (a positive angle heads west, so a negative one east).
    const east = { x: 10, z: 3, angle: -1.0, at: 0 }
    const legs = legsOf(east)
    expect(legs.length).toBeGreaterThan(1)
    // Off the wall it came in on: the east-west way turns round, the north-south way does not.
    expect(legs[1].dx).toBeCloseTo(-legs[0].dx, 9)
    expect(legs[1].dz).toBeCloseTo(legs[0].dz, 9)
    expect(legs[0].x + legs[0].dx * (legs[0].s1 - legs[0].s0)).toBeCloseTo(WALL, 9)
    // Every metre of the way it is on the beach, and it goes on towards the sea the whole time.
    let last = east.z
    for (let s = 0; s <= travel(east) * COCONUT.speed; s += 0.05) {
      const at = pathAt(east, s)
      expect(Math.abs(at.x)).toBeLessThanOrEqual(WALL + 1e-9)
      expect(at.z).toBeLessThanOrEqual(last + 1e-9)
      last = at.z
    }
    // And it reaches the sea: the bounces cost it nothing.
    expect(pathAt(east, travel(east) * COCONUT.speed).z).toBeCloseTo(BEACH.far, 6)
    // The west wall as well, and both in turn from a steep angle.
    const steep = { x: -11, z: 3, angle: 1.15, at: 0 }
    expect(legsOf(steep).length).toBeGreaterThanOrEqual(3)
    for (let s = 0; s <= travel(steep) * COCONUT.speed; s += 0.05) expect(Math.abs(pathAt(steep, s).x)).toBeLessThanOrEqual(WALL + 1e-9)
  })

  it('goes on smoothly through a bounce: no jump, and the legs join up', () => {
    const t = { x: 8, z: 3, angle: -0.9, at: 2 }
    const legs = legsOf(t)
    for (let i = 1; i < legs.length; i++) {
      const before = legs[i - 1]
      expect(legs[i].s0).toBeCloseTo(before.s1, 9)
      expect(legs[i].x).toBeCloseTo(before.x + before.dx * (before.s1 - before.s0), 9)
      expect(legs[i].z).toBeCloseTo(before.z + before.dz * (before.s1 - before.s0), 9)
    }
    let prev = coconutAt(t, 2)!
    for (let tau = 2.01; tau < 2 + travel(t); tau += 0.01) {
      const at = coconutAt(t, tau)!
      expect(Math.hypot(at.x - prev.x, at.z - prev.z)).toBeLessThanOrEqual(COCONUT.speed * 0.0101)
      prev = at
    }
  })

  it('knows which way it is going, turned round at each wall', () => {
    const t = { x: 8, z: 3, angle: -0.9, at: 0 }
    const h = heading(-0.9)
    expect(h.x).toBeGreaterThan(0)
    const legs = legsOf(t)
    for (const leg of legs) {
      const mid = (leg.s0 + leg.s1) / 2
      const going = headingAt(t, mid)
      expect(going.x).toBeCloseTo(leg.dx, 6)
      expect(going.z).toBeCloseTo(leg.dz, 6)
    }
    expect(foldX(WALL + 1)).toBeCloseTo(WALL - 1, 9)
    expect(foldX(-WALL - 1)).toBeCloseTo(-WALL + 1, 9)
    expect(foldX(3)).toBeCloseTo(3, 9)
  })

  it('stays in the box, and turns no further than it may', () => {
    expect(clampThrow(-50, 50, 3)).toEqual({ x: BOX.x0, z: BOX.z1, angle: COCONUT.turn })
  })
})

describe('the hits', () => {
  it('are exactly the crabs it comes within reach of, as stepping it through finely finds', () => {
    for (const t of [
      { x: -3, z: 3, angle: -0.2, at: 5 },
      { x: 4, z: 2, angle: 0.15, at: 7.5 },
      { x: 0, z: 3, angle: 0.05, at: 6 },
    ] as const) {
      const got = new Set(hits(columnFor(SEED), t).map((h) => h.crab))
      for (let i = 0; i < COLUMN.crabs; i++) {
        // Only disagree right at the edge of reach - the stepper's own margin.
        if (slowHit(SEED, t, i)) expect(got.has(i)).toBe(true)
      }
      for (const i of got) {
        const column = columnFor(SEED)
        const h = hits(column, t).find((x) => x.crab === i)!
        const c = coconutAt(t, h.at)!
        const k = crabAt(column, i, h.at)
        expect(Math.hypot(c.x - k.x, c.z - k.z)).toBeCloseTo(COCONUT.reach, 3)
      }
    }
  })

  it('are exactly the crabs it comes within reach of after a bounce too, as stepping finds', () => {
    let after = 0
    for (const t of [
      { x: 9, z: 3, angle: -0.85, at: 1 },
      { x: -10, z: 2.5, angle: 0.9, at: 0.5 },
      { x: 6, z: 3, angle: -1.1, at: 3 },
      { x: -4, z: 3, angle: 1.15, at: 0 },
    ] as const) {
      const column = columnFor(SEED)
      const found = hits(column, t)
      const got = new Set(found.map((h) => h.crab))
      for (let i = 0; i < COLUMN.crabs; i++) if (slowHit(SEED, t, i)) expect(got.has(i)).toBe(true)
      for (const h of found) {
        const c = coconutAt(t, h.at)!
        const k = crabAt(column, h.crab, h.at)
        expect(Math.hypot(c.x - k.x, c.z - k.z)).toBeCloseTo(COCONUT.reach, 3)
      }
      // A crab met after the first bounce: what the wall is for.
      const firstBounce = t.at + legsOf(t)[0].s1 / COCONUT.speed
      after += found.filter((h) => h.at > firstBounce + 1e-6).length
      // A crab is hit once, however many legs pass it.
      expect(found.length).toBe(got.size)
    }
    expect(after).toBeGreaterThan(0)
  }, 60000)

  it('come in the order it meets them, never before the roll', () => {
    const t = { x: -4, z: 3, angle: -0.1, at: 6 }
    const got = hits(columnFor(SEED), t)
    for (let i = 1; i < got.length; i++) expect(got[i].at).toBeGreaterThanOrEqual(got[i - 1].at)
    for (const h of got) expect(h.at).toBeGreaterThanOrEqual(t.at)
  })

  it('are none rolled straight away, with the column still off the beach', () => {
    expect(hits(columnFor(SEED), { x: 10, z: 3, angle: 0, at: 0 })).toEqual([])
  })

  it('can be all thirty on a gently bent column - a perfect game - but never more', () => {
    let best = 0
    for (let seed = 1; seed <= 40 && best < COLUMN.crabs; seed++) {
      const column = columnFor(seed)
      for (let x = -10; x <= 10; x += 1) for (let a = -0.7; a <= 0.7; a += 0.02) for (let at = 1; at <= 10; at += 0.5) best = Math.max(best, hits(column, { x, z: 3, angle: a, at }).length)
    }
    expect(best).toBe(COLUMN.crabs)
  }, 30000)
})
