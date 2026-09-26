/**
 * One round, on the wire.
 *
 * The host sends the clock, the winner once there is one, and every player -
 * position, look, whether they are sprinting, alive, or have left, and when
 * they last took a footstep. The maze is not sent: the seed makes it, and so
 * does who the Hunter is on every screen that reads `hunterId` off the
 * snapshot rather than trusting its own `theOne` sync, which may not have
 * landed yet.
 *
 * **There is no claim-and-verify message at all.** A catch is a continuous,
 * host-derivable predicate - proximity plus a clear line through the maze -
 * off positions the host already clamps and trusts, exactly like
 * `16-zombie-tag`'s `catchPlayers`. That is the whole of what makes this
 * wire surface smaller than Jackal's: `SNAPSHOT_TAG` and `MOVE_TAG`, nothing
 * else.
 */
import { MAZE } from './maze'
import { MAX_PLAYERS } from './setup'
import { PITCH_LIMIT, type Player, type Role, type Round } from './rules'

export const SNAPSHOT_TAG = 'bbn'
export const MOVE_TAG = 'bbn-mv'

/** `[id, x cm, z cm, yaw mrad, pitch mrad, steppedAt cs, flags: 1 left, 2 sprinting, 4 alive]`. */
export type WirePlayer = [string, number, number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  hunterId: string
  elapsed: number
  winner: Role | null
  over: boolean
  players: WirePlayer[]
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isInt = (v: unknown): v is number => Number.isInteger(v)
const cm = (v: number) => Math.round(v * 100)
/** Centiseconds, never negative - `-Infinity` (never stepped) clamps to 0, same as a step at the very first tick, which nobody can tell apart from "never" in practice. */
const cs = (v: number) => Math.round(Math.max(0, Math.min(100000, v)) * 100)

/** How far from the middle anything can ever be, centimetres, either axis - the maze's own half-extent plus a little slack. */
const REACH = ((MAZE.size * MAZE.cell) / 2 + MAZE.wallThickness + 4) * 100

const WINNER_CODE: Record<Role, number> = { hunter: 1, hider: 2 }
const winnerOf = (code: number): Role | null => (code === 1 ? 'hunter' : code === 2 ? 'hider' : null)

export function encodeSnapshot(round: Round): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: round.id,
    s: round.seed,
    h: round.hunterId,
    e: Math.round(round.elapsed * 100) / 100,
    w: round.winner ? WINNER_CODE[round.winner] : 0,
    ov: round.over ? 1 : 0,
    p: round.players.map(
      (p): WirePlayer => [p.id, cm(p.x), cm(p.z), Math.round(p.yaw * 1000), Math.round(p.pitch * 1000), cs(p.steppedAt), (p.left ? 1 : 0) | (p.sprinting ? 2 : 0) | (p.alive ? 4 : 0)],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (typeof message.h !== 'string' || message.h.length === 0) return null
  if (message.w !== 0 && message.w !== 1 && message.w !== 2) return null
  if (message.ov !== 0 && message.ov !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_PLAYERS) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 7) return null
    const [id, x, z, yaw, pitch, steppedAt, flags] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isInt(x) || Math.abs(x) > REACH || !isInt(z) || Math.abs(z) > REACH) return null
    if (!isInt(yaw) || Math.abs(yaw) > 3200 || !isInt(pitch) || Math.abs(pitch) > 3200) return null
    if (!isCount(steppedAt) || !isInt(flags) || flags < 0 || flags > 7) return null
    players.push([id, x, z, yaw, pitch, steppedAt, flags])
  }
  if (!players.some(([id]) => id === message.h)) return null
  return { id: message.g as number, seed: message.s as number, hunterId: message.h, elapsed: message.e, winner: winnerOf(message.w as number), over: message.ov === 1, players }
}

/**
 * Brings a guest's copy into line with the host's: everything but its own
 * position, look and sprint, which it walks and reports for itself and only
 * takes from the host once, at the moment it changes role - see `hunterId`
 * below. **Keeping "mine" locally authoritative for `sprinting` in
 * particular** is what stops a footstep taken mid-sprint from surfacing late
 * just because the echo of "sprint released" beat the snapshot carrying the
 * step - see `hearFootsteps` in `rules.ts`.
 */
export function applySnapshot(round: Round, snap: Snapshot, me: string): Round {
  if (round.id !== snap.id) {
    round.players = []
    round.id = snap.id
  }
  round.seed = snap.seed
  round.hunterId = snap.hunterId
  round.elapsed = snap.elapsed
  round.winner = snap.winner
  round.over = snap.over
  const next: Player[] = []
  for (const [id, x, z, yaw, pitch, steppedAt, flags] of snap.players) {
    const known = round.players.find((p) => p.id === id)
    const role: Role = id === snap.hunterId ? 'hunter' : 'hider'
    const player: Player =
      known ?? {
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
        sprinting: false,
        distanceSinceStep: 0,
        steppedAt: -Infinity,
      }
    player.role = role
    player.mine = id === me
    const shared = { left: (flags & 1) !== 0, alive: (flags & 4) !== 0 }
    if (player.mine && known && !snap.over) {
      Object.assign(player, shared)
    } else {
      Object.assign(player, shared, { x: x / 100, z: z / 100, yaw: yaw / 1000, pitch: pitch / 1000, sprinting: (flags & 2) !== 0, steppedAt: steppedAt / 100 })
    }
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
  sprint: boolean
}

export function encodeMove(round: number, m: MoveOut): Record<string, unknown> {
  return { t: MOVE_TAG, g: round, x: fixed(m.x), z: fixed(m.z), y: fixed(m.yaw), p: fixed(m.pitch), s: m.sprint ? 1 : 0 }
}

export function decodeMove(message: Record<string, unknown>): { round: number; x: number; z: number; yaw: number; pitch: number; sprint: boolean } | null {
  if (message.t !== MOVE_TAG) return null
  if (!isCount(message.g) || !isNumber(message.x) || !isNumber(message.z) || !isNumber(message.y) || !isNumber(message.p)) return null
  if (Math.abs(message.x) > REACH / 100 || Math.abs(message.z) > REACH / 100) return null
  if (Math.abs(message.p) > PITCH_LIMIT + 0.01) return null
  if (message.s !== 0 && message.s !== 1) return null
  return { round: message.g as number, x: message.x, z: message.z, yaw: message.y, pitch: message.p, sprint: message.s === 1 }
}
