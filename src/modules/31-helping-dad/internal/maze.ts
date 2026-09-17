/**
 * The maze: a grid of cells with walls between, grown from the seed.
 *
 * A perfect maze - exactly one way between any two cells - carved by a seeded
 * depth-first walk, so every browser that has the seed has the same maze. The
 * start is the bottom-left cell and the finish the top-right.
 *
 * Walls are boxes on the cell edges, each one a wall's thickness longer than the
 * edge so the corners between them are filled. A torch is a circle; it touches a
 * wall when the nearest point of any box is closer than its radius.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

export const GRID = {
  /** Cells across and down. */
  cols: 11,
  rows: 7,
  /** A cell's width, wall middle to wall middle. */
  cell: 1.2,
  /** A wall's thickness, and its height. */
  wall: 0.2,
  height: 0.25,
} as const

export interface Point {
  x: number
  z: number
}

/** A wall, as its extent on the ground. */
export interface Box {
  x0: number
  z0: number
  x1: number
  z1: number
}

export interface Cell {
  col: number
  row: number
}

export interface Maze {
  seed: number
  /** Open to the east of each cell, by `row * cols + col`. */
  east: boolean[]
  /** Open to the south of each cell. */
  south: boolean[]
  boxes: Box[]
  /** Cells from each cell to the finish, the only way there is. */
  toFinish: number[]
  start: Cell
  finish: Cell
}

const index = (col: number, row: number) => row * GRID.cols + col

/** The middle of a cell, in the world. */
export function cellCentre(col: number, row: number): Point {
  return { x: (col - (GRID.cols - 1) / 2) * GRID.cell, z: (row - (GRID.rows - 1) / 2) * GRID.cell }
}

/** The cell a point is in, the nearest one if it is outside. */
export function cellAt(p: Point): Cell {
  const col = Math.round(p.x / GRID.cell + (GRID.cols - 1) / 2)
  const row = Math.round(p.z / GRID.cell + (GRID.rows - 1) / 2)
  return { col: Math.max(0, Math.min(GRID.cols - 1, col)), row: Math.max(0, Math.min(GRID.rows - 1, row)) }
}

/** The maze's outer edge, wall middles. */
export const HALF = { x: (GRID.cols * GRID.cell) / 2, z: (GRID.rows * GRID.cell) / 2 } as const

/** Whether a move of one cell from `from` in direction (dc, dr) is through an opening. */
export function isOpen(maze: Maze, from: Cell, dc: number, dr: number): boolean {
  const col = from.col + dc
  const row = from.row + dr
  if (col < 0 || row < 0 || col >= GRID.cols || row >= GRID.rows) return false
  if (dc === 1) return maze.east[index(from.col, from.row)]
  if (dc === -1) return maze.east[index(col, row)]
  if (dr === 1) return maze.south[index(from.col, from.row)]
  if (dr === -1) return maze.south[index(col, row)]
  return false
}

const STEPS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

const cache = new Map<number, Maze>()

