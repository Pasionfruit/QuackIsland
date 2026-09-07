/**
 * 00-core - the public contract.
 *
 * This file is the only part of this module anyone may import. Everything in
 * internal/ is private and may change without notice while this module is
 * still open; once it is frozen, this surface is fixed.
 */

export { CAMERA, CONVENTIONS, PRIORITY, type Priority } from './internal/conventions'
export { createRng, hashSeed } from './internal/rng'
// The three-line external store. Exported because a module that owns state the
// DOM has to read - the lobby, the camera mode - would otherwise write its own,
// and there would be four of them.
export { createStore, useStore, type Store } from './internal/store'
export { assetUrl } from './internal/assets'
export { useGameFrame, type FrameCallback } from './internal/frame'
export { readPerf, type PerfSample } from './internal/perf'
export {
  CYCLE_SECONDS,
  LIGHTING,
  SECTION_SECONDS,
  TIMES_OF_DAY,
  TIME_LABELS,
  advanceCycle,
  getDayTime,
  getTimeOfDay,
  getTimeScale,
  isCycleRunning,
  nameAt,
  normaliseTime,
  sectionAt,
  setCycleRunning,
  setDayTime,
  setTimeOfDay,
  setTimeScale,
  timeOf,
  useLightingSettings,
  type DaySection,
  type LightingPreset,
  type TimeOfDay,
} from './internal/lighting'
export { TIDE, TIDE_MAX, TIDE_RANGE, tideAt, tideRising } from './internal/tide'
export {
  WEATHER,
  WEATHER_FADE,
  WEATHER_KINDS,
  WEATHER_LABELS,
  applyWeather,
  blendWeather,
  getWeather,
  setWeather,
  useWeather,
  type LightingNumbers,
  type Precipitation,
  type WeatherKind,
  type WeatherPreset,
} from './internal/weather'
export { readSky, type SkyState } from './internal/Environment'
export { getCameraMode, setCameraMode, useCameraMode, type CameraMode } from './internal/view'
export { GameCanvas } from './internal/GameCanvas'
export { PerfHUD } from './internal/PerfHUD'

/**
 * One entry in the scene registry. The registry itself lives in
 * src/app/scene.ts, which is deliberately never frozen, so a new module adds
 * itself with a single line and never edits anyone else's.
 */
import type { ComponentType } from 'react'

export interface SceneEntry {
  /** Module id, e.g. '01-terrain'. */
  id: string
  /** Draw order. Lower renders first. Use the module number times ten. */
  order: number
  /** Turn a module off to inspect another one in isolation while gating it. */
  enabled: boolean
  /** Components may take optional props; the registry renders them bare. */
  Component: ComponentType
}
