/**
 * The place Messy Maze happens in: a square grid of cells, with walls between
 * some of them, four corners to start in and a middle to race to.
 *
 * Flat arithmetic, in maze units, with no three.js and no React. A cell is a
 * square `MAZE.cell` across; the maze is `MAZE.size` cells a side, centred on
 * the origin, so the middle cell's centre is (0, 0) and the corners are the
 * four cells furthest from it.
 *
 * **There are three mazes, drawn out in `layouts.ts`**, and a race is run in
 * one of them. The host says which by number, which is all a guest needs to
 * build the same walls.
 *
 * **Every route to the middle crosses two spinning platforms.** Not because
 * anybody is told to, but because there is no gap in the walls that lets you
 * past them - `platformsOnRoute` counts the fewest a racer can possibly cross,
 * and the tests hold every corner of every maze to two.
 *
 * **Every maze is fair.** Each is one quarter turned four times, so every
 * corner looks out on the same maze, rotated; nobody's start is closer to the
 * middle than anybody else's.
 */
import { PLAYER } from '../../02-player'
import { LAYOUTS, type Layout } from './layouts'

export const MAZE = {
  /** Cells along each side. Odd, so there is a middle cell to race to. */
  size: 17,
  /** How wide a cell is, wall to wall, in maze units. */
  cell: 3,
  /** How thick a wall is. Thin enough that the corridors are the maze. */
  wall: 0.45,

  /**
   * How big a racer is, to the walls: exactly the island pill's own radius.
   *
   * Not a number of its own. It was 0.55 against a body drawn 0.4 across, and
   * every racer stopped a hand's width short of every wall and caught on
   * corners it could plainly see it had cleared - walls that were not there.
   * What you bump into is what you can see.
   */
  radius: PLAYER.radius,
  /** How fast a racer runs, in units a second. */
  speed: 7,

  /**
   * How big a platform is drawn: most of the corridor it sits in.
   *
   * Only for drawing. Whether you are on a platform is whether you are in its
   * cell - see `platformUnder` - which is exactly what the mazes guarantee every
   * route crosses. A distance from the middle can always be cut past on a tight
   * corner by a small enough body; a cell cannot.
   */
  platformRadius: 1.2,
  /** How close to the very middle counts as having reached it. */
  goalRadius: 1.15,
} as const

export interface Point {
  x: number
  y: number
}

export interface Cell {
  x: number
  y: number
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Platform {
  /** Its index in `maze.platforms`. What a racer's tally is kept in. */
  id: number
  cell: Cell
  /** Its middle, in maze units. */
  at: Point
  /** Which quarter it belongs to: the same as the corner whose route it is on. */
  quarter: number
}

export interface Maze {
  /** Its index in `MAZES`, which is what goes on the wire. */
  id: number
  name: string
  size: number
  /** `openEast[y][x]`: whether you can walk from (x, y) to (x + 1, y). */
  openEast: boolean[][]
  /** `openSouth[y][x]`: whether you can walk from (x, y) to (x, y + 1). */
  openSouth: boolean[][]
  /** Every wall still standing, outer walls included, as boxes. */
  walls: Box[]
  /** Eight: two on every corner's route, in quarter order. */
  platforms: Platform[]
  /** The four starting cells, one per quarter, in quarter order. */
  corners: Cell[]
}

/** The middle cell's index along either axis. */
export const MIDDLE = (MAZE.size - 1) / 2

/** Half the maze, outer walls included - which is what the camera wants. */
export const HALF = (MAZE.size * MAZE.cell) / 2 + MAZE.wall / 2

/** The middle of a cell, in maze units. */
export function cellCentre(cell: Cell): Point {
  return { x: (cell.x - MIDDLE) * MAZE.cell, y: (cell.y - MIDDLE) * MAZE.cell }
}

/** Which cell a point is in, clamped to the grid. */
export function cellAt(at: Point): Cell {
  const clamp = (n: number) => Math.max(0, Math.min(MAZE.size - 1, n))
  return {
    x: clamp(Math.round(at.x / MAZE.cell + MIDDLE)),
    y: clamp(Math.round(at.y / MAZE.cell + MIDDLE)),
  }
}

/**
 * A quarter turn about the middle cell.
 *
 * `(u, v)` from the middle goes to `(-v, u)`. Applied to a cell four times it
 * comes back to where it started; applied to a wall, it gives the matching
 * wall in the next quarter round. The whole of the fairness is this function.
 */
export function rotate(cell: Cell, turns = 1): Cell {
  let { x, y } = cell
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) {
    const nx = MAZE.size - 1 - y
    y = x
    x = nx
  }
  return { x, y }
}

