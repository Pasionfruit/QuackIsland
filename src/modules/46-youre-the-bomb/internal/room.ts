/**
 * The room: a long hall with a hole in the floor at the far end, bombs hidden
 * in the floor on a grid, and a giant rolling pin outside the door.
 *
 * Everybody starts at the south end. The way out is the hole at the north end.
 * The bombs are grown from the seed - but first a winding safe way from one
 * end to the other is laid, and no bomb goes on it, so the room can always be
 * crossed. Nobody is told where the way is.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

export const ROOM = {
  /** Half the room's width and length: the inner faces of its walls. */
  halfX: 6,
  halfZ: 30,
  /** The floor grid a bomb can sit on: one to a square. */
  cell: 1.5,
  /** How much of the floor is bombs, off the safe way. */
  density: 0.24,
  /** Rows at the start, and before the hole, kept clear. */
  clearStart: 3,
  clearEnd: 2,
  /** The hole: its middle, and how near it you have to be to drop through. */
  hole: { x: 0, z: -28, radius: 1.5 },
} as const

export const COLS = Math.round((ROOM.halfX * 2) / ROOM.cell)
export const ROWS = Math.round((ROOM.halfZ * 2) / ROOM.cell)

export interface Point {
  x: number
  z: number
}

export interface Bomb extends Point {
  /** Its square: row from the north, column from the west. */
  row: number
  col: number
}

export interface Room {
  seed: number
  bombs: Bomb[]
  /** The safe way laid first, square by square from the start to the hole - for the tests. */
  way: { row: number; col: number }[]
}

/** The middle of a square. */
export function cellMiddle(row: number, col: number): Point {
  return { x: -ROOM.halfX + (col + 0.5) * ROOM.cell, z: -ROOM.halfZ + (row + 0.5) * ROOM.cell }
}

/** Which square a point is on, or null off the floor. */
export function cellAt(x: number, z: number): { row: number; col: number } | null {
  if (Math.abs(x) >= ROOM.halfX || Math.abs(z) >= ROOM.halfZ) return null
  return {
    row: Math.min(ROWS - 1, Math.floor((z + ROOM.halfZ) / ROOM.cell)),
    col: Math.min(COLS - 1, Math.floor((x + ROOM.halfX) / ROOM.cell)),
  }
}

const cache = new Map<number, Room>()

/** The room for a seed. The same seed, the same bombs. */
export function roomFor(seed: number): Room {
  const known = cache.get(seed)
  if (known) return known
  const random = createRng(hashSeed(seed, 'youre-the-bomb:room'))
  const holeCell = cellAt(ROOM.hole.x, ROOM.hole.z)!

  // The safe way: from a random square on the start row, north a row at a time,
  // wandering a square or two sideways as it goes, to the hole.
  const way: { row: number; col: number }[] = []
  let col = Math.floor(random() * COLS)
  for (let row = ROWS - 1; row >= holeCell.row; row--) {
    way.push({ row, col })
    // Most rows it drifts; the last few steer for the hole.
    const target = row - holeCell.row < 6 ? holeCell.col : Math.floor(random() * COLS)
    const steps = Math.min(Math.abs(target - col), 1 + Math.floor(random() * 2))
    for (let s = 0; s < steps; s++) {
      col += Math.sign(target - col)
      way.push({ row, col })
    }
  }
  const safe = new Set(way.map((w) => `${w.row}:${w.col}`))

  const bombs: Bomb[] = []
  for (let row = 0; row < ROWS; row++) {
    for (let c = 0; c < COLS; c++) {
      if (row >= ROWS - ROOM.clearStart || row < holeCell.row + ROOM.clearEnd) continue
      if (safe.has(`${row}:${c}`)) continue
      if (random() >= ROOM.density) continue
      // Anywhere in its square, off the very edges.
      const m = cellMiddle(row, c)
      bombs.push({ row, col: c, x: m.x + (random() - 0.5) * ROOM.cell * 0.5, z: m.z + (random() - 0.5) * ROOM.cell * 0.5 })
    }
  }
  const room = { seed, bombs, way }
  cache.set(seed, room)
  if (cache.size > 16) cache.delete(cache.keys().next().value!)
  return room
}

/** The bombs within `radius` of a point: what a scan shows. */
export function scan(room: Room, at: Point, radius: number): number[] {
  const found: number[] = []
  room.bombs.forEach((b, i) => {
    if (Math.hypot(b.x - at.x, b.z - at.z) <= radius) found.push(i)
  })
  return found
}

/** Where everybody starts: along the south end, spread across it. */
export function spawnPoint(index: number, count: number): Point & { yaw: number } {
  const across = count <= 1 ? 0 : -ROOM.halfX + 1.2 + ((ROOM.halfX * 2 - 2.4) * index) / (count - 1)
  const row = index % 2
  return { x: across, z: ROOM.halfZ - 1.2 - row * 1.3, yaw: 0 }
}

/** Whether a point is over the hole. */
export function inHole(p: Point): boolean {
  return Math.hypot(p.x - ROOM.hole.x, p.z - ROOM.hole.z) <= ROOM.hole.radius
}
