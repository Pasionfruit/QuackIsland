/**
 * One game, on the wire.
 *
 * The host sends the clock, which letter is up - its number, when it appears,
 * whether and when it was decided and who got it - every attempt at it, and
 * everybody's score. The letter itself is not sent: the seed makes it.
 *
 * A guest sends its one attempt at a letter: which letter, the key, and its
 * reaction as its own screen timed it.
 */
import { ROUND, asLetter, openLetter, type Attempt, type Game, type Player } from './rules'
import { MAX_PLAYERS } from './setup'

export const SNAPSHOT_TAG = 'kw'
export const INTENT_TAG = 'kw-in'

/** `[id, score, best ms or -1, left 0/1]`. */
export type WirePlayer = [string, number, number, number]
/** `[player, key, reaction ms, heard cs]`. */
export type WireAttempt = [number, string, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  index: number
  appearsAt: number
  closedAt: number | null
  winner: number | null
  players: WirePlayer[]
  attempts: WireAttempt[]
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const cs = (v: number) => Math.round(v * 100)
const ms = (v: number) => Math.round(v * 1000)

export function encodeSnapshot(game: Game): Record<string, unknown> {
  const l = game.letter
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: cs(game.elapsed) / 100,
    o: game.over ? 1 : 0,
    n: l.index,
    a: cs(l.appearsAt),
    c: l.closedAt === null ? -1 : cs(l.closedAt),
    w: l.winner ?? -1,
    p: game.players.map((p): WirePlayer => [p.id, p.score, p.best === null ? -1 : ms(p.best), p.left ? 1 : 0]),
    x: l.attempts.map((a): WireAttempt => [a.player, a.key, ms(a.reaction), cs(a.heardAt)]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!isCount(message.n) || message.n >= ROUND.letters || !isCount(message.a) || !Number.isInteger(message.c) || (message.c as number) < -1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_PLAYERS) return null
  if (!Array.isArray(message.x) || message.x.length > MAX_PLAYERS) return null
  const count = message.p.length
  if (!Number.isInteger(message.w) || (message.w as number) < -1 || (message.w as number) >= count) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 4) return null
    const [id, score, best, left] = raw
    if (typeof id !== 'string' || id.length === 0 || !isCount(score) || score > ROUND.letters) return null
    if (!(best === -1 || (isCount(best) && best <= ROUND.window * 1000)) || (left !== 0 && left !== 1)) return null
    players.push([id, score, best, left])
  }
  const attempts: WireAttempt[] = []
  for (const raw of message.x) {
    if (!Array.isArray(raw) || raw.length !== 4) return null
    const [player, key, reaction, heard] = raw
    if (!isCount(player) || player >= count || typeof key !== 'string' || asLetter(key) !== key) return null
    if (!isCount(reaction) || reaction > ROUND.window * 1000 || !isCount(heard)) return null
    attempts.push([player, key, reaction, heard])
  }
  return {
    id: message.g as number,
    seed: message.s as number,
    elapsed: message.e,
    over: message.o === 1,
    index: message.n,
    appearsAt: message.a / 100,
    closedAt: message.c === -1 ? null : (message.c as number) / 100,
    winner: message.w === -1 ? null : (message.w as number),
    players,
    attempts,
  }
}

/**
 * Brings a guest's copy into line with the host's: everything but the clock,
 * which the caller eases. While a letter is still up, the guest's own attempt
 * stays even if the host has not heard it yet - it was made, and it is its only
 * one. Once the host has decided the letter, only what the host heard counts.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  const fresh = game.id !== snap.id
  if (fresh) {
    game.players = []
    game.elapsed = snap.elapsed
  }
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over

  game.players = snap.players.map(([id, score, best, left]): Player => {
    const known = game.players.find((p) => p.id === id)
    return { id, mine: id === me, bot: known?.bot ?? false, score, best: best < 0 ? null : best / 1000, left: left === 1 }
  })
  const mine = game.players.findIndex((p) => p.mine)

  const sameLetter = !fresh && game.letter.index === snap.index && game.letter.appearsAt === snap.appearsAt
  const ownPending = sameLetter ? game.letter.attempts.find((a) => a.player === mine) : undefined
  if (!sameLetter) game.letter = openLetter(snap.seed, snap.index, 0)
  const letter = game.letter
  letter.appearsAt = snap.appearsAt
  letter.closedAt = snap.closedAt
  letter.winner = snap.winner
  letter.attempts = snap.attempts.map(([player, key, reaction, heard]): Attempt => ({ player, key, reaction: reaction / 1000, heardAt: heard / 100 }))
  if (ownPending && snap.closedAt === null && !letter.attempts.some((a) => a.player === mine)) letter.attempts.push(ownPending)
  return game
}

export function encodeIntent(game: number, index: number, key: string, reaction: number): Record<string, unknown> {
  return { t: INTENT_TAG, g: game, n: index, k: key, m: ms(reaction) }
}

export function decodeIntent(message: Record<string, unknown>): { game: number; index: number; key: string; reaction: number } | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isCount(message.n) || message.n >= ROUND.letters || typeof message.k !== 'string' || asLetter(message.k) !== message.k) return null
  if (!isCount(message.m) || message.m > ROUND.window * 1000) return null
  return { game: message.g as number, index: message.n, key: message.k, reaction: message.m / 1000 }
}
