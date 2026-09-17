/**
 * One game, on the wire.
 *
 * The host sends the clock, the turn order, whose turn it is and when it
 * started, which outline is on the board, and everybody's score. The outlines
 * are not sent - the seed makes them - and neither is the drawing.
 *
 * **The drawing comes from the drawer**, to everybody at once: batches of pen
 * points, twenty a second, each saying which turn, which outline and which
 * attempt they belong to, and whether the pen came up after them. Everybody - the
 * host deciding, the others watching - runs them through the same pen the
 * drawer's own screen did, so every screen has the same drawing and the same
 * dishes. The relay is a WebSocket: batches arrive, and arrive in order.
 */
import { MAX_PLAYERS } from './setup'
import { TRACE, penDown, penMove, penUp, phase, drawer, type Game, type Player } from './rules'

export const SNAPSHOT_TAG = 'cc'
export const INK_TAG = 'cc-ink'

/** `[id, score, left 0/1]`. */
export type WirePlayer = [string, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  order: number[]
  turn: number
  startsAt: number
  outline: number
  strokes: number
  players: WirePlayer[]
}

export interface Ink {
  game: number
  turn: number
  outline: number
  stroke: number
  /** Board points, x then y, in thousandths. */
  points: number[]
  up: boolean
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const cs = (v: number) => Math.round(v * 100)
/** The furthest a point can be from the middle of the board, thousandths. */
const REACH = Math.round((1 + TRACE.margin) * 1000)
/** The most points in one batch: three hundred at the board's edge still fit a relay message. */
export const MAX_POINTS = 300

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: cs(game.elapsed) / 100,
    o: game.over ? 1 : 0,
    q: game.order,
    n: game.turn,
    a: cs(game.startsAt),
    k: game.outline,
    c: game.strokes,
    p: game.players.map((p): WirePlayer => [p.id, p.score, p.left ? 1 : 0]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_PLAYERS) return null
  const count = message.p.length
  const order = message.q
  if (!Array.isArray(order) || order.length !== count || [...order].sort((a, b) => a - b).some((v, i) => v !== i)) return null
  if (!isCount(message.n) || message.n >= count || !isCount(message.a) || !isCount(message.k) || !isCount(message.c)) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 3) return null
    const [id, score, left] = raw
    if (typeof id !== 'string' || id.length === 0 || !isCount(score) || score > 999 || (left !== 0 && left !== 1)) return null
    players.push([id, score, left])
  }
  return {
    id: message.g as number,
    seed: message.s as number,
    elapsed: message.e,
    over: message.o === 1,
    order: order as number[],
    turn: message.n,
    startsAt: message.a / 100,
    outline: message.k,
    strokes: message.c,
    players,
  }
}

/**
 * Brings a copy into line with the host's: everything but the clock, which the
 * caller eases, and the drawing, which comes from the drawer. Within the same
 * turn a copy may be a dish ahead of the host - it heard the pen first - so it
 * keeps whichever outline is further on, and the drawer's higher score.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  const fresh = game.id !== snap.id
  if (fresh) {
    Object.assign(game, { players: [], elapsed: snap.elapsed, turn: -1, stroke: null, dish: null, erasedAt: null, lift: false, strokes: 0, outline: 0 })
  }
  const sameTurn = !fresh && game.turn === snap.turn
  const drawing = snap.order[snap.turn]
  const before = game.players
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  game.order = snap.order
  game.players = snap.players.map(([id, score, left], index): Player => {
    const known = before.find((p) => p.id === id)
    const ahead = sameTurn && index === drawing && known ? Math.max(known.score, score) : score
    return { id, mine: id === me, bot: known?.bot ?? false, score: ahead, left: left === 1 }
  })
  game.startsAt = snap.startsAt
  if (!sameTurn) {
    Object.assign(game, { turn: snap.turn, outline: snap.outline, strokes: snap.strokes, stroke: null, dish: null, erasedAt: null, lift: false })
  } else {
    if (snap.outline > game.outline) {
      game.outline = snap.outline
      game.stroke = null
      game.lift = false
    }
    game.strokes = Math.max(game.strokes, snap.strokes)
  }
  return game
}

export function encodeInk(ink: Ink): Record<string, unknown> {
  return { t: INK_TAG, g: ink.game, n: ink.turn, k: ink.outline, s: ink.stroke, p: ink.points, u: ink.up ? 1 : 0 }
}

export function decodeInk(message: Record<string, unknown>): Ink | null {
  if (message.t !== INK_TAG) return null
  if (!isCount(message.g) || !isCount(message.n) || !isCount(message.k) || !isCount(message.s) || (message.u !== 0 && message.u !== 1)) return null
  const points = message.p
  if (!Array.isArray(points) || points.length % 2 !== 0 || points.length > MAX_POINTS * 2) return null
  if (!points.every((v) => Number.isInteger(v) && Math.abs(v) <= REACH)) return null
  return { game: message.g as number, turn: message.n, outline: message.k, stroke: message.s, points: points as number[], up: message.u === 1 }
}

/**
 * Runs a batch of the drawer's pen through a copy of the game: a new attempt's
 * first point puts the pen down, the rest move it, and the pen comes up after
 * if the batch says so. A batch for another turn or another outline, from
 * anybody but the drawer, or for an attempt already over, changes nothing.
 */
export function applyInk(game: Game, player: number, ink: Ink): void {
  if (ink.game !== game.id || ink.turn !== game.turn || player !== drawer(game) || phase(game) !== 'drawing') return
  if (ink.outline === game.outline) {
    for (let i = 0; i < ink.points.length; i += 2) {
      const x = ink.points[i] / 1000
      const y = ink.points[i + 1] / 1000
      if (game.stroke?.id === ink.stroke) {
        if (penMove(game, player, x, y) === 'accepted') break
      } else if (!game.stroke && ink.stroke > game.strokes) {
        penDown(game, player, x, y, ink.stroke)
      }
    }
  }
  if (ink.up && (game.stroke === null || game.stroke.id === ink.stroke)) penUp(game, player)
}
