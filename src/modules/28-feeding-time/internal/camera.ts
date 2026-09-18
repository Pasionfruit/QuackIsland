/**
 * Where the camera stands: behind the bank, over everybody's shoulders, looking
 * out across the pond - the way you throw. The whole pond and the bank in view
 * the whole round.
 *
 * Fitted the same way as the other minigames' cameras: slid along its line of
 * sight until the scene touches the edge of the frame, and aimed so the space
 * above and below comes out even.
 */
import { POND } from './rules'

/** The points that have to be in frame: round the pond's edge, and the bank with everybody on it. */
export const POINTS: readonly [number, number, number][] = [
  ...Array.from({ length: 16 }, (_, i): [number, number, number] => {
    const a = (i / 16) * Math.PI * 2
    return [Math.cos(a) * (POND.radiusX + 0.6), 0, POND.centreZ + Math.sin(a) * (POND.radiusZ + 0.6)]
  }),
  [-(POND.spot * 3.5 + 1), 1.8, POND.standZ + 0.8],
  [POND.spot * 3.5 + 1, 1.8, POND.standZ + 0.8],
  [-(POND.spot * 3.5 + 1), 0, POND.standZ + 0.8],
  [POND.spot * 3.5 + 1, 0, POND.standZ + 0.8],
]

/** Degrees up from the ground: a throw goes up the screen and out across the water. */
export const TILT = 40
/** The lens. */
export const FOV = 40
/** How much of the frame, middle to edge, the scene may fill. */
export const FILL = 0.96

export interface Shot {
  x: number
  y: number
  z: number
  target: { x: number; y: number; z: number }
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
    let low = POND.centreZ - POND.radiusZ - 4
    let high = POND.standZ + 4
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2
      if (lopsided(mid, distance) > 0) high = mid
      else low = mid
    }
    return (low + high) / 2
  }

  let aim = POND.centreZ / 2
  let distance = needed(aim)
  for (let i = 0; i < 20; i++) {
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

/**
 * The spot on the ground under a point of the view - 0 to 1 across and down -
 * seen through the camera `frameScene` gives for that shape of view. Null for a
 * point above the horizon, which never hits the ground.
 */
export function groundAt(across: number, down: number, aspect: number): { x: number; z: number } | null {
  const shot = frameScene(aspect)
  const safeAspect = Math.max(0.2, Number.isFinite(aspect) ? aspect : 1)
  const tanV = Math.tan(radians(FOV) / 2)
  // The camera looks straight down the middle (x = 0), so its right is +x.
  const f = { x: shot.target.x - shot.x, y: shot.target.y - shot.y, z: shot.target.z - shot.z }
  const length = Math.hypot(f.x, f.y, f.z)
  f.x /= length
  f.y /= length
  f.z /= length
  const right = { x: 1, y: 0, z: 0 }
  // Up on the screen: right × forward.
  const up = { x: 0, y: -f.z, z: f.y }
  const sx = (across * 2 - 1) * tanV * safeAspect
  const sy = (1 - down * 2) * tanV
  const dir = { x: f.x + right.x * sx + up.x * sy, y: f.y + up.y * sy, z: f.z + up.z * sy }
  if (dir.y >= -1e-6) return null
  const s = -shot.y / dir.y
  return { x: shot.x + dir.x * s, z: shot.z + dir.z * s }
}
