/**
 * The stage, and where the camera stands to see it.
 *
 * A big stopwatch standing at the back of a stage, and in front of it a row of
 * players, each at a button. The camera stands out front, a little raised, with
 * the stopwatch's face square on and everybody in view.
 *
 * Fitted the same way as the other minigames' cameras: slid along its line of
 * sight until the stage touches the edge of the frame, and aimed so the space
 * above and below comes out even.
 */

/** Where things stand on the stage. */
export const STAGE = {
  /** The stopwatch's middle, its face's radius, and how far back it stands. */
  watchY: 4.4,
  watchRadius: 2.6,
  watchZ: -3,
  /** The row of players: how far apart, and how far forward. */
  spacing: 1.9,
  rowZ: 1.6,
} as const

/** Where player `index` of `count` stands. */
export function standX(index: number, count: number): number {
  return (index - (Math.max(1, count) - 1) / 2) * STAGE.spacing
}

/** The points that have to be in frame: the stopwatch with its crown, and a row of eight at their buttons. */
export const POINTS: readonly [number, number, number][] = [
  [-STAGE.watchRadius - 0.4, STAGE.watchY + STAGE.watchRadius + 0.9, STAGE.watchZ],
  [STAGE.watchRadius + 0.4, STAGE.watchY + STAGE.watchRadius + 0.9, STAGE.watchZ],
  [-STAGE.watchRadius - 0.4, 0, STAGE.watchZ],
  [STAGE.watchRadius + 0.4, 0, STAGE.watchZ],
  [standX(0, 8) - 1, 0, STAGE.rowZ + 1],
  [standX(7, 8) + 1, 0, STAGE.rowZ + 1],
  [standX(0, 8) - 1, 1.8, STAGE.rowZ],
  [standX(7, 8) + 1, 1.8, STAGE.rowZ],
]

/** Degrees up from the stage: low, to look the stopwatch in the face. */
export const TILT = 16
/** The lens. */
export const FOV = 40
/** How much of the frame, middle to edge, the scene may fill. */
export const FILL = 0.94

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
  // The camera looks at a height, not the floor: about the middle of what it frames.
  const lookY = STAGE.watchY * 0.55

  const needed = (aim: number) => {
    let most = 0
    for (const [x, y0, z] of POINTS) {
      const y = y0 - lookY
      const along = y * back.y + (z - aim) * back.z
      const high = y * screenUp.y + (z - aim) * screenUp.z
      most = Math.max(most, along + Math.abs(x) / tanH, along + Math.abs(high) / tanV)
    }
    return most
  }
  const lopsided = (aim: number, distance: number) => {
    let top = -Infinity
    let bottom = Infinity
    for (const [, y0, z] of POINTS) {
      const y = y0 - lookY
      const along = y * back.y + (z - aim) * back.z
      const high = (y * screenUp.y + (z - aim) * screenUp.z) / (distance - along)
      top = Math.max(top, high)
      bottom = Math.min(bottom, high)
    }
    return top + bottom
  }
  const centred = (distance: number) => {
    let low = -12
    let high = 12
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
    y: lookY + back.y * distance,
    z: aim + back.z * distance,
    target: { x: 0, y: lookY, z: aim },
    distance,
  }
  last = { aspect: safeAspect, shot }
  return shot
}
