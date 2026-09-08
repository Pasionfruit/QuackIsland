/**
 * Where the camera goes, in both views.
 *
 * Pure, because the last time a direction was worked out by hand in this
 * module it was wrong at every angle and looked plausible at one. Both views
 * are built from the same forward vector here, so first person and third
 * person cannot disagree about which way `yaw` points - which is the failure
 * that would make the toggle feel like the controls inverted.
 */
import { createStore, useStore } from '../../00-core'

export type ViewMode = 'first' | 'third'

export const VIEW_MODES: readonly ViewMode[] = ['first', 'third']

export const VIEW = {
  /** How far the camera keeps off the ground, in third person only. */
  groundClearance: 1.2,
  /**
   * How far in front of the eyes the first-person camera looks.
   *
   * Any positive number gives the same direction; it only has to be far enough
   * that floating-point noise in the difference does not matter.
   */
  aimDistance: 10,
  /**
   * Pitch limits, per view.
   *
   * Third person cannot look far up because the camera would end up under the
   * ground behind the player. First person has no such problem, so it gets
   * most of the way to straight up and down - and being unable to look up at
   * the sky in a game with a sky in it would be a strange restriction.
   */
  pitch: {
    third: { min: -0.5, max: 1.05 },
    first: { min: -1.35, max: 1.35 },
  },
} as const

/** The camera rig: where it is pointing and how far back it sits. */
export interface RigState {
  /** Radians. Forward is `(sin(yaw), cos(yaw))`, matching the controller. */
  yaw: number
  /** Radians. Positive looks *down*. */
  pitch: number
  distance: number
  panX: number
  panZ: number
}

export interface Placement {
  x: number
  y: number
  z: number
  lookX: number
  lookY: number
  lookZ: number
}

/**
 * The direction the camera looks, from the rig.
 *
 * One definition, used by both views. Positive pitch looks down, which is the
 * convention the third-person rig already used: it lifts the camera up and
 * aims it back at the player.
 */
export function lookDirection(yaw: number, pitch: number): [number, number, number] {
  const flat = Math.cos(pitch)
  return [Math.sin(yaw) * flat, -Math.sin(pitch), Math.cos(yaw) * flat]
}

/** Keeps the pitch inside what the current view can cope with. */
export function clampPitch(mode: ViewMode, pitch: number): number {
  const limits = VIEW.pitch[mode]
  return Math.min(limits.max, Math.max(limits.min, pitch))
}

/**
 * Where the camera should be and what it should look at.
 *
 * `eyeHeight` and `groundAt` are passed in rather than imported so this stays
 * pure and testable against flat ground.
 */
export function placeCamera(
  mode: ViewMode,
  rig: RigState,
  player: { x: number; y: number; z: number },
  eyeHeight: number,
  groundAt?: (x: number, z: number) => number,
): Placement {
  const [dx, dy, dz] = lookDirection(rig.yaw, rig.pitch)

  if (mode === 'first') {
    // At the eyes, looking along the rig. No panning and no zoom: sliding your
    // own head sideways is not a thing, and there is nothing to zoom out from.
    const x = player.x
    const y = player.y + eyeHeight
    const z = player.z
    return {
      x,
      y,
      z,
      lookX: x + dx * VIEW.aimDistance,
      lookY: y + dy * VIEW.aimDistance,
      lookZ: z + dz * VIEW.aimDistance,
    }
  }

  // Third person: the camera sits back along the look direction and aims at
  // the player, so forward in the controller is always away from the camera.
  const focusX = player.x + rig.panX
  const focusZ = player.z + rig.panZ
  // The eyes: the same point it will aim at, so the view really does run along
  // the rig. An earlier version orbited around 2.6 m and aimed at eye height,
  // which tilted the real view five degrees below the rig at normal zoom and
  // thirteen at close zoom - so swapping to first person jumped the horizon.
  const focusY = player.y + eyeHeight

  let x = focusX - dx * rig.distance
  let y = focusY - dy * rig.distance
  let z = focusZ - dz * rig.distance

  if (groundAt) {
    const floor = groundAt(x, z) + VIEW.groundClearance
    if (y < floor) y = floor
  }

  return {
    x,
    y,
    z,
    lookX: focusX,
    lookY: focusY,
    lookZ: focusZ,
  }
}

const store = createStore<ViewMode>('third')

export function setViewMode(next: ViewMode): void {
  store.set(next)
}

export function getViewMode(): ViewMode {
  return store.get()
}

export function toggleViewMode(): void {
  store.set(store.get() === 'third' ? 'first' : 'third')
}

export function useViewMode(): ViewMode {
  return useStore(store)
}
