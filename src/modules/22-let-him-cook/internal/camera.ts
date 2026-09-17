/**
 * The kitchen's layout, where the camera stands to see it, and what a click
 * lands on.
 *
 * A counter with the fifteen items on it in three rows of five, the chef behind
 * it, and the stove with the pot off to the chef's left - your right. The camera
 * stands in front of the counter, raised, looking down at the items: they are
 * what you have to watch and what you click.
 *
 * Fitted the same way as the other minigames' cameras: slid along its line of
 * sight until the kitchen touches the edge of the frame, and aimed so the space
 * above and below comes out even.
 */
import { KITCHEN } from './rules'

export interface Point {
  x: number
  y: number
  z: number
}

export const LAYOUT = {
  columns: 5,
  /** Across and front to back between items. */
  spacing: { x: 1.7, z: 1.3 },
  /** The counter top's height. */
  top: 1,
  /** The counter's size. */
  counter: { width: 9.6, depth: 4.4 },
  /** An item's radius, for drawing and for clicking. */
  item: 0.52,
  /** Where the chef stands: behind the counter, at this depth. */
  chefZ: -3.1,
  /** The stove, and the pot on it. */
  stove: { x: 6.3, z: -2.2, height: 1, width: 1.8 },
  potTop: 2.1,
} as const

/** Where an item sits on the counter. Row 0 is at the back. */
export function slotAt(slot: number): Point {
  const column = slot % LAYOUT.columns
  const row = Math.floor(slot / LAYOUT.columns)
  const rows = Math.ceil(KITCHEN.items / LAYOUT.columns)
  return {
    x: (column - (LAYOUT.columns - 1) / 2) * LAYOUT.spacing.x,
    y: LAYOUT.top + LAYOUT.item,
    z: (row - (rows - 1) / 2) * LAYOUT.spacing.z,
  }
}

/** The top of the pot, where the chef's items land. */
export const POT: Point = { x: LAYOUT.stove.x, y: LAYOUT.potTop, z: LAYOUT.stove.z }

/**
 * The item a ray from the camera meets first, or null. Items `skip` says are not
 * there to click - claimed ones - are passed through.
 */
export function pickSlot(origin: Point, direction: Point, skip: (slot: number) => boolean = () => false): number | null {
  const length = Math.hypot(direction.x, direction.y, direction.z)
  if (length === 0) return null
  const d = { x: direction.x / length, y: direction.y / length, z: direction.z / length }
  // A little more than the drawn item, so a click on its edge is not a miss.
  const radius = LAYOUT.item * 1.15
  let best: { slot: number; along: number } | null = null
  for (let slot = 0; slot < KITCHEN.items; slot++) {
    if (skip(slot)) continue
    const at = slotAt(slot)
    const to = { x: at.x - origin.x, y: at.y - origin.y, z: at.z - origin.z }
    const along = to.x * d.x + to.y * d.y + to.z * d.z
    if (along <= 0) continue
    const closest = Math.hypot(to.x - d.x * along, to.y - d.y * along, to.z - d.z * along)
    if (closest > radius) continue
    if (!best || along < best.along) best = { slot, along }
  }
  return best ? best.slot : null
}

/** The points that have to be in frame: the counter, the chef's hat, the stove and pot. */
export const POINTS: readonly [number, number, number][] = [
  ...[-LAYOUT.counter.width / 2, LAYOUT.counter.width / 2].flatMap((x) =>
    [-LAYOUT.counter.depth / 2, LAYOUT.counter.depth / 2].flatMap((z) => [0, LAYOUT.top + 1.1].map((y): [number, number, number] => [x, y, z])),
  ),
  [-LAYOUT.counter.width / 2, 3.4, LAYOUT.chefZ],
  [LAYOUT.counter.width / 2, 3.4, LAYOUT.chefZ],
  [LAYOUT.stove.x + LAYOUT.stove.width / 2 + 0.2, LAYOUT.potTop + 0.3, LAYOUT.stove.z - 0.9],
  [LAYOUT.stove.x + LAYOUT.stove.width / 2 + 0.2, 0, LAYOUT.stove.z + 0.9],
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
