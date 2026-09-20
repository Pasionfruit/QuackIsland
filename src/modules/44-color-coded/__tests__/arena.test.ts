/**
 * The arena and its clock: the schedule, the deal, the wheel, what is solid when.
 */
import { describe, expect, it } from 'vitest'
import { GRID, HALF, PANEL_COLOURS, PHASES, ROUND_LENGTH, VIABLE, dealFor, panelAt, panelCentre, panelLift, solid, spawnPoint, viable, wheelAngle, when } from '../internal/arena'

const SEED = 8080
const COUNT = GRID.size * GRID.size

describe('the schedule', () => {
  it('goes spin, reveal, drop, rebuild, and round again', () => {
    expect(when(0)).toMatchObject({ round: 1, phase: 'spin' })
    expect(when(PHASES.spin + 0.01)).toMatchObject({ round: 1, phase: 'reveal' })
    expect(when(PHASES.spin + PHASES.reveal + 0.01)).toMatchObject({ round: 1, phase: 'drop' })
    expect(when(ROUND_LENGTH - 0.01)).toMatchObject({ round: 1, phase: 'rebuild' })
    expect(when(ROUND_LENGTH + 0.01)).toMatchObject({ round: 2, phase: 'spin' })
    expect(PHASES.reveal).toBe(2)
  })
})

describe('the deal', () => {
  it('puts the wheel colour on exactly the round\'s count of panels, fewer every round, down to one', () => {
    for (let round = 1; round <= 12; round++) {
      const deal = dealFor(SEED, round)
      expect(deal.panels).toHaveLength(COUNT)
      expect(deal.panels.filter((c) => c === deal.colour)).toHaveLength(viable(round))
      expect(deal.panels.every((c) => c >= 0 && c < PANEL_COLOURS.length)).toBe(true)
    }
    for (let r = 1; r < VIABLE.length; r++) expect(viable(r + 1)).toBeLessThanOrEqual(viable(r))
    expect(viable(1)).toBeGreaterThan(viable(5))
    expect(viable(40)).toBe(1)
  })

  it('is the same for the same seed and round, and not for another', () => {
    expect(dealFor(SEED, 3)).toEqual(dealFor(SEED, 3))
    expect(JSON.stringify(dealFor(SEED + 1, 3))).not.toBe(JSON.stringify(dealFor(SEED, 3)))
  })
})

