/**
 * Where the camera stands, and why it never moves.
 *
 * Low at the near end of the arena, looking across it - a shooting gallery,
 * not a map. Balloons rise up the view rather than towards it, so every one of
 * them is a round target with its colour and shape facing you, the whole
 * arena is in view the whole game, and a balloon never drifts out of sight
 * behind the camera.
 *
 * Fitted the same way as the other minigames' cameras: slid along its line of
 * sight until a corner of the arena, floor to ceiling, touches the edge of the
 * frame, and aimed so the space above and below comes out even.
 */
import { BOUNDS } from './arena'

/** Degrees up from the floor. Low: you look across the arena at the balloons, not down on them. */
export const TILT = 22
/** The lens. */
export const FOV = 45
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
