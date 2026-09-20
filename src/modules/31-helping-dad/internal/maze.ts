/**
 * The maze: a grid of cells with walls between, grown from the seed - and it
 * turns, with Dad's junk sliding about inside it.
 *
 * A perfect maze - exactly one way between any two cells - carved by a seeded
 * depth-first walk, so every browser that has the seed has the same maze. The
 * start is the bottom-left cell and the finish the top-right.
 *
 * Walls are boxes on the cell edges, each one a wall's thickness longer than the
 * edge so the corners between them are filled. A torch is a circle; it touches a
 * wall when the nearest point of any box is closer than its radius. **The
 * corridors are narrow** - a cell is only a little wider than its walls are
 * thick - so there is not much room either side of a careful torch.
 *
 * **The whole maze turns**, slowly, about its middle: a seeded direction and an
 * eased-in rate, both a pure function of the clock, so every screen has it at
 * the same angle without being told. Everything here, and everything in the
 * rules, is in the maze's own frame - the turn is the scene rotating the lot and
 * the mouse being read back into it, so a torch's position means the same thing
 * on every screen however far round the maze has gone.
 *
 * **Dad's junk slides up and down the corridors.** Each piece runs between two
 * cell middles along a straight stretch, back and forth for ever, at its own
 * pace and from its own place in the run - all from the seed, so nobody is told
 * where anything is. A piece is wider than the room left beside it, so a corridor
 * with one in it is shut until it has gone past.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

export const GRID = {
  /** Cells across and down. Square, because a maze that turns sweeps a circle. */
  cols: 8,
  rows: 8,
  /** A cell's width, wall middle to wall middle. */
  cell: 0.95,
  /** A wall's thickness, and its height. */
  wall: 0.2,
  height: 0.25,
} as const

/** How the maze turns. */
export const ROTATE = {
  /** Radians a second, once it is up to speed: a turn and a half in a round. */
  rate: 0.085,
  /** Seconds it takes to get there from a standstill, so it does not lurch at the whistle. */
  ramp: 4,
} as const

/** Dad's junk: what slides about the corridors. */
export const JUNK = {
  /** How many pieces are loose in the maze. */
  count: 5,
  /**
   * A piece's radius. A corridor leaves a torch's middle `(cell - wall) / 2 -
   * TORCH.radius` either side of its line, and a piece on that line keeps a
   * torch's middle `JUNK.radius + TORCH.radius` away - which is more. So a
   * corridor with a piece in it cannot be squeezed past, only waited out.
   */
  radius: 0.15,
  /** How fast a piece slides, slowest and fastest, metres a second. */
  pace: [0.7, 1.1] as readonly [number, number],
  /** The most cells a piece's run is long, end to end. The longest runs are taken first. */
  span: 4,
  /** How far short of a piece a stand-in holds back before waiting for it to pass. */
  clear: 0.12,
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
  /** Which way it turns: 1 or -1. */
  spin: number
  /** Open to the east of each cell, by `row * cols + col`. */
  east: boolean[]
  /** Open to the south of each cell. */
  south: boolean[]
  boxes: Box[]
  /** Cells from each cell to the finish, the only way there is. */
  toFinish: number[]
  /** Dad's junk, sliding up and down the corridors. */
  junk: Junk[]
  start: Cell
  finish: Cell
}

/**
 * One piece of Dad's junk: a circle sliding for ever between the two ends of a
 * straight run of corridor, at its own pace and from its own place in the run.
 */
export interface Junk {
  /** The two ends of its run, cell middles. */
  from: Point
  to: Point
  /** Metres a second. */
  pace: number
  /** Where in the run it was at the whistle, 0 to 1 of a there-and-back. */
  phase: number
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

  const maze: Maze = { seed, spin: createRng(hashSeed(seed, 'helping-dad:spin'))() < 0.5 ? -1 : 1, east, south, boxes: [], toFinish: [], junk: [], start, finish }

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
  maze.junk = junkFor(maze, seed)

  cache.set(seed, maze)
  if (cache.size > 16) cache.delete(cache.keys().next().value!)
  return maze
}

/**
 * How far round the maze has turned, radians, `t` seconds after the whistle.
 *
 * Eased in over `ROTATE.ramp` from a standstill and flat out after it, which is
 * the integral of a rate that ramps and then holds - so the angle and the speed
 * it turns at are both smooth, and it never jumps. Before the whistle it has not
 * moved. A pure function of the seed and the clock: nothing about the turn ever
 * goes on the wire.
 */
export function mazeAngle(seed: number, t: number): number {
  const s = Math.max(0, t)
  const { rate, ramp } = ROTATE
  const turned = s <= ramp ? (rate * s * s) / (2 * ramp) : rate * (s - ramp / 2)
  return mazeFor(seed).spin * turned
}

