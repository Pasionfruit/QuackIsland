/**
 * Where the camera stands, and why it never moves from there.
 *
 * Pure trigonometry, so the one thing that would ruin the game if it were
 * wrong - a corner of the arena off the edge of the screen, where somebody
 * could be caught out of sight - is arithmetic a test can check rather than
 * something you find out by looking.
 *
 * **Tilted, not overhead.** A straight-down view is a map; this is a room seen
 * from across it. The angle is measured up from the floor: 90 degrees would be
 * directly above, and `TILT` is sixty, so the camera sits high and back and
 * everything in the arena has a visible side as well as a top.
 *
 * It still never moves. The whole arena is in frame at all times and the
 * camera does not follow anybody, so nothing you can see is a thing you had to
 * earn by looking the right way.
 */
import { ARENA, HALF_H, HALF_W } from './arena'

/** Degrees up from the floor. Ninety would be straight down. */
export const TILT = 60

/** The lens. Narrow enough that the far end of the arena is not warped. */
export const FOV = 42

/**
 * How much of the window the room is allowed to fill, as a fraction of the
 * frame from the middle to the edge.
 *
 * Just short of all of it. The room is fitted exactly - see `frameArena` - so
 * this is the whole of the border: a sliver of sky, so the wall on the limiting
 * side does not sit flush against the edge of the window.
 */
export const FILL = 0.97

const radians = (degrees: number) => (degrees * Math.PI) / 180

/**
 * The room as drawn: the floor slab, and the walls standing outside it.
 *
 * Framing against these rather than against the floor is what keeps the tops
 * of the walls in shot. Bodies are shorter than the walls and always inside
 * them, so a room that fits is a room where nobody is out of sight.
 */
function roomCorners(): [number, number, number][] {
  const w = HALF_W + FLOOR.wallThickness
  const d = HALF_H + FLOOR.wallThickness
  const out: [number, number, number][] = []
  for (const x of [-w, w]) {
    for (const z of [-d, d]) {
      for (const y of [-FLOOR.thickness, FLOOR.wallHeight]) out.push([x, y, z])
    }
  }
  return out
}

export interface Shot {
  /** Where the camera stands. */
  x: number
  y: number
  z: number
  /** Where it looks: on the floor, down the middle, nudged along the depth. */
  target: { x: number; y: number; z: number }
  /** How far it is from what it looks at. */
  distance: number
}

/**
 * Where to stand to fill the window with the room, in a window of that shape.
 *
 * `aspect` is width over height. The camera keeps its tilt and only ever
 * slides along its line of sight, so the question is how close it can get
 * before a corner of the room leaves the frame. For one corner that is a
 * straight answer; the room needs the largest of them, taken against the
 * horizontal and vertical edges of the frame both.
 *
 * **It also slides where it looks, along the depth of the room.** Seen at an
 * angle, the near half of the room comes out bigger than the far half, so a
 * camera aimed at the middle leaves more sky above the far wall than below the
 * near one. Moving the aim until the two are even is what lets it come closer,
 * and on a narrow window - where the width decides the distance - it is what
 * keeps the room in the middle of the frame rather than pushed to one end.
 *
 * The camera is up and back along +Z, so the room is seen from its near edge
 * looking across it.
 */
export function frameArena(aspect: number, fov: number = FOV): Shot {
  const safeAspect = Math.max(0.2, Number.isFinite(aspect) ? aspect : 1)
  if (last && last.aspect === safeAspect && last.fov === fov) return last.shot

  const tanV = Math.tan(radians(fov) / 2) * FILL
  const tanH = Math.tan(radians(fov) / 2) * safeAspect * FILL
  const up = radians(TILT)
  // Towards the camera, and the frame's own up, both unit length.
  const back = { y: Math.sin(up), z: Math.cos(up) }
  const screenUp = { y: Math.cos(up), z: -Math.sin(up) }
  const corners = roomCorners()

  /** How far back the camera has to be to fit every corner, aiming at `aim`. */
  const needed = (aim: number) => {
    let most = 0
    for (const [x, y, z] of corners) {
      const along = y * back.y + (z - aim) * back.z
      const high = y * screenUp.y + (z - aim) * screenUp.z
      most = Math.max(most, along + Math.abs(x) / tanH, along + Math.abs(high) / tanV)
    }
    return most
  }

  /** Top and bottom of the room on screen, added: zero when the sky is even. */
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

  /** The aim that evens the sky out at this distance. Aiming nearer lifts it all. */
  const centred = (distance: number) => {
    let low = -HALF_H
    let high = HALF_H
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2
      if (lopsided(mid, distance) > 0) high = mid
      else low = mid
    }
    return (low + high) / 2
  }

  // Come in as close as that aim allows, even the sky out again from there,
  // and repeat. The two barely pull on each other, so it settles in a few.
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
  last = { aspect: safeAspect, fov, shot }
  return shot
}

/**
 * The last answer. Asked every frame with the same window, and a search is not
 * something to redo sixty times a second to get the number it got last time.
 */
let last: { aspect: number; fov: number; shot: Shot } | null = null

/**
 * Turns a heading on the floor into a turn about the up axis.
 *
 * The rules think in a flat x/y plane, where a heading of zero points along
 * +x. The world thinks in x/z, and a body with no rotation faces +z. This is
 * the one place that conversion happens, so the two can disagree about what
 * zero means without anything going cross-eyed.
 */
export function headingToYaw(heading: number): number {
  return Math.atan2(Math.cos(heading), Math.sin(heading))
}

/** Where the floor is, in world units, for anything that has to sit on it. */
export const FLOOR = {
  width: ARENA.width,
  depth: ARENA.height,
  /** How thick the slab is. It is drawn as a box so it has an edge to see. */
  thickness: 1,
  /** How high the walls stand. Tall enough to read as a room from this angle. */
  wallHeight: 2.2,
  wallThickness: 0.9,
  /** How tall a crate is. Head height, so they are worth hiding behind. */
  crateHeight: 1.9,
} as const
