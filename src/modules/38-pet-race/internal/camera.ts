/**
 * Where the camera is, which is behind your own animal.
 *
 * A two-hundred-metre course cannot be watched from one fixed spot, so this is
 * the one minigame here with a camera that moves. It **does not turn**: it sits
 * behind and above your pet looking straight down the course, and slides across
 * with you. A camera that swung round to whatever the pet was facing would make
 * a weaving rabbit unwatchable, and would hide the gate you are aiming at.
 *
 * It holds back from the middle - `LEAN` - so that running near a fence still
 * shows you the fence rather than putting you in the middle of a half-empty
 * frame, and it pulls back on a narrow window so the track's full width is
 * always in shot.
 *
 * Pure: numbers in, numbers out, no three.js and no state.
 */
import { TRACK } from './course'

export const FOV = 52
/** How high above the ground. */
export const HEIGHT = 6.3
/** How far back up the course. */
export const BACK = 11
/** How far ahead of the pet the camera looks. */
export const AHEAD = 11
/** How much of your pet's drift across the track the camera follows: 1 would pin it to the middle. */
export const LEAN = 0.62
/** The window this framing was chosen for. Narrower than this and the camera pulls back. */
export const BASE_ASPECT = 16 / 9

export interface Shot {
  x: number
  y: number
  z: number
  target: { x: number; y: number; z: number }
}

/**
 * Where to stand to watch a pet at `x`, `z`.
 *
 * `aspect` is the canvas's width over its height. On anything narrower than
 * `BASE_ASPECT` the camera steps back by the ratio, which is what keeps both
 * fences in frame on a tall window instead of cropping the course.
 */
export function chase(x: number, z: number, aspect: number): Shot {
  const safe = Math.max(0.3, Number.isFinite(aspect) ? aspect : BASE_ASPECT)
  const pull = Math.max(1, BASE_ASPECT / safe)
  const across = x * LEAN
  return {
    x: across,
    y: HEIGHT * Math.min(1.5, pull),
    z: z + BACK * pull,
    target: { x: across, y: 1.1, z: z - AHEAD },
  }
}

/**
 * The spot the camera watches from before there is anything to chase - the
 * table is up, and the start line is what there is to look at.
 */
export function atTheLine(aspect: number): Shot {
  return chase(0, 2, aspect)
}

/**
 * How far down the course to draw fog from, so the far end fades rather than
 * popping in.
 *
 * Far enough out that the two or three bands of hedges you are actually driving
 * at are drawn plainly: fog close enough to soften them is fog that hides the
 * gate you are aiming for, which is the one thing on the course you have to be
 * able to see.
 */
export const FOG = { near: 74, far: 205 } as const

/** The whole course as a box, for anything that wants to know how big the world is. */
export const BOUNDS = {
  minX: -TRACK.width / 2,
  maxX: TRACK.width / 2,
  minZ: -TRACK.length - TRACK.runOff,
  maxZ: TRACK.runUp,
} as const