/**
 * Which quarter a cell belongs to, or -1 for the middle.
 *
 * The four quarters are the four quarter-turns of one shape, and between them
 * they cover every cell but the middle exactly once. Quarter 0 is the one with
 * the top left corner in it; each next one is it turned once more.
 */
export function quarterOf(cell: Cell): number {
  const u = cell.x - MIDDLE
  const v = cell.y - MIDDLE
  if (u < 0 && v <= 0) return 0
  if (u >= 0 && v < 0) return 1
  if (u > 0 && v >= 0) return 2
  if (u <= 0 && v > 0) return 3
  return -1
}

const inGrid = (c: Cell) => c.x >= 0 && c.y >= 0 && c.x < MAZE.size && c.y < MAZE.size

const NEIGHBOURS: readonly Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

/** Whether you can walk straight from one cell to the next one along. */
export function isOpen(maze: Maze, a: Cell, b: Cell): boolean {
  if (!inGrid(a) || !inGrid(b)) return false
  if (a.y === b.y && Math.abs(a.x - b.x) === 1) return maze.openEast[a.y][Math.min(a.x, b.x)]
  if (a.x === b.x && Math.abs(a.y - b.y) === 1) return maze.openSouth[Math.min(a.y, b.y)][a.x]
  return false
}

/** The cells you can step to from here. */
export function exits(maze: Maze, cell: Cell): Cell[] {
  const out: Cell[] = []
  for (const step of NEIGHBOURS) {
    const next = { x: cell.x + step.x, y: cell.y + step.y }
    if (isOpen(maze, cell, next)) out.push(next)
  }
  return out
}

const key = (c: Cell) => c.y * MAZE.size + c.x

/**
 * How many steps every cell is from the nearest of some targets, walking.
 *
 * Indexed `y * size + x`; `Infinity` for a cell nothing can reach. What the
 * stand-in racers steer by, and what a racer who never made it is ranked on.
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

/**
 * The fewest spinning platforms anybody can cross getting from one cell to
 * another, whatever way they go - or `Infinity` if they cannot get there.
 *
 * A shortest-path search where stepping onto a platform costs one and
 * anything else costs nothing. This is the number the mazes are designed
 * around: from every corner to the middle it is two.
 */
export function platformsOnRoute(maze: Maze, from: Cell, to: Cell): number {
  const platforms = new Set(maze.platforms.map((p) => key(p.cell)))
  const cost = new Array<number>(MAZE.size * MAZE.size).fill(Infinity)
  cost[key(from)] = platforms.has(key(from)) ? 1 : 0
  // Free steps go to the front of the queue and platform steps to the back,
  // so cells come off in order of how many platforms it took to reach them.
  const queue: Cell[] = [from]
  while (queue.length > 0) {
    const here = queue.shift()!
    for (const next of exits(maze, here)) {
      const onto = platforms.has(key(next)) ? 1 : 0
      const through = cost[key(here)] + onto
      if (through >= cost[key(next)]) continue
      cost[key(next)] = through
      if (onto) queue.push(next)
      else queue.unshift(next)
    }
  }
  return cost[key(to)]
}

/**
 * Reads a maze from its drawing. See `layouts.ts` for what the characters mean.
 *
 * Strict, because a drawing is hand-editable: the wrong size, a missing post, a
 * gap in the outer wall, or a marker anywhere it does not belong is an error
 * saying where, not a maze with a hole in it.
 */
