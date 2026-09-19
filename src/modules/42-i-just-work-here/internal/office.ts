/**
 * The office: an open-plan floor with a wall round it, grown from the seed.
 *
 * Everybody has a desk of their own against the north or the south wall - eight
 * of them, far apart, the same eight every time - and the floor between is
 * furniture: pods of two desks back to back, meeting tables, lengths of
 * partition, filing cabinets, the copier, plants, the water cooler.
 *
 * Seen from above it is all rectangles, square to the world, and that is all
 * the rules ever see. Furniture comes in groups whose pieces touch; two groups
 * are either touching or far enough apart for two people to pass, so the floor
 * is always one open space and nobody's pieces are ever out of reach.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

export const OFFICE = {
  /** Half the floor, east-west and north-south: the inner face of the wall. */
  halfX: 18,
  halfZ: 12.5,
  wallThickness: 0.5,
  /** How high the wall is drawn. Low, so the camera sees over it. */
  wallHeight: 1.1,
  /** The least gap between two groups of furniture: room for two to pass. */
  gap: 1.7,
  /** How much room is kept clear round the spot in front of each desk. */
  deskRoom: 2.6,
} as const

/** What a rectangle is, for drawing it. The rules treat them all the same. */
export type Kind = 'wall' | 'home' | 'desk' | 'partition' | 'table' | 'cabinet' | 'copier' | 'plant' | 'cooler'

export interface Point {
  x: number
  z: number
}

/** A rectangle on the floor, how tall it is drawn, and what it is. */
export interface Block {
  x0: number
  z0: number
  x1: number
  z1: number
  height: number
  kind: Kind
  /** For a home desk, which of the eight it is. */
  slot?: number
}

/** Somebody's desk: the desk itself, and the spot in front of it where they stand. */
export interface Desk {
  slot: number
  block: Block
  spot: Point
  /** The way the spot faces: into the room. */
  yaw: number
}

export interface Office {
  seed: number
  blocks: Block[]
  desks: Desk[]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** How far apart two rectangles are on the floor, zero if they touch or overlap. */
export function gapBetween(a: Block, b: Block): number {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1, 0)
  const dz = Math.max(a.z0 - b.z1, b.z0 - a.z1, 0)
  return Math.hypot(dx, dz)
}

/** How far a point is from a rectangle, zero inside it. */
export function distanceTo(b: Block, p: Point): number {
  return Math.hypot(p.x - clamp(p.x, b.x0, b.x1), p.z - clamp(p.z, b.z0, b.z1))
}

const DESK_W = 1.8
const DESK_D = 0.9
/** The eight desks, west to east along the north wall, then west to east along the south. */
const SLOT_X = [-13.5, -4.5, 4.5, 13.5] as const

function deskAt(slot: number): Desk {
  const north = slot < 4
  const x = SLOT_X[slot % 4]
  const z0 = north ? -OFFICE.halfZ : OFFICE.halfZ - DESK_D
  const block: Block = { x0: x - DESK_W / 2, x1: x + DESK_W / 2, z0, z1: z0 + DESK_D, height: 0.78, kind: 'home', slot }
  const spot = { x, z: north ? block.z1 + 1 : block.z0 - 1 }
  // Facing (-sin yaw, -cos yaw): south from the north wall, north from the south.
  return { slot, block, spot, yaw: north ? Math.PI : 0 }
}

/** Every one of the eight desks, whoever sits at them. */
export const DESKS: readonly Desk[] = Array.from({ length: 8 }, (_, slot) => deskAt(slot))

/**
 * Which desks a game of `count` uses, in the order they are handed out: the
 * corners first, crossways, then the middles - so two players are as far apart
 * as the floor allows, and so are three, and four.
 */
const SPREAD = [0, 7, 3, 4, 1, 6, 2, 5] as const

/** Which desk each of `count` players gets, by seed: the spread-out ones, shuffled between them. */
export function deskSlots(seed: number, count: number): number[] {
  const chosen = SPREAD.slice(0, Math.max(0, Math.min(8, count))).map(Number)
  const random = createRng(hashSeed(seed, 'i-just-work-here:desks'))
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[chosen[i], chosen[j]] = [chosen[j], chosen[i]]
  }
  return chosen
}

