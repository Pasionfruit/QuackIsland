import { describe, expect, it } from 'vitest'
import {
  WEATHER,
  WEATHER_FADE,
  WEATHER_KINDS,
  WEATHER_LABELS,
  applyWeather,
  blendWeather,
  type LightingNumbers,
} from '../internal/weather'

/** A stand-in for whatever the time of day worked out. */
const noon: LightingNumbers = {
  sunIntensity: 2.6,
  ambientIntensity: 0.35,
  hemiIntensity: 0.9,
  fogNear: 600,
  fogFar: 2600,
  exposure: 1.05,
}

describe('the four weathers', () => {
  it('are the four that were asked for, and all have a label', () => {
    expect([...WEATHER_KINDS]).toEqual(['sunny', 'cloudy', 'rainy', 'snowing'])
    for (const kind of WEATHER_KINDS) {
      expect(WEATHER[kind]).toBeTruthy()
      expect(WEATHER_LABELS[kind].length).toBeGreaterThan(0)
    }
  })

  it('leave sunny alone entirely', () => {
    // Sunny is the baseline: every multiplier is 1, so the lighting comes out
    // exactly as the time of day asked for.
    expect(applyWeather(noon, WEATHER.sunny)).toEqual(noon)
    expect(WEATHER.sunny.cloud).toBe(0)
    expect(WEATHER.sunny.precipitation).toBe('none')
  })

  it('put clouds in every sky that is not sunny', () => {
    for (const kind of WEATHER_KINDS) {
      if (kind === 'sunny') continue
      expect(WEATHER[kind].cloud).toBeGreaterThan(0.5)
    }
  })

  it('only drop things out of skies thick enough to drop them', () => {
    for (const kind of WEATHER_KINDS) {
      const w = WEATHER[kind]
      if (w.precipitation === 'none') {
        expect(w.count).toBe(0)
        continue
      }
      expect(w.count).toBeGreaterThan(0)
      expect(w.fall).toBeGreaterThan(0)
      // It cannot rain out of a clear sky.
      expect(w.cloud).toBeGreaterThan(0.7)
    }
  })

  it('makes snow fall far slower than rain', () => {
    expect(WEATHER.snowing.fall).toBeLessThan(WEATHER.rainy.fall / 4)
  })

  it('dims the sun as the cloud thickens', () => {
    // More cloud has to mean less direct sun, or the sky and the ground
    // disagree about what the weather is.
    const ordered = [...WEATHER_KINDS].sort((a, b) => WEATHER[a].cloud - WEATHER[b].cloud)
    for (let i = 1; i < ordered.length; i++) {
      expect(WEATHER[ordered[i]].sun).toBeLessThanOrEqual(WEATHER[ordered[i - 1]].sun)
    }
  })

  it('lifts the fill light as it takes the sun away', () => {
    // Overcast is dimmer *and* flatter, not simply dark: cloud scatters light
    // rather than swallowing it. A preset that dropped both would look like
    // night in the middle of the afternoon.
    for (const kind of WEATHER_KINDS) {
      const w = WEATHER[kind]
      if (w.sun >= 1) continue
      expect(w.ambient).toBeGreaterThan(1)
      expect(w.hemi).toBeGreaterThan(1)
    }
  })

  it('brings the fog in rather than pushing it out', () => {
    for (const kind of WEATHER_KINDS) {
      const w = WEATHER[kind]
      expect(w.fogNear).toBeLessThanOrEqual(1)
      expect(w.fogFar).toBeLessThanOrEqual(1)
      // And never inverts it, which would put the far plane inside the near.
      expect(w.fogNear).toBeGreaterThan(0)
      expect(w.fogFar).toBeGreaterThan(0)
    }
  })

  it('keeps snow the brightest of the bad weathers', () => {
    // Everything under snow is a reflector, so it is dim but not gloomy.
    expect(WEATHER.snowing.exposure).toBeGreaterThan(WEATHER.rainy.exposure)
    expect(WEATHER.snowing.hemi).toBeGreaterThan(WEATHER.rainy.hemi)
  })
})