export function parseLayout(id: number, layout: Layout): Maze {
  const size = MAZE.size
  const span = size * 2 + 1
  const { rows, name } = layout
  const fail = (why: string): never => {
    throw new Error(`maze "${name}": ${why}`)
  }
  if (rows.length !== span || rows.some((r) => r.length !== span)) fail(`must be ${span} by ${span}`)

  const grid = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const openEast = grid()
  const openSouth = grid()
  const starts: Cell[] = []
  const platformCells: Cell[] = []

  for (let r = 0; r < span; r++) {
    for (let c = 0; c < span; c++) {
      const ch = rows[r][c]
      const edge = r === 0 || c === 0 || r === span - 1 || c === span - 1
      if (edge) {
        if (ch !== '#') fail(`gap in the outer wall at row ${r}, column ${c}`)
        continue
      }
      if (r % 2 === 0 && c % 2 === 0) {
        if (ch !== '#') fail(`missing corner post at row ${r}, column ${c}`)
        continue
      }
      if (r % 2 === 1 && c % 2 === 1) {
        const cell = { x: (c - 1) / 2, y: (r - 1) / 2 }
        if (ch === 'S') starts.push(cell)
        else if (ch === 'O') platformCells.push(cell)
        else if (ch === 'X') {
          if (cell.x !== MIDDLE || cell.y !== MIDDLE) fail('the X is not in the middle')
        } else if (ch !== ' ') fail(`unexpected "${ch}" in cell ${cell.x},${cell.y}`)
        continue
      }
      if (ch !== ' ' && ch !== '#') fail(`unexpected "${ch}" in a wall at row ${r}, column ${c}`)
      const open = ch === ' '
      if (r % 2 === 1) openEast[(r - 1) / 2][c / 2 - 1] = open
      else openSouth[r / 2 - 1][(c - 1) / 2] = open
    }
  }

  // Corners in quarter order, which is the order they are dealt out in.
  const corners = [0, 1, 2, 3].map((turn) => rotate({ x: 0, y: 0 }, turn))
  const isCorner = (cell: Cell) => corners.some((c) => c.x === cell.x && c.y === cell.y)
  if (starts.length !== 4 || !starts.every(isCorner)) fail('needs an S in each of the four corners and nowhere else')

  const maze: Maze = { id, name, size, openEast, openSouth, walls: [], platforms: [], corners }

  // Platforms in quarter order, and within a quarter in the order its corner
  // reaches them - so platform 0 is the first on quarter 0's way in.
  maze.platforms = [0, 1, 2, 3].flatMap((quarter) => {
    const fromCorner = stepsTo(maze, [corners[quarter]])
    return platformCells
      .filter((cell) => quarterOf(cell) === quarter)
      .sort((a, b) => stepsFrom(fromCorner, a) - stepsFrom(fromCorner, b))
      .map((cell, i) => ({ id: quarter * 2 + i, cell, at: cellCentre(cell), quarter }))
  })

  maze.walls = wallsOf(maze)
  return maze
}

/**
 * The walking route between two cells, both ends included, or `[]` if there
 * is none. Shortest, when there is more than one.
 */
export function routeBetween(maze: Maze, from: Cell, to: Cell): Cell[] {
  const field = stepsTo(maze, [to])
  if (stepsFrom(field, from) === Infinity) return []
  const route = [from]
  let here = from
  while (here.x !== to.x || here.y !== to.y) {
    const options = exits(maze, here)
    here = options.reduce((best, c) => (stepsFrom(field, c) < stepsFrom(field, best) ? c : best))
    route.push(here)
  }
  return route
}

/**
 * Every wall still standing, as a box.
 *
 * A wall between two cells runs the full side of the cell **plus a wall's
 * thickness**, so neighbouring walls overlap at the corners rather than
 * leaving a pinhole a body could be squeezed through. The four outer walls are
 * one long box each.
 */
