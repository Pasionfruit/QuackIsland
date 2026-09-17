/**
 * One round, on the wire.
 *
 * The host sends the seed - every browser draws the ducks from it - the clock,
 * scores, the crackers in the air or still floating, and which ducks are busy
 * eating. A guest sends a throw: which round, a number that goes up with every
 * throw, and the throw's lean and distance. Said again until the host has
 * taken it, and counted once.
 */
import { POND, type Cracker, type Feeder, type Game, type Throw } from './rules'

export const SNAPSHOT_TAG = 'ft'
export const INTENT_TAG = 'ft-in'

/** `[id, score, throws, seq, thrown at (-1 for never)]`. */
export type WireFeeder = [string, number, number, number, number]
/** `[id, player, to x, to z, at, lands, fed (-2 in the air, -1 nobody, else a duck)]`. */
export type WireCracker = [number, number, number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  feeders: WireFeeder[]
  crackers: WireCracker[]
  eating: number[]
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
    f: game.players.map((p): WireFeeder => [p.id, p.score, p.throws, p.seq, Number.isFinite(p.thrownAt) ? r2(p.thrownAt) : -1]),
    c: game.crackers.slice(-48).map((c): WireCracker => [c.id, c.player, r2(c.to.x), r2(c.to.z), r2(c.at), r2(c.lands), c.fed === null ? -2 : c.fed]),
    d: game.eating.map((t) => (Number.isFinite(t) ? r2(t) : -1)),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.f) || message.f.length === 0 || message.f.length > 8) return null
  const players = message.f.length
  const feeders: WireFeeder[] = []
  for (const raw of message.f) {
    if (!Array.isArray(raw) || raw.length !== 5) return null
    const [id, score, throws, seq, thrownAt] = raw
    if (typeof id !== 'string' || id.length === 0 || ![score, throws, seq].every(isCount) || !isNumber(thrownAt)) return null
    feeders.push([id, score, throws, seq, thrownAt])
  }
  if (!Array.isArray(message.d) || message.d.length > POND.ducks + 4 || !message.d.every(isNumber)) return null
  const ducks = message.d.length
  if (!Array.isArray(message.c) || message.c.length > 48) return null
  const crackers: WireCracker[] = []
  for (const raw of message.c) {
    if (!Array.isArray(raw) || raw.length !== 7) return null
    const [id, player, x, z, at, lands, fed] = raw
    if (!isCount(id) || !isCount(player) || player >= players || ![x, z, at, lands].every(isNumber)) return null
    if (!Number.isInteger(fed) || fed < -2 || fed >= ducks) return null
    crackers.push([id, player, x, z, at, lands, fed])
  }
  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, feeders, crackers, eating: message.d as number[] }
}

/** Brings a guest's copy into line with the host's: everything but the clock, which the caller eases. */
export function applySnapshot(game: Game, snap: Snapshot, me: string, spots: (player: number) => { x: number; z: number }): Game {
  if (game.id !== snap.id) game.players = []
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  if (snap.over) game.elapsed = snap.elapsed
  game.eating = snap.eating.map((t) => (t < 0 ? -Infinity : t))
  const next: Feeder[] = []
  for (const [id, score, throws, seq, thrownAt] of snap.feeders) {
    const feeder: Feeder = game.players.find((p) => p.id === id) ?? { id, mine: false, bot: false, score: 0, throws: 0, seq: 0, thrownAt: -Infinity }
    const host = thrownAt < 0 ? -Infinity : thrownAt
    Object.assign(feeder, { mine: id === me, score, throws, seq, thrownAt: id === me ? Math.max(feeder.thrownAt, host) : host })
    next.push(feeder)
  }
  game.players = next
  game.crackers = snap.crackers.map(
    ([id, player, x, z, at, lands, fed]): Cracker => ({ id, player, from: spots(player), to: { x, z }, at, lands, fed: fed === -2 ? null : fed }),
  )
  return game
}

export function encodeIntent(game: number, seq: number, thrown: Throw): Record<string, unknown> {
  return { t: INTENT_TAG, g: game, q: seq, a: Math.round(thrown.angle * 1000) / 1000, d: r2(thrown.distance) }
}

export function decodeIntent(message: Record<string, unknown>): { game: number; seq: number; thrown: Throw } | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isCount(message.q) || (message.q as number) < 1 || !isNumber(message.a) || !isNumber(message.d)) return null
  return { game: message.g as number, seq: message.q as number, thrown: { angle: message.a, distance: message.d } }
}
