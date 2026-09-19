/**
 * The store: its floor, its shelves and checkouts, the ten things it sells,
 * everybody's grocery list, and where every item is stocked.
 *
 * **All of it comes from the seed and how many are playing**: the lists, how
 * many of each thing there are and which shelf each one is on. So every screen
 * works out the store for itself and only where the items have got to since is
 * ever sent.
 *
 * The shelves are low - waist high - with the goods on top, so the camera can
 * see across the aisles. There is exactly one of each thing on the shelves for
 * everybody who needs it (and one of anything nobody needs): taking something
 * that is not on your list takes it from somebody else.
 *
 * Also here, because the stand-ins need it and it is pure: a grid over the
 * floor and the walking distance across it, round the shelves.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

export const STORE = {
  /** Half the store's width, east to west, and depth, north to south. The door is on the south wall. */
  halfX: 20,
  halfZ: 14,
  /** How tall a shelf is: waist high, the goods on top. */
  shelf: 1.1,
} as const

export interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}

const rect = (cx: number, cz: number, w: number, d: number): Rect => ({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 })

/** The island shelves: four rows of three, each 8 m long and 1.2 m deep. */
const ISLANDS: Rect[] = [-9.5, -5.5, -1.5, 2.5].flatMap((z) => [-13, 0, 13].map((x) => rect(x, z, 8, 1.2)))

/** Shelves along the north, west and east walls. */
const WALLS: Rect[] = [rect(0, -13.2, 36, 0.9), rect(-19.3, -4, 0.9, 16), rect(19.3, -4, 0.9, 16)]

/** Where the checkout counters stand, east to west. */
export const COUNTERS: readonly number[] = [-10, -3.3, 3.3, 10]
const COUNTER = { width: 0.9, z0: 7, z1: 10.5 } as const

/** Everything solid: shelves and counters. */
export const SOLIDS: readonly Rect[] = [...ISLANDS, ...WALLS, ...COUNTERS.map((x) => ({ x0: x - COUNTER.width / 2, z0: COUNTER.z0, x1: x + COUNTER.width / 2, z1: COUNTER.z1 }))]
export const SHELVES: readonly Rect[] = [...ISLANDS, ...WALLS]

/** The checkout lanes, just east of each counter: walk down one with your whole list and you are through. */
export const LANES: readonly Rect[] = COUNTERS.map((x) => ({ x0: x + COUNTER.width / 2, z0: COUNTER.z0, x1: x + COUNTER.width / 2 + 1.7, z1: COUNTER.z1 }))

export function inRect(r: Rect, x: number, z: number, grow = 0): boolean {
  return x >= r.x0 - grow && x <= r.x1 + grow && z >= r.z0 - grow && z <= r.z1 + grow
}

export function inLane(x: number, z: number): boolean {
  return LANES.some((r) => inRect(r, x, z))
}

/** The ten things the store sells. */
export const ITEMS = [
  { name: 'milk', icon: '🥛', colour: '#f4f6fb' },
  { name: 'bananas', icon: '🍌', colour: '#f7d23e' },
  { name: 'bread', icon: '🍞', colour: '#c98a4b' },
  { name: 'eggs', icon: '🥚', colour: '#f3e3c3' },
  { name: 'cheese', icon: '🧀', colour: '#f5b82e' },
  { name: 'apples', icon: '🍎', colour: '#e0342c' },
  { name: 'cereal', icon: '🥣', colour: '#f08a24' },
  { name: 'toilet paper', icon: '🧻', colour: '#fbfbf7' },
  { name: 'watermelon', icon: '🍉', colour: '#3c9a3f' },
  { name: 'soda', icon: '🥤', colour: '#d8252f' },
] as const

/** How many things are on a list. */
export const LIST_SIZE = 3