describe('applying weather to the light', () => {
  it('multiplies rather than replaces, so the time of day still wins', () => {
    // Midnight rain has to still be midnight. If weather set absolute values,
    // every weather would look the same at every hour.
    const midnight: LightingNumbers = { ...noon, sunIntensity: 0.1, exposure: 0.8 }
    const rainyNoon = applyWeather(noon, WEATHER.rainy)
    const rainyMidnight = applyWeather(midnight, WEATHER.rainy)
    expect(rainyMidnight.sunIntensity).toBeLessThan(rainyNoon.sunIntensity)
    expect(rainyNoon.sunIntensity).toBeCloseTo(noon.sunIntensity * WEATHER.rainy.sun, 9)
  })

  it('never makes anything negative, however dark it gets', () => {
    for (const kind of WEATHER_KINDS) {
      const lit = applyWeather(noon, WEATHER[kind])
      for (const value of Object.values(lit)) {
        expect(Number.isFinite(value)).toBe(true)
        expect(value).toBeGreaterThan(0)
      }
    }
  })

  it('keeps the fog the right way round', () => {
    for (const kind of WEATHER_KINDS) {
      const lit = applyWeather(noon, WEATHER[kind])
      expect(lit.fogFar).toBeGreaterThan(lit.fogNear)
    }
  })

  it('does nothing at all when the weather has not arrived yet', () => {
    expect(applyWeather(noon, WEATHER.rainy, 0)).toEqual(noon)
  })

  it('arrives gradually with the amount', () => {
    const half = applyWeather(noon, WEATHER.rainy, 0.5)
    const full = applyWeather(noon, WEATHER.rainy, 1)
    expect(half.sunIntensity).toBeGreaterThan(full.sunIntensity)
    expect(half.sunIntensity).toBeLessThan(noon.sunIntensity)
  })

  it('clamps an amount from outside its range', () => {
    expect(applyWeather(noon, WEATHER.rainy, -1)).toEqual(noon)
    expect(applyWeather(noon, WEATHER.rainy, 5)).toEqual(applyWeather(noon, WEATHER.rainy, 1))
  })
})

describe('weather coming over', () => {
  it('is the start at zero and the end at one', () => {
    expect(blendWeather(WEATHER.sunny, WEATHER.rainy, 0)).toEqual(WEATHER.sunny)
    expect(blendWeather(WEATHER.sunny, WEATHER.rainy, 1)).toEqual(WEATHER.rainy)
  })

  it('moves every number in between', () => {
    const mid = blendWeather(WEATHER.sunny, WEATHER.rainy, 0.5)
    expect(mid.cloud).toBeCloseTo((WEATHER.sunny.cloud + WEATHER.rainy.cloud) / 2, 9)
    expect(mid.sun).toBeCloseTo((WEATHER.sunny.sun + WEATHER.rainy.sun) / 2, 9)
    expect(mid.grey).toBeGreaterThan(0)
    expect(mid.grey).toBeLessThan(WEATHER.rainy.grey)
  })

  it('never leaves half a raindrop and half a snowflake in the air', () => {
    // What falls out of the sky cannot be interpolated, so it switches at the
    // midpoint instead.
    for (const t of [0, 0.2, 0.49]) {
      expect(blendWeather(WEATHER.rainy, WEATHER.snowing, t).precipitation).toBe('rain')
    }
    for (const t of [0.5, 0.8, 1]) {
      expect(blendWeather(WEATHER.rainy, WEATHER.snowing, t).precipitation).toBe('snow')
    }
  })

  it('gives a whole number of particles', () => {
    for (const t of [0.13, 0.37, 0.66, 0.91]) {
      const count = blendWeather(WEATHER.sunny, WEATHER.rainy, t).count
      expect(Number.isInteger(count)).toBe(true)
    }
  })

  it('clamps outside its range rather than overshooting', () => {
    expect(blendWeather(WEATHER.sunny, WEATHER.rainy, -2)).toEqual(WEATHER.sunny)
    expect(blendWeather(WEATHER.sunny, WEATHER.rainy, 9)).toEqual(WEATHER.rainy)
  })

  it('can be re-entered part way, which is what flicking between two does', () => {
    // Starting a new change from the blend you had reached is what stops it
    // jumping when you change your mind halfway.
    const partway = blendWeather(WEATHER.sunny, WEATHER.rainy, 0.4)
    const onward = blendWeather(partway, WEATHER.snowing, 0)
    expect(onward).toEqual(partway)
    expect(blendWeather(partway, WEATHER.snowing, 1)).toEqual(WEATHER.snowing)
  })

  it('takes long enough to read as weather rather than a switch', () => {
    expect(WEATHER_FADE).toBeGreaterThan(1)
    expect(WEATHER_FADE).toBeLessThan(10)
  })
})
