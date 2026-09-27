/**
 * One round, on the wire.
 *
 * The host sends the clock, the winner once there is one, how many hits
 * Mama Tank has taken, and every player - position, look, hits landed,
 * when they last fired, alive and left. The field is not sent: the seed
 * makes it, and so does who drives Mama Tank - every screen reads
 * `mamaId` straight off the snapshot rather than trusting its own
 * `theOne` sync, which may not have landed yet. `hitsNeeded` is not sent
 * either: it is `round(playerCount * 2)`, a pure function of how many
 * players the snapshot itself already lists, fixed for the round the same
 * way Jackal's own `magazineSize` is recomputed rather than carried.
 *
 * A guest sends where it is and which way it looks, and - whichever role it
 * is playing - each shot the moment it fires: where from, which way, and
 * who its own screen saw it meet. The host decides whether that is a hit.
 */
import { FIELD } from './arena'
import { MAX_PLAYERS } from './setup'
import { PITCH_LIMIT, type Claim, type Player, type Role, type Round } from './rules'

export const SNAPSHOT_TAG = 'mmt'
export const MOVE_TAG = 'mmt-mv'
export const SHOT_TAG = 'mmt-sh'

/** `[id, x cm, z cm, yaw mrad, pitch mrad, hits, shotAt cs, flags: 1 left, 2 alive]`. */
export type WirePlayer = [string, number, number, number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  mamaId: string
  elapsed: number
  hitsOnMama: number
  winner: Role | null
  over: boolean
  players: WirePlayer[]
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isInt = (v: unknown): v is number => Number.isInteger(v)
const cm = (v: number) => Math.round(v * 100)
const clampCs = (v: number) => Math.max(0, Math.min(100000, v))
const cs = (v: number) => Math.round(clampCs(v) * 100)

/** How far from the middle anything can be, centimetres, either axis. */
const REACH = (FIELD.half + FIELD.wallThickness) * 100

const WINNER_CODE: Record<Role, number> = { mama: 1, mini: 2 }
const winnerOf = (code: number): Role | null => (code === 1 ? 'mama' : code === 2 ? 'mini' : null)

export function encodeSnapshot(round: Round): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: round.id,
    s: round.seed,
    o1: round.mamaId,
    e: Math.round(round.elapsed * 100) / 100,
    h: round.hitsOnMama,
    w: round.winner ? WINNER_CODE[round.winner] : 0,
    ov: round.over ? 1 : 0,
    p: round.players.map(
      (p): WirePlayer => [p.id, cm(p.x), cm(p.z), Math.round(p.yaw * 1000), Math.round(p.pitch * 1000), p.hits, cs(p.shotAt), (p.left ? 1 : 0) | (p.alive ? 2 : 0)],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (typeof message.o1 !== 'string' || message.o1.length === 0) return null
  if (!isCount(message.h)) return null
  if (message.w !== 0 && message.w !== 1 && message.w !== 2) return null
  if (message.ov !== 0 && message.ov !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_PLAYERS) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 8) return null
    const [id, x, z, yaw, pitch, hits, shotAt, flags] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isInt(x) || Math.abs(x) > REACH || !isInt(z) || Math.abs(z) > REACH) return null
    if (!isInt(yaw) || Math.abs(yaw) > 3200 || !isInt(pitch) || Math.abs(pitch) > 3200) return null
    if (!isCount(hits) || hits > 999) return null
    if (!isCount(shotAt)) return null
    if (!isInt(flags) || flags < 0 || flags > 3) return null
    players.push([id, x, z, yaw, pitch, hits, shotAt, flags])
  }
  if (!players.some(([id]) => id === message.o1)) return null
  return { id: message.g as number, seed: message.s as number, mamaId: message.o1, elapsed: message.e, hitsOnMama: message.h as number, winner: winnerOf(message.w as number), over: message.ov === 1, players }
}

/**
 * Brings a guest's copy into line with the host's: everything but its own
 * position and look, which it walks and aims for itself, the same shape
 * `64-jackal` uses. **Hits, and whether it is still standing, are always
 * the host's word** - even for your own player, since those only ever
 * change through a claim the host itself verified. The field and who drives
 * Mama Tank are read straight off the snapshot rather than from the
 * guest's own `theOne` sync, which may still be in flight.
 */
export function applySnapshot(round: Round, snap: Snapshot, me: string): Round {
  if (round.id !== snap.id) {
    round.players = []
    round.id = snap.id
  }
  round.seed = snap.seed
  round.mamaId = snap.mamaId
  round.elapsed = snap.elapsed
  round.hitsOnMama = snap.hitsOnMama
  round.hitsNeeded = Math.round(snap.players.length * 2)
  round.winner = snap.winner
  round.over = snap.over
  const next: Player[] = snap.players.map(([id, x, z, yaw, pitch, hits, shotAt, flags]) => {
    const known = round.players.find((p) => p.id === id)
    const role: Role = id === snap.mamaId ? 'mama' : 'mini'
    const player: Player = known ?? {
      id,
      role,
      x: x / 100,
      z: z / 100,
      yaw: yaw / 1000,
      pitch: pitch / 1000,
      alive: true,
      left: false,
      leftAt: null,
      mine: false,
      bot: false,
      shotAt: shotAt / 100,
      hits,
    }
    player.role = role
    player.mine = id === me
    const shared = { hits, shotAt: shotAt / 100, left: (flags & 1) !== 0, alive: (flags & 2) !== 0 }
    if (player.mine && known && !snap.over) {
      Object.assign(player, shared)
    } else Object.assign(player, shared, { x: x / 100, z: z / 100, yaw: yaw / 1000, pitch: pitch / 1000 })
    return player
  })
  round.players = next
  return round
}

const fixed = (v: number) => Math.round(v * 1000) / 1000

export interface MoveOut {
  x: number
  z: number
  yaw: number
  pitch: number
}

export function encodeMove(round: number, m: MoveOut): Record<string, unknown> {
  return { t: MOVE_TAG, g: round, x: fixed(m.x), z: fixed(m.z), y: fixed(m.yaw), p: fixed(m.pitch) }
}

export function decodeMove(message: Record<string, unknown>): { round: number; x: number; z: number; yaw: number; pitch: number } | null {
  if (message.t !== MOVE_TAG) return null
  if (!isCount(message.g) || !isNumber(message.x) || !isNumber(message.z) || !isNumber(message.y) || !isNumber(message.p)) return null
  if (Math.abs(message.x) > FIELD.half + 2 || Math.abs(message.z) > FIELD.half + 2) return null
  if (Math.abs(message.p) > PITCH_LIMIT + 0.01) return null
  return { round: message.g as number, x: message.x, z: message.z, yaw: message.y, pitch: message.p }
}

export function encodeShot(round: number, c: Claim): Record<string, unknown> {
  return { t: SHOT_TAG, g: round, x: fixed(c.x), z: fixed(c.z), y: fixed(c.yaw), p: fixed(c.pitch), v: c.victim ?? '' }
}

export function decodeShot(message: Record<string, unknown>): ({ round: number } & Claim) | null {
  if (message.t !== SHOT_TAG) return null
  if (!isCount(message.g) || !isNumber(message.x) || !isNumber(message.z) || !isNumber(message.y) || !isNumber(message.p) || typeof message.v !== 'string') return null
  if (Math.abs(message.x) > FIELD.half + 2 || Math.abs(message.z) > FIELD.half + 2) return null
  if (Math.abs(message.p) > PITCH_LIMIT + 0.01) return null
  return { round: message.g as number, x: message.x, z: message.z, yaw: message.y, pitch: message.p, victim: message.v === '' ? null : message.v }
}
