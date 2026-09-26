/**
 * The corn maze: a seeded recursive-backtracker grid, baked into wall blocks.
 *
 * Unlike `17-messy-maze`'s three fixed, hand-carved layouts, this one is grown
 * fresh from the seed every round - a "large" maze needs no hand-authoring,
 * only a generator, and a hunt loses its point the moment a player can
 * memorise the one maze the game always has. `openEast[y][x]`/`openSouth[y][x]`
 * is the same boolean-grid shape Messy Maze's own `Maze` already uses; only
 * the way it gets filled in is new.
 *
 * A corn row is a block like Jackal's cover, but simpler: nothing here jumps,
 * so there is no height-aware pass-over - a wall is solid to a body and always
 * blocks a line of sight, full stop. Flat arithmetic, no three.js, no React.
 */
import { createRng, hashSeed } from '../../00-core'

export const MAZE = {
  /** Cells along each side. Odd, so there is a true middle cell. ~88 m across at `CELL`. */
  size: 21,
  /** How wide a cell is, wall to wall, in metres. */
  cell: 4.2,
  /** How thick a wall is. */
  wallThickness: 0.3,
  /** How tall a corn row stands: comfortably over eye height, so it always blocks sight. */
  wallHeight: 2.4,
} as const

/** The middle cell's index along either axis. */
export const MIDDLE = (MAZE.size - 1) / 2

export interface Cell {
  x: number
  y: number
}

export interface Point {
  x: number
  z: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** A corn row, as a box standing on the floor: no `kind`, nothing vaults it. */
export interface Block {
  x0: number
  z0: number
  x1: number
  z1: number
  height: number
}

export interface Maze {
  seed: number
  size: number
  /** `openEast[y][x]`: whether you can walk from (x, y) to (x + 1, y). */
  openEast: boolean[][]
  /** `openSouth[y][x]`: whether you can walk from (x, y) to (x, y + 1). */
  openSouth: boolean[][]
  blocks: Block[]
}

/** The middle of a cell, in world metres. */
export function cellCentre(cell: Cell): Point {
  return { x: (cell.x - MIDDLE) * MAZE.cell, z: (cell.y - MIDDLE) * MAZE.cell }
}

/** Which cell a point is in, clamped to the grid. */
export function cellAt(at: Point): Cell {
  const clamp = (n: number) => Math.max(0, Math.min(MAZE.size - 1, n))
  return {
    x: clamp(Math.round(at.x / MAZE.cell + MIDDLE)),
    y: clamp(Math.round(at.z / MAZE.cell + MIDDLE)),
  }
}

const inGrid = (c: Cell) => c.x >= 0 && c.y >= 0 && c.x < MAZE.size && c.y < MAZE.size

const NEIGHBOURS: readonly Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

/** Whether you can walk straight from one cell to the next one along. */
export function isOpen(maze: Pick<Maze, 'openEast' | 'openSouth'>, a: Cell, b: Cell): boolean {
  if (!inGrid(a) || !inGrid(b)) return false
  if (a.y === b.y && Math.abs(a.x - b.x) === 1) return maze.openEast[a.y][Math.min(a.x, b.x)]
  if (a.x === b.x && Math.abs(a.y - b.y) === 1) return maze.openSouth[Math.min(a.y, b.y)][a.x]
  return false
}

/** The cells you can step to from here. */
export function exits(maze: Pick<Maze, 'openEast' | 'openSouth'>, cell: Cell): Cell[] {
  const out: Cell[] = []
  for (const step of NEIGHBOURS) {
    const next = { x: cell.x + step.x, y: cell.y + step.y }
    if (isOpen(maze, cell, next)) out.push(next)
  }
  return out
}

const key = (c: Cell) => c.y * MAZE.size + c.x

/**
 * How many steps every cell is from the nearest of some targets, walking -
 * the same distance-field shape `17-messy-maze/internal/ai.ts` steers by.
 * Indexed `y * size + x`; `Infinity` for a cell nothing can reach (never
 * happens here - the generator always leaves a spanning tree).
 */
export function stepsTo(maze: Maze, targets: readonly Cell[]): number[] {
  const out = new Array<number>(MAZE.size * MAZE.size).fill(Infinity)
  const queue: Cell[] = []
  for (const t of targets) {
    if (out[key(t)] === 0) continue
    out[key(t)] = 0
    queue.push(t)
  }
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head]
    for (const next of exits(maze, cell)) {
      if (out[key(next)] !== Infinity) continue
      out[key(next)] = out[key(cell)] + 1
      queue.push(next)
    }
  }
  return out
}

/** Reads a distance field made by `stepsTo`. */
export function stepsFrom(field: readonly number[], cell: Cell): number {
  return field[key(cell)]
}

