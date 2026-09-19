/**
 * One game, on the wire.
 *
 * The host sends the clock, whose turn it is and when its aiming started, the
 * thrower's aim - where they stand and at what angle - when they rolled, and
 * everybody's score. **The column and the crabs the coconut hits are not sent**:
 * the column is the seed's and the turn's, and the hits follow from the throw,
 * so every screen works them out for itself.
 *
 * A guest sends its aim only on its own turn, and once it has rolled, **when it
 * rolled by its own clock**, with the turn it was in - so a throw is judged by
 * the moment the thrower let go on their own screen.
 */
import { BEACH, COCONUT } from './beach'
import { MAX_PLAYERS } from './setup'
import { turnOrder, type Game, type Player } from './rules'

export const SNAPSHOT_TAG = 'pg'
export const INTENT_TAG = 'pg-in'

/** `[id, score or -1, flags: 1 left]`. */
export type WirePlayer = [string, number, number]
/** `[x cm, z cm, angle mrad]`. */
export type WireAim = [number, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  turn: number
  startsAt: number
  aim: WireAim
  rolledAt: number | null
  players: WirePlayer[]
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isInt = (v: unknown): v is number => Number.isInteger(v)
const cm = (v: number) => Math.round(v * 100)

function aimOk(v: unknown): v is WireAim {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isInt)) return false
  const [x, z, angle] = v as number[]
  return Math.abs(x) <= BEACH.halfX * 100 && Math.abs(z) <= BEACH.near * 100 && Math.abs(angle) <= COCONUT.turn * 1000 + 1
}

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: Math.round(game.elapsed * 100) / 100,
    o: game.over ? 1 : 0,
    u: game.turn,
    a: cm(game.startsAt),
    m: [cm(game.aim.x), cm(game.aim.z), Math.round(game.aim.angle * 1000)],
    r: game.rolledAt === null ? -1 : cm(game.rolledAt),
    p: game.players.map((p): WirePlayer => [p.id, p.score ?? -1, p.left ? 1 : 0]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_PLAYERS) return null
  const count = message.p.length
  if (!isCount(message.u) || message.u >= count || !isCount(message.a) || !aimOk(message.m)) return null
  if (!isInt(message.r) || message.r < -1 || message.r > 2000) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 3) return null
    const [id, score, flags] = raw
    if (typeof id !== 'string' || id.length === 0 || !isInt(score) || score < -1 || score > 30 || (flags !== 0 && flags !== 1)) return null
    players.push([id, score, flags])
  }
  return {
    id: message.g as number,
    seed: message.s as number,
    elapsed: message.e,
    over: message.o === 1,
    turn: message.u as number,
    startsAt: (message.a as number) / 100,
    aim: message.m as WireAim,
    rolledAt: message.r === -1 ? null : (message.r as number) / 100,
    players,
  }
}

/**
 * Brings a guest's copy into line with the host's, all but the clock, which the
 * caller eases - and, on the guest's own turn, its aim, which is its own.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) {
    game.players = []
    game.elapsed = snap.elapsed
  }
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  game.order = turnOrder(snap.seed, snap.players.length)
  const turnChanged = game.turn !== snap.turn
  game.turn = snap.turn
  game.startsAt = snap.startsAt
  game.players = snap.players.map(([id, score, flags]) => {
    const known = game.players.find((p) => p.id === id)
    const player: Player = known ?? { id, mine: false, bot: false, score: null, left: false }
    player.mine = id === me
    player.score = score < 0 ? null : score
    player.left = flags === 1
    return player
  })
  const mineToThrow = game.players[game.order[game.turn]]?.mine ?? false
  if (!mineToThrow || turnChanged) {
    game.aim = { x: snap.aim[0] / 100, z: snap.aim[1] / 100, angle: snap.aim[2] / 1000 }
    game.rolledAt = snap.rolledAt
  } else if (snap.rolledAt !== null) game.rolledAt = snap.rolledAt
  return game
}

export interface Intent {
  game: number
  turn: number
  aim: { x: number; z: number; angle: number }
  /** When it rolled, seconds into the aiming, by its own clock - or null. */
  rolledAt: number | null
}

export function encodeIntent(i: Intent): Record<string, unknown> {
  return { t: INTENT_TAG, g: i.game, u: i.turn, m: [cm(i.aim.x), cm(i.aim.z), Math.round(i.aim.angle * 1000)], r: i.rolledAt === null ? -1 : cm(i.rolledAt) }
}

export function decodeIntent(message: Record<string, unknown>): Intent | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isCount(message.u) || !aimOk(message.m) || !isInt(message.r) || message.r < -1 || message.r > 2000) return null
  const [x, z, angle] = message.m as WireAim
  return { game: message.g as number, turn: message.u as number, aim: { x: x / 100, z: z / 100, angle: angle / 1000 }, rolledAt: message.r === -1 ? null : (message.r as number) / 100 }
}
