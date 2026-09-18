/**
 * The tower, and where the camera stands to see it.
 *
 * One wide staircase going down from left to right: the top step, twenty, at the
 * left, the ground at the right. Every player has a lane of it, one behind the
 * other, host at the front. Everybody starts together up at the top left and
 * hops down and to the right; anybody who reaches the bottom stands on the
 * ground past the last step.
 *
 * The camera stands out front and well up. Well up so a lane's player never
 * hides the one behind: a player's head is lower than the line of sight over
 * them to the next lane's feet. At every x all the lanes are the same height, so
 * the staircase never hides a player either.
 *
 * Fitted the same way as the other minigames' cameras: slid along its line of
 * sight until the tower touches the edge of the frame, and aimed so the space
 * above and below comes out even.
 */
import { TOWER } from './rules'

export const STAIRS = {
  /** How far along a step is, and how high. */
  tread: 0.95,
  rise: 0.42,
  /** How far apart the lanes are, front to back. */
  lane: 1.45,
  /** The players' size on the staircase, against their size on the island. */
  scale: 0.8,
  /** A player's height and radius at that size. */
  height: 1.8 * 0.8,
  radius: 0.4 * 0.8,
} as const

/** The most lanes there are. */
export const LANES = 8

/** Where the middle of step `step` is along the staircase; step 0 is the ground past the bottom. */
export function stepX(step: number): number {
  return (TOWER.steps / 2 - step) * STAIRS.tread
}

/** The height of the top of step `step`. */
export function stepY(step: number): number {
  return Math.max(0, step) * STAIRS.rise
}

/** Where lane `index` of `count` is, front to back; the first lane is at the front. */
export function laneZ(index: number, count: number): number {
  return ((Math.max(1, count) - 1) / 2 - index) * STAIRS.lane
}

/** The points that have to be in frame for `lanes` lanes: the whole staircase with players and their bubbles on it, and the ground at the bottom. */
export function pointsFor(lanes: number): [number, number, number][] {
  const count = Math.max(1, Math.min(LANES, lanes))
  const front = laneZ(0, count) + STAIRS.lane / 2
  const back = laneZ(count - 1, count) - STAIRS.lane / 2
  const left = stepX(TOWER.steps) - STAIRS.tread / 2
  const right = stepX(0) + STAIRS.tread * 0.6
  const top = STAIRS.height + 0.85
  const points: [number, number, number][] = []
  for (const z of [front, back]) {
    points.push([left, 0, z], [left, stepY(TOWER.steps) + top, z], [right, 0, z], [right, top, z])
  }
  return points
}

/** The points for the most lanes there can be. */
export const POINTS: readonly [number, number, number][] = pointsFor(LANES)

/** Degrees up from the ground. */
export const TILT = 48
/** The lens. */
export const FOV = 36
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
let last: { aspect: number; lanes: number; shot: Shot } | null = null

/** The camera for a window shape, fitted to `lanes` lanes - the most there can be, if not given. */
export function frameScene(aspect: number, lanes = LANES): Shot {
  const safeAspect = Math.max(0.2, Number.isFinite(aspect) ? aspect : 1)
  if (last && last.aspect === safeAspect && last.lanes === lanes) return last.shot
  const POINTS = pointsFor(lanes)

  const tanV = Math.tan(radians(FOV) / 2) * FILL
  const tanH = tanV * safeAspect
  const up = radians(TILT)
  const back = { y: Math.sin(up), z: Math.cos(up) }
  const screenUp = { y: Math.cos(up), z: -Math.sin(up) }
  // The camera looks at a height, not the floor: about the middle of the tower.
  const lookY = stepY(TOWER.steps) * 0.45
  // And straight on at the middle of the staircase's length.
  const lookX = (POINTS[0][0] + POINTS[2][0]) / 2

  const needed = (aim: number) => {
    let most = 0
    for (const [x0, y0, z] of POINTS) {
      const x = x0 - lookX
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
    x: lookX,
    y: lookY + back.y * distance,
    z: aim + back.z * distance,
    target: { x: lookX, y: lookY, z: aim },
    distance,
  }
  last = { aspect: safeAspect, lanes, shot }
  return shot
}

/**
 * Where a player is drawn, `t` of the way through a hop from step `from` to step
 * `to`: along and down, with an arc over the top - a higher one the further the
 * drop. At `to` 0 they land on the ground past the bottom.
 */
export function hopAt(from: number, to: number, t: number): { x: number; y: number } {
  const k = Math.min(1, Math.max(0, t))
  const ease = k * k * (3 - 2 * k)
  const x = stepX(from) + (stepX(to) - stepX(from)) * ease
  // Height eased with the distance along, so the feet follow the line of the treads...
  const base = stepY(from) + (stepY(to) - stepY(from)) * ease
  // ...and lifted clear of the corners between.
  const arc = from === to ? 0 : (0.6 + 0.1 * Math.abs(from - to)) * 4 * k * (1 - k)
  return { x, y: base + arc }
}

/**
 * Where a player walking from step `from` down to step `to` is, `time` seconds
 * after setting off: one hop down a step every `perStep` seconds.
 */
export function walkAt(from: number, to: number, time: number, perStep: number): { x: number; y: number } {
  const steps = from - to
  if (steps <= 0 || time <= 0) return hopAt(from, from, 1)
  const done = Math.min(steps - 1, Math.floor(time / perStep))
  return hopAt(from - done, from - done - 1, (time - done * perStep) / perStep)
}
