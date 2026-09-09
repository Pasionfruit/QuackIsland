/**
 * The board: a hundred and twenty tiles spiralling in from the shore to the
 * foot of the volcano.
 *
 * Pure, and the one thing in here that is easy to get subtly wrong is the
 * spacing. An Archimedean spiral walked at a constant *angle* puts its tiles
 * further and further apart the further out you are - or in this case bunches
 * them into a jam at the middle, since the track runs inwards. Tiles have to
 * be stepped along by **arc length** instead, which needs the length of the
 * curve, which needs integrating it.
 *
 * That is the whole difficulty, and it is entirely testable: the gaps between
 * consecutive tiles should all be the same to within a hair.
 */
import { ISLAND, partyHeightLocal } from './island'

export const BOARD = {
  /** How many tiles. A hundred and twenty, as asked for. */
  tiles: 120,
  /** Where the race starts: out by the beach. */
  outer: 210,
  /** Where it finishes: at the foot of the volcano. */
  inner: ISLAND.volcano + 1.5,
  /** How many times round. Three reads as a spiral without being a maze. */
  turns: 3,
  /**
   * How wide a tile is, in metres.
   *
   * Sized against the *track*, not against the duck. On an island this size a
   * tile a duck's width across would be a speck two dozen metres from the next
   * one, and the spiral would read as a dotted line rather than a road.
   */
  tileRadius: 8,
  /** How far a tile sits above the board, so it reads as laid on it. */
  tileLift: 0.2,
  /** Every nth tile is marked, so progress is countable at a glance. */
  markEvery: 10,
} as const

export interface Tile {
  /** 0 at the start, out by the beach; the last one is at the volcano. */
  index: number
  /** World-space, relative to the island's middle. */
  x: number
  z: number
  /** The height of the board under it. */
  y: number
  /** How far round the spiral, for anything that wants to face along it. */
  angle: number
  /** Distance from the middle of the island. */
  radius: number
  /** Every tenth one, for counting. */
  marked: boolean
}

const TURN = Math.PI * 2

/** How far out the spiral is at a given angle. Straight line in, by design. */
function radiusAt(theta: number): number {
  const total = BOARD.turns * TURN
  const t = Math.min(1, Math.max(0, theta / total))
  return BOARD.outer + (BOARD.inner - BOARD.outer) * t
}

/**
 * The length of the spiral up to an angle, and in total.
 *
 * `ds = sqrt(r^2 + (dr/dtheta)^2) dtheta`, integrated numerically. There is a
 * closed form and it is horrible; a thousand steps of the trapezium rule is
 * accurate to well under a millimetre here and is obviously right.
 */
function arcTable(steps = 2000): { theta: number[]; arc: number[] } {
  const total = BOARD.turns * TURN
  const dr = (BOARD.inner - BOARD.outer) / total
  const theta: number[] = []
  const arc: number[] = []
  let running = 0
  let previous = Math.hypot(radiusAt(0), dr)

  theta.push(0)
  arc.push(0)
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * total
    const speed = Math.hypot(radiusAt(t), dr)
    running += ((previous + speed) / 2) * (total / steps)
    previous = speed
    theta.push(t)
    arc.push(running)
  }
  return { theta, arc }
}

/** The angle at which the spiral has run a given distance. */
function angleAtLength(table: { theta: number[]; arc: number[] }, target: number): number {
  const { theta, arc } = table
  if (target <= 0) return theta[0]
  const last = arc.length - 1
  if (target >= arc[last]) return theta[last]

  // The table is sorted, so this is a binary search rather than a walk.
  let low = 0
  let high = last
  while (high - low > 1) {
    const mid = (low + high) >> 1
    if (arc[mid] <= target) low = mid
    else high = mid
  }
  const span = arc[high] - arc[low]
  const t = span > 1e-12 ? (target - arc[low]) / span : 0
  return theta[low] + (theta[high] - theta[low]) * t
}

/**
 * Every tile, from the start out by the beach to the finish at the volcano.
 *
 * Positions are relative to the middle of the island; the view puts them in
 * the world. Kept that way so the maths can be checked without knowing where
 * the island happens to be.
 */
export function buildBoard(count: number = BOARD.tiles): Tile[] {
  const table = arcTable()
  const total = table.arc[table.arc.length - 1]
  const tiles: Tile[] = []
  // `count - 1` gaps between `count` tiles, so the last one lands exactly on
  // the end of the spiral rather than one gap short of it.
  const gaps = Math.max(1, count - 1)

  for (let i = 0; i < count; i++) {
    const angle = angleAtLength(table, (i / gaps) * total)
    const radius = radiusAt(angle)
    tiles.push({
      index: i,
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      y: partyHeightLocal(radius),
      angle,
      radius,
      marked: i > 0 && i < count - 1 && (i + 1) % BOARD.markEvery === 0,
    })
  }
  return tiles
}

/** How long the whole track is, in metres. */
export function trackLength(): number {
  const table = arcTable()
  return table.arc[table.arc.length - 1]
}

/** The gap between consecutive tiles, in metres. */
export function tileSpacing(count: number = BOARD.tiles): number {
  return trackLength() / Math.max(1, count - 1)
}
