/**
 * One round, on the wire.
 *
 * The host sends what everybody draws: the field's seed, the clock, the
 * four-leaf clovers waiting to be found, every claim, and each hunter's score,
 * cooldown, spam count, last click taken and last miss. **Not the luck seed**: where the
 * next four-leaf clover grows is not anybody's business until it has grown.
 *
 * A guest sends a click: which round, a number that goes up with every click
 * (0 for none), which clover, or -1 for bare grass, and how many times it has
 * clicked during its cooldown, ever, this round. Said again until the host's
 * copy of that hunter has taken it, and counted once however many times it
 * arrives.
 */
import { FIELD, type Claim, type Game, type Hunter, type Lucky } from './rules'

export const SNAPSHOT_TAG = 'll'
export const INTENT_TAG = 'll-in'

/** `[id, score (may be below zero), misses, cooldown, seq, miss clover (-1 grass, -2 none), miss at, spams]`. */
export type WireHunter = [string, number, number, number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  lucky: Lucky[]
  claims: Claim[]
  hunters: WireHunter[]
}

const CLOVERS = FIELD.columns * FIELD.rows
const r2 = (n: number) => Math.round(n * 100) / 100
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isClover = (v: unknown): v is number => isCount(v) && (v as number) < CLOVERS

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: r2(game.elapsed),
    o: game.over ? 1 : 0,
    l: game.lucky.map((l) => [l.clover, l.n, r2(l.since)]),
    c: game.claims.map((c) => [c.clover, c.player, r2(c.at)]),
    p: game.players.map(
      (h): WireHunter => [h.id, h.score, h.misses, r2(h.cooldown), h.seq, h.miss ? (h.miss.clover ?? -1) : -2, h.miss ? r2(h.miss.at) : 0, h.spams],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > 8) return null
  const players = message.p.length

  const hunters: WireHunter[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 8) return null
    const [id, score, misses, cooldown, seq, miss, at, spams] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!Number.isInteger(score) || !isCount(misses) || !isNumber(cooldown) || cooldown < 0 || !isCount(seq) || !isCount(spams)) return null
    if (!(miss === -2 || miss === -1 || isClover(miss)) || !isNumber(at)) return null
    hunters.push([id, score, misses, cooldown, seq, miss, at, spams])
  }

  if (!Array.isArray(message.l) || message.l.length > FIELD.hidden) return null
  const lucky: Lucky[] = []
  for (const raw of message.l) {
    if (!Array.isArray(raw) || raw.length !== 3 || !isClover(raw[0]) || !isCount(raw[1]) || !isNumber(raw[2])) return null
    lucky.push({ clover: raw[0], n: raw[1], since: raw[2] })
  }

  if (!Array.isArray(message.c) || message.c.length > CLOVERS) return null
  const claims: Claim[] = []
  for (const raw of message.c) {
    if (!Array.isArray(raw) || raw.length !== 3 || !isClover(raw[0]) || !isCount(raw[1]) || raw[1] >= players || !isNumber(raw[2])) return null
    claims.push({ clover: raw[0], player: raw[1], at: raw[2] })
  }

  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, lucky, claims, hunters }
}

/**
 * Brings a guest's copy into line with the host's: everything but the clock and
 * the cooldowns, which the caller runs on between snapshots.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) game.players = []
  game.id = snap.id
  game.seed = snap.seed
  game.luck = 0
  game.over = snap.over
  game.lucky = snap.lucky
  game.claims = snap.claims
  game.grown = snap.lucky.reduce((most, l) => Math.max(most, l.n + 1), 0)

  const next: Hunter[] = []
  for (const [id, score, misses, cooldown, seq, miss, at, spams] of snap.hunters) {
    const hunter: Hunter =
      game.players.find((h) => h.id === id) ?? { id, mine: false, bot: false, score: 0, misses: 0, spams: 0, cooldown: 0, seq: 0, miss: null, missWindow: -1 }
    Object.assign(hunter, { mine: id === me, score, misses, spams, cooldown, seq, miss: miss === -2 ? null : { clover: miss === -1 ? null : miss, at } })
    next.push(hunter)
  }
  game.players = next
  return game
}

/** `seq` 0 is no click - a message only to say the spam count. */
export function encodeIntent(game: number, seq: number, clover: number | null, spams = 0): Record<string, unknown> {
  return { t: INTENT_TAG, g: game, q: seq, c: clover ?? -1, s: spams }
}

export function decodeIntent(message: Record<string, unknown>): { game: number; seq: number; clover: number | null; spams: number } | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isCount(message.q) || !isCount(message.s)) return null
  if (!(message.c === -1 || isClover(message.c))) return null
  return { game: message.g as number, seq: message.q as number, clover: message.c === -1 ? null : (message.c as number), spams: message.s as number }
}
