/**
 * Where the camera stands over the table, and what a click lands on.
 *
 * In front of the row of cups, raised, looking down at the table - high enough
 * that the cups' paths past each other can be followed, low enough that a cup
 * lifted off a face shows the face. The whole row in view the whole game, fitted
 * to however many cups are on the table.
 *
 * Fitted the same way as the other minigames' cameras: slid along its line of
 * sight until the table touches the edge of the frame, and aimed so the space
 * above and below comes out even.
 */
import { TABLE, cupCount, slotX } from './rules'

export interface Point {
  x: number
  y: number
  z: number
}

/** The table top's height. */
export const TOP = 1
/** A cup's height. */
export const CUP_HEIGHT = 1.35
/** How high a cup is lifted to show what is under it... */
export const LIFT = 1.7
/** ...and how far back it goes as it lifts, so the face under it is in plain view. */
export const LIFT_BACK = 1.5

/** The points that have to be in frame for a row of `cups`: its ends, with room for swaps and lifts. */
export function pointsFor(cups: number): [number, number, number][] {
  const half = Math.abs(slotX(0, cups)) + TABLE.cup + 0.8
  return [-half, half].flatMap((x) =>
    [-2.4, 2.4].flatMap((z) => [TOP - 0.2, TOP + CUP_HEIGHT + LIFT].map((y): [number, number, number] => [x, y, z])),
  )
}

/** The points for the most cups there can be. */
export const POINTS: readonly [number, number, number][] = pointsFor(cupCount(8))

/** Degrees up from the table. */
export const TILT = 42
/** The lens. */
export const FOV = 36
/** How much of the frame, middle to edge, the scene may fill. */
export const FILL = 0.95

/**
 * The slot a ray from the camera picks: the cup whose body it passes nearest,
 * within its radius and a little. Cups are tested as upright cylinders down on
 * the table.
 */
export function pickSlot(origin: Point, direction: Point, cups: number): number | null {
  const length = Math.hypot(direction.x, direction.y, direction.z)
  if (length === 0) return null
  const d = { x: direction.x / length, y: direction.y / length, z: direction.z / length }
  let best: { slot: number; along: number } | null = null
  for (let slot = 0; slot < cups; slot++) {
    const cx = slotX(slot, cups)
    // Sample the ray where it crosses the cup's height, and see if it is inside.
    for (const y of [TOP + 0.1, TOP + CUP_HEIGHT * 0.5, TOP + CUP_HEIGHT - 0.05]) {
      if (Math.abs(d.y) < 1e-6) continue
      const along = (y - origin.y) / d.y
      if (along <= 0) continue
      const x = origin.x + d.x * along
      const z = origin.z + d.z * along
      if (Math.hypot(x - cx, z) > TABLE.cup * 1.1) continue
      if (!best || along < best.along) best = { slot, along }
    }
  }
  return best ? best.slot : null
}

export interface Shot extends Point {
  target: Point
  distance: number
}

const radians = (d: number) => (d * Math.PI) / 180
let last: { aspect: number; cups: number; shot: Shot } | null = null

/** The camera for a window shape, fitted to a row of `cups` - the most there can be, if not given. */
export function frameScene(aspect: number, cups = cupCount(8)): Shot {
  const safeAspect = Math.max(0.2, Number.isFinite(aspect) ? aspect : 1)
  if (last && last.aspect === safeAspect && last.cups === cups) return last.shot
  const POINTS = pointsFor(cups)

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
    let low = -8
    let high = 8
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
  last = { aspect: safeAspect, cups, shot }
  return shot
}
