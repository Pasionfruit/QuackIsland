/**
 * One game, on the wire.
 *
 * The host sends the clock, every player - where they are and how high off the
 * floor, which way they look, when they were eliminated and by whom, how many
 * they have eliminated, whether they have a shield, whether they have left - which
 * of the arena's shield spots have a shield on them just now, and the last half
 * second of shots, for everybody to draw. The arena is not sent: the seed makes
 * it. Nor is who hunts for whom: that is who eliminated whom, which is in there.
 *
 * A guest sends where it is, how high, and which way it looks, twenty times a
 * second, and each shot the moment it fires it: where from, which way, and who its
 * own screen saw it meet. The host decides whether that is a hit.
 */
import { ARENA, arenaFor } from './arena'
import { MAX_PLAYERS } from './setup'
import { JUMP, PITCH_LIMIT, ROUND, SHOT_LIFE, pickupReady, type Claim, type Game, type Player, type Shot } from './rules'

export const SNAPSHOT_TAG = 'hos'
export const MOVE_TAG = 'hos-mv'
export const SHOT_TAG = 'hos-sh'

/** `[id, x cm, z cm, yaw mrad, out cs or -1, by or -1, kills, flags: 1 left, 2 shield, y cm]`. */
export type WirePlayer = [string, number, number, number, number, number, number, number, number]
/** `[seq, by, from x, y, z cm, to x, y, z cm, hit or -1]`. */
export type WireShot = [number, number, number, number, number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  players: WirePlayer[]
  shots: WireShot[]
  /** Which shield spots have a shield on them just now: bit `k` is spot `k`. */
  spots: number
}

/** How long a shot is sent for after it is fired: long enough to survive a lost snapshot or two. */
const SEND_SHOTS = 0.5
const MAX_SHOTS = 16

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isInt = (v: unknown): v is number => Number.isInteger(v)
/** How far from the middle anything can be, centimetres: the wall's outer face. */
const REACH = (ARENA.half + ARENA.wallThickness) * 100
const cm = (v: number) => Math.round(v * 100)

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: Math.round(game.elapsed * 100) / 100,
    o: game.over ? 1 : 0,
    p: game.players.map(
      (p): WirePlayer => [p.id, cm(p.x), cm(p.z), Math.round(p.yaw * 1000), p.out === null ? -1 : cm(p.out), p.by ?? -1, p.kills, (p.left ? 1 : 0) | (p.shield ? 2 : 0), cm(p.y)],
    ),
    k: game.pickups.reduce((bits, _, k) => (pickupReady(game, k) ? bits | (1 << k) : bits), 0),
    h: game.shots
      .filter((s) => game.elapsed - s.at <= SEND_SHOTS)
      .slice(-MAX_SHOTS)
      .map((s): WireShot => [s.seq, s.by, cm(s.from.x), cm(s.from.y), cm(s.from.z), cm(s.to.x), cm(s.to.y), cm(s.to.z), s.hit]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_PLAYERS) return null
  if (!Array.isArray(message.h) || message.h.length > MAX_SHOTS) return null
  const count = message.p.length
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 9) return null
    const [id, x, z, yaw, out, by, kills, flags, y] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isInt(x) || Math.abs(x) > REACH || !isInt(z) || Math.abs(z) > REACH) return null
    if (!isInt(yaw) || Math.abs(yaw) > 3200) return null
    if (!(out === -1 || (isCount(out) && out <= (ROUND.limit + 1) * 100))) return null
    if (!isInt(by) || by < -1 || by >= count || !isCount(kills) || kills > MAX_PLAYERS || !isInt(flags) || flags < 0 || flags > 3) return null
    // Off the floor no further than a jump goes, with a little for rounding.
    if (!isInt(y) || y < 0 || y > (JUMP.max + 0.1) * 100) return null
    players.push([id, x, z, yaw, out, by, kills, flags, y])
  }
  if (!isCount(message.k) || message.k >= 1 << 20) return null
  const shots: WireShot[] = []
  for (const raw of message.h) {
    if (!Array.isArray(raw) || raw.length !== 9 || !raw.every(isInt)) return null
    const [seq, by, , y0, , , y1, , hit] = raw as WireShot
    if (seq <= 0 || by < 0 || by >= count || hit < -1 || hit >= count) return null
    if ([raw[2], raw[3], raw[4], raw[5], raw[6], raw[7]].some((v) => Math.abs(v) > REACH + 500) || y0 < 0 || y1 < -100) return null
    shots.push(raw as WireShot)
  }
  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, players, shots, spots: message.k as number }
}

