/**
 * The track, and where the camera stands to see it.
 *
 * A lane per racer, side by side, from a start line at the near end to a finish
 * line at the far end, and the traffic light over the finish. The camera stands
 * behind the start, raised, looking down the track the way everybody runs - so
 * the light is ahead of you, where it should be.
 *
 * Fitted the same way as the other minigames' cameras: slid along its line of
 * sight until the scene touches the edge of the frame, and aimed so the space
 * above and below comes out even. The scene here is the track, flat, plus the
 * light standing up at the far end - not a box, or the camera would leave room
 * for a light's height over the start line too.
 */

/** The track's sizes, in world units. The start is at z = 0 and the finish at z = -length. */
export const TRACK = {
  length: 26,
  lane: 2.1,
  /** How far behind the finish line the light stands. */
  lightBack: 2.2,
  /** How high the light's lamps are. */
  lightHeight: 6.4,
} as const

/** Where lane `index` of `count` runs, across. */
export function laneX(index: number, count: number): number {
  return (index - (Math.max(1, count) - 1) / 2) * TRACK.lane
}

/** How far down the track somebody is, from the start line, for a number of steps out of `of`. */
export function trackZ(steps: number, of: number): number {
  return -TRACK.length * Math.min(1, Math.max(0, steps / of))
}

const HALF = 4 * TRACK.lane + 0.6

/** The points that have to be in frame: the track's corners at ground and head height, and the light's top. */
export const POINTS: readonly [number, number, number][] = [
  ...[-HALF, HALF].flatMap((x) =>
    [1.6, -TRACK.length - 0.6].flatMap((z) => [0, 2].map((y): [number, number, number] => [x, y, z])),
  ),
  [-2.4, TRACK.lightHeight + 1.2, -TRACK.length - TRACK.lightBack],
  [2.4, TRACK.lightHeight + 1.2, -TRACK.length - TRACK.lightBack],
]

/** Degrees up from the track. Low enough to feel like looking down a track, high enough to tell the lanes apart. */
export const TILT = 26
/** The lens. */
export const FOV = 42
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
    let low = minZ
    let high = maxZ
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2
      if (lopsided(mid, distance) > 0) high = mid
      else low = mid
    }
    return (low + high) / 2
  }

  // The track is long and the camera is close to one end of it: the far points
  // pull the fit, so this settles over more rounds than a square arena does.
  let aim = (minZ + maxZ) / 2
  let distance = needed(aim)
  for (let i = 0; i < 24; i++) {
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
