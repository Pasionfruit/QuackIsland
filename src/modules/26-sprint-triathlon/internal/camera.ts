/**
 * The course, and where the camera stands to see it.
 *
 * The three legs laid end to end, left to right: a stretch of water, a stretch
 * of road, a stretch of running track, with a lane per racer across all three.
 * The camera stands in front of the course, raised, with the whole of it - start
 * to finish, every lane - in view the whole race.
 *
 * Fitted the same way as the other minigames' cameras: slid along its line of
 * sight until the course touches the edge of the frame, and aimed so the space
 * above and below comes out even.
 */

/** The course's sizes, in world units. */
export const TRACK = {
  /** Each leg's length, left to right. */
  leg: 12,
  /** A lane's width. */
  lane: 2.4,
} as const

/** Where the course starts and finishes, across. */
export const START_X = -TRACK.leg * 1.5
export const FINISH_X = TRACK.leg * 1.5

/** Where lane `index` of `count` runs, front to back. */
export function laneZ(index: number, count: number): number {
  return (index - (Math.max(1, count) - 1) / 2) * TRACK.lane
}

/** How far along the course a racer is, for their progress from 0 to 1. */
export function courseX(progress: number): number {
  return START_X + (FINISH_X - START_X) * Math.min(1, Math.max(0, progress))
}

const HALF_Z = 4 * TRACK.lane + 1

/** The points that have to be in frame: the course's corners, on the ground and at head height, and the arches' tops. */
export const POINTS: readonly [number, number, number][] = [
  ...[START_X - 1.5, FINISH_X + 1.5].flatMap((x) => [-HALF_Z, HALF_Z].flatMap((z) => [0, 2].map((y): [number, number, number] => [x, y, z]))),
  [FINISH_X, 4.6, -HALF_Z],
  [START_X, 4.6, -HALF_Z],
]

/** Degrees up from the ground. */
export const TILT = 50
/** The lens. */
export const FOV = 34
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
    let low = -HALF_Z - 6
    let high = HALF_Z + 6
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
