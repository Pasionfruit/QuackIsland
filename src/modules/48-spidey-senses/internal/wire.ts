/**
 * One game, on the wire.
 *
 * The host sends the clock, the round everybody is placed for and the last the
 * spider has been out for, and every player: where they are, when they stopped
 * this round, and the round the spider took them and how. **When the trapdoor
 * springs is not sent**: the seed and the clock make it, on every screen.
 *
 * A guest sends what its hands are doing - which way it is creeping - and, once
 * it has clicked, **when it clicked by its own clock**, with the round it was
 * in. The host believes a click up to half a second old, so being further from
 * the host is not being slower to react.
 */
import { CELLAR, MAX_ROUNDS, scheduleFor } from './nest'
import { MAX_PLAYERS } from './setup'
import { type Game, type How, type Player } from './rules'

export const SNAPSHOT_TAG = 'ss'
export const INTENT_TAG = 'ss-in'

/** `[id, x cm, z cm, stopped at cs or -1, out round or 0, how: 0 none 1 eaten 2 chicken, flags: 1 left]`. */
export type WirePlayer = [string, number, number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  round: number
  judged: number
  players: WirePlayer[]
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isInt = (v: unknown): v is number => Number.isInteger(v)
const cm = (v: number) => Math.round(v * 100)
const HOW: readonly (How | null)[] = [null, 'eaten', 'chicken']
const REACH = (CELLAR.far + 1) * 100

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: Math.round(game.elapsed * 100) / 100,
    o: game.over ? 1 : 0,
    r: game.round,
    j: game.judged,
    p: game.players.map((p): WirePlayer => [p.id, cm(p.x), cm(p.z), p.stoppedAt === null ? -1 : cm(p.stoppedAt), p.out ?? 0, HOW.indexOf(p.how), p.left ? 1 : 0]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!isInt(message.r) || message.r < 1 || message.r > MAX_ROUNDS || !isInt(message.j) || message.j < 0 || message.j > MAX_ROUNDS) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_PLAYERS) return null
  const latest = (scheduleFor(message.s as number)[MAX_ROUNDS - 1].end + 1) * 100
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 7) return null
    const [id, x, z, stoppedAt, out, how, flags] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isInt(x) || Math.abs(x) > REACH || !isInt(z) || Math.abs(z) > REACH) return null
    if (!isInt(stoppedAt) || stoppedAt < -1 || stoppedAt > latest) return null
    if (!isInt(out) || out < 0 || out > MAX_ROUNDS || !isInt(how) || how < 0 || how > 2 || (out === 0) !== (how === 0)) return null
    if (flags !== 0 && flags !== 1) return null
    players.push([id, x, z, stoppedAt, out, how, flags])
  }
  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, round: message.r as number, judged: message.j as number, players }
}

/**
 * Brings a guest's copy into line with the host's, all but the clock, which the
 * caller eases. Everything is the host's; a guest's own player is eased towards
 * where the host has it by the caller.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) {
    game.players = []
    game.elapsed = snap.elapsed
  }
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  game.round = snap.round
  game.judged = snap.judged
  const rounds = scheduleFor(snap.seed)
  game.players = snap.players.map(([id, x, z, stoppedAt, out, how, flags]) => {
    const known = game.players.find((p) => p.id === id)
    const player: Player = known ?? {
      id,
      mine: false,
      bot: false,
      x: 0,
      z: 0,
      yaw: 0,
      toward: 0,
      around: 0,
      stoppedAt: null,
      out: null,
      how: null,
      outAt: null,
      left: false,
      leftAt: null,
    }
    player.mine = id === me
    Object.assign(player, {
      x: x / 100,
      z: z / 100,
      yaw: Math.atan2(x, z),
      stoppedAt: stoppedAt < 0 ? null : stoppedAt / 100,
      out: out === 0 ? null : out,
      how: HOW[how],
      outAt: out === 0 ? null : rounds[out - 1].judged,
      left: flags === 1,
    })
    return player
  })
  return game
}

export interface Intent {
  game: number
  /** Which way it creeps: in, and round. */
  toward: number
  around: number
  /** When it clicked by its own clock, and in which round - or null before it has this round. */
  stop: { at: number; round: number } | null
}

const fixed = (v: number) => Math.round(v * 1000) / 1000

export function encodeIntent(i: Intent): Record<string, unknown> {
  return { t: INTENT_TAG, g: i.game, f: fixed(i.toward), a: fixed(i.around), s: i.stop ? Math.round(i.stop.at * 100) : -1, r: i.stop ? i.stop.round : 0 }
}

export function decodeIntent(message: Record<string, unknown>): Intent | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isNumber(message.f) || !isNumber(message.a) || !isInt(message.s) || !isInt(message.r)) return null
  if (Math.abs(message.f) > 1.01 || Math.abs(message.a) > 1.01 || message.s < -1 || message.r < 0 || message.r > MAX_ROUNDS) return null
  if ((message.s === -1) !== (message.r === 0)) return null
  return { game: message.g as number, toward: message.f, around: message.a, stop: message.s < 0 ? null : { at: (message.s as number) / 100, round: message.r as number } }
}
