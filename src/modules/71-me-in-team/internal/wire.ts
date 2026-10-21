import { adoptRound, decodeHeader, decodePose, encodeHeader, encodePose, isCount, mergePlayers, playerRows, sides, type Pose } from '../../68-minigame-kit'
import { HALF_LENGTH, HALF_WIDTH } from './course'
import { type Hands, type Player, type Round } from './rules'

export const TAG = 'me-in-team'
const ROLES = sides('solo', 'team')
export type InputMessage = Pose & { round: number; forward: number; strafe: number }
type Row = [string, number, number, number, number, number, number, boolean, boolean, number]
export interface Snapshot { id: number; seed: number; elapsed: number; soloId: string; winner: Round['winner']; over: boolean; rows: Row[]; checkpoint: number; tension: number }
const finite = (n: unknown, low: number, high: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= low && n <= high
export function encodeInput(r: Round, p: Player): Record<string, unknown> { return encodePose(TAG, r.id, p, { f: p.forward, s: p.strafe }) }
export function decodeInput(raw: Record<string, unknown>): InputMessage | null {
  const pose = decodePose(raw, TAG, { reachX: HALF_WIDTH, reachZ: HALF_LENGTH, pitchLimit: 1.1 })
  return pose && finite(raw.f, -1, 1) && finite(raw.s, -1, 1) && pose.pitch >= .18 ? { ...pose, forward: raw.f, strafe: raw.s } : null
}
export function handsOf(message: InputMessage): Hands { return { forward: message.forward, strafe: message.strafe, yaw: message.yaw, pitch: message.pitch } }
export function encodeSnapshot(r: Round): Record<string, unknown> {
  return { ...encodeHeader(TAG, r, r.soloId, ROLES), checkpoint: r.checkpoint, tension: r.tension,
    players: r.players.map((p): Row => [p.id, p.x, p.z, p.yaw, p.pitch, p.forward, p.strafe, p.left, p.bot, p.inputAt]) }
}
export function decodeSnapshot(raw: Record<string, unknown>): Snapshot | null {
  const header = decodeHeader(raw, TAG, ROLES), rows = playerRows(raw.players, 10)
  if (!header || !rows?.length || header.elapsed > 60 || !isCount(raw.checkpoint) || (raw.checkpoint as number) > 3 || !finite(raw.tension, 0, 1)) return null
  for (const p of rows) if (!finite(p[1], -HALF_WIDTH, HALF_WIDTH) || !finite(p[2], -HALF_LENGTH, HALF_LENGTH) || !finite(p[3], -Math.PI, Math.PI) || !finite(p[4], .18, 1.1)
    || !finite(p[5], -1, 1) || !finite(p[6], -1, 1) || typeof p[7] !== 'boolean' || typeof p[8] !== 'boolean' || !finite(p[9], 0, 60)) return null
  if (!rows.some((p) => p[0] === header.oneId) || new Set(rows.map((p) => p[0])).size !== rows.length) return null
  return { ...header, soloId: header.oneId, rows: rows as Row[], checkpoint: raw.checkpoint as number, tension: raw.tension }
}
export function applySnapshot(r: Round, snap: Snapshot, me: string): void {
  adoptRound(r, snap.id)
  r.seed = snap.seed; r.soloId = snap.soloId; r.over = snap.over; r.winner = snap.winner; r.checkpoint = snap.checkpoint; r.tension = snap.tension
  const parts = (p: Row) => ({ x: p[1], z: p[2], yaw: p[3], pitch: p[4], forward: p[5], strafe: p[6], left: p[7], bot: p[8], inputAt: p[9], role: p[0] === snap.soloId ? 'solo' as const : 'team' as const })
  // Position is shared even for the local player: chain pulls are host-authoritative.
  r.players = mergePlayers(r.players, snap.rows, me, snap.over, { create: (p) => ({ id: p[0], mine: p[0] === me, ...parts(p) }), shared: parts, owned: () => ({}) })
}
