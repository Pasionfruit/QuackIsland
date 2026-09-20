/**
 * The cellar's clock: the rounds, when the trapdoor springs, the twitches, the window.
 */
import { describe, expect, it } from 'vitest'
import { CELLAR, MAX_ROUNDS, TIMING, rattle, scheduleFor, spawnPoint, sprung, when, windowFor } from '../internal/nest'

const SEED = 31337

describe('the schedule', () => {
  it('is the same for the same seed, and springs at other moments for another', () => {
    expect(scheduleFor(SEED)).toEqual(scheduleFor(SEED))
    expect(scheduleFor(SEED + 1)[0].springs).not.toBe(scheduleFor(SEED)[0].springs)
  })

  it('runs ready, creep, reveal, round after round, each starting where the last ended', () => {
    const rounds = scheduleFor(SEED)
    expect(rounds).toHaveLength(MAX_ROUNDS)
    rounds.forEach((r, i) => {
      expect(r.round).toBe(i + 1)
      expect(r.start).toBeCloseTo(i === 0 ? 0 : rounds[i - 1].end, 9)
      expect(r.creep - r.start).toBeCloseTo(TIMING.ready, 9)
      expect(r.judged).toBeCloseTo(r.springs + r.window + TIMING.grace, 9)
      expect(r.end - r.judged).toBeCloseTo(TIMING.reveal, 9)
      expect(when(SEED, r.start + 0.01)).toMatchObject({ phase: 'ready', round: r })
      expect(when(SEED, r.creep + 0.01)).toMatchObject({ phase: 'creep', round: r })
      expect(when(SEED, r.judged + 0.01)).toMatchObject({ phase: 'reveal', round: r })
    })
  })

  it('springs at a random moment within the range, differently round to round', () => {
    const moments = new Set<number>()
    for (let seed = 1; seed <= 20; seed++) {
      for (const r of scheduleFor(seed)) {
        const into = r.springs - r.creep
        expect(into).toBeGreaterThanOrEqual(TIMING.spring[0])
        expect(into).toBeLessThanOrEqual(TIMING.spring[1])
        moments.add(Math.round(into * 10))
      }
    }
    expect(moments.size).toBeGreaterThan(25)
  })

  it('gives less time to react round by round, down to a floor', () => {
    expect(windowFor(1)).toBeCloseTo(TIMING.window[0], 9)
    for (let r = 2; r <= MAX_ROUNDS; r++) expect(windowFor(r)).toBeLessThanOrEqual(windowFor(r - 1))
    expect(windowFor(MAX_ROUNDS)).toBeCloseTo(TIMING.window[1], 9)
  })
})

describe('the lid', () => {
  it('twitches a little before the spring, never near it, and rattles hard from it to the reveal', () => {
    let twitches = 0
    for (let seed = 1; seed <= 20; seed++) {
      for (const r of scheduleFor(seed)) {
        for (const at of r.twitches) {
          twitches += 1
          expect(at).toBeGreaterThan(r.creep)
          expect(at).toBeLessThan(r.springs - 1.2)
          expect(rattle(seed, at + 0.01)).toBeGreaterThan(0)
          expect(rattle(seed, at + 0.01)).toBeLessThan(0.5)
        }
        expect(rattle(seed, r.springs - 0.0001)).toBeLessThan(0.5)
        expect(rattle(seed, r.springs + 0.01)).toBe(1)
        expect(rattle(seed, r.judged + 0.01)).toBe(0)
        expect(sprung(seed, r.springs - 0.01)).toBe(false)
        expect(sprung(seed, r.springs + 0.01)).toBe(true)
      }
    }
    expect(twitches).toBeGreaterThan(40)
  })
})

describe('the ring', () => {
  it('starts everybody the same distance out, apart', () => {
    for (let n = 1; n <= 8; n++) {
      const spots = Array.from({ length: n }, (_, i) => spawnPoint(i, n))
      for (const s of spots) expect(Math.hypot(s.x, s.z)).toBeCloseTo(CELLAR.far, 9)
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThan(2)
    }
  })
})