/** Everybody's grocery list, by player: three different things each, from the seed. */
export function listsFor(seed: number, count: number): number[][] {
  return Array.from({ length: count }, (_, i) => {
    const random = createRng(hashSeed(seed, `needs-a-walmart:list:${i}`))
    const kinds = ITEMS.map((_, k) => k)
    for (let k = kinds.length - 1; k > 0; k--) {
      const j = Math.floor(random() * (k + 1))
      ;[kinds[k], kinds[j]] = [kinds[j], kinds[k]]
    }
    return kinds.slice(0, LIST_SIZE).sort((a, b) => a - b)
  })
}

/** A place on a shelf for an item, and where to stand to reach it. */
export interface Slot {
  x: number
  z: number
  standX: number
  standZ: number
}

/** How far in from a shelf's edge its goods sit. */
const INSET = 0.3

/** Every place on the shelves an item can be stocked: along each face that looks onto the floor. */
export const SLOTS: readonly Slot[] = (() => {
  const slots: Slot[] = []
  const stand = 0.95
  for (const s of SHELVES) {
    const w = s.x1 - s.x0
    const d = s.z1 - s.z0
    if (w >= d) {
      // Long east to west: slots along the north and south faces, those facing the floor.
      for (let x = s.x0 + 0.8; x <= s.x1 - 0.8 + 1e-6; x += 1.6) {
        if (s.z0 > -STORE.halfZ + 1.5) slots.push({ x, z: s.z0 + INSET, standX: x, standZ: s.z0 - stand + INSET })
        if (s.z1 < STORE.halfZ - 1.5) slots.push({ x, z: s.z1 - INSET, standX: x, standZ: s.z1 + stand - INSET })
      }
    } else {
      for (let z = s.z0 + 0.8; z <= s.z1 - 0.8 + 1e-6; z += 1.6) {
        if (s.x0 > -STORE.halfX + 1.5) slots.push({ x: s.x0 + INSET, z, standX: s.x0 - stand + INSET, standZ: z })
        if (s.x1 < STORE.halfX - 1.5) slots.push({ x: s.x1 - INSET, z, standX: s.x1 + stand - INSET, standZ: z })
      }
    }
  }
  return slots
})()

/** One thing in the store as it is stocked. */
export interface Stocked {
  kind: number
  slot: number
}

const stocks = new Map<string, Stocked[]>()

/**
 * What is on the shelves at the start, and where: one of each thing for
 * everybody whose list has it, and one of anything on nobody's list, each on a
 * different slot, from the seed. The same seed and headcount, the same store.
 */
export function stockFor(seed: number, count: number): Stocked[] {
  const key = `${seed}:${count}`
  const known = stocks.get(key)
  if (known) return known
  const need = ITEMS.map(() => 0)
  for (const list of listsFor(seed, count)) for (const k of list) need[k] += 1
  const random = createRng(hashSeed(seed, `needs-a-walmart:stock:${count}`))
  const slots = SLOTS.map((_, i) => i)
  for (let k = slots.length - 1; k > 0; k--) {
    const j = Math.floor(random() * (k + 1))
    ;[slots[k], slots[j]] = [slots[j], slots[k]]
  }
  const stocked: Stocked[] = []
  need.forEach((n, kind) => {
    for (let c = 0; c < Math.max(1, n); c++) stocked.push({ kind, slot: slots[stocked.length] })
  })
  stocks.set(key, stocked)
  if (stocks.size > 16) stocks.delete(stocks.keys().next().value!)
  return stocked
}

/** Where player `index` of `count` starts: just inside the door, in a line, facing into the store. */
export function spawnPoint(index: number, count: number): { x: number; z: number; yaw: number } {
  const spread = Math.min(2, 16 / Math.max(1, count))
  return { x: (index - (count - 1) / 2) * spread, z: STORE.halfZ - 1.8, yaw: 0 }
}

