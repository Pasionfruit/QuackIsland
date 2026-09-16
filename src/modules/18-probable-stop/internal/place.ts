/**
 * Where Probable Stop happens, as numbers: a sandy ledge to choose on, three
 * bridges out over the sea, an island at the far end, and a sandbank to the
 * side for everybody who has fallen.
 *
 * Pure, so where everybody stands and what the reveal looks like at any moment
 * are worked out from the game and nothing else. Every browser draws the same
 * picture from the same state, and a test can check nobody stands in the sea
 * by mistake.
 *
 * World axes: x across, y up, z towards the camera. The bridges run from the
 * ledge (near, +z) to the island (far, -z).
 */
import { GAME, type Game, type Player } from './game'

export interface Rect {
  /** Middle. */
  x: number
  z: number
  width: number
  depth: number
}

export interface Spot {
  x: number
  y: number
  z: number
}

export const PLACE = {
  /** Where each bridge's middle is, across, left to right. */
  lanes: [-5.5, 0, 5.5] as readonly number[],
  bridgeWidth: 3,
  bridgeThickness: 0.35,
  /** Where the bridges start and end, along. */
  bridgeNear: 3.5,
  bridgeFar: -13,
  ledge: { x: 0, z: 6.5, width: 20, depth: 6 } as Rect,
  island: { x: 0, z: -16, width: 20, depth: 6 } as Rect,
  bank: { x: -14.5, z: 3, width: 5, depth: 11 } as Rect,
  /** How high the sand stands above the sea. */
  seaLevel: -3,
  /** Room between two people standing side by side. */
  spacing: 1.25,
} as const

/** Where the n-th person on a patch of ground stands, two across and back from the front. */
function slot(n: number, centreX: number, frontZ: number, across = 2, towardCamera = true): Spot {
  const col = n % across
  const row = Math.floor(n / across)
  return {
    x: centreX + (col - (across - 1) / 2) * PLACE.spacing,
    y: 0,
    z: frontZ + (towardCamera ? 1 : -1) * row * PLACE.spacing,
  }
}

/** Everybody on a path, in a steady order, so nobody swaps places when somebody arrives. */
function lineUp(players: readonly Player[]): Player[] {
  return [...players].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
}

/**
 * How far through the reveal we are, 0 to 1. 0 while choosing; 1 once it is
 * over, so the end of a game keeps the last reveal's picture.
 */
export function revealProgress(game: Game): number {
  if (game.phase === 'choosing') return 0
  if (game.phase === 'over') return 1
  return Math.max(0, Math.min(1, 1 - game.clock / GAME.revealTime))
}

const ease = (t: number) => {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

/**
 * The reveal, in beats. A held breath, then the paths that did not hold drop
 * and take their people with them, then everybody left walks across.
 */
export const BEATS = {
  drop: [0.2, 0.55] as const,
  cross: [0.35, 0.95] as const,
}

/** How far a bridge has dropped, 0 to 1, for a lane. */
export function bridgeDrop(game: Game, lane: number): number {
  if (game.phase === 'choosing' || game.safe.length === 0 || game.safe.includes(lane)) return 0
  const [from, to] = BEATS.drop
  return ease((revealProgress(game) - from) / (to - from))
}

/**
 * Where somebody should be standing right now.
 *
 * - **Choosing**: on the ledge, lined up behind the path they are on.
 * - **Reveal, their path held**: walking across it to the island.
 * - **Reveal, their path dropped this round**: going down with it.
 * - **Out from an earlier round**: on the sandbank, watching.
 * - **Over**: survivors on the island, everybody else on the bank.
 */
export function spotFor(game: Game, player: Player): Spot {
  const fellEarlier = !player.alive && player.outIn !== null && (player.outIn < game.round || game.phase === 'over')
  if (fellEarlier || (game.phase === 'choosing' && !player.alive)) {
    const watching = lineUp(game.players.filter((p) => !p.alive))
    const n = watching.indexOf(player)
    return slot(n, PLACE.bank.x, PLACE.bank.z - PLACE.bank.depth / 2 + 1, 3)
  }

  const onPath = lineUp(game.players.filter((p) => p.pick === player.pick && (p.alive || p.outIn === game.round)))
  const start = slot(Math.max(0, onPath.indexOf(player)), PLACE.lanes[player.pick], PLACE.bridgeNear + 1)

  if (game.phase === 'choosing') return start

  if (!player.alive) {
    // Going down with the bridge.
    const drop = bridgeDrop(game, player.pick)
    return { x: start.x, y: -drop * 9, z: start.z - drop * 4 }
  }

  const [from, to] = BEATS.cross
  const across = ease((revealProgress(game) - from) / (to - from))
  const end = slot(onPath.indexOf(player), PLACE.lanes[player.pick], PLACE.island.z + 1, 2, false)
  return {
    x: start.x + (end.x - start.x) * across,
    y: 0,
    z: start.z + (end.z - start.z) * across,
  }
}

/** Whether a spot is on solid ground: the ledge, the island, the bank, or a standing bridge. */
export function onGround(spot: Spot, game: Game): boolean {
  const inside = (r: Rect) =>
    Math.abs(spot.x - r.x) <= r.width / 2 && Math.abs(spot.z - r.z) <= r.depth / 2
  if (inside(PLACE.ledge) || inside(PLACE.island) || inside(PLACE.bank)) return true
  return PLACE.lanes.some(
    (x, lane) =>
      bridgeDrop(game, lane) === 0 &&
      Math.abs(spot.x - x) <= PLACE.bridgeWidth / 2 &&
      spot.z <= PLACE.bridgeNear &&
      spot.z >= PLACE.bridgeFar,
  )
}

/** The whole scene's footprint, for the camera to fit. */
export const BOUNDS = {
  minX: PLACE.bank.x - PLACE.bank.width / 2,
  maxX: PLACE.ledge.x + PLACE.ledge.width / 2,
  minZ: PLACE.island.z - PLACE.island.depth / 2,
  maxZ: PLACE.ledge.z + PLACE.ledge.depth / 2,
  minY: -1,
  maxY: 1.7,
} as const
