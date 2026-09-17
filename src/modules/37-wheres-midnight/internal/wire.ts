/**
 * One search, on the wire.
 *
 * The host sends the junkyard's seed, the clock, and each seeker's find time,
 * misses, cooldown, last click taken and last miss. Where Midnight is follows
 * from the seed, and that is no secret: every browser has to draw her.
 *
 * A guest sends a click: which round, a number that goes up with every click,
 * the direction it went from the camera, and when by the guest's own clock.
 * Said again until the host has taken it, and counted once however many times it
 * arrives. The host works out what the direction lands on for itself.
 */
import type { Game, Seeker } from './rules'
import type { Vec3 } from './view'

export const SNAPSHOT_TAG = 'wm'
export const INTENT_TAG = 'wm-in'

/** `[id, foundAt (-1 not yet), misses, cooldown, seq, missAt (-1 none)]`. */
export type WireSeeker = [string, number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  seekers: WireSeeker[]
}

export interface Click {
  game: number
  seq: number
  dir: Vec3
  at: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const r4 = (n: number) => Math.round(n * 10000) / 10000
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isTime = (v: unknown): v is number => v === -1 || (isNumber(v) && v >= 0)

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: r2(game.elapsed),
    o: game.over ? 1 : 0,
    p: game.players.map(
      (s): WireSeeker => [s.id, s.foundAt === null ? -1 : r2(s.foundAt), s.misses, r2(s.cooldown), s.seq, s.missAt === null ? -1 : r2(s.missAt)],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > 8) return null
  const seekers: WireSeeker[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 6) return null
    const [id, foundAt, misses, cooldown, seq, missAt] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isTime(foundAt) || !isCount(misses) || !isNumber(cooldown) || cooldown < 0 || !isCount(seq) || !isTime(missAt)) return null
    seekers.push([id, foundAt, misses, cooldown, seq, missAt])
  }
  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, seekers }
}

/**
 * Brings a guest's copy into line with the host's: everything but the clock and
 * the cooldowns, which the caller runs on between snapshots.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) game.players = []
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  const next: Seeker[] = []
  for (const [id, foundAt, misses, cooldown, seq, missAt] of snap.seekers) {
    const seeker: Seeker =
      game.players.find((s) => s.id === id) ?? { id, mine: false, bot: false, foundAt: null, misses: 0, cooldown: 0, seq: 0, missAt: null, botStep: 0 }
    Object.assign(seeker, {
      mine: id === me,
      foundAt: foundAt < 0 ? null : foundAt,
      misses,
      cooldown,
      seq,
      missAt: missAt < 0 ? null : missAt,
    })
    next.push(seeker)
  }
  game.players = next
  return game
}

export function encodeIntent(click: Click): Record<string, unknown> {
  return { t: INTENT_TAG, g: click.game, q: click.seq, d: [r4(click.dir.x), r4(click.dir.y), r4(click.dir.z)], a: r2(click.at) }
}

/** A guest's click, with its direction made unit length: a client can send whatever it likes. */
export function decodeIntent(message: Record<string, unknown>): Click | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isCount(message.q) || (message.q as number) < 1) return null
  if (!isNumber(message.a) || message.a < 0) return null
  const d = message.d
  if (!Array.isArray(d) || d.length !== 3 || !d.every(isNumber)) return null
  const length = Math.hypot(d[0], d[1], d[2])
  if (!(length > 1e-6)) return null
  return { game: message.g as number, seq: message.q as number, dir: { x: d[0] / length, y: d[1] / length, z: d[2] / length }, at: message.a }
}
