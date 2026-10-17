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
import {
  MAX_PLAYERS,
  MRAD_LIMIT,
  adoptRound,
  cm,
  cs,
  decodeClaim,
  decodeHeader,
  decodePose,
  encodeClaim,
  encodeHeader,
  encodePose,
  fixed,
  isCount,
  isInt,
  isNumber,
  mergePlayers,
  mrad,
  playerRows,
  sides,
} from '../../68-minigame-kit'
import { FIELD, TOWER_Z } from './arena'
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

/** How far from the middle anything can be, centimetres, either axis. */
const REACH_X = (FIELD.halfWidth + FIELD.wallThickness) * 100
const REACH_Z = (FIELD.length / 2 + FIELD.wallThickness + 4) * 100
/** As high off the ground as anybody ever is: the tower's own platform. */
const REACH_Y = (FIELD.towerHeight + 1) * 100

const ROLES = sides<Role>('sniper', 'runner')

export function encodeSnapshot(round: Round): Record<string, unknown> {
  return {
    ...encodeHeader(SNAPSHOT_TAG, round, round.sniperId, ROLES),
    p: round.players.map(
      (p): WirePlayer => [
        p.id,
        cm(p.x),
        cm(p.z),
        cm(p.y),
        mrad(p.yaw),
        mrad(p.pitch),
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
  const header = decodeHeader(message, SNAPSHOT_TAG, ROLES)
  const rows = header && playerRows(message.p, 11, MAX_PLAYERS)
  if (!header || !rows) return null
  const players: WirePlayer[] = []
  for (const row of rows) {
    const [id, x, z, y, yaw, pitch, lives, bullets, reload, invuln, flags] = row
    if (!isInt(x) || Math.abs(x) > REACH_X || !isInt(z) || Math.abs(z) > REACH_Z) return null
    if (!isInt(y) || y < 0 || y > REACH_Y) return null
    if (!isInt(yaw) || Math.abs(yaw) > MRAD_LIMIT || !isInt(pitch) || Math.abs(pitch) > MRAD_LIMIT) return null
    if (!isCount(lives) || lives > 9 || !isCount(bullets) || bullets > 99) return null
    if (!isCount(reload) || !isCount(invuln) || !isInt(flags) || flags < 0 || flags > 15) return null
    players.push([id, x, z, y, yaw, pitch, lives, bullets, reload, invuln, flags])
  }
  if (!players.some(([id]) => id === header.oneId)) return null
  return { id: header.id, seed: header.seed, sniperId: header.oneId, elapsed: header.elapsed, winner: header.winner, over: header.over, players }
}

/**
 * Brings a guest's copy into line with the host's: everything but its own
 * position and look, which it walks and aims for itself and only takes from
 * the host once, at the moment it changes role - see `sniperId` below. The
 * lane and who is the Sniper are read straight off the snapshot rather than
 * from the guest's own `theOne` sync, which may still be in flight.
 */
export function applySnapshot(round: Round, snap: Snapshot, me: string): Round {
  adoptRound(round, snap.id)
  round.seed = snap.seed
  round.sniperId = snap.sniperId
  round.elapsed = snap.elapsed
  round.winner = snap.winner
  round.over = snap.over
  round.players = mergePlayers<Player, WirePlayer>(round.players, snap.players, me, snap.over, {
    create: ([id, x, z, y, yaw, pitch, lives, bullets]) => ({
      id,
      role: id === snap.sniperId ? 'sniper' : 'runner',
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
    }),
    shared: ([id, , , , , , lives, bullets, reload, invuln, flags]) => ({
      role: id === snap.sniperId ? 'sniper' : 'runner',
      lives,
      bullets,
      reloadingUntil: reload / 100,
      invulnerableUntil: invuln / 100,
      left: (flags & 1) !== 0,
      scoped: (flags & 2) !== 0,
      alive: (flags & 4) !== 0,
      reachedBase: (flags & 8) !== 0,
    }),
    owned: ([, x, z, y, yaw, pitch]) => ({ x: x / 100, z: z / 100, y: y / 100, yaw: yaw / 1000, pitch: pitch / 1000 }),
  })
  return round
}

export interface MoveOut {
  x: number
  z: number
  yaw: number
  pitch: number
  y: number
  scoped: boolean
}

export function encodeMove(round: number, m: MoveOut): Record<string, unknown> {
  return encodePose(MOVE_TAG, round, m, { j: fixed(m.y), c: m.scoped ? 1 : 0 })
}

export function decodeMove(message: Record<string, unknown>): { round: number; x: number; z: number; y: number; yaw: number; pitch: number; scoped: boolean } | null {
  const pose = decodePose(message, MOVE_TAG, { reachX: FIELD.halfWidth + 2, reachZ: FIELD.length / 2 + 6, pitchLimit: PITCH_LIMIT })
  if (!pose || !isNumber(message.j)) return null
  if (message.j < 0 || message.j > FIELD.towerHeight + 1) return null
  if (message.c !== 0 && message.c !== 1) return null
  return { ...pose, y: message.j, scoped: message.c === 1 }
}

const fromTheTower = (x: number, z: number) => Math.abs(x) <= FIELD.platformHalf + 2 && Math.abs(z - TOWER_Z) <= FIELD.platformHalf + 2

export function encodeShot(round: number, c: Claim): Record<string, unknown> {
  return encodeClaim(SHOT_TAG, round, c)
}

export function decodeShot(message: Record<string, unknown>): ({ round: number } & Claim) | null {
  return decodeClaim(message, SHOT_TAG, PITCH_LIMIT, fromTheTower)
}
