/**
 * Party Parade's course: a 180-space run from the start line to the treasure,
 * across nine islands joined by bridges - Wii Party's Island Race, rebuilt for
 * the Polyland cast.
 *
 * It is a route, not a loop. Spaces are still indices into one flat array, but
 * each one points at what comes next rather than being followed by i+1, which
 * is what lets the causeway exist: one fork partway round cuts straight across
 * the middle, skipping a third of the course for anyone willing to cross it.
 *
 * At this length the course is authored as a *shape* - the islands and the
 * waypoints between them - and the spaces are sampled along a smooth curve
 * through it at even spacing. Typing out 180 coordinates would be miserable to
 * tune, and it would let a bridge drift out of line with the path it carries;
 * deriving both from one curve means a bridge is simply a run of spaces that
 * landed on open water.
 */
import { noise } from '../../../lib/draw'

/** The camera's window onto the world, in world units. */
export const VIEW_W = 480
export const VIEW_H = 270

/** The whole course. Far larger than the view - the camera follows the action. */
export const WORLD_W = 1440
export const WORLD_H = 900

/** Spaces on the main road, start line to treasure. */
export const MAIN_COUNT = 180
/** Spaces on the causeway, the shortcut across the middle. */
export const SHORT_COUNT = 26

export type TileKind = 'start' | 'plain' | 'good' | 'bad' | 'hostile' | 'gate' | 'treasure'

/** What the leader has to roll to get past a checkpoint. */
export type GateRule = 'odd' | 'even' | 'high'

export const GATE_TEXT: Record<GateRule, string> = {
  odd: 'roll an odd number',
  even: 'roll an even number',
  high: 'roll above a five',
}

export function gateAllows(rule: GateRule, roll: number): boolean {
  if (rule === 'odd') return roll % 2 === 1
  if (rule === 'even') return roll % 2 === 0
  return roll > 5
}

/** What landing on a space does to you. */
export interface TileEffect {
  kind: 'forward' | 'back' | 'skip'
  amount: number
  text: string
}

export type IslandId = string

export interface Island {
  id: IslandId
  name: string
  cx: number
  cy: number
  rx: number
  ry: number
  seed: number
}

export interface BoardTile {
  x: number
  y: number
  kind: TileKind
  islandId: IslandId | null
  /** The next space along, or -1 at the treasure. */
  next: number
  /** The space behind, or -1 at the start line. Used when something sets you back. */
  prev: number
  /** The causeway, on the one space that forks. */
  alt: number | null
  gate: GateRule | null
  effect: TileEffect | null
}

export interface Pt {
  x: number
  y: number
}

const ISLAND_NAMES = [
  'Start Isle',
  'Kettle Rock',
  'Long Sand',
  'The Elbow',
  'Gull Reef',
  'Two Pines',
  'Old Anchor',
  'Cinder Bay',
  'Treasure Head',
]

/** The two stepping stones the causeway crosses on its way over the middle. */
const MID_NAMES = ['Halfway Rock', 'The Gamble']

function buildIslands(): Island[] {
  const out: Island[] = []
  // A horseshoe: bottom-left round the top and back down to bottom-right, so
  // the start line and the treasure sit apart with open water between them.
  for (let i = 0; i < ISLAND_NAMES.length; i++) {
    const a = ((135 + i * (270 / 8)) * Math.PI) / 180
    const reach = 0.93 + noise(i * 2.3) * 0.12
    out.push({
      id: `isle${i}`,
      name: ISLAND_NAMES[i],
      cx: WORLD_W / 2 + Math.cos(a) * 520 * reach,
      cy: WORLD_H / 2 + Math.sin(a) * 330 * reach,
      rx: 112 + noise(i * 4.7) * 44,
      ry: 68 + noise(i * 6.1) * 30,
      seed: i + 1,
    })
  }
  for (let i = 0; i < MID_NAMES.length; i++) {
    out.push({
      id: `mid${i}`,
      name: MID_NAMES[i],
      cx: WORLD_W / 2 + (i === 0 ? -128 : 132),
      cy: WORLD_H / 2 + (i === 0 ? -24 : 26),
      rx: 74,
      ry: 46,
      seed: 40 + i,
    })
  }
  return out
}

export const ISLANDS: Island[] = buildIslands()

const MAIN_ISLES = ISLANDS.slice(0, ISLAND_NAMES.length)
const MID_ISLES = ISLANDS.slice(ISLAND_NAMES.length)

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

/** Dense samples along an open curve, used only to measure it. */
function sampleOpen(way: Pt[], per = 40): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < way.length - 1; i++) {
    const p0 = way[Math.max(0, i - 1)]
    const p1 = way[i]
    const p2 = way[i + 1]
    const p3 = way[Math.min(way.length - 1, i + 2)]
    for (let s = 0; s < per; s++) {
      const t = s / per
      out.push({ x: catmull(p0.x, p1.x, p2.x, p3.x, t), y: catmull(p0.y, p1.y, p2.y, p3.y, t) })
    }
  }
  out.push(way[way.length - 1])
  return out
}