/** A group of furniture, laid out round (0, 0) and turned a quarter or not. */
function group(kind: number, random: () => number): Block[] {
  const box = (w: number, d: number, height: number, k: Kind, x = 0, z = 0): Block => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, height, kind: k })
  if (kind < 0.34) {
    // A pod: two desks back to back with a partition between.
    return [box(1.6, 0.8, 0.78, 'desk', 0, -0.46), box(1.7, 0.12, 1.35, 'partition'), box(1.6, 0.8, 0.78, 'desk', 0, 0.46)]
  }
  if (kind < 0.5) return [box(3.2 + random() * 1.4, 0.14, 1.5, 'partition')]
  if (kind < 0.62) return [box(3 + random() * 0.6, 1.4, 0.76, 'table')]
  if (kind < 0.74) return [box(0.9, 0.6, 1.3, 'cabinet', -0.45), box(0.9, 0.6, 1.3, 'cabinet', 0.45)]
  if (kind < 0.82) return [box(1.2, 0.8, 1.1, 'copier')]
  if (kind < 0.92) return [box(0.7, 0.7, 1.3, 'plant')]
  return [box(0.5, 0.5, 1.2, 'cooler')]
}

const cache = new Map<number, Office>()

/** The office for a seed. The same seed, the same office. */
export function officeFor(seed: number): Office {
  const known = cache.get(seed)
  if (known) return known
  const { halfX: hx, halfZ: hz, wallThickness: w, wallHeight: h } = OFFICE
  const walls: Block[] = [
    { x0: -hx - w, x1: hx + w, z0: -hz - w, z1: -hz, height: h, kind: 'wall' },
    { x0: -hx - w, x1: hx + w, z0: hz, z1: hz + w, height: h, kind: 'wall' },
    { x0: -hx - w, x1: -hx, z0: -hz, z1: hz, height: h, kind: 'wall' },
    { x0: hx, x1: hx + w, z0: -hz, z1: hz, height: h, kind: 'wall' },
  ]
  const desks = DESKS.map((d) => d)
  const homes = desks.map((d) => d.block)

  const random = createRng(hashSeed(seed, 'i-just-work-here:office'))
  const furniture: Block[][] = []
  const fits = (blocks: Block[]) =>
    blocks.every(
      (b) =>
        b.x0 >= -hx + OFFICE.gap &&
        b.x1 <= hx - OFFICE.gap &&
        b.z0 >= -hz + OFFICE.gap &&
        b.z1 <= hz - OFFICE.gap &&
        homes.every((home) => gapBetween(b, home) >= OFFICE.gap) &&
        desks.every((d) => distanceTo(b, d.spot) >= OFFICE.deskRoom) &&
        furniture.every((other) => other.every((o) => gapBetween(b, o) >= OFFICE.gap)),
    )
  // A loose grid of places for a group, each nudged by the seed, each tried a few ways.
  for (let gz = -7.5; gz <= 7.5; gz += 5) {
    for (let gx = -14; gx <= 14; gx += 5.6) {
      const kind = random()
      if (kind > 0.93) continue
      const shape = group(kind, random)
      const turned = random() < 0.5
      for (let attempt = 0; attempt < 6; attempt++) {
        const cx = gx + (random() * 2 - 1) * 1.2
        const cz = gz + (random() * 2 - 1) * 1
        const placed = shape.map((b) =>
          turned
            ? { ...b, x0: cx + b.z0, x1: cx + b.z1, z0: cz - b.x1, z1: cz - b.x0 }
            : { ...b, x0: cx + b.x0, x1: cx + b.x1, z0: cz + b.z0, z1: cz + b.z1 },
        )
        if (!fits(placed)) continue
        furniture.push(placed)
        break
      }
    }
  }
  // A few odds and ends against the east and west walls, where there is room.
  for (let attempt = 0; attempt < 12; attempt++) {
    const shape = group(0.74 + random() * 0.26, random)
    const east = random() < 0.5
    const cz = (random() * 2 - 1) * (hz - 4)
    const cx = east ? hx - OFFICE.gap - 0.5 : -hx + OFFICE.gap + 0.5
    const placed = shape.map((b) => ({ ...b, x0: cx + b.x0, x1: cx + b.x1, z0: cz + b.z0, z1: cz + b.z1 }))
    if (fits(placed)) furniture.push(placed)
  }

  const office: Office = { seed, blocks: [...walls, ...homes, ...furniture.flat()], desks }
  cache.set(seed, office)
  if (cache.size > 16) cache.delete(cache.keys().next().value!)
  return office
}

