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
  isCount,
  isInt,
  mergePlayers,
  mrad,
  playerRows,
  sides,
} from '../../68-minigame-kit'
import { FIELD } from './arena'
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

/** How far from the middle anything can be, centimetres, either axis. */
const REACH = (FIELD.half + FIELD.wallThickness) * 100

const ROLES = sides<Role>('mama', 'mini')

export function encodeSnapshot(round: Round): Record<string, unknown> {
  return {
    ...encodeHeader(SNAPSHOT_TAG, round, round.mamaId, ROLES),
    h: round.hitsOnMama,
    p: round.players.map((p): WirePlayer => [p.id, cm(p.x), cm(p.z), mrad(p.yaw), mrad(p.pitch), p.hits, cs(p.shotAt), (p.left ? 1 : 0) | (p.alive ? 2 : 0)]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  const header = decodeHeader(message, SNAPSHOT_TAG, ROLES)
  const rows = header && isCount(message.h) && playerRows(message.p, 8, MAX_PLAYERS)
  if (!header || !rows) return null
  const players: WirePlayer[] = []
  for (const row of rows) {
    const [id, x, z, yaw, pitch, hits, shotAt, flags] = row
    if (!isInt(x) || Math.abs(x) > REACH || !isInt(z) || Math.abs(z) > REACH) return null
    if (!isInt(yaw) || Math.abs(yaw) > MRAD_LIMIT || !isInt(pitch) || Math.abs(pitch) > MRAD_LIMIT) return null
    if (!isCount(hits) || hits > 999) return null
    if (!isCount(shotAt)) return null
    if (!isInt(flags) || flags < 0 || flags > 3) return null
    players.push([id, x, z, yaw, pitch, hits, shotAt, flags])
  }
  if (!players.some(([id]) => id === header.oneId)) return null
  return {
    id: header.id,
    seed: header.seed,
    mamaId: header.oneId,
    elapsed: header.elapsed,
    hitsOnMama: message.h as number,
    winner: header.winner,
    over: header.over,
    players,
  }
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
  adoptRound(round, snap.id)
  round.seed = snap.seed
  round.mamaId = snap.mamaId
  round.elapsed = snap.elapsed
  round.hitsOnMama = snap.hitsOnMama
  round.hitsNeeded = Math.round(snap.players.length * 2)
  round.winner = snap.winner
  round.over = snap.over
  round.players = mergePlayers<Player, WirePlayer>(round.players, snap.players, me, snap.over, {
    create: ([id, x, z, yaw, pitch, hits, shotAt]) => ({
      id,
      role: id === snap.mamaId ? 'mama' : 'mini',
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
    }),
    shared: ([id, , , , , hits, shotAt, flags]) => ({
      role: id === snap.mamaId ? 'mama' : 'mini',
      hits,
      shotAt: shotAt / 100,
      left: (flags & 1) !== 0,
      alive: (flags & 2) !== 0,
    }),
    owned: ([, x, z, yaw, pitch]) => ({ x: x / 100, z: z / 100, yaw: yaw / 1000, pitch: pitch / 1000 }),
  })
  return round
}

export interface MoveOut {
  x: number
  z: number
  yaw: number
  pitch: number
}

const ON_THE_FIELD = { reachX: FIELD.half + 2, reachZ: FIELD.half + 2, pitchLimit: PITCH_LIMIT }
const onTheField = (x: number, z: number) => Math.abs(x) <= ON_THE_FIELD.reachX && Math.abs(z) <= ON_THE_FIELD.reachZ

export function encodeMove(round: number, m: MoveOut): Record<string, unknown> {
  return encodePose(MOVE_TAG, round, m)
}

export function decodeMove(message: Record<string, unknown>): { round: number; x: number; z: number; yaw: number; pitch: number } | null {
  return decodePose(message, MOVE_TAG, ON_THE_FIELD)
}

export function encodeShot(round: number, c: Claim): Record<string, unknown> {
  return encodeClaim(SHOT_TAG, round, c)
}

export function decodeShot(message: Record<string, unknown>): ({ round: number } & Claim) | null {
  return decodeClaim(message, SHOT_TAG, PITCH_LIMIT, onTheField)
}
