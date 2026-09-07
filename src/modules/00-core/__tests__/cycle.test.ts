import { beforeEach, describe, expect, it } from 'vitest'
import {
  CYCLE_SECONDS,
  SECTION_SECONDS,
  TIMES_OF_DAY,
  advanceCycle,
  getDayTime,
  nameAt,
  normaliseTime,
  sectionAt,
  setCycleRunning,
  setDayTime,
  setTimeOfDay,
  setTimeScale,
  timeOf,
} from '../internal/lighting'

beforeEach(() => {
  setDayTime(timeOf('dawn'))
  setCycleRunning(true)
  setTimeScale(1)
})

describe('the shape of a day', () => {
  it('runs an hour, a quarter of it in each named time', () => {
    expect(CYCLE_SECONDS).toBe(3600)
    expect(SECTION_SECONDS).toBe(900)
    expect(SECTION_SECONDS * TIMES_OF_DAY.length).toBe(CYCLE_SECONDS)
  })

  it('starts each named time squarely on its own preset', () => {
    for (const name of TIMES_OF_DAY) {
      const s = sectionAt(timeOf(name))
      expect(s.from).toBe(name)
      expect(s.blend).toBeCloseTo(0, 6)
    }
  })

  it('runs the four in order and wraps back round', () => {
    expect(sectionAt(timeOf('dawn')).to).toBe('daylight')
    expect(sectionAt(timeOf('daylight')).to).toBe('dusk')
    expect(sectionAt(timeOf('dusk')).to).toBe('night')
    // Night rolls into the next dawn rather than stopping.
    expect(sectionAt(timeOf('night')).to).toBe('dawn')
  })

  it('wraps any time into the cycle rather than running off the end', () => {
    expect(normaliseTime(1)).toBeCloseTo(0, 6)
    expect(normaliseTime(1.25)).toBeCloseTo(0.25, 6)
    expect(normaliseTime(-0.25)).toBeCloseTo(0.75, 6)
    expect(normaliseTime(NaN)).toBe(0)
  })

  it('lingers near each named time rather than sliding evenly', () => {
    // The easing is what makes a section feel like that time of day for most
    // of its fifteen minutes instead of being in transit the whole way.
    const quarterIn = sectionAt(timeOf('daylight') + 0.25 * 0.25).blend
    const halfway = sectionAt(timeOf('daylight') + 0.25 * 0.5).blend
    expect(quarterIn).toBeLessThan(0.25)
    expect(halfway).toBeCloseTo(0.5, 2)
  })

  it('names the nearer of the two times it sits between', () => {
    expect(nameAt(timeOf('daylight'))).toBe('daylight')
    expect(nameAt(timeOf('daylight') + 0.24)).toBe('dusk')
  })
})

describe('the clock', () => {
  it('advances by real time over the cycle length', () => {
    setDayTime(0)
    // Advanced in slices, because a single huge delta is deliberately clamped.
    for (let i = 0; i < CYCLE_SECONDS / 4 / 0.1; i++) advanceCycle(0.1)
    expect(getDayTime()).toBeCloseTo(0.25, 3)
  })

  it('goes faster when told to', () => {
    setDayTime(0)
    setTimeScale(60)
    for (let i = 0; i < 150; i++) advanceCycle(0.1)
    // Fifteen seconds of real time at sixty times speed is a whole section.
    expect(getDayTime()).toBeCloseTo(0.25, 3)
  })

  it('stands still when paused', () => {
    setDayTime(0.4)
    setCycleRunning(false)
    for (let i = 0; i < 100; i++) advanceCycle(0.2)
    expect(getDayTime()).toBeCloseTo(0.4, 6)
  })

  it('stands still at zero speed', () => {
    setDayTime(0.4)
    setTimeScale(0)
    for (let i = 0; i < 100; i++) advanceCycle(0.2)
    expect(getDayTime()).toBeCloseTo(0.4, 6)
  })

  it('clamps a huge delta, so a backgrounded tab does not skip a day', () => {
    setDayTime(0)
    advanceCycle(100000)
    // Capped at a quarter second of real time, which is a sliver of an hour.
    expect(getDayTime()).toBeLessThan(0.001)
  })

  it('wraps past night into dawn without running off the end', () => {
    setDayTime(timeOf('night') + 0.249)
    setTimeScale(600)
    for (let i = 0; i < 40; i++) advanceCycle(0.25)
    expect(getDayTime()).toBeGreaterThanOrEqual(0)
    expect(getDayTime()).toBeLessThan(1)
  })

  it('jumps to a named time when asked', () => {
    setTimeOfDay('dusk')
    expect(getDayTime()).toBeCloseTo(timeOf('dusk'), 6)
    expect(nameAt(getDayTime())).toBe('dusk')
  })
})
