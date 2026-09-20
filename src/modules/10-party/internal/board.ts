/**
 * The board: a hundred and twenty tiles winding from the island's edge up to
 * the crater at the top of the volcano.
 *
 * It is a spiral with a **wave** in it, not a clean one. The radius carries a
 * sine wave on top of the steady march inwards, so the track leans out and in
 * as it climbs rather than tightening at a constant rate - which is the
 * difference between a road somebody laid and a curve somebody plotted.
 *
 * Three things make the geometry awkward, and one decision deals with all of
 * them:
 *
 * - the track **climbs**, so a metre of map is more than a metre of walking,
 *   and it is walking that the spacing is for;
 * - the island is **not round**, so a given angle is a different distance out
 *   than the one before it;
 * - the wave means the radius is not even monotonic.
 *
 * So rather than integrating a speed function - which would need the
 * derivative of all three - the curve is **walked**: sample it finely in three
 * dimensions, add up the actual straight-line hops, and step tiles along the
 * total. Fewer moving parts, nothing to keep in step with the island, and it
 * stays right no matter what shape the island becomes next.
 */
import { PLAYER } from '../../02-player'
import { ISLAND, outlineAt, partyHeightLocalAt } from './island'

export const BOARD = {
  /** How many tiles. A hundred and twenty, as asked for. */
  tiles: 120,
  /**
   * Where the race starts: out at the edge of the island.
   *
   * On the plateau just outside the volcano's foot, so the first tile is on
   * flat ground with the beach behind it and the whole mountain ahead.
   */
  outer: ISLAND.volcano + 18,
  /**
   * Where it finishes: on the crater floor, beside the treasure.
   *
   * Inside the rim rather than on it. The rim is a 58-degree crease, so a tile
   * three metres outside it sits five metres down a wall - which is a strange
   * place to finish a race whose prize is on the flat ground just past it.
   *
   * Far enough in that the whole tile is inside it, too: a tile reaches about
   * five metres from its middle at the corner, so its middle has to be at
   * least that far in from the rim or the corner hangs over the wall.
   */
  inner: ISLAND.crater * 0.7,
  /** How many times round. */
  turns: 3,
  /**
   * How far the track leans in and out of a true spiral, in metres.
   *
   * This is the "not perfectly" part. It has to stay well under half the gap
   * between one lap and the next or the track would touch itself - there is a
   * test - and it is worth a good fraction of that, because a wave you have to
   * look for is not worth having.
   */
  wave: 17,
  /** How many times it leans out and back over the whole climb. */
  waveCycles: 7,
  /** Where in the wave the track starts, so tile one is not on a crest. */
  wavePhase: 0.6,
  /**
   * How far a tile reaches from its middle to its edge: **room for a full party
   * of eight ducks to stand on it at once, and walk about**.
   *
   * Written against the duck rather than as a number, because that is the
   * actual requirement. Eight discs fit in a circle 3.31 of their radii out, so
   * the floor is 3.5 duck radii; this is three times that, which is what
   * leaves room to move rather than just to stand. The rounded corners cost
   * nothing at either size: the inscribed circle is what has to hold.
   */
  tileRadius: PLAYER.radius * 10.5,
  /**
   * How far a tile sits above the ground, in metres.
   *
   * Enough to read as a board laid *on* the island rather than painted into
   * it. Tiles are also tilted to the slope they sit on, which is what stops
   * the uphill corner burying itself on a cone this steep.
   */
  tileLift: 0.5,
  /** How thick a tile is. */
  tileThickness: 0.22,
  /** How round the corners of a tile are, as a fraction of its half-width. */
  tileRound: 0.34,
  /** Every nth tile is marked, so progress is countable at a glance. */
  markEvery: 10,
  /** How wide each dot of the dotted line between tiles is, across. */
  dotRadius: 0.32,
  /** Roughly how far apart the dots are, along the ground, in metres. */
  dotSpacing: 1.7,
  /**
   * How far the line stops short of a tile's edge, in metres.
   *
   * The tile is a square turned to face along the track, and the track leans up
   * to twenty degrees off dead ahead where the wave is steepest, so a tile is a
   * little longer along the road than it is wide. This covers that and leaves a
   * gap you can see.
   */
  dotMargin: 0.9,
  /** How far a dot sits above the ground, in metres. Less than a tile. */
  dotLift: 0.16,
} as const

export interface Tile {
  /** 0 at the start, out by the beach; the last one is at the crater. */
  index: number
  /** Island-local, relative to the middle; the view puts them in the world. */
  x: number
  z: number
  /** The height of the ground under it. */
  y: number
  /** How far round the track, for anything that wants to face along it. */
  angle: number
  /** Local radius, before the island's outline warp. */
  radius: number
  /** Every tenth one, for counting. */
  marked: boolean
}

const TURN = Math.PI * 2

/**
 * How far out the track is at a given angle: a steady march inwards, plus the
 * wave that stops it being a plain spiral.
 */
