/**
 * Party Parade's board: a 180-space loop winding across nine islands joined
 * by bridges over open water - Wii Party's Island Race, rebuilt for the
 * Polyland cast.
 *
 * The tile array is the only thing movement ever needs. A player's position
 * is an index into BOARD_TILES and nothing else, so moving is
 * `nextTileIndex(i, steps)` rather than a graph walk - a closed loop has no
 * branching exits. Islands and bridges are backdrop the renderer reads and
 * the rules never do.
 *
 * At 180 spaces the loop is far too long to hand-place, so the *shape* is
 * authored - nine islands and the waypoints between them - and the spaces are
 * sampled along a smooth closed curve through it at even spacing. That also
 * means the bridges cannot drift out of line with the path: a bridge is
 * simply a run of consecutive spaces that landed on open water.
 */
import { noise } from '../../../lib/draw'

/** The camera's window onto the world, in world units. */
export const VIEW_W = 480
export const VIEW_H = 270

/** The whole board. Far larger than the view - the camera follows the action. */
export const WORLD_W = 1440
export const WORLD_H = 900

export const TILE_COUNT = 180

/**
 * 'start' is the loop's origin, drawn with a flag so a lap is readable. The
 * other three are real kinds, colour-coded from here on, even though what
 * landing on one *does* is a later phase's job.
 */
export type TileKind = 'start' | 'plain' | 'good' | 'bad' | 'hostile'

export type IslandId = string

export interface Island {
  id: IslandId
  name: string
  cx: number
  cy: number
  rx: number
  ry: number
  /** Fixed seed for this island's outline wobble and prop scatter, so neither reshuffles between reloads. */
  seed: number
}

export interface BoardTile {
  x: number
  y: number
  kind: TileKind
  /** The island this space stands on, or null for a space out on a bridge. */
  islandId: IslandId | null
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
  'Last Light',
]

function buildIslands(): Island[] {
  const n = ISLAND_NAMES.length
  const out: Island[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    const reach = 0.9 + noise(i * 2.3) * 0.18
    out.push({
      id: `isle${i}`,
      name: ISLAND_NAMES[i],
      cx: WORLD_W / 2 + Math.cos(a) * 515 * reach,
      cy: WORLD_H / 2 + Math.sin(a) * 310 * reach,
      rx: 116 + noise(i * 4.7) * 48,
      ry: 70 + noise(i * 6.1) * 32,
      seed: i + 1,
    })
  }
  return out
}

export const ISLANDS: Island[] = buildIslands()

/**
 * The curve's control points: each island's middle, with a waypoint pushed
 * out to sea between neighbours so the crossings bow outwards instead of
 * cutting the corner.
 */
function buildWaypoints(islands: Island[]): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < islands.length; i++) {
    const a = islands[i]
    const b = islands[(i + 1) % islands.length]
    pts.push({ x: a.cx, y: a.cy })
    const mx = (a.cx + b.cx) / 2
    const my = (a.cy + b.cy) / 2
    const dx = mx - WORLD_W / 2
    const dy = my - WORLD_H / 2
    const d = Math.hypot(dx, dy) || 1
    const push = 24 + noise(i * 3.1) * 40
    pts.push({ x: mx + (dx / d) * push, y: my + (dy / d) * push })
  }
  return pts
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

/** Dense samples along the closed curve, used only to measure it. */
function sampleCurve(way: Pt[], per = 40): Pt[] {
  const n = way.length
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const p0 = way[(i - 1 + n) % n]
    const p1 = way[i]
    const p2 = way[(i + 1) % n]
    const p3 = way[(i + 2) % n]
    for (let s = 0; s < per; s++) {
      const t = s / per
      out.push({ x: catmull(p0.x, p1.x, p2.x, p3.x, t), y: catmull(p0.y, p1.y, p2.y, p3.y, t) })
    }
  }
  return out
}

/** Walks the dense curve and drops a space every equal slice of its length. */
function evenlySpaced(dense: Pt[], count: number): Pt[] {
  const n = dense.length
  const cum: number[] = [0]
  for (let i = 1; i <= n; i++) {
    const a = dense[i - 1]
    const b = dense[i % n]
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y))
  }
  const total = cum[n]
  const out: Pt[] = []
  let at = 0
  for (let k = 0; k < count; k++) {
    const want = (k / count) * total
    while (at < n && cum[at + 1] < want) at++
    const span = cum[at + 1] - cum[at] || 1
    const t = (want - cum[at]) / span
    const a = dense[at]
    const b = dense[(at + 1) % n]
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  return out
}

function islandUnder(x: number, y: number): IslandId | null {
  for (const i of ISLANDS) {
    const dx = (x - i.cx) / (i.rx * 0.95)
    const dy = (y - i.cy) / (i.ry * 0.95)
    if (dx * dx + dy * dy <= 1) return i.id
  }
  return null
}

function kindFor(i: number): TileKind {
  if (i === 0) return 'start'
  // Roughly two thirds open road, then good outnumbering bad and hostile -
  // generous, but the loop is long and most turns should just be a walk.
  const r = noise(i * 3.7 + 1.3)
  if (r < 0.62) return 'plain'
  if (r < 0.75) return 'good'
  if (r < 0.88) return 'bad'
  return 'hostile'
}

function buildTiles(): BoardTile[] {
  const pts = evenlySpaced(sampleCurve(buildWaypoints(ISLANDS)), TILE_COUNT)
  return pts.map((p, i) => ({
    x: p.x,
    y: p.y,
    kind: kindFor(i),
    islandId: islandUnder(p.x, p.y),
  }))
}

export const BOARD_TILES: BoardTile[] = buildTiles()

export const START_INDEX = 0

/** Everything movement needs: wrap forward around the loop (and backward, harmlessly). */
export function nextTileIndex(from: number, steps: number): number {
  const n = BOARD_TILES.length
  return (((from + steps) % n) + n) % n
}

/**
 * Runs of consecutive spaces out over open water. Each one is a bridge, so a
 * bridge always lands exactly on the path rather than being placed by hand
 * and drifting away from it.
 */
export function bridgeSpans(): number[][] {
  const spans: number[][] = []
  const n = BOARD_TILES.length
  let seen = 0
  let i = 0
  // Start from a space that is on land, so a span never gets split across the
  // wrap point and drawn as two stubs.
  while (i < n && BOARD_TILES[i].islandId === null) i++
  const from = i % n
  let run: number[] = []
  while (seen < n) {
    const idx = (from + seen) % n
    if (BOARD_TILES[idx].islandId === null) {
      run.push(idx)
    } else if (run.length) {
      spans.push(run)
      run = []
    }
    seen++
  }
  if (run.length) spans.push(run)
  return spans
}

export function islandById(id: IslandId): Island | undefined {
  return ISLANDS.find((i) => i.id === id)
}
