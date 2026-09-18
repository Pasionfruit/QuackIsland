/**
 * The track, and where the camera stands to see it.
 *
 * The race is drawn as a running track: a lane each, start on the left and
 * the end of the feed on the right, and everybody walking along their lane as
 * they scroll - with their phone held up over their head. The camera stands
 * out front and above, looking down the lanes at a slant.
 *
 * Fitted the same way as I'll Just Wait's: slid along its line of sight until
 * the track touches the edge of the frame, and aimed so the space above and
 * below comes out even.
 */

export const TRACK = {
  /** Half the track's length: start at `-half`, the end of the feed at `half`. */
  half: 8,
  /** Lane width. */
  lane: 2,
  /** How high over a player their phone is held. */
  phoneY: 2.45,
} as const

/** Where lane `index` of `count` is, front to back. The first is at the back. */
export function laneZ(index: number, count: number): number {
  return (index - (Math.max(1, count) - 1) / 2) * TRACK.lane
}

/** Where along the track `progress` of `reels` is. */
export function trackX(progress: number, reels: number): number {
  const k = Math.min(1, Math.max(0, progress / Math.max(1, reels)))
  return -TRACK.half + k * TRACK.half * 2
}

/** The points that have to be in frame: the track, eight lanes of it, and the phones over it. */
export const POINTS: readonly [number, number, number][] = [
  [-TRACK.half - 1.2, 0, laneZ(0, 8) - TRACK.lane / 2],
  [TRACK.half + 1.2, 0, laneZ(0, 8) - TRACK.lane / 2],
  [-TRACK.half - 1.2, 0, laneZ(7, 8) + TRACK.lane / 2],
  [TRACK.half + 1.2, 0, laneZ(7, 8) + TRACK.lane / 2],
  [-TRACK.half - 0.8, TRACK.phoneY + 0.9, laneZ(0, 8)],
  [TRACK.half + 0.8, TRACK.phoneY + 0.9, laneZ(0, 8)],
]

/** Degrees down onto the track. */
export const TILT = 48
/** The lens. */
export const FOV = 40
/** How much of the frame, middle to edge, the scene may fill. */
export const FILL = 0.92

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
  const lookY = 1

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
