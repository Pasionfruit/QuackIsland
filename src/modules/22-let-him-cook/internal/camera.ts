/**
 * The kitchen's layout, where the camera stands to see it, and what a click
 * lands on.
 *
 * A counter with six baskets on it, one per ingredient, in two rows of three -
 * each holding however many copies of its ingredient there are. The chef stands
 * behind it, and the stove with the pot is off to the chef's left - your right.
 * Whoever's turn it is stands in front of the counter, reaches into a basket and
 * tosses what they took into the pot. The camera stands in front of all of it,
 * raised, looking down into the baskets: they are what you have to watch and
 * what you click.
 *
 * Fitted the same way as the other minigames' cameras: slid along its line of
 * sight until the kitchen touches the edge of the frame, and aimed so the space
 * above and below comes out even.
 */
import { KINDS, KITCHEN } from './rules'

export interface Point {
  x: number
  y: number
  z: number
}

export const LAYOUT = {
  /** Baskets across; the six make two rows. */
  columns: 3,
  /** Across and front to back between baskets. */
  spacing: { x: 3, z: 2.2 },
  /** A basket's radius, and the height of its side. */
  basket: 0.95,
  wall: 0.45,
  /** The counter top's height. */
  top: 1,
  /** The counter's size. */
  counter: { width: 9.6, depth: 4.4 },
  /** An item's radius, for drawing. */
  item: 0.52,
  /** How big an item is in its basket, next to its size on its own. */
  inBasket: 0.8,
  /** Where the chef stands: behind the counter, at this depth. */
  chefZ: -3.1,
  /** Where whoever's turn it is stands: in front of the counter, at this depth. */
  cookZ: 2.95,
  /** Where they walk in from, across. */
  cookEnters: -5.6,
  /** The stove, and the pot on it. */
  stove: { x: 6.3, z: -2.2, height: 1, width: 1.8 },
  potTop: 2.1,
} as const

/** The middle of a place on the counter a basket can stand, on the counter top. Row 0 is at the back. */
function placeAt(place: number): Point {
  const column = place % LAYOUT.columns
  const row = Math.floor(place / LAYOUT.columns)
  const rows = Math.ceil(KITCHEN.places / LAYOUT.columns)
  return {
    x: (column - (LAYOUT.columns - 1) / 2) * LAYOUT.spacing.x,
    y: LAYOUT.top,
    z: (row - (rows - 1) / 2) * LAYOUT.spacing.z,
  }
}

/** The places round the counter, in the order a basket goes round them: along the back, then back along the front. */
export const LOOP: readonly number[] = [0, 1, 2, 5, 4, 3]

const smooth = (t: number) => t * t * (3 - 2 * t)

/**
 * The middle of an ingredient's basket, on the counter top, once the baskets
 * have turned `turned` places round the counter from where they start - each
 * ingredient's own place. A fraction is a basket on its way from one place to
 * the next.
 */
export function basketAt(kind: number, turned = 0): Point {
  const start = LOOP.indexOf(kind % KITCHEN.places)
  const whole = Math.floor(turned)
  const from = placeAt(LOOP[(((start + whole) % LOOP.length) + LOOP.length) % LOOP.length])
  const part = smooth(turned - whole)
  if (part === 0) return from
  const to = placeAt(LOOP[(((start + whole + 1) % LOOP.length) + LOOP.length) % LOOP.length])
  return { x: from.x + (to.x - from.x) * part, y: from.y, z: from.z + (to.z - from.z) * part }
}

/** Where items sit in a basket, by how many it holds: across and front to back from its middle. */
const NESTS: readonly (readonly [number, number][])[] = [
  [],
  [[0, 0]],
  [[-0.3, 0], [0.3, 0]],
  [[-0.32, -0.26], [0.32, -0.26], [0, 0.3]],
  [[-0.32, -0.3], [0.32, -0.3], [-0.32, 0.3], [0.32, 0.3]],
]

/** Where the nth of `count` copies of an ingredient sits in its basket, standing on its floor. */
export function itemAt(kind: number, index: number, count: number, turned = 0): Point {
  const basket = basketAt(kind, turned)
  const nest = NESTS[Math.min(Math.max(count, 1), NESTS.length - 1)]
  const [dx, dz] = nest[Math.min(index, nest.length - 1)] ?? [0, 0]
  return { x: basket.x + dx, y: LAYOUT.top + 0.08, z: basket.z + dz }
}