export function radiusAt(theta: number): number {
  const total = BOARD.turns * TURN
  const t = Math.min(1, Math.max(0, theta / total))
  const straight = BOARD.outer + (BOARD.inner - BOARD.outer) * t
  // The wave is eased out at both ends, so the track starts exactly at the
  // island's edge and finishes exactly on the crater rim rather than wherever
  // the sine happened to be.
  const ends = Math.sin(Math.PI * t)
  return straight + BOARD.wave * ends * Math.sin(t * BOARD.waveCycles * TURN + BOARD.wavePhase)
}

/** A point on the track, in island-local space, on the ground it climbs. */
export function trackPointAt(theta: number): { x: number; y: number; z: number; radius: number } {
  const radius = radiusAt(theta)
  const out = radius * outlineAt(theta)
  return {
    x: Math.cos(theta) * out,
    y: partyHeightLocalAt(radius, theta),
    z: Math.sin(theta) * out,
    radius,
  }
}

/**
 * The track walked from end to end, as a table of angle against distance.
 *
 * Straight-line hops between closely spaced samples. Chords rather than arcs,
 * so it reads a hair short - four thousand steps over two kilometres puts that
 * error far below a millimetre, and it is the *even spacing* that matters here
 * rather than the absolute length.
 */
function arcTable(steps = 4000): { theta: number[]; arc: number[] } {
  const total = BOARD.turns * TURN
  const theta: number[] = [0]
  const arc: number[] = [0]

  let previous = trackPointAt(0)
  let running = 0
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * total
    const here = trackPointAt(t)
    running += Math.hypot(here.x - previous.x, here.y - previous.y, here.z - previous.z)
    previous = here
    theta.push(t)
    arc.push(running)
  }
  return { theta, arc }
}

/** The angle at which the track has run a given distance. */
function angleAtLength(table: { theta: number[]; arc: number[] }, target: number): number {
  const { theta, arc } = table
  if (target <= 0) return theta[0]
  const last = arc.length - 1
  if (target >= arc[last]) return theta[last]

  // The table is sorted, so this is a binary search rather than a walk.
  let low = 0
  let high = last
  while (high - low > 1) {
    const mid = (low + high) >> 1
    if (arc[mid] <= target) low = mid
    else high = mid
  }
  const span = arc[high] - arc[low]
  const t = span > 1e-12 ? (target - arc[low]) / span : 0
  return theta[low] + (theta[high] - theta[low]) * t
}

/**
 * Every tile, from the start at the island's edge to the finish at the crater.
 *
 * Positions are island-local; the view puts them in the world. Kept that way
 * so the maths can be checked without knowing where the island happens to be.
 */
export function buildBoard(count: number = BOARD.tiles): Tile[] {
  const table = arcTable()
  const total = table.arc[table.arc.length - 1]
  const tiles: Tile[] = []
  // `count - 1` gaps between `count` tiles, so the last one lands exactly on
  // the end of the track rather than one gap short of it.
  const gaps = Math.max(1, count - 1)

  for (let i = 0; i < count; i++) {
    const angle = angleAtLength(table, (i / gaps) * total)
    const point = trackPointAt(angle)
    tiles.push({
      index: i,
      x: point.x,
      z: point.z,
      y: point.y,
      angle,
      radius: point.radius,
      marked: i > 0 && i < count - 1 && (i + 1) % BOARD.markEvery === 0,
    })
  }
  return tiles
}

export interface ConnectorDot {
  /** Island-local, on the ground; the view lifts it and lays it in the slope. */
  x: number
  y: number
  z: number
}

/**
 * The dotted line joining each tile to the next, as the dots that make it up.
 *
 * Walked along the very same curve the tiles are, so the line runs down the
 * middle of the road rather than cutting corners between tile centres - which
 * on a spiral this tight would put it off the track. Each gap gets a whole
 * number of dots, spread evenly and centred, so the line stops the same
 * distance short of both tiles instead of running out mid-dot.
 */
export function connectorDots(count: number = BOARD.tiles): ConnectorDot[] {
  const table = arcTable()
  const total = table.arc[table.arc.length - 1]
  const gaps = Math.max(1, count - 1)
  const step = total / gaps
  const clear = BOARD.tileRadius + BOARD.dotMargin
  const dots: ConnectorDot[] = []

  for (let i = 0; i < gaps; i++) {
    const from = i * step + clear
    const to = (i + 1) * step - clear
    if (to <= from) continue
    const n = Math.max(1, Math.round((to - from) / BOARD.dotSpacing))
    for (let k = 0; k < n; k++) {
      const point = trackPointAt(angleAtLength(table, from + ((k + 0.5) * (to - from)) / n))
      dots.push({ x: point.x, y: point.y, z: point.z })
    }
  }
  return dots
}

/** How long the whole track is, in metres, along the ground it climbs. */
export function trackLength(): number {
  const table = arcTable()
  return table.arc[table.arc.length - 1]
}

/** The gap between consecutive tiles, in metres. */
export function tileSpacing(count: number = BOARD.tiles): number {
  return trackLength() / Math.max(1, count - 1)
}
