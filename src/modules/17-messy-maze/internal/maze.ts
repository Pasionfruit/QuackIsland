/**
 * The place Messy Maze happens in: a square grid of cells, with walls between
 * some of them, four corners to start in and a middle to race to.
 *
 * Flat arithmetic, in maze units, with no three.js and no React. A cell is a
 * square `MAZE.cell` across; the maze is `MAZE.size` cells a side, centred on
 * the origin, so the middle cell's centre is (0, 0) and the corners are the
 * four cells furthest from it.
 *
 * **A maze is made from a seed and nothing else.** The host deals a seed, and
 * the walls, the platforms and the starting corners all follow from it. That
 * is what lets a guest draw the host's maze from one number on the wire rather
 * than from four hundred walls, and what lets a test ask for the same maze
 * twice and get it.
 *
 * **It is fair by construction, not by luck.** The walls are carved for one
 * quarter of the grid and then turned through a right angle three times, so
 * every corner looks out on the same maze as every other, rotated. Nobody's
 * start is closer to the middle than anybody else's, and there is a test that
 * counts the steps.
 */
import { createRng } from '../../00-core'

export const MAZE = {
  /** Cells along each side. Odd, so there is a middle cell to race to. */
  size: 17,
  /** How wide a cell is, wall to wall, in maze units. */
  cell: 3,
  /** How thick a wall is. Thin enough that the corridors are the maze. */
  wall: 0.45,

  /**
   * How big a racer is. Smaller than the corridor by a comfortable margin, so
   * turning a corner is a matter of the keys and not of lining up to a pixel.
   */
  radius: 0.55,
  /** How fast a racer runs, in units a second. */
  speed: 7,

  /**
   * How many extra walls come out of each quarter once it is a proper maze.
   *
   * A perfect maze - one route between any two cells - is a puzzle rather than
   * a race: once you have found the way there is nothing left to decide. Loops
   * are what make it messy, and what give a player who took a wrong turn a way
   * back into it that is not the way they came.
   */
  loops: 5,
  /**
   * How many doorways each quarter opens into the next one round.
   *
   * Without these the four quarters are four separate mazes that only meet in
   * the middle, and nobody ever sees anybody else until the end. With them,
   * routes cross, and somebody else's platform is a thing you can use.
   */
  crossings: 2,

  /** How far along a corner's route each of its two platforms sits. */
  platformsAt: [0.3, 0.68] as readonly number[],
  /** How close to a platform's middle counts as standing on it. */
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
  seed: number
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

function setOpen(open: { east: boolean[][]; south: boolean[][] }, a: Cell, b: Cell): void {
  if (a.y === b.y) open.east[a.y][Math.min(a.x, b.x)] = true
  else open.south[Math.min(a.y, b.y)][a.x] = true
}

/** Opens a wall and the same wall in the other three quarters. */
function openAllFour(open: { east: boolean[][]; south: boolean[][] }, a: Cell, b: Cell): void {
  for (let turn = 0; turn < 4; turn++) setOpen(open, rotate(a, turn), rotate(b, turn))
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
 * Builds the maze a seed describes.
 *
 * 1. **Carve quarter 0 as a perfect maze**, depth first from its corner, with
 *    every step taken in all four quarters at once. Each quarter is then a
 *    tree: one route from its corner to anywhere in it.
 * 2. **Open quarter 0 onto the middle**, and so every quarter.
 * 3. **Find the platforms** on that one route from corner to middle, before
 *    anything adds a second route - so they are on the way, not off to one
 *    side of it.
 * 4. **Make it messy**: knock out a few more walls inside the quarter, and a
 *    few between it and the next one round.
 *
 * Every random choice is made for quarter 0 and applied to all four, so the
 * randomness is in what the maze is, never in who it favours.
 */
export function buildMaze(seed: number): Maze {
  const random = createRng(seed)
  const size = MAZE.size
  const grid = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const open = { east: grid(), south: grid() }

  const inQuarter = (c: Cell) => inGrid(c) && quarterOf(c) === 0
  const corner: Cell = { x: 0, y: 0 }
  // The one cell of quarter 0 that touches the middle.
  const doorway: Cell = { x: MIDDLE - 1, y: MIDDLE }

  // 1. Depth first, one quarter, mirrored into the rest.
  const visited = new Set<number>([key(corner)])
  const stack: Cell[] = [corner]
  while (stack.length > 0) {
    const here = stack[stack.length - 1]
    const choices = NEIGHBOURS.map((s) => ({ x: here.x + s.x, y: here.y + s.y })).filter(
      (c) => inQuarter(c) && !visited.has(key(c)),
    )
    if (choices.length === 0) {
      stack.pop()
      continue
    }
    const next = choices[Math.floor(random() * choices.length)]
    openAllFour(open, here, next)
    visited.add(key(next))
    stack.push(next)
  }

  // 2. Into the middle.
  openAllFour(open, doorway, { x: MIDDLE, y: MIDDLE })

  const shell = (): Maze => ({
    seed,
    size,
    openEast: open.east,
    openSouth: open.south,
    walls: [],
    platforms: [],
    corners: [0, 1, 2, 3].map((turn) => rotate(corner, turn)),
  })

  // 3. The route, while there is still exactly one.
  const tree = shell()
  const route = routeBetween(tree, corner, { x: MIDDLE, y: MIDDLE })
  const platformCells = MAZE.platformsAt.map((along) => {
    // Never the corner itself and never the middle: a platform you are
    // standing on at the start, or on at the finish, is not one on the way.
    const index = Math.max(1, Math.min(route.length - 2, Math.round((route.length - 1) * along)))
    return route[index]
  })

  // 4. Messier. Walls inside quarter 0 first, then doorways into quarter 1.
  const inside: [Cell, Cell][] = []
  const across: [Cell, Cell][] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const here = { x, y }
      if (quarterOf(here) !== 0) continue
      for (const step of [NEIGHBOURS[0], NEIGHBOURS[2]]) {
        for (const sign of [1, -1]) {
          const there = { x: x + step.x * sign, y: y + step.y * sign }
          if (!inGrid(there) || isOpen(tree, here, there)) continue
          const quarter = quarterOf(there)
          if (quarter === 0 && sign === 1) inside.push([here, there])
          if (quarter === 1) across.push([here, there])
        }
      }
    }
  }
  for (const [pool, count] of [
    [inside, MAZE.loops],
    [across, MAZE.crossings],
  ] as const) {
    for (let i = 0; i < count && pool.length > 0; i++) {
      const pick = Math.floor(random() * pool.length)
      const [a, b] = pool.splice(pick, 1)[0]
      openAllFour(open, a, b)
    }
  }

  const maze = shell()
  maze.platforms = [0, 1, 2, 3].flatMap((quarter) =>
    platformCells.map((cell, i) => {
      const turned = rotate(cell, quarter)
      return { id: quarter * 2 + i, cell: turned, at: cellCentre(turned), quarter }
    }),
  )
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

/** Whether a circle overlaps any wall. For tests, and for checking a spawn. */
export function inWall(maze: Maze, at: Point, radius = 0): boolean {
  return maze.walls.some(
    (box) =>
      Math.abs(at.x - box.x) < box.width / 2 + radius &&
      Math.abs(at.y - box.y) < box.height / 2 + radius,
  )
}

/**
 * The same seed's maze, built once.
 *
 * A guest is handed a seed twenty times a second and the host steps the same
 * maze sixty; neither should be rebuilding four hundred walls to do it.
 */
const built = new Map<number, Maze>()
export function mazeFor(seed: number): Maze {
  let maze = built.get(seed)
  if (!maze) {
    maze = buildMaze(seed)
    // A handful of rounds a session. Kept small anyway, oldest out first.
    if (built.size >= 8) built.delete(built.keys().next().value as number)
    built.set(seed, maze)
  }
  return maze
}