/** A point in the maze's own frame, as the world sees it once the maze has turned `angle`. */
export function intoWorld(p: Point, angle: number): Point {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: c * p.x + s * p.z, z: -s * p.x + c * p.z }
}

/** A point in the world, read back into the maze's own frame - which is where every rule works. */
export function intoMaze(p: Point, angle: number): Point {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: c * p.x - s * p.z, z: s * p.x + c * p.z }
}

/**
 * Dad's junk: `JUNK.count` pieces, each on its own straight run of corridor.
 *
 * Every opening is pushed on as far as its corridor goes straight, up to
 * `JUNK.span` cells, and **the longest runs are taken first**. A piece on a run
 * one cell long would be in that corridor the whole time, which is not an
 * obstacle but a closed door; on a long one it is away from either end for
 * seconds at a stretch, which is the window you go through.
 *
 * No run touches the start or the finish - the two cells everybody has to be
 * able to stand in - and no two runs share a cell, so a corridor is never shut
 * by more than one thing at once.
 */
function junkFor(maze: Maze, seed: number): Junk[] {
  const random = createRng(hashSeed(seed, 'helping-dad:junk'))
  const openings: { cell: Cell; dc: number; dr: number }[] = []
  for (let row = 0; row < GRID.rows; row++) {
    for (let col = 0; col < GRID.cols; col++) {
      for (const [dc, dr] of STEPS) if (isOpen(maze, { col, row }, dc, dr)) openings.push({ cell: { col, row }, dc, dr })
    }
  }
  // Shuffled with the seed, so two runs of the same length are picked between in
  // the same way every time and no run is tried twice.
  for (let i = openings.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[openings[i], openings[j]] = [openings[j], openings[i]]
  }

  const ends = [maze.start, maze.finish].map((c) => index(c.col, c.row))
  const runs: Cell[][] = []
  for (const opening of openings) {
    const run: Cell[] = [opening.cell]
    while (run.length < JUNK.span && isOpen(maze, run[run.length - 1], opening.dc, opening.dr)) {
      const last = run[run.length - 1]
      run.push({ col: last.col + opening.dc, row: last.row + opening.dr })
    }
    if (!run.some((c) => ends.includes(index(c.col, c.row)))) runs.push(run)
  }
  // The longest first; a stable sort, so the shuffle above decides between equals.
  runs.sort((a, b) => b.length - a.length)

  const spoken = new Set<number>()
  const junk: Junk[] = []
  for (const run of runs) {
    if (junk.length >= JUNK.count) break
    const taken = run.map((c) => index(c.col, c.row))
    if (taken.some((i) => spoken.has(i))) continue
    for (const i of taken) spoken.add(i)
    const head = run[0]
    const tail = run[run.length - 1]
    junk.push({
      from: cellCentre(head.col, head.row),
      to: cellCentre(tail.col, tail.row),
      pace: JUNK.pace[0] + random() * (JUNK.pace[1] - JUNK.pace[0]),
      phase: random(),
    })
  }
  return junk
}

/**
 * Where a piece of junk is `t` seconds after the whistle: along its run and back
 * again, for ever. Before the whistle it is already sliding, so the maze is
 * moving while the three, two, one is counted.
 */
export function junkAt(piece: Junk, t: number): Point {
  const length = Math.hypot(piece.to.x - piece.from.x, piece.to.z - piece.from.z)
  if (length <= 1e-9) return piece.from
  // A there-and-back is two lengths; `along` is how far into one, 0 to 2.
  const along = (((piece.phase * 2 + (piece.pace * t) / length) % 2) + 2) % 2
  const f = along <= 1 ? along : 2 - along
  return { x: piece.from.x + (piece.to.x - piece.from.x) * f, z: piece.from.z + (piece.to.z - piece.from.z) * f }
}

/** The piece of junk a circle of `radius` at `p` is touching at `t`, or null. */
export function touchesJunk(maze: Maze, p: Point, radius: number, t: number): Junk | null {
  for (const piece of maze.junk) {
    const at = junkAt(piece, t)
    const reach = radius + JUNK.radius
    if ((p.x - at.x) ** 2 + (p.z - at.z) ** 2 < reach * reach) return piece
  }
  return null
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
 * How near the corridor's line counts as on it, for `routeTarget`. A fifth of
 * the room a corridor leaves a torch either side, which is close enough not to
 * cut a corner and loose enough to be reachable: in a maze that turns, a torch
 * led by a mouse in the world never lands on the line to the millimetre, and a
 * tighter test than this has it stepping forward and back for ever.
 */
export const ON_LINE = ((GRID.cell - GRID.wall) / 2) * 0.2

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
  return across > ON_LINE ? middle : cellCentre(next.col, next.row)
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
