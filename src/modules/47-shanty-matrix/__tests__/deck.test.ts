/**
 * The deck and the guns: the barrage from the seed, where a ball is when, and how it gets fiercer.
 */
import { describe, expect, it } from 'vitest'
import { DECK, LIMIT, SHOT, activeShots, ballAt, barrageFor, crossing, fierceness, lifetime, offLine, spawnPoint, volleySize } from '../internal/deck'

const SEED = 4711

describe('the barrage', () => {
  it('is the same for the same seed, and not for another', () => {
    expect(barrageFor(SEED)).toEqual(barrageFor(SEED))
    expect(JSON.stringify(barrageFor(SEED + 1))).not.toBe(JSON.stringify(barrageFor(SEED)))
  })

  it('is fired in order, from the start to the end of the round, numbered as it goes', () => {
    const shots = barrageFor(SEED)
    expect(shots[0].fire).toBeCloseTo(SHOT.first, 5)
    shots.forEach((s, i) => {
      expect(s.k).toBe(i)
      if (i > 0) expect(s.fire).toBeGreaterThanOrEqual(shots[i - 1].fire)
    })
    expect(shots[shots.length - 1].fire).toBeLessThan(LIMIT + 1)
  })

  it('comes from every direction, crosses the deck, and is giant', () => {
    const shots = barrageFor(SEED)
    const quarters = new Set(shots.map((s) => Math.floor(((Math.atan2(s.dz, s.dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2))))
    expect(quarters.size).toBe(4)
    for (const s of shots) {
      expect(Math.hypot(s.dx, s.dz)).toBeCloseTo(1, 6)
      expect(s.radius).toBeGreaterThanOrEqual(SHOT.radius[0])
      expect(s.radius).toBeLessThanOrEqual(SHOT.radius[1])
      expect(s.sOut).toBeGreaterThan(s.sIn)
      // Somewhere along its crossing it is over the deck itself, not just clipping a corner.
      const on = Array.from({ length: 41 }, (_, i) => s.sIn + ((s.sOut - s.sIn) * i) / 40).some(
        (at) => Math.abs(s.cx + s.dx * at) < DECK.halfX && Math.abs(s.cz + s.dz * at) < DECK.halfZ,
      )
      expect(on).toBe(true)
    }
  })

  it('gets fiercer: shorter gaps, quicker balls, and more at once', () => {
    const shots = barrageFor(SEED)
    const early = shots.filter((s) => s.fire < 16)
    const late = shots.filter((s) => s.fire > SHOT.ramp)
    const perSecond = (list: typeof shots, span: number) => list.length / span
    expect(perSecond(late, LIMIT - SHOT.ramp)).toBeGreaterThan(perSecond(early, 16) * 2.5)
    const mean = (list: typeof shots) => list.reduce((a, s) => a + s.speed, 0) / list.length
    expect(mean(late)).toBeGreaterThan(mean(early) * 1.4)
    expect(fierceness(0)).toBe(0)
    expect(fierceness(SHOT.ramp * 2)).toBe(1)
    expect(volleySize(10, 0)).toBe(1)
    expect(volleySize(100, 0)).toBe(3)
  })
})

describe('a ball', () => {
  it('is not there before it is fired, reaches the rail exactly the warning later, and is gone after its lifetime', () => {
    for (const s of barrageFor(SEED).slice(0, 40)) {
      expect(ballAt(s, s.fire - 0.01)).toBe(null)
      expect(ballAt(s, s.fire)!.stage).toBe('incoming')
      expect(ballAt(s, s.fire + SHOT.warn)!.s).toBeCloseTo(s.sIn, 6)
      expect(ballAt(s, s.fire + SHOT.warn + 0.01)!.stage).toBe('deck')
      expect(ballAt(s, s.fire + lifetime(s) - 0.05)!.stage).toBe('outgoing')
      expect(ballAt(s, s.fire + lifetime(s) + 0.05)).toBe(null)
    }
  })

  it('comes down onto the deck, rolls across it at its own height, and drops into the sea', () => {
    const s = barrageFor(SEED)[3]
    const at = (t: number) => ballAt(s, t)!
    expect(at(s.fire).y).toBeGreaterThan(at(s.fire + SHOT.warn * 0.9).y)
    const crossing = s.fire + SHOT.warn + (s.sOut - s.sIn) / s.speed / 2
    expect(at(crossing).y).toBeCloseTo(s.radius, 6)
    expect(offLine(s, at(crossing).x, at(crossing).z)).toBeCloseTo(0, 6)
    expect(at(s.fire + lifetime(s) - 0.01).y).toBeLessThan(-2)
  })

  it('touches the deck from rail to rail of its crossing, and a line that misses the deck has none', () => {
    const [a, b] = crossing(0, 0, 1, 0, 1)!
    expect(a).toBeCloseTo(-DECK.halfX - 1, 6)
    expect(b).toBeCloseTo(DECK.halfX + 1, 6)
    expect(crossing(0, DECK.halfZ + 3, 1, 0, 1)).toBe(null)
  })

  it('is among those active from when it is fired until it is gone, and no other time', () => {
    const shots = barrageFor(SEED)
    for (const t of [0, 1, 5, 17.3, 44, 56, 74]) {
      const active = new Set(activeShots(SEED, t).map((s) => s.k))
      for (const s of shots) expect(active.has(s.k)).toBe(ballAt(s, t) !== null)
    }
  })
})

describe('the deck', () => {
  it('starts everybody on it, apart', () => {
    for (let n = 1; n <= 8; n++) {
      const spots = Array.from({ length: n }, (_, i) => spawnPoint(i, n))
      for (const s of spots) {
        expect(Math.abs(s.x)).toBeLessThan(DECK.halfX - 1)
        expect(Math.abs(s.z)).toBeLessThan(DECK.halfZ - 1)
      }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThan(2)
    }
  })
})