/** Walks a dense curve and drops a space every equal slice of its length. */
function evenlySpaced(dense: Pt[], count: number): Pt[] {
  const n = dense.length
  const cum: number[] = [0]
  for (let i = 1; i < n; i++) {
    const a = dense[i - 1]
    const b = dense[i]
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y))
  }
  const total = cum[n - 1]
  const out: Pt[] = []
  let at = 0
  for (let k = 0; k < count; k++) {
    const want = (k / Math.max(1, count - 1)) * total
    while (at < n - 2 && cum[at + 1] < want) at++
    const span = cum[at + 1] - cum[at] || 1
    const t = Math.min(1, (want - cum[at]) / span)
    const a = dense[at]
    const b = dense[at + 1]
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  return out
}

/** Island centres, with a waypoint pushed out to sea between neighbours so crossings bow outwards. */
function mainWaypoints(): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < MAIN_ISLES.length; i++) {
    const a = MAIN_ISLES[i]
    pts.push({ x: a.cx, y: a.cy })
    const b = MAIN_ISLES[i + 1]
    if (!b) break
    const mx = (a.cx + b.cx) / 2
    const my = (a.cy + b.cy) / 2
    const dx = mx - WORLD_W / 2
    const dy = my - WORLD_H / 2
    const d = Math.hypot(dx, dy) || 1
    const push = 22 + noise(i * 3.1) * 36
    pts.push({ x: mx + (dx / d) * push, y: my + (dy / d) * push })
  }
  return pts
}

function islandUnder(x: number, y: number): IslandId | null {
  for (const i of ISLANDS) {
    const dx = (x - i.cx) / (i.rx * 0.95)
    const dy = (y - i.cy) / (i.ry * 0.95)
    if (dx * dx + dy * dy <= 1) return i.id
  }
  return null
}

