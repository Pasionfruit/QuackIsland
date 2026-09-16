/**
 * Where the camera stands, and why it never moves from there.
 *
 * The whole maze is in view for the whole race. Nobody has to find anybody,
 * and seeing where the others are - who is about to reach a platform, who took
 * the wrong turn - is half of what makes it a race rather than four people
 * alone in four mazes.
 *
 * **Steeper than Zombie Tag.** A maze is corridors, and at a shallow angle the
 * walls hide the corridor behind them. `TILT` is high enough to see down every
 * corridor, and the walls are low - see `WALL_HEIGHT` - so bodies stand above
 * them; low enough that the walls still have sides and it reads as a place.
 *
 * Pure trigonometry, and fitted exactly: the camera slides along its line of
 * sight until a corner of the maze touches the edge of the frame, and aims
 * where the sky above and below comes out even.
 */
import { HALF } from './maze'

/** Degrees up from the floor. Ninety would be straight down. */
export const TILT = 66

/** The lens. */
export const FOV = 38

/** How much of the frame, middle to edge, the maze may fill. */
export const FILL = 0.97

/** How tall a wall stands. Lower than a body, so nobody is ever behind one. */
export const WALL_HEIGHT = 0.9

/** How thick the floor slab is. Drawn as a box so the maze has an edge. */
export const SLAB = 0.6

/** The top of a body, which has to be in frame at the far wall too. */
const HEAD = 1.6

export interface Shot {
  x: number
  y: number
  z: number
  target: { x: number; y: number; z: number }
  distance: number
}

const radians = (degrees: number) => (degrees * Math.PI) / 180

let last: { aspect: number; shot: Shot } | null = null

/**
 * Where to stand to fill a window of this shape with the maze.
 *
 * `aspect` is width over height. For each corner of the maze, slab to head
 * height, there is a least distance at which it is inside the frame; the
 * camera takes the largest. The aim is then slid along the depth until the
 * top and bottom of the maze sit the same distance from the edges - at an
 * angle the near side comes out bigger than the far one - and the two are
 * settled against each other a few times.
 */
export function frameMaze(aspect: number): Shot {
  const safeAspect = Math.max(0.2, Number.isFinite(aspect) ? aspect : 1)
  if (last && last.aspect === safeAspect) return last.shot

  const tanV = Math.tan(radians(FOV) / 2) * FILL
  const tanH = tanV * safeAspect
  const up = radians(TILT)
  const back = { y: Math.sin(up), z: Math.cos(up) }
  const screenUp = { y: Math.cos(up), z: -Math.sin(up) }

  const corners: [number, number, number][] = []
  for (const x of [-HALF, HALF]) {
    for (const z of [-HALF, HALF]) {
      for (const y of [-SLAB, HEAD]) corners.push([x, y, z])
    }
  }

  const needed = (aim: number) => {
    let most = 0
    for (const [x, y, z] of corners) {
      const along = y * back.y + (z - aim) * back.z
      const high = y * screenUp.y + (z - aim) * screenUp.z
      most = Math.max(most, along + Math.abs(x) / tanH, along + Math.abs(high) / tanV)
    }
    return most
  }

  const lopsided = (aim: number, distance: number) => {
    let top = -Infinity
    let bottom = Infinity
    for (const [, y, z] of corners) {
      const along = y * back.y + (z - aim) * back.z
      const high = (y * screenUp.y + (z - aim) * screenUp.z) / (distance - along)
      top = Math.max(top, high)
      bottom = Math.min(bottom, high)
    }
    return top + bottom
  }

  const centred = (distance: number) => {
    let low = -HALF
    let high = HALF
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2
      if (lopsided(mid, distance) > 0) high = mid
      else low = mid
    }
    return (low + high) / 2
  }

  let aim = 0
  let distance = needed(aim)
  for (let i = 0; i < 12; i++) {
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
 * Turns a heading in the maze's flat x/y into a turn about the world's up
 * axis. Zero points along +x in the maze; a body with no turn faces +z.
 */
export function headingToYaw(heading: number): number {
  return Math.atan2(Math.cos(heading), Math.sin(heading))
}
