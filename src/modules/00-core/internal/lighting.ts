/**
 * The day, and where in it we are.
 *
 * Lighting is singular - one sun, one sky - so it lives here with the camera
 * and the render loop rather than in a content module. A later sky module
 * drives it through these setters instead of installing lights of its own,
 * which is the seam that stops two modules fighting over the sun.
 *
 * Time runs 0..1 through dawn, daylight, dusk and night, a quarter each. The
 * section maths is pure and has no three.js in it, so it is tested in Node;
 * the colour blending lives in Environment.tsx where Color exists.
 */
import { createStore, useStore } from './store'

export type TimeOfDay = 'dawn' | 'daylight' | 'dusk' | 'night'

/** In the order the sun actually moves. */
export const TIMES_OF_DAY: readonly TimeOfDay[] = ['dawn', 'daylight', 'dusk', 'night']

export const TIME_LABELS: Record<TimeOfDay, string> = {
  dawn: 'Dawn',
  daylight: 'Daylight',
  dusk: 'Dusk',
  night: 'Night',
}

/** A full turn of the day, in seconds. One hour. */
export const CYCLE_SECONDS = 60 * 60
/** Fifteen minutes in each of the four. */
export const SECTION_SECONDS = CYCLE_SECONDS / TIMES_OF_DAY.length

export interface LightingPreset {
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

export interface DaySection {
  from: TimeOfDay
  to: TimeOfDay
  /** How far between the two, already eased. 0 is squarely `from`. */
  blend: number
}

/** Eases so the day lingers near each named time and moves through the change between. */
function ease(f: number): number {
  return f * f * (3 - 2 * f)
}

/** Wraps into [0, 1), so callers never have to think about it. */
export function normaliseTime(t: number): number {
  if (!Number.isFinite(t)) return 0
  return ((t % 1) + 1) % 1
}

/**
 * Which two times of day we are between, and how far.
 *
 * Pure, so the section boundaries can be checked without rendering anything.
 */
export function sectionAt(t: number): DaySection {
  const n = TIMES_OF_DAY.length
  const p = normaliseTime(t) * n
  const i = Math.min(n - 1, Math.floor(p))
  return {
    from: TIMES_OF_DAY[i],
    to: TIMES_OF_DAY[(i + 1) % n],
    blend: ease(p - i),
  }
}

/** The nearest named time, for labelling. */
export function nameAt(t: number): TimeOfDay {
  const s = sectionAt(t)
  return s.blend < 0.5 ? s.from : s.to
}

/** Where in the cycle a named time sits. */
export function timeOf(name: TimeOfDay): number {
  return TIMES_OF_DAY.indexOf(name) / TIMES_OF_DAY.length
}

/**
 * The clock.
 *
 * `t` changes every frame while the cycle is running, so it is deliberately
 * NOT in the reactive store - a subscriber would re-render sixty times a
 * second. The panel polls it instead. Only the discrete settings notify.
 */
const clock = {
  t: timeOf('daylight'),
  auto: true,
  /**
   * How many times faster than real. A full hour is unwatchable when you are
   * trying to check that dusk looks right, so this exists for gating as much
   * as for play.
   */
  scale: 1,
}

const settings = createStore(0)
const bump = () => settings.set(settings.get() + 1)

export function getDayTime(): number {
  return clock.t
}

export function setDayTime(t: number): void {
  clock.t = normaliseTime(t)
  bump()
}

export function isCycleRunning(): boolean {
  return clock.auto
}

export function setCycleRunning(on: boolean): void {
  clock.auto = on
  bump()
}

export function getTimeScale(): number {
  return clock.scale
}

export function setTimeScale(scale: number): void {
  clock.scale = Math.max(0, scale)
  bump()
}

/** Jump to a named time. Used by the labelled buttons. */
export function setTimeOfDay(name: TimeOfDay): void {
  setDayTime(timeOf(name))
}

export function getTimeOfDay(): TimeOfDay {
  return nameAt(clock.t)
}

/** Advances the clock. Called once a frame by the renderer; a no-op when paused. */
export function advanceCycle(deltaSeconds: number): void {
  if (!clock.auto || clock.scale === 0) return
  const d = Math.min(Math.max(deltaSeconds, 0), 0.25)
  clock.t = normaliseTime(clock.t + (d * clock.scale) / CYCLE_SECONDS)
}

/** Re-renders only when a discrete setting changes, never on the clock ticking. */
export function useLightingSettings(): number {
  return useStore(settings)
}
