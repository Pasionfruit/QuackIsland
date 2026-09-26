/**
 * One round, on the wire.
 *
 * The host sends the clock, the winner once there is one, and every player -
 * position and height, look, lives, bullets, when their reload and their
 * invulnerable window end, whether they are scoped in, alive, reached base or
 * have left. The lane is not sent: the seed makes it, and so does who the
 * Sniper is on every screen that reads `sniperId` off the snapshot rather
 * than trusting its own `theOne` sync, which may not have landed yet.
 *
 * **The laser is not sent either.** It is `laserOf(round)`, a pure function of
 * the Sniper's own synced position and look against the shared arena - every
 * screen traces it the same way, so there is nothing to disagree about.
 *
 * A guest sends where it is, how high, and which way it looks, and - only
 * while it is the Sniper - each shot the moment it fires: where from, which
 * way, and who its own screen saw it meet. The host decides whether that is a
 * hit.
 */
import { FIELD, TOWER_Z } from './arena'
import { MAX_PLAYERS } from './setup'
import { PITCH_LIMIT, type Claim, type Player, type Role, type Round } from './rules'

export const SNAPSHOT_TAG = 'jkl'
export const MOVE_TAG = 'jkl-mv'
export const SHOT_TAG = 'jkl-sh'

/** `[id, x cm, z cm, y cm, yaw mrad, pitch mrad, lives, bullets, reload-until cs, invuln-until cs, flags: 1 left, 2 scoped, 4 alive, 8 reached base]`. */
export type WirePlayer = [string, number, number, number, number, number, number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  sniperId: string
  elapsed: number
  winner: Role | null
  over: boolean
  players: WirePlayer[]
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isInt = (v: unknown): v is number => Number.isInteger(v)
const cm = (v: number) => Math.round(v * 100)
const cs = (v: number) => Math.round(clampCs(v) * 100)
const clampCs = (v: number) => Math.max(0, Math.min(100000, v))

/** How far from the middle anything can be, centimetres, either axis. */
const REACH_X = (FIELD.halfWidth + FIELD.wallThickness) * 100
const REACH_Z = (FIELD.length / 2 + FIELD.wallThickness + 4) * 100
/** As high off the ground as anybody ever is: the tower's own platform. */
const REACH_Y = (FIELD.towerHeight + 1) * 100

const WINNER_CODE: Record<Role, number> = { sniper: 1, runner: 2 }
const winnerOf = (code: number): Role | null => (code === 1 ? 'sniper' : code === 2 ? 'runner' : null)

export function encodeSnapshot(round: Round): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: round.id,
    s: round.seed,
    o1: round.sniperId,
    e: Math.round(round.elapsed * 100) / 100,
    w: round.winner ? WINNER_CODE[round.winner] : 0,
    ov: round.over ? 1 : 0,
    p: round.players.map(
      (p): WirePlayer => [
        p.id,
        cm(p.x),
        cm(p.z),
        cm(p.y),
        Math.round(p.yaw * 1000),
        Math.round(p.pitch * 1000),
        p.lives,
        p.bullets,
        cs(p.reloadingUntil),
        cs(p.invulnerableUntil),
        (p.left ? 1 : 0) | (p.scoped ? 2 : 0) | (p.alive ? 4 : 0) | (p.reachedBase ? 8 : 0),
      ],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (typeof message.o1 !== 'string' || message.o1.length === 0) return null
  if (message.w !== 0 && message.w !== 1 && message.w !== 2) return null
  if (message.ov !== 0 && message.ov !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_PLAYERS) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 11) return null
    const [id, x, z, y, yaw, pitch, lives, bullets, reload, invuln, flags] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isInt(x) || Math.abs(x) > REACH_X || !isInt(z) || Math.abs(z) > REACH_Z) return null
    if (!isInt(y) || y < 0 || y > REACH_Y) return null
    if (!isInt(yaw) || Math.abs(yaw) > 3200 || !isInt(pitch) || Math.abs(pitch) > 3200) return null
    if (!isCount(lives) || lives > 9 || !isCount(bullets) || bullets > 99) return null
    if (!isCount(reload) || !isCount(invuln) || !isInt(flags) || flags < 0 || flags > 15) return null
    players.push([id, x, z, y, yaw, pitch, lives, bullets, reload, invuln, flags])
  }
  if (!players.some(([id]) => id === message.o1)) return null
  return { id: message.g as number, seed: message.s as number, sniperId: message.o1, elapsed: message.e, winner: winnerOf(message.w as number), over: message.ov === 1, players }
}

