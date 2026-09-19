/**
 * One game, on the wire.
 *
 * The host sends the clock, the round, who is on which side, and every player:
 * where they stand, **whether they have voted - never what, until the vote is
 * over** - when they were removed, whether they have left. And the last few
 * rounds' results, votes and all. The numbers are not sent: the seed makes them.
 *
 * A guest sends its vote the moment it changes, and where it stands on its side
 * ten times a second.
 */
import { GEAR, ROUND_LENGTH, type Game, type Player, type Result } from './rules'
import { MAX_PLAYERS } from './setup'

export const SNAPSHOT_TAG = 'bbs'
export const VOTE_TAG = 'bbs-v'
export const MOVE_TAG = 'bbs-mv'

/** `[id, x cm, z cm, voted: 1 or 0, out cs or -1, flags: 1 left]`. */
export type WirePlayer = [string, number, number, number, number, number]
/** `[round, number, zeros, steps, side, victim or -1, seats, votes]` - seats as player indices, votes as a string of 0, 1 and - by player. */
export type WireResult = [number, number, number, number, number, number, number[], string]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  round: number
  seats: number[]
  players: WirePlayer[]
  results: WireResult[]
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isInt = (v: unknown): v is number => Number.isInteger(v)
const cm = (v: number) => Math.round(v * 100)
const REACH = GEAR.teeth * 100
const MAX_ROUNDS = MAX_PLAYERS + 2

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: Math.round(game.elapsed * 100) / 100,
    o: game.over ? 1 : 0,
    r: game.round,
    q: game.seats,
    p: game.players.map((p): WirePlayer => [p.id, cm(p.x), cm(p.z), p.vote === null ? 0 : 1, p.out === null ? -1 : cm(p.out), p.left ? 1 : 0]),
    x: game.results
      .slice(-3)
      .map((r): WireResult => [r.round, r.number, r.zeros, r.steps, r.side, r.victim, r.seats, r.votes.map((v) => (v === null ? '-' : String(v))).join('')]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!isInt(message.r) || message.r < 1 || message.r > MAX_ROUNDS) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_PLAYERS) return null
  const count = message.p.length
  const seatsOk = (q: unknown): q is number[] => Array.isArray(q) && q.length <= count && q.every((i) => isInt(i) && i >= 0 && i < count) && new Set(q).size === q.length
  if (!seatsOk(message.q)) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 6) return null
    const [id, x, z, voted, out, flags] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isInt(x) || Math.abs(x) > REACH || !isInt(z) || Math.abs(z) > REACH) return null
    if ((voted !== 0 && voted !== 1) || (flags !== 0 && flags !== 1)) return null
    if (!(out === -1 || (isCount(out) && out <= MAX_ROUNDS * ROUND_LENGTH * 100))) return null
    players.push([id, x, z, voted, out, flags])
  }
  if (!Array.isArray(message.x) || message.x.length > 3) return null
  const results: WireResult[] = []
  for (const raw of message.x) {
    if (!Array.isArray(raw) || raw.length !== 8) return null
    const [round, number, zeros, steps, side, victim, seats, votes] = raw
    if (![round, number, zeros, side].every(isCount) || !isInt(steps) || !isInt(victim) || victim < -1 || victim >= count) return null
    if (!seatsOk(seats) || side >= Math.max(1, seats.length) || zeros > seats.length) return null
    if (typeof votes !== 'string' || votes.length !== count || !/^[01-]*$/.test(votes)) return null
    results.push([round, number, zeros, steps, side, victim, seats, votes])
  }
  return {
    id: message.g as number,
    seed: message.s as number,
    elapsed: message.e,
    over: message.o === 1,
    round: message.r,
    seats: message.q,
    players,
    results,
  }
}

/**
 * Brings a guest's copy into line with the host's, all but the clock, which the
 * caller eases. A guest's own vote and where it stands stay as its own screen has
 * them while the round is the same; everybody else's vote is only ever "voted".
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) {
    game.players = []
    game.results = []
    game.elapsed = snap.elapsed
  }
  const sameRound = game.round === snap.round && game.id === snap.id
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  game.round = snap.round
  game.seats = [...snap.seats]
  game.players = snap.players.map(([id, x, z, voted, out, flags]) => {
    const known = game.players.find((p) => p.id === id)
    const player: Player = known ?? { id, mine: false, bot: false, x: x / 100, z: z / 100, vote: null, out: null, left: false, leftAt: null }
    player.mine = id === me
    player.out = out < 0 ? null : out / 100
    player.left = flags === 1
    if (player.mine && known && sameRound && player.out === null && !snap.over) return player
    player.x = x / 100
    player.z = z / 100
    // Everybody else's vote is a secret: all a guest knows is whether they have voted.
    if (!player.mine || !sameRound) player.vote = voted === 1 && !player.mine ? 1 : null
    return player
  })
  game.results = snap.results.map(
    ([round, number, zeros, steps, side, victim, seats, votes]): Result => ({
      round,
      number,
      zeros,
      steps,
      side,
      victim,
      seats,
      votes: [...votes].map((c) => (c === '-' ? null : (Number(c) as 0 | 1))),
    }),
  )
  return game
}

export function encodeVote(game: number, round: number, v: 0 | 1): Record<string, unknown> {
  return { t: VOTE_TAG, g: game, n: round, v }
}

export function decodeVote(message: Record<string, unknown>): { game: number; round: number; vote: 0 | 1 } | null {
  if (message.t !== VOTE_TAG || !isCount(message.g) || !isInt(message.n) || message.n < 1 || (message.v !== 0 && message.v !== 1)) return null
  return { game: message.g as number, round: message.n, vote: message.v }
}

const fixed = (v: number) => Math.round(v * 1000) / 1000

export function encodeMove(game: number, p: { x: number; z: number }): Record<string, unknown> {
  return { t: MOVE_TAG, g: game, x: fixed(p.x), z: fixed(p.z) }
}

export function decodeMove(message: Record<string, unknown>): { game: number; x: number; z: number } | null {
  if (message.t !== MOVE_TAG || !isCount(message.g) || !isNumber(message.x) || !isNumber(message.z)) return null
  if (Math.abs(message.x) > GEAR.rim || Math.abs(message.z) > GEAR.rim) return null
  return { game: message.g as number, x: message.x, z: message.z }
}
