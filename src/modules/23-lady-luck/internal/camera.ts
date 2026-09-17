/**
 * Where the camera stands over the field, and what a click lands on.
 *
 * High over the meadow and steep, so every clover is seen from nearly above -
 * three leaves or four has to be something you can tell by looking - with the
 * whole field in view the whole round.
 *
 * Fitted the same way as the other minigames' cameras: slid along its line of
 * sight until the field touches the edge of the frame, and aimed so the space
 * above and below comes out even.
 */
import { FIELD } from './rules'

export interface Point {
  x: number
  y: number
  z: number
}

/** The field's half-width and half-depth, a clover's reach past the outermost ones. */
export const HALF = {
  x: ((FIELD.columns - 1) * FIELD.spacing) / 2 + FIELD.jitter + 0.6,
  z: ((FIELD.rows - 1) * FIELD.spacing) / 2 + FIELD.jitter + 0.6,
} as const

/** The points that have to be in frame: the field's corners, on the ground and a leaf's height up. */
export const POINTS: readonly [number, number, number][] = [-HALF.x, HALF.x].flatMap((x) =>
  [-HALF.z, HALF.z].flatMap((z) => [0, 0.2].map((y): [number, number, number] => [x, y, z])),
)

/** Degrees up from the field. Steep: clovers are told apart from above. */
export const TILT = 66
/** The lens. */
export const FOV = 36
/** How much of the frame, middle to edge, the scene may fill. */
export const FILL = 0.97

/** Where a ray from the camera meets the ground, or null if it never does. */
export function groundHit(origin: Point, direction: Point): { x: number; z: number } | null {
  if (direction.y >= -1e-6) return null
  const along = -origin.y / direction.y
  return { x: origin.x + direction.x * along, z: origin.z + direction.z * along }
}

export interface Shot extends Point {
  target: Point
  distance: number
}

const radians = (d: number) => (d * Math.PI) / 180
let last: { aspect: number; shot: Shot } | null = null

export function frameScene(aspect: number): Shot {
  const safeAspect = Math.max(0.2, Number.isFinite(aspect) ? aspect : 1)
  if (last && last.aspect === safeAspect) return last.shot

  const tanV = Math.tan(radians(FOV) / 2) * FILL
  const tanH = tanV * safeAspect
  const up = radians(TILT)
  const back = { y: Math.sin(up), z: Math.cos(up) }
  const screenUp = { y: Math.cos(up), z: -Math.sin(up) }

  const needed = (aim: number) => {
    let most = 0
    for (const [x, y, z] of POINTS) {
      const along = y * back.y + (z - aim) * back.z
      const high = y * screenUp.y + (z - aim) * screenUp.z
      most = Math.max(most, along + Math.abs(x) / tanH, along + Math.abs(high) / tanV)
    }
    return most
  }
  const lopsided = (aim: number, distance: number) => {
    let top = -Infinity
    let bottom = Infinity
    for (const [, y, z] of POINTS) {
      const along = y * back.y + (z - aim) * back.z
      const high = (y * screenUp.y + (z - aim) * screenUp.z) / (distance - along)
      top = Math.max(top, high)
      bottom = Math.min(bottom, high)
    }
    return top + bottom
  }
  const centred = (distance: number) => {
    let low = -HALF.z - 4
    let high = HALF.z + 4
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2
      if (lopsided(mid, distance) > 0) high = mid
      else low = mid
    }
    return (low + high) / 2
  }

  let aim = 0
  let distance = needed(aim)
  for (let i = 0; i < 16; i++) {
    aim = centred(distance)
    distance = needed(aim)
  }

  const shot: Shot = {
    x: 0,
    y: back.y * distance,
    z: aim + back.z * distance,
    target: { x: 0, y: 0, z: aim },
    distance,
  }
  last = { aspect: safeAspect, shot }
  return shot
}