describe('what is solid', () => {
  it('is every panel through the spin and the reveal, and only the colour through the drop and rebuild', () => {
    const deal = dealFor(SEED, 1)
    for (let i = 0; i < COUNT; i++) {
      expect(solid(SEED, 1, i)).toBe(true)
      expect(solid(SEED, PHASES.spin + 1.9, i)).toBe(true)
      expect(solid(SEED, PHASES.spin + PHASES.reveal + 0.01, i)).toBe(deal.panels[i] === deal.colour)
      expect(solid(SEED, ROUND_LENGTH - 0.05, i)).toBe(deal.panels[i] === deal.colour)
      expect(solid(SEED, ROUND_LENGTH + 0.05, i)).toBe(true)
    }
    expect(solid(SEED, 1, -1)).toBe(false)
  })

  it('draws a wrong panel dropping away and slowly rising back', () => {
    const deal = dealFor(SEED, 1)
    const wrong = deal.panels.findIndex((c) => c !== deal.colour)
    const right = deal.panels.findIndex((c) => c === deal.colour)
    const drop = PHASES.spin + PHASES.reveal
    expect(panelLift(SEED, drop - 0.1, wrong)).toBe(0)
    expect(panelLift(SEED, drop + 0.6, wrong)).toBe(-1)
    const early = panelLift(SEED, drop + PHASES.drop + 0.5, wrong)
    const late = panelLift(SEED, drop + PHASES.drop + 2, wrong)
    expect(early).toBeLessThan(late)
    expect(late).toBeLessThanOrEqual(0)
    expect(panelLift(SEED, ROUND_LENGTH - 0.01, wrong)).toBeCloseTo(0, 2)
    expect(panelLift(SEED, drop + 1, right)).toBe(0)
  })

  it('is standable exactly when it is drawn flush: it rises steadily and arrives as the rebuild ends', () => {
    for (const round of [1, 2, 5]) {
      const deal = dealFor(SEED, round)
      const start = (round - 1) * ROUND_LENGTH
      const wrongs = deal.panels.map((c, i) => (c === deal.colour ? -1 : i)).filter((i) => i >= 0)
      const rebuild = start + PHASES.spin + PHASES.reveal + PHASES.drop
      for (const panel of wrongs) {
        let last = -Infinity
        for (let t = 0; t < PHASES.rebuild - 1e-6; t += 0.01) {
          const lift = panelLift(SEED, rebuild + t, panel)
          // Rising, in a straight line, and unstandable the whole way up.
          expect(lift).toBeGreaterThanOrEqual(last)
          expect(lift).toBeCloseTo(-(1 - t / PHASES.rebuild), 9)
          expect(lift).toBeLessThan(0)
          expect(solid(SEED, rebuild + t, panel)).toBe(false)
          last = lift
        }
        // Flush and solid together, at the moment the next round's spin starts.
        expect(panelLift(SEED, start + ROUND_LENGTH, panel)).toBe(0)
        expect(solid(SEED, start + ROUND_LENGTH, panel)).toBe(true)
      }
    }
  })

  it('never has a panel that looks up and is not solid, or looks down and is', () => {
    // A tenth of a second before it arrives, a panel is still visibly on its way: at least a tenth of the drop down.
    const deal = dealFor(SEED, 1)
    const wrong = deal.panels.findIndex((c) => c !== deal.colour)
    const nearly = panelLift(SEED, ROUND_LENGTH - 0.1, wrong)
    expect(nearly).toBeLessThan(-0.03)
    for (let t = PHASES.spin + PHASES.reveal + PHASES.drop; t < ROUND_LENGTH + 2; t += 0.01) {
      // Not the instant of the boundary itself, where a rounding error is the difference.
      if (Math.abs(t - ROUND_LENGTH) < 1e-6) continue
      const lift = panelLift(SEED, t, wrong)
      expect(solid(SEED, t, wrong)).toBe(lift > -1e-9)
    }
  })
})

describe('the floor', () => {
  it('has a panel under every point on it and none off it', () => {
    for (let i = 0; i < COUNT; i++) {
      const m = panelCentre(i)
      expect(panelAt(m.x, m.z)).toBe(i)
      expect(panelAt(m.x + GRID.cell / 2 - 0.01, m.z - GRID.cell / 2 + 0.01)).toBe(i)
    }
    expect(panelAt(HALF + 0.01, 0)).toBe(-1)
    expect(panelAt(0, -HALF - 0.01)).toBe(-1)
  })

  it('starts everybody on it, apart', () => {
    for (let n = 1; n <= 8; n++) {
      const spots = Array.from({ length: n }, (_, i) => spawnPoint(i, n))
      for (const s of spots) expect(panelAt(s.x, s.z)).toBeGreaterThanOrEqual(0)
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThan(2)
    }
  })
})

describe('the wheel', () => {
  it('stops with the round\'s colour at the top, and spins on from where it stopped', () => {
    for (let round = 1; round <= 6; round++) {
      const stop = wheelAngle(SEED, (round - 1) * ROUND_LENGTH + PHASES.spin + 0.5)
      const colour = dealFor(SEED, round).colour
      // The segment at the top is the one whose middle, turned by the wheel, points up.
      const segment = (Math.PI * 2) / PANEL_COLOURS.length
      const top = (((Math.PI / 2 - stop) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      expect(Math.floor(top / segment)).toBe(colour)
      const start = wheelAngle(SEED, round * ROUND_LENGTH)
      expect(start).toBeCloseTo(stop, 2)
    }
  })
})