function nearestIndex(pts: Pt[], to: Pt): number {
  let best = 0
  let bestD = Infinity
  pts.forEach((p, i) => {
    const d = Math.hypot(p.x - to.x, p.y - to.y)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

function effectFor(kind: TileKind, i: number): TileEffect | null {
  if (kind === 'good') {
    const amount = 2 + Math.floor(noise(i * 5.3) * 3)
    return { kind: 'forward', amount, text: `A fair wind - forward ${amount}` }
  }
  if (kind === 'bad') {
    const amount = 2 + Math.floor(noise(i * 7.1) * 3)
    return { kind: 'back', amount, text: `Washed out - back ${amount}` }
  }
  if (kind === 'hostile') {
    // Half of them knock you back hard, half cost you your next go.
    if (noise(i * 9.7) < 0.5) {
      const amount = 5 + Math.floor(noise(i * 2.9) * 4)
      return { kind: 'back', amount, text: `Storm surge - back ${amount}` }
    }
    return { kind: 'skip', amount: 1, text: 'Stuck fast - miss a turn' }
  }
  return null
}

function kindFor(i: number): TileKind {
  const r = noise(i * 3.7 + 1.3)
  if (r < 0.62) return 'plain'
  if (r < 0.75) return 'good'
  if (r < 0.88) return 'bad'
  return 'hostile'
}

/** Where the causeway leaves and rejoins the main road, and the three checkpoints. */
export let FORK_INDEX = 0
export let REJOIN_INDEX = 0
export const SHORT_START = MAIN_COUNT
export let GATE_INDICES: number[] = []

function buildTiles(): BoardTile[] {
  const main = evenlySpaced(sampleOpen(mainWaypoints()), MAIN_COUNT)

  // The causeway leaves near the third island and rejoins near the seventh,
  // crossing the two stepping stones in the middle.
  FORK_INDEX = nearestIndex(main, { x: MAIN_ISLES[3].cx, y: MAIN_ISLES[3].cy })
  REJOIN_INDEX = nearestIndex(main, { x: MAIN_ISLES[6].cx, y: MAIN_ISLES[6].cy })

  const shortWay: Pt[] = [
    main[FORK_INDEX],
    { x: MID_ISLES[0].cx, y: MID_ISLES[0].cy },
    { x: MID_ISLES[1].cx, y: MID_ISLES[1].cy },
    main[REJOIN_INDEX],
  ]
  // Drop the two endpoints: they are the main-road spaces this joins onto.
  const short = evenlySpaced(sampleOpen(shortWay), SHORT_COUNT + 2).slice(1, SHORT_COUNT + 1)

  // Checkpoints go on stretches every route has to cross, so taking the
  // causeway can never duck one.
  GATE_INDICES = [26, 58, Math.min(MAIN_COUNT - 12, REJOIN_INDEX + 22)]
  const gateRules: GateRule[] = ['odd', 'even', 'high']

  const tiles: BoardTile[] = []

  main.forEach((p, i) => {
    const gateAt = GATE_INDICES.indexOf(i)
    let kind: TileKind = kindFor(i)
    if (i === 0) kind = 'start'
    else if (i === MAIN_COUNT - 1) kind = 'treasure'
    else if (gateAt >= 0) kind = 'gate'
    tiles.push({
      x: p.x,
      y: p.y,
      kind,
      islandId: islandUnder(p.x, p.y),
      next: i === MAIN_COUNT - 1 ? -1 : i + 1,
      prev: i === 0 ? -1 : i - 1,
      alt: null,
      gate: gateAt >= 0 ? gateRules[gateAt] : null,
      effect: gateAt >= 0 || i === 0 || i === MAIN_COUNT - 1 ? null : effectFor(kind, i),
    })
  })

  short.forEach((p, k) => {
    const i = SHORT_START + k
    // The causeway is shorter and meaner - nothing good grows out here.
    const r = noise(i * 3.7 + 1.3)
    const kind: TileKind = r < 0.5 ? 'plain' : r < 0.78 ? 'hostile' : 'bad'
    tiles.push({
      x: p.x,
      y: p.y,
      kind,
      islandId: islandUnder(p.x, p.y),
      next: k === SHORT_COUNT - 1 ? REJOIN_INDEX : i + 1,
      prev: k === 0 ? FORK_INDEX : i - 1,
      alt: null,
      gate: null,
      effect: effectFor(kind, i),
    })
  })

  tiles[FORK_INDEX].alt = SHORT_START
  return tiles
}

export const BOARD_TILES: BoardTile[] = buildTiles()

export const START_INDEX = 0
export const TREASURE_INDEX = MAIN_COUNT - 1

/** Total spaces, both routes. Not the length of a run - see distanceToGoal. */
export const TILE_COUNT = BOARD_TILES.length

// -------------------------------------------------------------- route maths

/** Spaces still to walk from here to the treasure, by the shortest route. */
function buildDistances(): number[] {
  const dist = new Array<number>(BOARD_TILES.length).fill(-1)
  const solve = (i: number, guard: number): number => {
    if (i < 0) return 0
    if (dist[i] >= 0) return dist[i]
    if (guard <= 0) return 0
    const t = BOARD_TILES[i]
    let best = t.next < 0 ? 0 : 1 + solve(t.next, guard - 1)
    if (t.alt !== null) best = Math.min(best, 1 + solve(t.alt, guard - 1))
    dist[i] = best
    return best
  }
  for (let i = BOARD_TILES.length - 1; i >= 0; i--) solve(i, BOARD_TILES.length + 4)
  return dist
}

export const DIST_TO_GOAL: number[] = buildDistances()

export function distanceToGoal(tileIndex: number): number {
  return DIST_TO_GOAL[tileIndex] ?? 0
}

export interface WalkResult {
  /** Every space stepped through, starting with the one you were on. */
  route: number[]
  /** Why the walk ended: out of steps, a fork to choose, a checkpoint, or the treasure. */
  stopped: 'steps' | 'fork' | 'gate' | 'goal'
  remaining: number
}

/**
 * Walks `steps` forward from `from`. Stops early at the fork (the walker picks
 * a route), at a checkpoint (everyone has to stop), and at the treasure.
 * `takeAlt` only applies to the very first step, for resuming out of a fork.
 */
export function walkForward(from: number, steps: number, takeAlt = false): WalkResult {
  const route = [from]
  let at = from
  let left = steps
  while (left > 0) {
    const t = BOARD_TILES[at]
    const first = route.length === 1
    const to = first && takeAlt && t.alt !== null ? t.alt : t.next
    if (to < 0) return { route, stopped: 'goal', remaining: left }
    route.push(to)
    at = to
    left--
    const landed = BOARD_TILES[at]
    if (at === TREASURE_INDEX) return { route, stopped: 'goal', remaining: left }
    if (left > 0 && landed.gate) return { route, stopped: 'gate', remaining: left }
    if (left > 0 && landed.alt !== null) return { route, stopped: 'fork', remaining: left }
  }
  return { route, stopped: 'steps', remaining: 0 }
}

/** Walks backwards down the `prev` chain, for anything that sets you back. */
export function walkBack(from: number, steps: number): number[] {
  const route = [from]
  let at = from
  for (let i = 0; i < steps; i++) {
    const p = BOARD_TILES[at].prev
    if (p < 0) break
    route.push(p)
    at = p
  }
  return route
}

/** Runs of consecutive spaces out over open water - one bridge each. */
export function bridgeSpans(): number[][] {
  const spans: number[][] = []
  const runs: number[][] = [
    Array.from({ length: MAIN_COUNT }, (_, i) => i),
    Array.from({ length: SHORT_COUNT }, (_, k) => SHORT_START + k),
  ]
  for (const run of runs) {
    let cur: number[] = []
    for (const i of run) {
      if (BOARD_TILES[i].islandId === null) cur.push(i)
      else if (cur.length) {
        spans.push(cur)
        cur = []
      }
    }
    if (cur.length) spans.push(cur)
  }
  return spans
}

export function islandById(id: IslandId): Island | undefined {
  return ISLANDS.find((i) => i.id === id)
}
