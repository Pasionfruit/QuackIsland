/**
 * One round, on the wire.
 *
 * The host sends the seed - which is the target - its clock, and who has
 * stopped. **Not when**, until the round is over: a player who knew somebody
 * else had just stopped at nine seconds would have a very good idea when nine
 * seconds was. Once the round is over, everybody's time goes out.
 *
 * A guest sends its stop: which round, and the stopwatch time on its own
 * screen. Said again until the host says it has stopped.
 */
import type { Game, Timer } from './rules'

export const SNAPSHOT_TAG = 'ti'
export const INTENT_TAG = 'ti-in'

/** `[id, stop: a time once over, -2 for stopped but not shown yet, -1 for not stopped; left (0/1)]`. */
export type WireTimer = [string, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  timers: WireTimer[]
}

/** A stop a guest knows was made, but not when. */
export const HIDDEN = -2

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
    p: game.players.map((p): WireTimer => [p.id, p.stopped === null ? -1 : game.over ? p.stopped : HIDDEN, p.left ? 1 : 0]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > 8) return null
  const timers: WireTimer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 3) return null
    const [id, stopped, left] = raw
    if (typeof id !== 'string' || id.length === 0 || !isNumber(stopped) || (stopped < 0 && stopped !== -1 && stopped !== HIDDEN)) return null
    if (left !== 0 && left !== 1) return null
    timers.push([id, stopped, left])
  }
  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, timers }
}

/**
 * Brings a guest's copy into line with the host's: everything but the clock,
 * which the caller eases. A stop the host has not shown yet stays as whatever
 * this browser has - its own stop, which it knows - or `HIDDEN`.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) game.players = []
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  if (snap.over) game.elapsed = snap.elapsed
  const next: Timer[] = []
  for (const [id, stopped, left] of snap.timers) {
    const timer: Timer = game.players.find((p) => p.id === id) ?? { id, mine: false, bot: false, stopped: null, left: false }
    Object.assign(timer, {
      mine: id === me,
      left: left === 1,
      stopped: stopped >= 0 ? stopped : stopped === HIDDEN ? (timer.stopped ?? HIDDEN) : null,
    })
    next.push(timer)
  }
  game.players = next
  return game
}

export function encodeIntent(game: number, at: number): Record<string, unknown> {
  return { t: INTENT_TAG, g: game, a: Math.round(at * 1000) / 1000 }
}

export function decodeIntent(message: Record<string, unknown>): { game: number; at: number } | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isNumber(message.a) || message.a < 0) return null
  return { game: message.g as number, at: message.a }
}
