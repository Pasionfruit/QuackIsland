/**
 * Where the camera stands, and why it never moves from there.
 *
 * Pure trigonometry, so the one thing that would ruin the game if it were
 * wrong - a corner of the arena off the edge of the screen, where somebody
 * could be caught out of sight - is arithmetic a test can check rather than
 * something you find out by looking.
 *
 * **Tilted, not overhead.** A straight-down view is a map; this is a room seen
 * from across it. The angle is measured up from the floor: 90 degrees would be
 * directly above, and `TILT` is sixty, so the camera sits high and back and
 * everything in the arena has a visible side as well as a top.
 *
 * It still never moves. The whole arena is in frame at all times and the
 * camera does not follow anybody, so nothing you can see is a thing you had to
 * earn by looking the right way.
 */
import { ARENA, HALF_H, HALF_W } from './arena'

/** Degrees up from the floor. Ninety would be straight down. */
export const TILT = 60

/** The lens. Narrow enough that the far end of the arena is not warped. */
export const FOV = 42

/**
 * How much room to leave around the arena, as a fraction of its size.
 *
 * Not decoration: bodies are a metre and a half tall and stand *up* out of the
 * floor, so a frame that exactly fits the floor cuts the heads off anybody at
 * the back.
 */
export const MARGIN = 1.12

const radians = (degrees: number) => (degrees * Math.PI) / 180

/**
 * The smallest circle the whole arena fits inside, centred on the middle.
 *
 * Framing against a sphere rather than against the corners is deliberately a
 * little generous: it means one number works at every camera angle and every
 * window shape, and the cost is some sky at the edges rather than a body
 * somebody cannot see.
 */
export const ARENA_RADIUS = Math.hypot(HALF_W, HALF_H) * MARGIN

export interface Shot {
  /** Where the camera stands. */
  x: number
  y: number
  z: number
  /** How far it is from the middle of the arena. */
  distance: number
}

/**
 * Where to stand to see all of it, in a window of the given shape.
 *
 * `aspect` is width over height. A tall narrow window is framed by its width,
 * a wide one by its height, so the limiting angle is whichever of the two is
 * smaller - get that backwards and the arena spills off the sides of a phone.
 *
 * The camera goes up and back along +Z, so the arena is seen from its near
 * edge looking across it.
 */
export function frameArena(aspect: number, fov: number = FOV): Shot {
  const safeAspect = Math.max(0.2, aspect)
  const halfVertical = radians(fov) / 2
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * safeAspect)
  const limiting = Math.min(halfVertical, halfHorizontal)

  const distance = ARENA_RADIUS / Math.sin(limiting)
  const up = radians(TILT)
  return {
    x: 0,
    y: Math.sin(up) * distance,
    z: Math.cos(up) * distance,
    distance,
  }
}

/**
 * Turns a heading on the floor into a turn about the up axis.
 *
 * The rules think in a flat x/y plane, where a heading of zero points along
 * +x. The world thinks in x/z, and a body with no rotation faces +z. This is
 * the one place that conversion happens, so the two can disagree about what
 * zero means without anything going cross-eyed.
 */
export function headingToYaw(heading: number): number {
  return Math.atan2(Math.cos(heading), Math.sin(heading))
}

/** Where the floor is, in world units, for anything that has to sit on it. */
export const FLOOR = {
  width: ARENA.width,
  depth: ARENA.height,
  /** How thick the slab is. It is drawn as a box so it has an edge to see. */
  thickness: 1,
  /** How high the walls stand. Tall enough to read as a room from this angle. */
  wallHeight: 2.2,
  wallThickness: 0.9,
  /** How tall a crate is. Head height, so they are worth hiding behind. */
  crateHeight: 1.9,
} as const