/** Where the nth claim on an ingredient is marked: a chip in the claimer's colour, beside its basket. */
export function chipAt(kind: number, n: number, turned = 0): Point {
  const basket = basketAt(kind, turned)
  return { x: basket.x + LAYOUT.basket + 0.3, y: LAYOUT.top + 0.03, z: basket.z - 0.45 + n * 0.3 }
}

/** The top of the pot, where the items land. */
export const POT: Point = { x: LAYOUT.stove.x, y: LAYOUT.potTop, z: LAYOUT.stove.z }

/**
 * The basket a ray from the camera meets first, or null, with the baskets turned
 * `turned` places round the counter. Baskets `skip` says are not there to click
 * - emptied ones - are passed through.
 */
export function pickBasket(origin: Point, direction: Point, skip: (kind: number) => boolean = () => false, turned = 0): number | null {
  const length = Math.hypot(direction.x, direction.y, direction.z)
  if (length === 0) return null
  const d = { x: direction.x / length, y: direction.y / length, z: direction.z / length }
  // A little more than the basket, so a click on its rim is not a miss.
  const radius = LAYOUT.basket * 1.05
  let best: { kind: number; along: number } | null = null
  for (let kind = 0; kind < KINDS; kind++) {
    if (skip(kind)) continue
    const at = basketAt(kind, turned)
    const to = { x: at.x - origin.x, y: at.y + LAYOUT.wall * 0.7 - origin.y, z: at.z - origin.z }
    const along = to.x * d.x + to.y * d.y + to.z * d.z
    if (along <= 0) continue
    const closest = Math.hypot(to.x - d.x * along, to.y - d.y * along, to.z - d.z * along)
    if (closest > radius) continue
    if (!best || along < best.along) best = { kind, along }
  }
  return best ? best.kind : null
}

/** The points that have to be in frame: the counter, the chef's hat, the stove and pot, and the cook in front. */
export const POINTS: readonly [number, number, number][] = [
  ...[-LAYOUT.counter.width / 2, LAYOUT.counter.width / 2].flatMap((x) =>
    [-LAYOUT.counter.depth / 2, LAYOUT.counter.depth / 2].flatMap((z) => [0, LAYOUT.top + 1.1].map((y): [number, number, number] => [x, y, z])),
  ),
  [-LAYOUT.counter.width / 2, 3.4, LAYOUT.chefZ],
  [LAYOUT.counter.width / 2, 3.4, LAYOUT.chefZ],
  [LAYOUT.stove.x + LAYOUT.stove.width / 2 + 0.2, LAYOUT.potTop + 0.3, LAYOUT.stove.z - 0.9],
  [LAYOUT.stove.x + LAYOUT.stove.width / 2 + 0.2, 0, LAYOUT.stove.z + 0.9],
  [LAYOUT.cookEnters, 0, LAYOUT.cookZ + 0.35],
  [LAYOUT.spacing.x + 0.4, 0, LAYOUT.cookZ + 0.35],
]

/** Degrees up from the counter. Steep enough to see every item in the back row past the front. */
export const TILT = 44
/** The lens. */
export const FOV = 40
/** How much of the frame, middle to edge, the scene may fill. */
export const FILL = 0.94

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
  const xs = POINTS.map((p) => p[0])
  const zs = POINTS.map((p) => p[2])
  const middleX = (Math.min(...xs) + Math.max(...xs)) / 2
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)

  const needed = (aim: number) => {
    let most = 0
    for (const [x, y, z] of POINTS) {
      const along = y * back.y + (z - aim) * back.z
      const high = y * screenUp.y + (z - aim) * screenUp.z
      most = Math.max(most, along + Math.abs(x - middleX) / tanH, along + Math.abs(high) / tanV)
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

  let aim = (minZ + maxZ) / 2
  let distance = needed(aim)
  for (let i = 0; i < 24; i++) {
    aim = centred(distance)
    distance = needed(aim)
  }

  const shot: Shot = {
    x: middleX,
    y: back.y * distance,
    z: aim + back.z * distance,
    target: { x: middleX, y: 0, z: aim },
    distance,
  }
  last = { aspect: safeAspect, shot }
  return shot
}