/** Whether a body of `radius` standing at `p` overlaps anything. */
export function blocked(office: Office, p: Point, radius: number): boolean {
  if (Math.abs(p.x) > OFFICE.halfX - radius + 1e-9 || Math.abs(p.z) > OFFICE.halfZ - radius + 1e-9) return true
  for (const b of office.blocks) {
    const dx = p.x - clamp(p.x, b.x0, b.x1)
    const dz = p.z - clamp(p.z, b.z0, b.z1)
    if (dx * dx + dz * dz < radius * radius - 1e-9) return true
  }
  return false
}

/** The nearest place to `p` a body of `radius` can stand, pushed out of anything it overlaps the shortest way. */
export function collide(office: Office, p: Point, radius: number): Point {
  let x = clamp(p.x, -OFFICE.halfX + radius, OFFICE.halfX - radius)
  let z = clamp(p.z, -OFFICE.halfZ + radius, OFFICE.halfZ - radius)
  for (let pass = 0; pass < 4; pass++) {
    let moved = false
    for (const b of office.blocks) {
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

/** Moves a body by (`dx`, `dz`) a few centimetres at a time, sliding round whatever is in the way. */
export function slide(office: Office, from: Point, dx: number, dz: number, radius: number): Point {
  const length = Math.hypot(dx, dz)
  const steps = Math.max(1, Math.ceil(length / 0.1))
  let at = from
  for (let i = 0; i < steps; i++) at = collide(office, { x: at.x + dx / steps, z: at.z + dz / steps }, radius)
  return at
}

/** The span of `t` for which `o + d t` lies between `lo` and `hi`, or null if never. */
function slab(o: number, d: number, lo: number, hi: number): [number, number] | null {
  if (Math.abs(d) < 1e-12) return o < lo || o > hi ? null : [-Infinity, Infinity]
  const a = (lo - o) / d
  const b = (hi - o) / d
  return a < b ? [a, b] : [b, a]
}

/**
 * How far a ball of `radius` gets from `from` along `dir` (a unit vector on the
 * floor) before it touches anything - or `maxT`. Rectangles are grown by the
 * radius, so the corners are a touch generous; nobody will notice at 18 cm.
 */
export function cast(office: Office, from: Point, dir: Point, maxT: number, radius = 0): number {
  let best = maxT
  for (const b of office.blocks) {
    const xs = slab(from.x, dir.x, b.x0 - radius, b.x1 + radius)
    const zs = slab(from.z, dir.z, b.z0 - radius, b.z1 + radius)
    if (!xs || !zs) continue
    const enter = Math.max(xs[0], zs[0])
    const exit = Math.min(xs[1], zs[1])
    if (enter > exit || exit < 0) continue
    best = Math.min(best, Math.max(0, enter))
  }
  return Math.max(0, best)
}

/** Whether a straight line from `a` to `b` touches nothing. */
export function lineClear(office: Office, a: Point, b: Point, radius = 0): boolean {
  const d = Math.hypot(b.x - a.x, b.z - a.z)
  if (d < 1e-9) return true
  return cast(office, a, { x: (b.x - a.x) / d, z: (b.z - a.z) / d }, d, radius) >= d - 1e-6
}

/** Whether a body of `radius` could walk straight from `a` to `b`. */
export function walkClear(office: Office, a: Point, b: Point, radius: number): boolean {
  const d = Math.hypot(b.x - a.x, b.z - a.z)
  const steps = Math.max(1, Math.ceil(d / 0.2))
  for (let i = 1; i <= steps; i++) {
    if (blocked(office, { x: a.x + ((b.x - a.x) * i) / steps, z: a.z + ((b.z - a.z) * i) / steps }, radius)) return false
  }
  return true
}

/** The grid a stand-in finds its way round the office on. */
export interface Nav {
  cell: number
  cols: number
  rows: number
  open: Uint8Array
}

const NAV_CELL = 0.5
const navs = new Map<number, Nav>()

/** Which half-metre squares a body of `radius` can stand in the middle of. */
export function navFor(office: Office, radius: number): Nav {
  const known = navs.get(office.seed)
  if (known) return known
  const cols = Math.floor((OFFICE.halfX * 2) / NAV_CELL)
  const rows = Math.floor((OFFICE.halfZ * 2) / NAV_CELL)
  const open = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      open[r * cols + c] = blocked(office, cellMiddle({ cell: NAV_CELL, cols, rows, open }, c, r), radius + 0.05) ? 0 : 1
    }
  }
  const nav = { cell: NAV_CELL, cols, rows, open }
  navs.set(office.seed, nav)
  if (navs.size > 8) navs.delete(navs.keys().next().value!)
  return nav
}

function cellMiddle(nav: Nav, c: number, r: number): Point {
  return { x: -OFFICE.halfX + (c + 0.5) * nav.cell, z: -OFFICE.halfZ + (r + 0.5) * nav.cell }
}

/** The open square nearest `p`, or -1. */
function cellOf(nav: Nav, p: Point): number {
  const c0 = clamp(Math.floor((p.x + OFFICE.halfX) / nav.cell), 0, nav.cols - 1)
  const r0 = clamp(Math.floor((p.z + OFFICE.halfZ) / nav.cell), 0, nav.rows - 1)
  for (let ring = 0; ring < 6; ring++) {
    let best = -1
    let bestD = Infinity
    for (let r = r0 - ring; r <= r0 + ring; r++) {
      for (let c = c0 - ring; c <= c0 + ring; c++) {
        if (r < 0 || c < 0 || r >= nav.rows || c >= nav.cols || !nav.open[r * nav.cols + c]) continue
        const m = cellMiddle(nav, c, r)
        const d = Math.hypot(m.x - p.x, m.z - p.z)
        if (d < bestD) {
          bestD = d
          best = r * nav.cols + c
        }
      }
    }
    if (best >= 0) return best
  }
  return -1
}

const STEPS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const

/**
 * A way from `from` to `to` round the furniture, as points to walk between -
 * or an empty list if there is none. Straight lines are taken where a body fits
 * down them, so the way is a few corners rather than a staircase of squares.
 */
export function route(office: Office, from: Point, to: Point, radius: number): Point[] {
  if (walkClear(office, from, to, radius)) return [to]
  const nav = navFor(office, radius)
  const start = cellOf(nav, from)
  const goal = cellOf(nav, to)
  if (start < 0 || goal < 0) return []
  // Dijkstra on a small grid, near enough A* at this size.
  const cost = new Float64Array(nav.cols * nav.rows).fill(Infinity)
  const back = new Int32Array(nav.cols * nav.rows).fill(-1)
  const queue: number[] = [goal]
  cost[goal] = 0
  while (queue.length > 0) {
    let bi = 0
    for (let i = 1; i < queue.length; i++) if (cost[queue[i]] < cost[queue[bi]]) bi = i
    const at = queue[bi]
    queue[bi] = queue[queue.length - 1]
    queue.pop()
    if (at === start) break
    const c = at % nav.cols
    const r = (at - c) / nav.cols
    for (const [dc, dr, w] of STEPS) {
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nr < 0 || nc >= nav.cols || nr >= nav.rows) continue
      const next = nr * nav.cols + nc
      if (!nav.open[next]) continue
      // No cutting a corner diagonally.
      if (dc !== 0 && dr !== 0 && (!nav.open[r * nav.cols + nc] || !nav.open[nr * nav.cols + c])) continue
      const through = cost[at] + w
      if (through < cost[next]) {
        if (cost[next] === Infinity) queue.push(next)
        cost[next] = through
        back[next] = at
      }
    }
  }
  if (!Number.isFinite(cost[start])) return []
  const cells: Point[] = []
  for (let at = back[start]; at >= 0; at = back[at]) cells.push(cellMiddle(nav, at % nav.cols, Math.floor(at / nav.cols)))
  cells.push(to)
  // Take the furthest point along that can be walked to in a straight line, and again from there.
  const way: Point[] = []
  let here = from
  let i = 0
  while (i < cells.length) {
    let far = i
    for (let j = cells.length - 1; j > i; j--) {
      if (walkClear(office, here, cells[j], radius)) {
        far = j
        break
      }
    }
    way.push(cells[far])
    here = cells[far]
    i = far + 1
  }
  return way
}

/** Somewhere a body of `radius` could stand, anywhere on the floor. */
export function openPoint(office: Office, random: () => number, radius: number): Point {
  for (let i = 0; i < 60; i++) {
    const p = { x: (random() * 2 - 1) * (OFFICE.halfX - 1.5), z: (random() * 2 - 1) * (OFFICE.halfZ - 1.5) }
    if (!blocked(office, p, radius + 0.3)) return p
  }
  return { ...office.desks[0].spot }
}