/** The maze for a seed. The same seed, the same maze. */
export function mazeFor(seed: number): Maze {
  const known = cache.get(seed)
  if (known) return known
  const random = createRng(hashSeed(seed, 'helping-dad:maze'))
  const count = GRID.cols * GRID.rows
  const east = new Array<boolean>(count).fill(false)
  const south = new Array<boolean>(count).fill(false)
  const seen = new Array<boolean>(count).fill(false)
  const start: Cell = { col: 0, row: GRID.rows - 1 }
  const finish: Cell = { col: GRID.cols - 1, row: 0 }

  const stack: Cell[] = [start]
  seen[index(start.col, start.row)] = true
  while (stack.length > 0) {
    const here = stack[stack.length - 1]
    const next = STEPS.map(([dc, dr]) => ({ col: here.col + dc, row: here.row + dr, dc, dr })).filter(
      (c) => c.col >= 0 && c.row >= 0 && c.col < GRID.cols && c.row < GRID.rows && !seen[index(c.col, c.row)],
    )
    if (next.length === 0) {
      stack.pop()
      continue
    }
    const go = next[Math.floor(random() * next.length)]
    if (go.dc === 1) east[index(here.col, here.row)] = true
    if (go.dc === -1) east[index(go.col, go.row)] = true
    if (go.dr === 1) south[index(here.col, here.row)] = true
    if (go.dr === -1) south[index(go.col, go.row)] = true
    seen[index(go.col, go.row)] = true
    stack.push({ col: go.col, row: go.row })
  }

  const maze: Maze = { seed, east, south, boxes: [], toFinish: [], start, finish }

  // The walls: the outer edge, then every closed edge between cells.
  const { cell, wall } = GRID
  const t = wall / 2
  const boxes: Box[] = [
    { x0: -HALF.x - t, x1: HALF.x + t, z0: -HALF.z - t, z1: -HALF.z + t },
    { x0: -HALF.x - t, x1: HALF.x + t, z0: HALF.z - t, z1: HALF.z + t },
    { x0: -HALF.x - t, x1: -HALF.x + t, z0: -HALF.z - t, z1: HALF.z + t },
    { x0: HALF.x - t, x1: HALF.x + t, z0: -HALF.z - t, z1: HALF.z + t },
  ]
  for (let row = 0; row < GRID.rows; row++) {
    for (let col = 0; col < GRID.cols; col++) {
      const c = cellCentre(col, row)
      if (col < GRID.cols - 1 && !east[index(col, row)]) {
        boxes.push({ x0: c.x + cell / 2 - t, x1: c.x + cell / 2 + t, z0: c.z - cell / 2 - t, z1: c.z + cell / 2 + t })
      }
      if (row < GRID.rows - 1 && !south[index(col, row)]) {
        boxes.push({ x0: c.x - cell / 2 - t, x1: c.x + cell / 2 + t, z0: c.z + cell / 2 - t, z1: c.z + cell / 2 + t })
      }
    }
  }
  maze.boxes = boxes

  // How far every cell is from the finish, walking.
  const far = new Array<number>(count).fill(-1)
  far[index(finish.col, finish.row)] = 0
  const queue: Cell[] = [finish]
  for (let i = 0; i < queue.length; i++) {
    const here = queue[i]
    for (const [dc, dr] of STEPS) {
      if (!isOpen(maze, here, dc, dr)) continue
      const there = { col: here.col + dc, row: here.row + dr }
      if (far[index(there.col, there.row)] >= 0) continue
      far[index(there.col, there.row)] = far[index(here.col, here.row)] + 1
      queue.push(there)
    }
  }
  maze.toFinish = far

  cache.set(seed, maze)
  if (cache.size > 16) cache.delete(cache.keys().next().value!)
  return maze
}

/** Cells from `cell` to the finish. */
export function stepsToFinish(maze: Maze, cell: Cell): number {
  return maze.toFinish[index(cell.col, cell.row)]
}

/** The next cell on the way to the finish from `cell`, or null at the finish. */
export function nextCell(maze: Maze, cell: Cell): Cell | null {
  const here = stepsToFinish(maze, cell)
  if (here <= 0) return null
  for (const [dc, dr] of STEPS) {
    if (!isOpen(maze, cell, dc, dr)) continue
    const there = { col: cell.col + dc, row: cell.row + dr }
    if (stepsToFinish(maze, there) === here - 1) return there
  }
  return null
}

/**
 * Where to head from `p` to follow the way out without cutting a corner: the
 * next cell's middle, once `p` is on the line between this cell's middle and
 * that one; otherwise back onto that line, at this cell's middle. At the finish,
 * its middle.
 */
export function routeTarget(maze: Maze, p: Point): Point {
  const cell = cellAt(p)
  const middle = cellCentre(cell.col, cell.row)
  const next = nextCell(maze, cell)
  if (!next) return middle
  const across = next.col !== cell.col ? Math.abs(p.z - middle.z) : Math.abs(p.x - middle.x)
  return across > 1e-3 ? middle : cellCentre(next.col, next.row)
}

/** Whether a circle of `radius` at `p` touches any wall. */
export function touchesWall(maze: Maze, p: Point, radius: number): boolean {
  for (const b of maze.boxes) {
    const x = Math.max(b.x0, Math.min(p.x, b.x1))
    const z = Math.max(b.z0, Math.min(p.z, b.z1))
    const dx = p.x - x
    const dz = p.z - z
    if (dx * dx + dz * dz < radius * radius) return true
  }
  return false
}

/**
 * How far a point is from the finish, walking: the cells between, and the way to
 * the middle of its own cell. For placing anybody who did not get there.
 */
export function distanceToFinish(maze: Maze, p: Point): number {
  const cell = cellAt(p)
  const c = cellCentre(cell.col, cell.row)
  return stepsToFinish(maze, cell) * GRID.cell + Math.hypot(p.x - c.x, p.z - c.z)
}
