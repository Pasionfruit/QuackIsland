import { describe, expect, it } from 'vitest'
import { TIMES_OF_DAY, timeOf } from '../internal/lighting'
import { TIDE, TIDE_MAX, TIDE_RANGE, tideAt, tideRising } from '../internal/tide'

/**
 * Samples one whole day at a fine step.
 *
 * The day clock is a turn, 0 to 1, not seconds - that is what `getDayTime`
 * returns and what the lighting works in.
 */
function day(step = 1 / 3600): number[] {
  const out: number[] = []
  for (let u = 0; u < 1; u += step) out.push(tideAt(u))
  return out
}

/** Local maxima of a series, as [index, value]. */
function peaks(series: number[]): Array<[number, number]> {
  const found: Array<[number, number]> = []
  for (let i = 1; i < series.length - 1; i++) {
    if (series[i] > series[i - 1] && series[i] >= series[i + 1]) found.push([i, series[i]])
  }
  return found
}

describe('the tide', () => {
  it('stays within its own range', () => {
    for (const h of day()) {
      expect(Number.isFinite(h)).toBe(true)
      expect(Math.abs(h)).toBeLessThanOrEqual(TIDE_MAX + 1e-9)
    }
    expect(TIDE_RANGE).toBe(TIDE_MAX * 2)
  })

  it('actually moves the water a useful distance', () => {
    // Too small and nothing visibly changes on the beach; too large and the
    // island floods. The shore here is shallow enough that a metre of tide
    // walks the waterline six or seven metres in or out.
    expect(TIDE_RANGE).toBeGreaterThan(1)
    expect(TIDE_RANGE).toBeLessThan(3)
  })

  it('comes in and goes out twice a day', () => {
    const highs = peaks(day(1 / 720))
    expect(highs).toHaveLength(2)
    const lows = peaks(day(1 / 720).map((h) => -h))
    expect(lows).toHaveLength(2)
  })

  it('makes the day two unequal high tides, not the same one twice', () => {
    // A higher high water and a lower high water. Real coasts do this, and it
    // is most of what stops a tide reading as a mechanical pump.
    const [a, b] = peaks(day(1 / 720)).map(([, v]) => v)
    expect(Math.abs(a - b)).toBeGreaterThan(0.1)
  })

  it('is continuous, including across the turn of the day', () => {
    // The day clock wraps; the tide must not step when it does.
    expect(tideAt(0)).toBeCloseTo(tideAt(1), 9)
    const step = 1 / 3600
    let worst = 0
    for (let u = 0; u < 1; u += step) {
      worst = Math.max(worst, Math.abs(tideAt(u + step) - tideAt(u)))
    }
    // Nothing jumps: a thirty-six-hundredth of a day is under a millimetre.
    expect(worst).toBeLessThan(0.01)
  })

  it('repeats every day and takes times outside the day', () => {
    for (const u of [0, 0.04, 0.25, 0.71, 0.999]) {
      expect(tideAt(u + 1)).toBeCloseTo(tideAt(u), 9)
      expect(tideAt(u - 1)).toBeCloseTo(tideAt(u), 9)
      expect(tideAt(u + 7)).toBeCloseTo(tideAt(u), 9)
    }
  })

  it('spends real time near the top and bottom of its range', () => {
    // Sanity that the swing is a swing and not a flat line with a spike.
    const samples = day(1 / 720)
    expect(Math.max(...samples)).toBeGreaterThan(TIDE_MAX * 0.6)
    expect(Math.min(...samples)).toBeLessThan(-TIDE_MAX * 0.6)
  })

  it('says it is rising exactly when it is rising', () => {
    // Derived from the level rather than tracked, so it cannot get out of step
    // with it. Checked against a much wider window than the one it uses, away
    // from the turns where a wide window straddles a peak and means nothing.
    for (let u = 0; u < 1; u += 1 / 500) {
      const over = tideAt(u + 0.01) - tideAt(u - 0.01)
      if (Math.abs(over) < 0.02) continue
      expect(tideRising(u)).toBe(over > 0)
    }
  })

  it('visibly moves whatever time of day you are looking at', () => {
    // Not a physical fact, a reviewability one. Two high tides a day means no
    // quarter of it is stuck at slack water, so you can stand on the beach at
    // any hour and watch the waterline move without changing the time first.
    for (const name of TIMES_OF_DAY) {
      const from = timeOf(name)
      let lo = Infinity
      let hi = -Infinity
      for (let u = from; u < from + 1 / TIMES_OF_DAY.length; u += 0.0005) {
        const h = tideAt(u)
        lo = Math.min(lo, h)
        hi = Math.max(hi, h)
      }
      expect(hi - lo).toBeGreaterThan(TIDE_RANGE * 0.5)
    }
  })

  it('is built from two constituents that both matter', () => {
    expect(TIDE.semidiurnal).toBeGreaterThan(TIDE.diurnal)
    expect(TIDE.diurnal).toBeGreaterThan(0)
  })
})
