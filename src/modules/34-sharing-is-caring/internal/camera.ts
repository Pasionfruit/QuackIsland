/**
 * Where the camera stands, and why it never moves.
 *
 * High and back from the arena, tilted so you can judge how close you are to
 * the wearer - which is the whole game - while the whole arena, wall to wall,
 * is in view for the whole round. Nobody can run off with the crown out of
 * sight.
 *
 * Fitted the same way as the other minigames' cameras: slid along its line of
 * sight until the arena touches the edge of the frame, and aimed so the space
 * above and below comes out even.
 */
import { ARENA } from './rules'

/** The arena, wall to wall, from a little under its floor to a crown on a head above. */
export const BOUNDS = {
  minX: -ARENA.radius - 0.8,
  maxX: ARENA.radius + 0.8,
  minZ: -ARENA.radius - 0.8,
  maxZ: ARENA.radius + 0.8,
  minY: -0.8,
  maxY: 2.6,
} as const

/** Degrees up from the arena. Steep enough to judge the gap between two bodies. */
export const TILT = 58
/** The lens. */
export const FOV = 40
/** How much of the frame, middle to edge, the scene may fill. */
export const FILL = 0.95

export interface Shot {
  x: number
  y: number
  z: number
  target: { x: number; y: number; z: number }
  distance: number
}

const radians = (d: number) => (d * Math.PI) / 180
let last: { aspect: number; shot: Shot } | null = null

/** The scene's corners, as offsets from its middle across. */
function corners(): [number, number, number][] {
  const out: [number, number, number][] = []
  const middleX = (BOUNDS.minX + BOUNDS.maxX) / 2
  for (const x of [BOUNDS.minX, BOUNDS.maxX]) {
    for (const z of [BOUNDS.minZ, BOUNDS.maxZ]) {
      for (const y of [BOUNDS.minY, BOUNDS.maxY]) out.push([x - middleX, y, z])
    }
  }
  return out
}

export function frameScene(aspect: number): Shot {
  const safeAspect = Math.max(0.2, Number.isFinite(aspect) ? aspect : 1)
  if (last && last.aspect === safeAspect) return last.shot

  const tanV = Math.tan(radians(FOV) / 2) * FILL
  const tanH = tanV * safeAspect
  const up = radians(TILT)
  const back = { y: Math.sin(up), z: Math.cos(up) }
  const screenUp = { y: Math.cos(up), z: -Math.sin(up) }
  const points = corners()

  const needed = (aim: number) => {
    let most = 0
    for (const [x, y, z] of points) {
      const along = y * back.y + (z - aim) * back.z
      const high = y * screenUp.y + (z - aim) * screenUp.z
      most = Math.max(most, along + Math.abs(x) / tanH, along + Math.abs(high) / tanV)
    }
    return most
  }
  const lopsided = (aim: number, distance: number) => {
    let top = -Infinity
    let bottom = Infinity
    for (const [, y, z] of points) {
      const along = y * back.y + (z - aim) * back.z
      const high = (y * screenUp.y + (z - aim) * screenUp.z) / (distance - along)
      top = Math.max(top, high)
      bottom = Math.min(bottom, high)
    }
    return top + bottom
  }
  const centred = (distance: number) => {
    let low = BOUNDS.minZ
    let high = BOUNDS.maxZ
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2
      if (lopsided(mid, distance) > 0) high = mid
      else low = mid
    }
    return (low + high) / 2
  }

  let aim = (BOUNDS.minZ + BOUNDS.maxZ) / 2
  let distance = needed(aim)
  for (let i = 0; i < 12; i++) {
    aim = centred(distance)
    distance = needed(aim)
  }

  const middleX = (BOUNDS.minX + BOUNDS.maxX) / 2
  const shot: Shot = {
    x: middleX,
    y: back.y * distance,
    z: aim + back.z * distance,
    target: { x: middleX, y: 0, z: aim },
    distance,
  }
  last = { aspect: safeAspect, shot }
  return shot
}
