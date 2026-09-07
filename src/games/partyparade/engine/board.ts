/**
 * Party Parade's board: a fixed, hand-authored loop of tiles winding across
 * four islands joined by bridges over open water - Wii Party's Island Race,
 * rebuilt for the Polyland cast.
 *
 * The tile array is the only thing movement ever needs. A player's position
 * is an index into BOARD_TILES and nothing else, so moving is
 * `nextTileIndex(i, steps)` rather than a graph walk - a closed loop has no
 * branching exits, which is what makes this simpler than Case Closed's room
 * graph. ISLANDS and BRIDGES are backdrop geography that the renderer reads
 * and the rules never do.
 */

export const VIEW_W = 480
export const VIEW_H = 270

/** Where the water starts. Every island sits comfortably below this. */
export const HORIZON_Y = 34

/**
 * 'start' is the loop's origin, drawn with a flag so the lap is readable.
 * The other three are real kinds now, colour-coded from this phase on, even
 * though what landing on one *does* is a later phase's job.
 */
export type TileKind = 'start' | 'plain' | 'good' | 'bad' | 'hostile'

export type IslandId = 'startIsle' | 'northIsle' | 'eastIsle' | 'southIsle'

export interface Island {
  id: IslandId
  name: string
  cx: number
  cy: number
  rx: number
  ry: number
  /** Fixed seed for this island's outline wobble and its prop scatter, so neither reshuffles between reloads. */
  seed: number
}

export interface Bridge {
  id: string
  from: IslandId
  to: IslandId
  ax: number
  ay: number
  bx: number
  by: number
  /** Deck width in world units. */
  width: number
}

export interface BoardTile {
  x: number
  y: number
  kind: TileKind
  /** The island this tile stands on, or null for a tile out on a bridge span. */
  islandId: IslandId | null
}

export const ISLANDS: Island[] = [
  { id: 'startIsle', name: 'Start Isle', cx: 110, cy: 205, rx: 72, ry: 38, seed: 1 },
  { id: 'northIsle', name: 'North Isle', cx: 185, cy: 92, rx: 60, ry: 33, seed: 2 },
  { id: 'eastIsle', name: 'East Isle', cx: 378, cy: 118, rx: 74, ry: 40, seed: 3 },
  { id: 'southIsle', name: 'South Isle', cx: 330, cy: 215, rx: 62, ry: 35, seed: 4 },
]

export const BRIDGES: Bridge[] = [
  { id: 'start-north', from: 'startIsle', to: 'northIsle', ax: 153, ay: 180, bx: 172, by: 122, width: 15 },
  { id: 'north-east', from: 'northIsle', to: 'eastIsle', ax: 243, ay: 101, bx: 312, by: 112, width: 15 },
  { id: 'east-south', from: 'eastIsle', to: 'southIsle', ax: 378, ay: 153, bx: 352, by: 191, width: 15 },
  { id: 'south-start', from: 'southIsle', to: 'startIsle', ax: 274, ay: 214, bx: 184, by: 222, width: 15 },
]

/**
 * The loop, in play order. Index 0 is where every pawn starts, sitting where
 * the last bridge lands so a full lap reads as a lap.
 */
export const BOARD_TILES: BoardTile[] = [
  // Start Isle - the path lands from the south bridge, swings west around the
  // island, and climbs back out to the north.
  { x: 170, y: 223, kind: 'start', islandId: 'startIsle' },
  { x: 142, y: 232, kind: 'plain', islandId: 'startIsle' },
  { x: 114, y: 234, kind: 'good', islandId: 'startIsle' },
  { x: 88, y: 228, kind: 'plain', islandId: 'startIsle' },
  { x: 70, y: 212, kind: 'bad', islandId: 'startIsle' },
  { x: 76, y: 193, kind: 'plain', islandId: 'startIsle' },
  { x: 100, y: 182, kind: 'good', islandId: 'startIsle' },
  { x: 128, y: 180, kind: 'plain', islandId: 'startIsle' },
  { x: 150, y: 186, kind: 'plain', islandId: 'startIsle' },
  // Bridge north
  { x: 158, y: 162, kind: 'plain', islandId: null },
  { x: 165, y: 140, kind: 'hostile', islandId: null },
  // North Isle
  { x: 170, y: 112, kind: 'plain', islandId: 'northIsle' },
  { x: 180, y: 92, kind: 'good', islandId: 'northIsle' },
  { x: 200, y: 78, kind: 'plain', islandId: 'northIsle' },
  { x: 222, y: 82, kind: 'bad', islandId: 'northIsle' },
  { x: 238, y: 98, kind: 'plain', islandId: 'northIsle' },
  // Bridge east
  { x: 264, y: 105, kind: 'plain', islandId: null },
  { x: 288, y: 109, kind: 'plain', islandId: null },
  // East Isle - the biggest island, so the path loops right around its rim.
  { x: 322, y: 114, kind: 'plain', islandId: 'eastIsle' },
  { x: 344, y: 100, kind: 'good', islandId: 'eastIsle' },
  { x: 370, y: 92, kind: 'plain', islandId: 'eastIsle' },
  { x: 398, y: 98, kind: 'bad', islandId: 'eastIsle' },
  { x: 418, y: 116, kind: 'plain', islandId: 'eastIsle' },
  { x: 412, y: 140, kind: 'good', islandId: 'eastIsle' },
  { x: 390, y: 150, kind: 'plain', islandId: 'eastIsle' },
  // Bridge south
  { x: 372, y: 164, kind: 'plain', islandId: null },
  { x: 362, y: 179, kind: 'hostile', islandId: null },
  // South Isle
  { x: 352, y: 199, kind: 'plain', islandId: 'southIsle' },
  { x: 344, y: 220, kind: 'good', islandId: 'southIsle' },
  { x: 324, y: 232, kind: 'plain', islandId: 'southIsle' },
  { x: 300, y: 228, kind: 'bad', islandId: 'southIsle' },
  { x: 282, y: 214, kind: 'plain', islandId: 'southIsle' },
  // Bridge home, closing the loop back onto the start tile.
  { x: 248, y: 217, kind: 'plain', islandId: null },
  { x: 222, y: 220, kind: 'hostile', islandId: null },
  { x: 196, y: 222, kind: 'plain', islandId: null },
]

export const START_INDEX = 0

/** Everything movement needs: wrap forward around the loop (and backward, harmlessly). */
export function nextTileIndex(from: number, steps: number): number {
  const n = BOARD_TILES.length
  return (((from + steps) % n) + n) % n
}

export function islandById(id: IslandId): Island | undefined {
  return ISLANDS.find((i) => i.id === id)
}