/** Cells with exactly one exit: the ends of the maze's own branches, good places to hole up. */
export function deadEnds(maze: Maze): Cell[] {
  const out: Cell[] = []
  for (let y = 0; y < maze.size; y++) {
    for (let x = 0; x < maze.size; x++) {
      if (exits(maze, { x, y }).length === 1) out.push({ x, y })
    }
  }
  return out
}

/** The `n` cells nearest `anchor` by the maze's own corridors (breadth-first), anchor included first. */
export function nearestCells(maze: Maze, anchor: Cell, n: number): Cell[] {
  const seen = new Set<number>([key(anchor)])
  const out: Cell[] = [anchor]
  const queue: Cell[] = [anchor]
  for (let head = 0; head < queue.length && out.length < n; head++) {
    for (const next of exits(maze, queue[head])) {
      if (seen.has(key(next))) continue
      seen.add(key(next))
      out.push(next)
      queue.push(next)
      if (out.length >= n) break
    }
  }
  return out
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * A perfect maze: a recursive backtracker carved iteratively (a stack, not
 * recursion - the grid is 21x21 and a recursive carve would be over four
 * hundred stack frames deep at its worst). Every cell ends up reachable from
 * every other, with exactly one route between any two - a spanning tree over
 * the grid, never an isolated pocket.
 */
function carve(size: number, random: () => number): { openEast: boolean[][]; openSouth: boolean[][] } {
  const grid = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const openEast = grid()
  const openSouth = grid()
  const visited = grid()
  const stack: Cell[] = [{ x: 0, y: 0 }]
  visited[0][0] = true
  while (stack.length > 0) {
    const at = stack[stack.length - 1]
    const options = shuffled(NEIGHBOURS, random)
      .map((step) => ({ x: at.x + step.x, y: at.y + step.y }))
      .filter((c) => inGrid(c) && !visited[c.y][c.x])
    if (options.length === 0) {
      stack.pop()
      continue
    }
    const next = options[0]
    if (next.x === at.x + 1) openEast[at.y][at.x] = true
    else if (next.x === at.x - 1) openEast[next.y][next.x] = true
    else if (next.y === at.y + 1) openSouth[at.y][at.x] = true
    else openSouth[next.y][next.x] = true
    visited[next.y][next.x] = true
    stack.push(next)
  }
  return { openEast, openSouth }
}

/**
 * Every corn row still standing, as a box. A wall between two cells runs the
 * full side of the cell plus a wall's thickness, so neighbouring walls
 * overlap at the corners rather than leaving a pinhole a body could slip
 * through - the same reasoning as Messy Maze's own `wallsOf`.
 */
function wallsOf(size: number, openEast: boolean[][], openSouth: boolean[][]): Block[] {
  const { cell, wallThickness: wall, wallHeight: height } = MAZE
  const out: Block[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const middle = cellCentre({ x, y })
      if (x < size - 1 && !openEast[y][x]) {
        out.push({ x0: middle.x + cell / 2 - wall / 2, x1: middle.x + cell / 2 + wall / 2, z0: middle.z - cell / 2 - wall / 2, z1: middle.z + cell / 2 + wall / 2, height })
      }
      if (y < size - 1 && !openSouth[y][x]) {
        out.push({ x0: middle.x - cell / 2 - wall / 2, x1: middle.x + cell / 2 + wall / 2, z0: middle.z + cell / 2 - wall / 2, z1: middle.z + cell / 2 + wall / 2, height })
      }
    }
  }
  const edge = (size * cell) / 2
  const long = size * cell + wall
  out.push({ x0: -long / 2, x1: long / 2, z0: -edge - wall / 2, z1: -edge + wall / 2, height })
  out.push({ x0: -long / 2, x1: long / 2, z0: edge - wall / 2, z1: edge + wall / 2, height })
  out.push({ x0: -edge - wall / 2, x1: -edge + wall / 2, z0: -long / 2, z1: long / 2, height })
  out.push({ x0: edge - wall / 2, x1: edge + wall / 2, z0: -long / 2, z1: long / 2, height })
  return out
}

const cache = new Map<number, Maze>()