/** Pushes a circle of radius `r` out of every solid and back inside the walls. */
export function collide(p: { x: number; z: number }, r: number): void {
  p.x = Math.max(-STORE.halfX + r, Math.min(STORE.halfX - r, p.x))
  p.z = Math.max(-STORE.halfZ + r, Math.min(STORE.halfZ - r, p.z))
  for (const s of SOLIDS) {
    const nx = Math.max(s.x0, Math.min(s.x1, p.x))
    const nz = Math.max(s.z0, Math.min(s.z1, p.z))
    const dx = p.x - nx
    const dz = p.z - nz
    const d = Math.hypot(dx, dz)
    if (d >= r) continue
    if (d > 1e-9) {
      p.x = nx + (dx / d) * r
      p.z = nz + (dz / d) * r
    } else {
      // Inside it: out by the nearest side that is still inside the store - a shelf against a wall is left towards the room.
      const sides: [number, () => void][] = [
        [p.x - s.x0, () => (p.x = s.x0 - r)],
        [s.x1 - p.x, () => (p.x = s.x1 + r)],
        [p.z - s.z0, () => (p.z = s.z0 - r)],
        [s.z1 - p.z, () => (p.z = s.z1 + r)],
      ]
      const inside = [s.x0 - r >= -STORE.halfX + r, s.x1 + r <= STORE.halfX - r, s.z0 - r >= -STORE.halfZ + r, s.z1 + r <= STORE.halfZ - r]
      const out = sides.map((side, k) => ({ d: side[0], go: side[1], ok: inside[k] })).filter((o) => o.ok).sort((a, b) => a.d - b.d)[0]
      out?.go()
    }
  }
}

/** Somewhere to put an item down on the floor near `x`, `z`: out of any shelf and inside the walls. */
export function floorSpot(x: number, z: number): { x: number; z: number } {
  const p = { x, z }
  collide(p, 0.35)
  collide(p, 0.35)
  return p
}

// The grid the stand-ins find their way on.

export const GRID = {
  /** Metres a cell. */
  cell: 0.5,
  cols: Math.round((STORE.halfX * 2) / 0.5),
  rows: Math.round((STORE.halfZ * 2) / 0.5),
} as const

/** The cell a point is in. */
export function cellOf(x: number, z: number): number {
  const c = Math.max(0, Math.min(GRID.cols - 1, Math.floor((x + STORE.halfX) / GRID.cell)))
  const r = Math.max(0, Math.min(GRID.rows - 1, Math.floor((z + STORE.halfZ) / GRID.cell)))
  return r * GRID.cols + c
}

/** The middle of a cell. */
export function cellMiddle(cell: number): { x: number; z: number } {
  return { x: -STORE.halfX + ((cell % GRID.cols) + 0.5) * GRID.cell, z: -STORE.halfZ + (Math.floor(cell / GRID.cols) + 0.5) * GRID.cell }
}

/** Which cells a body of radius `r` cannot stand in. */
function blockedFor(r: number): Uint8Array {
  const blocked = new Uint8Array(GRID.cols * GRID.rows)
  for (let i = 0; i < blocked.length; i++) {
    const m = cellMiddle(i)
    if (Math.abs(m.x) > STORE.halfX - r || Math.abs(m.z) > STORE.halfZ - r || SOLIDS.some((s) => inRect(s, m.x, m.z, r))) blocked[i] = 1
  }
  // Pockets nobody can get into from the door - behind the wall shelves' corners - count as blocked too,
  // so nothing is ever sent to walk to one.
  const reached = new Uint8Array(blocked.length)
  const start = cellOf(0, STORE.halfZ - 1.8)
  const queue = [start]
  reached[start] = 1
  while (queue.length) {
    const cur = queue.pop()!
    const c = cur % GRID.cols
    const row = Math.floor(cur / GRID.cols)
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nc = c + dc
      const nr = row + dr
      if (nc < 0 || nr < 0 || nc >= GRID.cols || nr >= GRID.rows) continue
      const next = nr * GRID.cols + nc
      if (blocked[next] || reached[next]) continue
      reached[next] = 1
      queue.push(next)
    }
  }
  for (let i = 0; i < blocked.length; i++) if (!reached[i]) blocked[i] = 1
  return blocked
}

