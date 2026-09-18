/**
 * The stage, and where the camera stands to see it.
 *
 * A big wall clock at the back of a stage - yours - and in front of it a row
 * of players, each with their own small clock over their head, showing what
 * it reads. The camera stands out front, a little raised, with the faces
 * square on: they are things you read to the minute.
 *
 * Fitted the same way as Time It's: slid along its line of sight until the
 * stage touches the edge of the frame, and aimed so the space above and below
 * comes out even.
 */

/** Where things stand on the stage. */
export const STAGE = {
  /** The clock's middle, its face's radius, and how far back it hangs. */
  clockY: 7.1,
  clockRadius: 3.2,
  clockZ: -3,
  /** The row of players: how far apart, and how far forward. */
  spacing: 1.75,
  rowZ: 2,
  /** Each player's own small clock: how high over them, and its radius. */
  smallY: 2.75,
  smallRadius: 0.62,
} as const

/** Where player `index` of `count` stands. */
export function standX(index: number, count: number): number {
  return (index - (Math.max(1, count) - 1) / 2) * STAGE.spacing
}

/**
 * The points that have to be in frame: the clock with its rim - and headroom
 * over it for the target, which sits at the top of the screen and must not
 * cover the twelve - and a row of eight under their small clocks.
 */
export const POINTS: readonly [number, number, number][] = [
  [-STAGE.clockRadius - 0.4, STAGE.clockY + STAGE.clockRadius + 2.4, STAGE.clockZ],
  [STAGE.clockRadius + 0.4, STAGE.clockY + STAGE.clockRadius + 2.4, STAGE.clockZ],
  [-STAGE.clockRadius - 0.4, STAGE.clockY - STAGE.clockRadius - 0.4, STAGE.clockZ],
  [STAGE.clockRadius + 0.4, STAGE.clockY - STAGE.clockRadius - 0.4, STAGE.clockZ],
  [standX(0, 8) - 0.8, 0, STAGE.rowZ + 0.6],
  [standX(7, 8) + 0.8, 0, STAGE.rowZ + 0.6],
  [standX(0, 8) - 0.8, STAGE.smallY + STAGE.smallRadius + 0.5, STAGE.rowZ],
  [standX(7, 8) + 0.8, STAGE.smallY + STAGE.smallRadius + 0.5, STAGE.rowZ],
]

/** Degrees up from the stage: low, to look the clock in the face. */
export const TILT = 12
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
  const lookY = STAGE.clockY * 0.55

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
