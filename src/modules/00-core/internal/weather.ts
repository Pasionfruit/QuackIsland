/**
 * What the weather is doing.
 *
 * Here rather than in the sky module for the same reason as the tide: it is a
 * world fact several modules need and none of them should depend on each
 * other. The sky draws the clouds and the rain, but the *lights* live here, and
 * an overcast day that did not dim the sun would not be overcast at all.
 *
 * Weather is chosen, not simulated. There is no front moving across the island
 * and no chance of it turning: you pick one and the island is in it. That is
 * what was asked for, and it is also what makes it reviewable - every state is
 * one click away instead of something you wait for.
 *
 * The presets are **multipliers** on whatever the time of day is doing, never
 * absolute values. Rain at noon and rain at midnight are both rain, and both
 * still have to be lit like noon and midnight.
 */
import { createStore, useStore } from './store'

export type WeatherKind = 'sunny' | 'cloudy' | 'rainy' | 'snowing'

export const WEATHER_KINDS: readonly WeatherKind[] = ['sunny', 'cloudy', 'rainy', 'snowing']

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  sunny: 'Sunny',
  cloudy: 'Cloudy',
  rainy: 'Rainy',
  snowing: 'Snow',
}

/** What falls out of the sky, if anything. */
export type Precipitation = 'none' | 'rain' | 'snow'

export interface WeatherPreset {
  /** Multiplier on the sun. Cloud blocks it. */
  sun: number
  /** Multiplier on the ambient fill. Cloud scatters light, so this goes up. */
  ambient: number
  /** Multiplier on the sky/ground bounce. */
  hemi: number
  /** Multipliers on the fog distances. Under 1 brings the murk closer. */
  fogNear: number
  fogFar: number
  /** Multiplier on tone-mapping exposure. */
  exposure: number
  /**
   * How far the colours are dragged towards a flat overcast grey, 0 to 1.
   * This is what stops rain looking like sunshine with particles in it.
   */
  grey: number
  /** The grey they are dragged towards. */
  greyColor: string
  /** Cloud cover on the dome, 0 clear to 1 solid. */
  cloud: number
  /** How dark the clouds themselves are, 0 white to 1 charcoal. */
  cloudShade: number
  precipitation: Precipitation
  /** Particles in the air around the camera. */
  count: number
  /** Metres per second, downwards. */
  fall: number
}

export const WEATHER: Record<WeatherKind, WeatherPreset> = {
  sunny: {
    sun: 1,
    ambient: 1,
    hemi: 1,
    fogNear: 1,
    fogFar: 1,
    exposure: 1,
    grey: 0,
    greyColor: '#b9c2cc',
    cloud: 0,
    cloudShade: 0,
    precipitation: 'none',
    count: 0,
    fall: 0,
  },
  cloudy: {
    // Bright but flat: less direct sun, more of everything bouncing about.
    sun: 0.42,
    ambient: 1.5,
    hemi: 1.25,
    fogNear: 0.6,
    fogFar: 0.75,
    exposure: 0.96,
    grey: 0.4,
    greyColor: '#b9c2cc',
    cloud: 0.62,
    cloudShade: 0.28,
    precipitation: 'none',
    count: 0,
    fall: 0,
  },
  rainy: {
    sun: 0.2,
    ambient: 1.45,
    hemi: 1.1,
    fogNear: 0.32,
    fogFar: 0.45,
    exposure: 0.88,
    grey: 0.62,
    greyColor: '#8e98a4',
    cloud: 0.9,
    cloudShade: 0.55,
    precipitation: 'rain',
    count: 5200,
    fall: 26,
  },
  snowing: {
    // Snow is bright: the sun is buried but everything below is a reflector.
    sun: 0.3,
    ambient: 1.7,
    hemi: 1.5,
    fogNear: 0.28,
    fogFar: 0.4,
    exposure: 1,
    grey: 0.5,
    greyColor: '#cdd6e2',
    cloud: 0.82,
    cloudShade: 0.3,
    precipitation: 'snow',
    count: 3000,
    fall: 2.2,
  },
}

/** The numbers weather scales. Everything here is a multiplier's target. */
export interface LightingNumbers {
  sunIntensity: number
  ambientIntensity: number
  hemiIntensity: number
  fogNear: number
  fogFar: number
  exposure: number
}

/**
 * Applies a weather preset to the lighting the time of day asked for.
 *
 * Pure, and multiplicative on purpose: weather never decides what the light
 * *is*, only how much of it gets through. Midnight rain is still midnight.
 */
export function applyWeather(
  base: LightingNumbers,
  preset: WeatherPreset,
  amount = 1,
): LightingNumbers {
  const t = Math.min(1, Math.max(0, amount))
  const at = (multiplier: number) => 1 + (multiplier - 1) * t
  return {
    sunIntensity: base.sunIntensity * at(preset.sun),
    ambientIntensity: base.ambientIntensity * at(preset.ambient),
    hemiIntensity: base.hemiIntensity * at(preset.hemi),
    fogNear: base.fogNear * at(preset.fogNear),
    fogFar: base.fogFar * at(preset.fogFar),
    exposure: base.exposure * at(preset.exposure),
  }
}

/**
 * Eases between two presets, so switching weather is a change coming over the
 * island rather than a cut. Every field is a number, so this is a straight
 * interpolation - except what falls out of the sky, which cannot be half rain
 * and half snow and so switches at the midpoint.
 */
export function blendWeather(from: WeatherPreset, to: WeatherPreset, t: number): WeatherPreset {
  const k = Math.min(1, Math.max(0, t))
  // Written this way round rather than `a + (b - a) * k` because it is exact at
  // both ends: at k of 1 the first term is zero and the answer is b itself, not
  // b give or take a float. A blend that never quite arrives leaves the weather
  // permanently a hair off its own preset.
  const mix = (a: number, b: number) => (1 - k) * a + k * b
  return {
    sun: mix(from.sun, to.sun),
    ambient: mix(from.ambient, to.ambient),
    hemi: mix(from.hemi, to.hemi),
    fogNear: mix(from.fogNear, to.fogNear),
    fogFar: mix(from.fogFar, to.fogFar),
    exposure: mix(from.exposure, to.exposure),
    grey: mix(from.grey, to.grey),
    greyColor: k < 0.5 ? from.greyColor : to.greyColor,
    cloud: mix(from.cloud, to.cloud),
    cloudShade: mix(from.cloudShade, to.cloudShade),
    precipitation: k < 0.5 ? from.precipitation : to.precipitation,
    count: Math.round(mix(from.count, to.count)),
    fall: mix(from.fall, to.fall),
  }
}

/** How long weather takes to come over, in seconds of real time. */
export const WEATHER_FADE = 2.5

const store = createStore<WeatherKind>('sunny')

export function setWeather(next: WeatherKind): void {
  store.set(next)
}

export function getWeather(): WeatherKind {
  return store.get()
}

export function useWeather(): WeatherKind {
  return useStore(store)
}
