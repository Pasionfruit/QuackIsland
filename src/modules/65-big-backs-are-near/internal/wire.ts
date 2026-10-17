/**
 * One round, on the wire.
 *
 * The host sends the clock, the winner once there is one, and every player -
 * position, look, whether they are sprinting, alive, or have left, and when
 * they last took a footstep. The maze is not sent: the seed makes it, and so
 * does who the Hunter is on every screen that reads the header's `o1` off the
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
import {
  MAX_PLAYERS,
  MRAD_LIMIT,
  adoptRound,
  cm,
  cs,
  decodeHeader,
  decodePose,
  encodeHeader,
  encodePose,
  isCount,
  isInt,
  mergePlayers,
  mrad,
  playerRows,
  sides,
} from '../../68-minigame-kit'
import { MAZE } from './maze'
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

/** How far from the middle anything can ever be, centimetres, either axis - the maze's own half-extent plus a little slack. */
const REACH = ((MAZE.size * MAZE.cell) / 2 + MAZE.wallThickness + 4) * 100

const ROLES = sides<Role>('hunter', 'hider')

export function encodeSnapshot(round: Round): Record<string, unknown> {
  return {
    ...encodeHeader(SNAPSHOT_TAG, round, round.hunterId, ROLES),
    // `steppedAt` is `-Infinity` until a first step; `cs` clamps that to 0, which nobody can tell apart from a step at the very first tick.
    p: round.players.map((p): WirePlayer => [p.id, cm(p.x), cm(p.z), mrad(p.yaw), mrad(p.pitch), cs(p.steppedAt), (p.left ? 1 : 0) | (p.sprinting ? 2 : 0) | (p.alive ? 4 : 0)]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  const header = decodeHeader(message, SNAPSHOT_TAG, ROLES)
  const rows = header && playerRows(message.p, 7, MAX_PLAYERS)
  if (!header || !rows) return null
  const players: WirePlayer[] = []
  for (const row of rows) {
    const [id, x, z, yaw, pitch, steppedAt, flags] = row
    if (!isInt(x) || Math.abs(x) > REACH || !isInt(z) || Math.abs(z) > REACH) return null
    if (!isInt(yaw) || Math.abs(yaw) > MRAD_LIMIT || !isInt(pitch) || Math.abs(pitch) > MRAD_LIMIT) return null
    if (!isCount(steppedAt) || !isInt(flags) || flags < 0 || flags > 7) return null
    players.push([id, x, z, yaw, pitch, steppedAt, flags])
  }
  if (!players.some(([id]) => id === header.oneId)) return null
  return { id: header.id, seed: header.seed, hunterId: header.oneId, elapsed: header.elapsed, winner: header.winner, over: header.over, players }
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
  adoptRound(round, snap.id)
  round.seed = snap.seed
  round.hunterId = snap.hunterId
  round.elapsed = snap.elapsed
  round.winner = snap.winner
  round.over = snap.over
  round.players = mergePlayers<Player, WirePlayer>(round.players, snap.players, me, snap.over, {
    create: ([id, x, z, yaw, pitch]) => ({
      id,
      role: id === snap.hunterId ? 'hunter' : 'hider',
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
    }),
    shared: ([id, , , , , , flags]) => ({ role: id === snap.hunterId ? 'hunter' : 'hider', left: (flags & 1) !== 0, alive: (flags & 4) !== 0 }),
    owned: ([, x, z, yaw, pitch, steppedAt, flags]) => ({ x: x / 100, z: z / 100, yaw: yaw / 1000, pitch: pitch / 1000, sprinting: (flags & 2) !== 0, steppedAt: steppedAt / 100 }),
  })
  return round
}

export interface MoveOut {
  x: number
  z: number
  yaw: number
  pitch: number
  sprint: boolean
}

export function encodeMove(round: number, m: MoveOut): Record<string, unknown> {
  return encodePose(MOVE_TAG, round, m, { s: m.sprint ? 1 : 0 })
}

export function decodeMove(message: Record<string, unknown>): { round: number; x: number; z: number; yaw: number; pitch: number; sprint: boolean } | null {
  const pose = decodePose(message, MOVE_TAG, { reachX: REACH / 100, reachZ: REACH / 100, pitchLimit: PITCH_LIMIT })
  if (!pose || (message.s !== 0 && message.s !== 1)) return null
  return { ...pose, sprint: message.s === 1 }
}