/**
 * Brings a guest's copy into line with the host's: everything but its own
 * position and look, which it walks and aims for itself and only takes from
 * the host once, at the moment it changes role - see `sniperId` below. The
 * lane and who is the Sniper are read straight off the snapshot rather than
 * from the guest's own `theOne` sync, which may still be in flight.
 */
export function applySnapshot(round: Round, snap: Snapshot, me: string): Round {
  if (round.id !== snap.id) {
    round.players = []
    round.id = snap.id
  }
  round.seed = snap.seed
  round.sniperId = snap.sniperId
  round.elapsed = snap.elapsed
  round.winner = snap.winner
  round.over = snap.over
  const next: Player[] = []
  for (const [id, x, z, y, yaw, pitch, lives, bullets, reload, invuln, flags] of snap.players) {
    const known = round.players.find((p) => p.id === id)
    const role: Role = id === snap.sniperId ? 'sniper' : 'runner'
    const player: Player =
      known ?? {
        id,
        role,
        x: x / 100,
        z: z / 100,
        y: y / 100,
        vy: 0,
        yaw: yaw / 1000,
        pitch: pitch / 1000,
        alive: true,
        lives,
        invulnerableUntil: 0,
        reachedBase: false,
        bullets,
        reloadingUntil: 0,
        scoped: false,
        shotAt: -Infinity,
        mine: false,
        bot: false,
        left: false,
        leftAt: null,
      }
    player.role = role
    player.mine = id === me
    const shared = {
      lives,
      bullets,
      reloadingUntil: reload / 100,
      invulnerableUntil: invuln / 100,
      left: (flags & 1) !== 0,
      scoped: (flags & 2) !== 0,
      alive: (flags & 4) !== 0,
      reachedBase: (flags & 8) !== 0,
    }
    if (player.mine && known && !snap.over) {
      Object.assign(player, shared)
    } else Object.assign(player, shared, { x: x / 100, z: z / 100, y: y / 100, yaw: yaw / 1000, pitch: pitch / 1000 })
    next.push(player)
  }
  round.players = next
  return round
}

const fixed = (v: number) => Math.round(v * 1000) / 1000

export interface MoveOut {
  x: number
  z: number
  yaw: number
  pitch: number
  y: number
  scoped: boolean
}

export function encodeMove(round: number, m: MoveOut): Record<string, unknown> {
  return { t: MOVE_TAG, g: round, x: fixed(m.x), z: fixed(m.z), y: fixed(m.yaw), p: fixed(m.pitch), j: fixed(m.y), c: m.scoped ? 1 : 0 }
}

export function decodeMove(message: Record<string, unknown>): { round: number; x: number; z: number; y: number; yaw: number; pitch: number; scoped: boolean } | null {
  if (message.t !== MOVE_TAG) return null
  if (!isCount(message.g) || !isNumber(message.x) || !isNumber(message.z) || !isNumber(message.y) || !isNumber(message.p) || !isNumber(message.j)) return null
  if (Math.abs(message.x) > FIELD.halfWidth + 2 || Math.abs(message.z) > FIELD.length / 2 + 6) return null
  if (Math.abs(message.p) > PITCH_LIMIT + 0.01) return null
  if (message.j < 0 || message.j > FIELD.towerHeight + 1) return null
  if (message.c !== 0 && message.c !== 1) return null
  return { round: message.g as number, x: message.x, z: message.z, y: message.j, yaw: message.y, pitch: message.p, scoped: message.c === 1 }
}

export function encodeShot(round: number, c: Claim): Record<string, unknown> {
  return { t: SHOT_TAG, g: round, x: fixed(c.x), z: fixed(c.z), y: fixed(c.yaw), p: fixed(c.pitch), v: c.victim ?? '' }
}

export function decodeShot(message: Record<string, unknown>): ({ round: number } & Claim) | null {
  if (message.t !== SHOT_TAG) return null
  if (!isCount(message.g) || !isNumber(message.x) || !isNumber(message.z) || !isNumber(message.y) || !isNumber(message.p) || typeof message.v !== 'string') return null
  if (Math.abs(message.x) > FIELD.platformHalf + 2 || Math.abs(message.z - TOWER_Z) > FIELD.platformHalf + 2) return null
  if (Math.abs(message.p) > PITCH_LIMIT + 0.01) return null
  return { round: message.g as number, x: message.x, z: message.z, yaw: message.y, pitch: message.p, victim: message.v === '' ? null : message.v }
}
