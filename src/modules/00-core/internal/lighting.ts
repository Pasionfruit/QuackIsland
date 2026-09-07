/**
 * Times of day.
 *
 * Lighting is singular - there is one sun and one sky - so it lives here with
 * the camera and the render loop rather than in a content module. A later sky
 * module drives it through `setTimeOfDay` instead of installing lights of its
 * own, which is the seam that stops two modules fighting over the sun.
 */
import { createStore, useStore } from './store'

export type TimeOfDay = 'dawn' | 'daylight' | 'dusk' | 'night'

/** In the order the sun actually moves, which is the order the slider uses. */
export const TIMES_OF_DAY: readonly TimeOfDay[] = ['dawn', 'daylight', 'dusk', 'night']

export const TIME_LABELS: Record<TimeOfDay, string> = {
  dawn: 'Dawn',
  daylight: 'Daylight',
  dusk: 'Dusk',
  night: 'Night',
}

export interface LightingPreset {
  /** Direction the key light comes from, in metres. Length sets nothing; only the direction matters. */
  sunPosition: [number, number, number]
  sunColor: string
  sunIntensity: number
  ambientColor: string
  ambientIntensity: number
  skyColor: string
  groundColor: string
  hemiIntensity: number
  background: string
  fogColor: string
  fogNear: number
  fogFar: number
  exposure: number
}

export const LIGHTING: Record<TimeOfDay, LightingPreset> = {
  // Low sun from the east, everything warm and soft, long shadows westward.
  dawn: {
    sunPosition: [-190, 48, 130],
    sunColor: '#ffb583',
    sunIntensity: 1.9,
    ambientColor: '#8fa8c8',
    ambientIntensity: 0.3,
    skyColor: '#ffd9b8',
    groundColor: '#4a4038',
    hemiIntensity: 0.65,
    background: '#e9b78e',
    fogColor: '#e6b294',
    fogNear: 380,
    fogFar: 2300,
    exposure: 1.08,
  },
  // Sun high and slightly south. The reference lighting everything else is judged against.
  daylight: {
    sunPosition: [120, 190, 90],
    sunColor: '#fff3e0',
    sunIntensity: 2.6,
    ambientColor: '#cfe3ff',
    ambientIntensity: 0.35,
    skyColor: '#bcd6ff',
    groundColor: '#8a7f6a',
    hemiIntensity: 0.9,
    background: '#9fc4dd',
    fogColor: '#a8c8dd',
    fogNear: 600,
    fogFar: 2600,
    exposure: 1.05,
  },
  // Low sun from the west, deeper and redder than dawn, sky pulling to violet.
  dusk: {
    sunPosition: [185, 40, -125],
    sunColor: '#ff8347',
    sunIntensity: 1.7,
    ambientColor: '#6b7fa8',
    ambientIntensity: 0.3,
    skyColor: '#ffb27f',
    groundColor: '#3b332c',
    hemiIntensity: 0.55,
    background: '#d2825f',
    fogColor: '#c1745a',
    fogNear: 330,
    fogFar: 2100,
    exposure: 1.1,
  },
  // Moonlight: dim, cool, and directional enough to still read shape. Exposure
  // is lifted so it stays legible rather than becoming a black screen.
  night: {
    sunPosition: [-110, 165, -120],
    sunColor: '#a8c0ea',
    sunIntensity: 0.55,
    ambientColor: '#3d4a6b',
    ambientIntensity: 0.26,
    skyColor: '#2a3a5c',
    groundColor: '#151a22',
    hemiIntensity: 0.4,
    background: '#141c2e',
    fogColor: '#141c2e',
    fogNear: 240,
    fogFar: 1750,
    exposure: 1.3,
  },
}

const store = createStore<TimeOfDay>('daylight')

export function setTimeOfDay(next: TimeOfDay): void {
  store.set(next)
}

export function getTimeOfDay(): TimeOfDay {
  return store.get()
}

export function useTimeOfDay(): TimeOfDay {
  return useStore(store)
}

export const timeOfDayStore = store
