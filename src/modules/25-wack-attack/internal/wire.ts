/**
 * One round, on the wire.
 *
 * The host sends the seed - every browser draws the moles from it - the clock,
 * where everybody is and which way they face, scores, swings, and **the whacks
 * of the last few seconds**: a mole older than that is back in its hole anyway,
 * and every guest has heard about it several times over.
 *
 * A guest sends which way it is walking and **how many times it has swung,
 * ever**, this round. A count rather than "swung just now", so repeating it is
 * harmless and losing a message loses nothing.
 */
import { FIELD, molesFor, type Game, type Intent, type Whack, type Whacker } from './rules'

export const SNAPSHOT_TAG = 'wa'
export const INTENT_TAG = 'wa-in'

/** How far back a snapshot's whacks go, seconds. */
export const RECENT = 3

/** `[id, x, y, facing, score, whacks, golden, swings, swung at (-1 for never), stunned until (-1 for never), bonks]`. */
export type WireWhacker = [string, number, number, number, number, number, number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  whacks: Whack[]
  whackers: WireWhacker[]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: r2(game.elapsed),
    o: game.over ? 1 : 0,
    w: game.whacks.filter((w) => w.at >= game.elapsed - RECENT).map((w) => [w.mole, w.player, r2(w.at)]),
    f: game.players.map(
      (p): WireWhacker => [p.id, r2(p.x), r2(p.y), r2(p.facing), p.score, p.whacks, p.golden, p.swings, Number.isFinite(p.swungAt) ? r2(p.swungAt) : -1, Number.isFinite(p.stunnedUntil) ? r2(p.stunnedUntil) : -1, p.bonks],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.f) || message.f.length === 0 || message.f.length > 8) return null
  const players = message.f.length

  const whackers: WireWhacker[] = []
  for (const raw of message.f) {
    if (!Array.isArray(raw) || raw.length !== 11) return null
    const [id, x, y, facing, score, whacks, golden, swings, swungAt, stunnedUntil, bonks] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (![x, y, facing, swungAt, stunnedUntil].every(isNumber) || ![score, whacks, golden, swings, bonks].every(isCount)) return null
    whackers.push([id, x, y, facing, score, whacks, golden, swings, swungAt, stunnedUntil, bonks])
  }

  if (!Array.isArray(message.w) || message.w.length > 64) return null
  const whacks: Whack[] = []
  for (const raw of message.w) {
    if (!Array.isArray(raw) || raw.length !== 3) return null
    const [mole, player, at] = raw
    if (!isCount(mole) || !isCount(player) || player >= players || !isNumber(at)) return null
    whacks.push({ mole, player, at })
  }

  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, whacks, whackers }
}

/**
 * Brings a guest's copy into line with the host's: everything but the clock and
 * positions, which the caller eases - see `useFieldNet`. Positions come back,
 * by id. Whacks are added to the ones a guest already has; none are taken away.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Map<string, { x: number; y: number; facing: number }> {
  if (game.id !== snap.id) {
    game.players = []
    game.whacks = []
  }
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  const moles = snap.seed === 0 ? 0 : molesFor(snap.seed).length
  for (const whack of snap.whacks) {
    if (whack.mole >= moles || game.whacks.some((w) => w.mole === whack.mole)) continue
    game.whacks.push(whack)
  }

  const at = new Map<string, { x: number; y: number; facing: number }>()
  const next: Whacker[] = []
  for (const [id, x, y, facing, score, whacks, golden, swings, swungAt, stunnedUntil, bonks] of snap.whackers) {
    at.set(id, { x, y, facing })
    const whacker: Whacker =
      game.players.find((p) => p.id === id) ?? { id, mine: false, bot: false, x, y, facing, score: 0, whacks: 0, golden: 0, swings: 0, swungAt: -Infinity, stunnedUntil: -Infinity, bonks: 0 }
    const host = swungAt < 0 ? -Infinity : swungAt
    // Our own swing shows the moment we make it; the host's word only moves it later.
    const swung = id === me ? Math.max(whacker.swungAt, host) : host
    Object.assign(whacker, {
      mine: id === me,
      score,
      whacks,
      golden,
      swings: Math.max(id === me ? whacker.swings : 0, swings),
      swungAt: swung,
      stunnedUntil: stunnedUntil < 0 ? -Infinity : stunnedUntil,
      bonks,
    })
    next.push(whacker)
  }
  game.players = next
  if (snap.over) game.elapsed = Math.min(FIELD.duration, snap.elapsed)
  return at
}

/** A guest's intent, for one round: the round is part of it because the swing count starts again at zero. */
export function encodeIntent(intent: Intent, game: number): Record<string, unknown> {
  return { t: INTENT_TAG, g: game, x: r2(intent.x), y: r2(intent.y), n: intent.swings }
}

/** A guest's intent and its round, with the walk clamped to full speed: a client can send whatever it likes. */
export function decodeIntent(message: Record<string, unknown>): { game: number; intent: Intent } | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isNumber(message.x) || !isNumber(message.y) || !isCount(message.n)) return null
  const length = Math.hypot(message.x, message.y)
  const scale = length > 1 ? 1 / length : 1
  return { game: message.g as number, intent: { x: message.x * scale, y: message.y * scale, swings: message.n as number } }
}
