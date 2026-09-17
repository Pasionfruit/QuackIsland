/**
 * Where the camera stands to see the tower and its web.
 *
 * High and to the front, looking down on the tower top - where everybody walks
 * and the strings are cut - with the whole web out to the poles in view the
 * whole game, so a string can be followed from the rim to its pole,
 * and nobody is launched out of sight.
 *
 * Fitted the same way as the other minigames' cameras: slid along its line of
 * sight until the scene touches the edge of the frame, and aimed so the space
 * above and below comes out even.
 */
import { TOWER } from './rules'

export interface Point {
  x: number
  y: number
  z: number
}

/** The points that have to be in frame: rings round the poles at their feet and tops, and heads on the tower top's rim. */
export const POINTS: readonly [number, number, number][] = [
  ...Array.from({ length: 32 }, (_, i): [number, number, number] => {
    const a = (i / 16) * Math.PI * 2
    return [Math.cos(a) * (TOWER.far[1] + 0.6), i < 16 ? 0 : TOWER.high[1] + 0.5, Math.sin(a) * (TOWER.far[1] + 0.6)]
  }),
  ...Array.from({ length: 16 }, (_, i): [number, number, number] => {
    const a = (i / 16) * Math.PI * 2
    return [Math.cos(a) * TOWER.radius, TOWER.height + 2, Math.sin(a) * TOWER.radius]
  }),
]

/** Degrees up from the ground. Steep, to see the tower top and the strings leaving it. */
export const TILT = 60
/** The lens. */
export const FOV = 40
/** How much of the frame, middle to edge, the scene may fill. */
export const FILL = 0.96

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
  const zs = POINTS.map((p) => p[2])
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)

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
    let low = minZ - 4
    let high = maxZ + 4
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2
      if (lopsided(mid, distance) > 0) high = mid
      else low = mid
    }
    return (low + high) / 2
  }

  let aim = 0
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