let blockedCache: { r: number; cells: Uint8Array; nearest: Int32Array } | null = null

function cacheFor(r: number): { cells: Uint8Array; nearest: Int32Array } {
  if (!blockedCache || blockedCache.r !== r) {
    const cells = blockedFor(r)
    // For every cell, the nearest free one - itself if it is free - worked out once, not every time a stand-in brushes a shelf.
    const free: number[] = []
    for (let i = 0; i < cells.length; i++) if (!cells[i]) free.push(i)
    const nearest = new Int32Array(cells.length)
    for (let i = 0; i < cells.length; i++) {
      if (!cells[i]) {
        nearest[i] = i
        continue
      }
      const m = cellMiddle(i)
      let best = i
      let bestD = Infinity
      for (const f of free) {
        const n = cellMiddle(f)
        const d = (n.x - m.x) ** 2 + (n.z - m.z) ** 2
        if (d < bestD) {
          bestD = d
          best = f
        }
      }
      nearest[i] = best
    }
    blockedCache = { r, cells, nearest }
  }
  return blockedCache
}

export function blocked(r: number): Uint8Array {
  return cacheFor(r).cells
}

/** The nearest cell a body of radius `r` can stand in to a point. */
export function freeCell(x: number, z: number, r: number): number {
  return cacheFor(r).nearest[cellOf(x, z)]
}

const STEPS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
]

/**
 * How far it is to walk from `from` to every cell, in cells, round the shelves -
 * Dijkstra over eight neighbours, never cutting a corner of a blocked cell.
 */
export function walkField(from: number, r: number): Float64Array {
  const cells = blocked(r)
  const dist = new Float64Array(cells.length).fill(Infinity)
  dist[from] = 0
  // A binary heap of [distance, cell]; stale entries are skipped when popped.
  const heap: [number, number][] = [[0, from]]
  const push = (item: [number, number]) => {
    heap.push(item)
    let i = heap.length - 1
    while (i > 0) {
      const up = (i - 1) >> 1
      if (heap[up][0] <= heap[i][0]) break
      ;[heap[up], heap[i]] = [heap[i], heap[up]]
      i = up
    }
  }
  const pop = (): [number, number] => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  while (heap.length) {
    const [d0, cur] = pop()
    if (d0 > dist[cur]) continue
    const c = cur % GRID.cols
    const row = Math.floor(cur / GRID.cols)
    for (const [dc, dr, cost] of STEPS) {
      const nc = c + dc
      const nr = row + dr
      if (nc < 0 || nr < 0 || nc >= GRID.cols || nr >= GRID.rows) continue
      const next = nr * GRID.cols + nc
      if (cells[next]) continue
      if (dc !== 0 && dr !== 0 && (cells[row * GRID.cols + nc] || cells[nr * GRID.cols + c])) continue
      const d = d0 + cost
      if (d < dist[next] - 1e-6) {
        dist[next] = d
        push([d, next])
      }
    }
  }
  return dist
}

/** The way to step from a cell down a walk field towards where the field was made from: a unit vector, or none there. */
export function downhill(field: Float64Array, cell: number): { x: number; z: number } | null {
  const c = cell % GRID.cols
  const row = Math.floor(cell / GRID.cols)
  let best = -1
  let bestD = field[cell]
  for (const [dc, dr] of STEPS) {
    const nc = c + dc
    const nr = row + dr
    if (nc < 0 || nr < 0 || nc >= GRID.cols || nr >= GRID.rows) continue
    const next = nr * GRID.cols + nc
    if (field[next] < bestD - 1e-6) {
      bestD = field[next]
      best = next
    }
  }
  if (best < 0) return null
  const a = cellMiddle(cell)
  const b = cellMiddle(best)
  const d = Math.hypot(b.x - a.x, b.z - a.z)
  return { x: (b.x - a.x) / d, z: (b.z - a.z) / d }
}