function wallsOf(maze: Maze): Box[] {
  const { cell, wall } = MAZE
  const size = maze.size
  const out: Box[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const middle = cellCentre({ x, y })
      if (x < size - 1 && !maze.openEast[y][x]) {
        out.push({ x: middle.x + cell / 2, y: middle.y, width: wall, height: cell + wall })
      }
      if (y < size - 1 && !maze.openSouth[y][x]) {
        out.push({ x: middle.x, y: middle.y + cell / 2, width: cell + wall, height: wall })
      }
    }
  }
  const edge = (size * cell) / 2
  const long = size * cell + wall
  out.push({ x: 0, y: -edge, width: long, height: wall })
  out.push({ x: 0, y: edge, width: long, height: wall })
  out.push({ x: -edge, y: 0, width: wall, height: long })
  out.push({ x: edge, y: 0, width: wall, height: long })
  return out
}

/**
 * Pushes a circle out of a box, if it is in one.
 *
 * The nearest point on the box to the circle's middle, and out along the line
 * from there. A middle that has ended up *inside* the box has no such line, so
 * it goes out through whichever side is nearest instead.
 */
export function pushOutOfBox(at: Point, radius: number, box: Box): Point {
  const halfW = box.width / 2
  const halfH = box.height / 2
  const dx = at.x - box.x
  const dy = at.y - box.y
  if (Math.abs(dx) >= halfW + radius || Math.abs(dy) >= halfH + radius) return at

  if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) {
    const outX = halfW - Math.abs(dx)
    const outY = halfH - Math.abs(dy)
    if (outX < outY) return { x: box.x + Math.sign(dx || 1) * (halfW + radius), y: at.y }
    return { x: at.x, y: box.y + Math.sign(dy || 1) * (halfH + radius) }
  }

  const nearestX = Math.max(box.x - halfW, Math.min(at.x, box.x + halfW))
  const nearestY = Math.max(box.y - halfH, Math.min(at.y, box.y + halfH))
  const awayX = at.x - nearestX
  const awayY = at.y - nearestY
  const distance = Math.hypot(awayX, awayY)
  if (distance >= radius || distance === 0) return at
  const push = radius / distance
  return { x: nearestX + awayX * push, y: nearestY + awayY * push }
}

/**
 * Where a body ends up after trying to be somewhere: out of every wall.
 *
 * Twice through, because in a corner a push out of one wall can put you into
 * the one beside it, and a second pass is what settles that.
 */
export function settle(maze: Maze, at: Point, radius = MAZE.radius): Point {
  let where = at
  for (let pass = 0; pass < 2; pass++) {
    for (const box of maze.walls) where = pushOutOfBox(where, radius, box)
  }
  return where
}

/**
 * The platform whose cell a point is in, if any.
 *
 * Standing on a platform means being in its cell, not within some distance of
 * its middle: every route to the middle is guaranteed to cross two platform
 * cells (`platformsOnRoute`), and a body cannot pass through a cell without its
 * middle being in it - so a platform can never be slipped past, whatever size
 * a racer is or however tight a corner is cut.
 */
export function platformUnder(maze: Maze, at: Point): Platform | null {
  const cell = cellAt(at)
  return maze.platforms.find((p) => p.cell.x === cell.x && p.cell.y === cell.y) ?? null
}

/** Whether a circle overlaps any wall. For tests, and for checking a spawn. */
export function inWall(maze: Maze, at: Point, radius = 0): boolean {
  return maze.walls.some(
    (box) =>
      Math.abs(at.x - box.x) < box.width / 2 + radius &&
      Math.abs(at.y - box.y) < box.height / 2 + radius,
  )
}

/** Every maze, read from its drawing once. */
export const MAZES: readonly Maze[] = Object.freeze(LAYOUTS.map((layout, id) => parseLayout(id, layout)))

/** A maze by its number. Wraps, so any whole number is one of them. */
export function mazeFor(id: number): Maze {
  const count = MAZES.length
  return MAZES[((Math.trunc(id) % count) + count) % count]
}