/** The maze for a seed. The same seed, the same maze. */
export function mazeFor(seed: number): Maze {
  const known = cache.get(seed)
  if (known) return known
  const random = createRng(hashSeed(seed, 'bbn:maze'))
  const { openEast, openSouth } = carve(MAZE.size, random)
  const maze: Maze = { seed, size: MAZE.size, openEast, openSouth, blocks: wallsOf(MAZE.size, openEast, openSouth) }
  cache.set(seed, maze)
  if (cache.size > 16) cache.delete(cache.keys().next().value!)
  return maze
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Whether a body of `radius` overlaps any corn row still standing at `p`. Flat: every wall is always in the way. */
export function blocked(maze: Maze, p: Point, radius: number): boolean {
  for (const b of maze.blocks) {
    const dx = p.x - clamp(p.x, b.x0, b.x1)
    const dz = p.z - clamp(p.z, b.z0, b.z1)
    if (dx * dx + dz * dz < radius * radius - 1e-9) return true
  }
  return false
}

/** The nearest place to `p` a body of `radius` can stand, pushed out of anything it overlaps, and kept inside the maze's own bounds. */
export function collide(maze: Maze, p: Point, radius: number): Point {
  const half = (maze.size * MAZE.cell) / 2
  let x = clamp(p.x, -half + radius, half - radius)
  let z = clamp(p.z, -half + radius, half - radius)
  for (let pass = 0; pass < 4; pass++) {
    let moved = false
    for (const b of maze.blocks) {
      const nx = clamp(x, b.x0, b.x1)
      const nz = clamp(z, b.z0, b.z1)
      const dx = x - nx
      const dz = z - nz
      const d2 = dx * dx + dz * dz
      if (d2 >= radius * radius) continue
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2)
        x = nx + (dx / d) * radius
        z = nz + (dz / d) * radius
      } else {
        const out = [x - b.x0, b.x1 - x, z - b.z0, b.z1 - z]
        const side = out.indexOf(Math.min(...out))
        if (side === 0) x = b.x0 - radius
        else if (side === 1) x = b.x1 + radius
        else if (side === 2) z = b.z0 - radius
        else z = b.z1 + radius
      }
      moved = true
    }
    if (!moved) break
  }
  return { x, z }
}

/** Moves a body from `from` by (`dx`, `dz`), sliding round whatever corn row is in the way. */
export function slide(maze: Maze, from: Point, dx: number, dz: number, radius: number): Point {
  const length = Math.hypot(dx, dz)
  const steps = Math.max(1, Math.ceil(length / 0.1))
  let at = from
  for (let i = 0; i < steps; i++) at = collide(maze, { x: at.x + dx / steps, z: at.z + dz / steps }, radius)
  return at
}

/** The span of `t` for which `o + d t` lies between `lo` and `hi`, or null if never. */
function slab(o: number, d: number, lo: number, hi: number): [number, number] | null {
  if (Math.abs(d) < 1e-12) return o < lo || o > hi ? null : [-Infinity, Infinity]
  const a = (lo - o) / d
  const b = (hi - o) / d
  return a < b ? [a, b] : [b, a]
}

/** How far along a ray from `from` in direction `dir` it goes before meeting a corn row, or `maxT`. */
export function rayHit(maze: Maze, from: Vec3, dir: Vec3, maxT: number): number {
  let best = maxT
  for (const b of maze.blocks) {
    const xs = slab(from.x, dir.x, b.x0, b.x1)
    const ys = slab(from.y, dir.y, 0, b.height)
    const zs = slab(from.z, dir.z, b.z0, b.z1)
    if (!xs || !ys || !zs) continue
    const enter = Math.max(xs[0], ys[0], zs[0])
    const exit = Math.min(xs[1], ys[1], zs[1])
    if (enter > exit || exit < 0) continue
    best = Math.min(best, Math.max(0, enter))
  }
  return Math.max(0, best)
}

/** Whether a straight line from `a` to `b` is clear of every corn row. */
export function lineClear(maze: Maze, a: Vec3, b: Vec3): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  if (d < 1e-9) return true
  const dir = { x: (b.x - a.x) / d, y: (b.y - a.y) / d, z: (b.z - a.z) / d }
  return rayHit(maze, a, dir, d) >= d - 1e-6
}

/** Where the Hunter starts: the maze's own middle cell. */
export function hunterSpawn(seed: number): Point & { yaw: number } {
  void mazeFor(seed)
  return { ...cellCentre({ x: MIDDLE, y: MIDDLE }), yaw: 0 }
}

/** The pen the Hiders scatter from: a clutch of cells near one edge, reached by the maze's own corridors rather than raw distance. */
export function hiderPen(seed: number, count: number): Cell[] {
  const maze = mazeFor(seed)
  return nearestCells(maze, { x: 1, y: maze.size - 2 }, Math.max(1, count))
}

/** Where Hider `index` of `count` starts: its own cell in the pen. */
export function hiderSpawn(seed: number, count: number, index: number): Point & { yaw: number } {
  const pen = hiderPen(seed, count)
  const cell = pen[index % pen.length]
  return { ...cellCentre(cell), yaw: Math.PI }
}