/**
 * Brings a guest's copy into line with the host's: everything but the clock,
 * which the caller eases. While the game is on, a guest's own player stays where
 * its own screen has it - it walks and aims there - and takes from the host only
 * being eliminated, kills, its shield, and leaving. **Being eliminated moves it**:
 * it starts hunting again beside whoever got it, and that is the host's word, taken
 * once, at the moment it is told - `respawns` goes up, so the screen knows to turn
 * it the way it now faces. Shots the guest has not seen are added, except its own,
 * which it drew the moment it fired.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) {
    game.players = []
    game.shots = []
    game.seq = 0
    game.elapsed = snap.elapsed
    game.pickups = []
  }
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  const next: Player[] = []
  for (const [id, x, z, yaw, out, by, kills, flags, y] of snap.players) {
    const known = game.players.find((p) => p.id === id)
    const player: Player =
      known ?? {
        id,
        mine: false,
        bot: false,
        x: x / 100,
        z: z / 100,
        y: 0,
        vy: 0,
        yaw: yaw / 1000,
        pitch: 0,
        out: null,
        by: null,
        kills: 0,
        shield: false,
        respawns: 0,
        shotAt: -Infinity,
        trail: [],
        left: false,
        leftAt: null,
      }
    player.mine = id === me
    const wasOut = player.out !== null
    const shared = { out: out < 0 ? null : out / 100, by: by < 0 ? null : by, kills, left: (flags & 1) !== 0, shield: (flags & 2) !== 0 }
    if (player.mine && known && !snap.over) {
      Object.assign(player, shared)
      // Eliminated just now: moved beside whoever got it, and the host's word for where.
      if (!wasOut && shared.out !== null) {
        Object.assign(player, { x: x / 100, z: z / 100, y: 0, vy: 0, yaw: yaw / 1000, pitch: 0 })
        player.respawns += 1
      }
    } else Object.assign(player, shared, { x: x / 100, z: z / 100, y: y / 100, yaw: yaw / 1000 })
    next.push(player)
  }
  game.players = next
  // The host's word on which shields are there: there, or gone until it says otherwise.
  const spots = arenaFor(snap.seed).pickups
  game.pickups = spots.map((_, k) => ((snap.spots >> k) & 1 ? 0 : Infinity))
  const mine = next.findIndex((p) => p.mine)
  for (const [seq, by, x0, y0, z0, x1, y1, z1, hit] of snap.shots) {
    if (seq <= game.seq) continue
    game.seq = seq
    if (by === mine) continue
    const shot: Shot = { seq, by, from: { x: x0 / 100, y: y0 / 100, z: z0 / 100 }, to: { x: x1 / 100, y: y1 / 100, z: z1 / 100 }, hit, at: game.elapsed }
    game.shots.push(shot)
  }
  if (game.shots.length > MAX_SHOTS * 2) game.shots = game.shots.filter((s) => game.elapsed - s.at <= SHOT_LIFE)
  return game
}

const fixed = (v: number) => Math.round(v * 1000) / 1000

export function encodeMove(game: number, p: Pick<Player, 'x' | 'z' | 'yaw' | 'pitch'> & { y?: number }): Record<string, unknown> {
  return { t: MOVE_TAG, g: game, x: fixed(p.x), z: fixed(p.z), y: fixed(p.yaw), p: fixed(p.pitch), j: fixed(p.y ?? 0) }
}

export function decodeMove(message: Record<string, unknown>): { game: number; x: number; z: number; y: number; yaw: number; pitch: number } | null {
  if (message.t !== MOVE_TAG) return null
  if (!isCount(message.g) || !isNumber(message.x) || !isNumber(message.z) || !isNumber(message.y) || !isNumber(message.p) || !isNumber(message.j)) return null
  if (Math.abs(message.x) > ARENA.half || Math.abs(message.z) > ARENA.half || Math.abs(message.y) > 4 || Math.abs(message.p) > PITCH_LIMIT + 0.01) return null
  // Off the floor no further than a jump goes.
  if (message.j < 0 || message.j > JUMP.max + 0.1) return null
  return { game: message.g as number, x: message.x, z: message.z, y: message.j, yaw: message.y, pitch: message.p }
}

export function encodeShot(game: number, c: Claim): Record<string, unknown> {
  return { t: SHOT_TAG, g: game, x: fixed(c.x), z: fixed(c.z), y: fixed(c.yaw), p: fixed(c.pitch), j: fixed(c.y ?? 0), v: c.victim ?? '' }
}

export function decodeShot(message: Record<string, unknown>): ({ game: number } & Claim) | null {
  if (message.t !== SHOT_TAG) return null
  const move = decodeMove({ ...message, t: MOVE_TAG })
  if (!move || typeof message.v !== 'string') return null
  return { game: move.game, x: move.x, z: move.z, y: move.y, yaw: move.yaw, pitch: move.pitch, victim: message.v === '' ? null : message.v }
}
