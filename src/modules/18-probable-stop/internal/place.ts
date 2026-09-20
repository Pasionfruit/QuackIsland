/**
 * Where Probable Stop happens, as numbers: the flat top of one peak to choose
 * on, three rope-and-plank bridges out over a misty valley, the top of a second
 * peak at the far end, and a cloud to the side for everybody who has fallen.
 *
 * Pure, so where everybody stands and what the reveal looks like at any moment
 * are worked out from the game and nothing else. Every browser draws the same
 * picture from the same state, and a test can check nobody stands on thin air
 * by mistake.
 *
 * World axes: x across, y up, z towards the camera. The bridges run from the
 * ledge (near, +z) to the island (far, -z) - the names of the two peak tops.
 */
import { createRng, hashSeed } from '../../00-core'
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
  /** The top of the near peak, where everybody chooses. */
  ledge: { x: 0, z: 6.5, width: 20, depth: 6 } as Rect,
  /** The top of the far peak, where the bridges that hold lead. */
  island: { x: 0, z: -16, width: 20, depth: 6 } as Rect,
  /** The cloud the fallen watch from. */
  cloud: { x: -14.5, z: 3, width: 5, depth: 11 } as Rect,
  /** How far the middle of a bridge sags below its ends. */
  sag: 0.55,
  /** The top of the mist filling the valley. Anybody under it is gone from view. */
  mistTop: -5,
  /** How far anybody falls before we stop counting. Deep in the mist. */
  fallTo: -70,
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
 * The reveal, in beats. Everybody sets off across their bridge together; the
 * bridges that will not hold start to shiver; then they snap in the middle and
 * take their people down into the mist, while everybody else walks on across.
 */
export const BEATS = {
  walk: [0.03, 0.97] as const,
  shiver: [0.24, 0.4] as const,
  drop: [0.4, 0.8] as const,
  /** Somebody whose bridge will not hold **turns grey** over this, finishing just as it gives way. */
  grey: [0.14, 0.38] as const,
}

/**
 * How grey somebody is, 0 to 1. Nobody is until it is time: **a player whose
 * bridge is about to go turns grey over the shiver, finishing before it snaps** - so
 * the colour draining out of them is the warning, and not the first moment of the reveal
 * that gives it away. Anybody who fell in an earlier round, or once the game is over,
 * is grey all the way; anybody still in, not at all.
 */
export function greyness(game: Game, player: Player): number {
  if (player.alive) return 0
  const fellEarlier = player.outIn !== null && (player.outIn < game.round || game.phase === 'over')
  if (fellEarlier || game.phase === 'choosing') return 1
  const [from, to] = BEATS.grey
  return ease((revealProgress(game) - from) / (to - from))
}

/** How far a bridge has dropped, 0 to 1, for a lane. */
export function bridgeDrop(game: Game, lane: number): number {
  if (game.phase === 'choosing' || game.safe.length === 0 || game.safe.includes(lane)) return 0
  const [from, to] = BEATS.drop
  return ease((revealProgress(game) - from) / (to - from))
}

/** Seconds since the bridges that did not hold gave way; 0 before. */
export function fallTime(game: Game): number {
  if (game.phase === 'choosing') return 0
  return Math.max(0, revealProgress(game) - BEATS.drop[0]) * GAME.revealTime
}

/** How high a bridge's deck is, somewhere along it: level at the ends, sagging in the middle. */
export function deckHeight(z: number): number {
  const half = (PLACE.bridgeNear - PLACE.bridgeFar) / 2
  const u = (z - (PLACE.bridgeNear + PLACE.bridgeFar) / 2) / half
  if (Math.abs(u) >= 1) return 0
  return -PLACE.sag * (1 - u * u)
}

/** How far along the walk across everybody is, 0 to 1. Steady in the middle, easing off at each end. */
function walked(t: number): number {
  const [from, to] = BEATS.walk
  const c = Math.max(0, Math.min(1, (t - from) / (to - from)))
  return 0.6 * c + 0.4 * ease(c)
}

/**
 * What a bridge looks like. How worn it is, and nothing else: which bridges
 * hold is decided from the game's secret seed at the reveal, and the look from
 * its public id, drawn apart from it, so a rickety bridge is exactly as likely
 * to hold as a sturdy one.
 */
export const CONDITIONS = ['sturdy', 'weathered', 'patched', 'rickety'] as const
export type Condition = (typeof CONDITIONS)[number]

/** The look of a lane's bridge this round. Three different ones each round, new every round. */
export function bridgeCondition(game: Pick<Game, 'id' | 'round'>, lane: number): Condition {
  const random = createRng(hashSeed(game.id, `probable-stop:bridges:${game.round}`))
  const order = [...CONDITIONS]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order[Math.max(0, Math.min(order.length - 1, lane))]
}

/** How far down somebody who has been falling for `t` seconds is, from `y`. */
function fallen(y: number, t: number): number {
  return Math.max(PLACE.fallTo, y - 0.5 * 9.8 * t * t)
}

/**
 * Where somebody should be standing right now.
 *
 * - **Choosing**: on the ledge, lined up behind the path they are on.
 * - **Reveal**: everybody walks out across their bridge, following its sag.
 *   Those whose path held carry on to the far peak; those whose path did not
 *   stop where they were when it snapped, and fall into the mist.
 * - **Out from an earlier round**: on the cloud, watching.
 * - **Over**: survivors on the far peak, everybody else on the cloud.
 */
export function spotFor(game: Game, player: Player): Spot {
  const fellEarlier = !player.alive && player.outIn !== null && (player.outIn < game.round || game.phase === 'over')
  if (fellEarlier || (game.phase === 'choosing' && !player.alive)) {
    const watching = lineUp(game.players.filter((p) => !p.alive))
    const n = watching.indexOf(player)
    return slot(n, PLACE.cloud.x, PLACE.cloud.z - PLACE.cloud.depth / 2 + 1, 3)
  }

  const onPath = lineUp(game.players.filter((p) => p.pick === player.pick && (p.alive || p.outIn === game.round)))
  const n = Math.max(0, onPath.indexOf(player))
  const start = slot(n, PLACE.lanes[player.pick], PLACE.bridgeNear + 1)

  if (game.phase === 'choosing') return start

  // Everybody walks out together; the ones on a bridge that is going stop
  // where they are when it goes. The far end keeps the same order, front row
  // first, so nobody walks through anybody.
  const t = revealProgress(game)
  const doomed = !player.alive
  const along = walked(doomed ? Math.min(t, BEATS.drop[0]) : t)
  const end = slot(n, PLACE.lanes[player.pick], PLACE.island.z - PLACE.island.depth / 2 + 1)
  const x = start.x + (end.x - start.x) * along
  const z = start.z + (end.z - start.z) * along
  const y = deckHeight(z)
  return { x, y: doomed ? fallen(y, fallTime(game)) : y, z }
}

/** Whether a spot is on something that holds you up: a peak, the cloud, or a standing bridge. */
export function onGround(spot: Spot, game: Game): boolean {
  const inside = (r: Rect) =>
    Math.abs(spot.x - r.x) <= r.width / 2 && Math.abs(spot.z - r.z) <= r.depth / 2
  if (inside(PLACE.ledge) || inside(PLACE.island) || inside(PLACE.cloud)) return true
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
  minX: PLACE.cloud.x - PLACE.cloud.width / 2,
  maxX: PLACE.ledge.x + PLACE.ledge.width / 2,
  minZ: PLACE.island.z - PLACE.island.depth / 2,
  maxZ: PLACE.ledge.z + PLACE.ledge.depth / 2,
  minY: -1,
  maxY: 1.7,
} as const
