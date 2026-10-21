import { adoptRound, decodeClaim, decodeHeader, decodePose, encodeClaim, encodeHeader, encodePose, isCount, mergePlayers, playerRows, sides, type Claim, type Pose } from '../../68-minigame-kit'
import { arenaFor, EDGE, slide, walkable } from './arena'
import { PITCH_LIMIT, speed, wrapAngle, type Player, type Round, type Shot } from './rules'

export const TAG = 'duck-szn'
const ROLES = sides('hunter', 'duck')
export type Guest = ({ round: number; kind: 'move'; crouch: boolean } & Pose) | ({ round: number; kind: 'shot' } & Claim)
export interface Snapshot { id: number; seed: number; elapsed: number; hunterId: string; winner: Round['winner']; over: boolean; rows: Row[]; shot: Shot | null }
type Row = [string, number, number, number, number, boolean, boolean, boolean, number, number, number, boolean]
const finite = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
export const poseOf = (p: Player): Pose => ({ x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch })
export const encodeMove = (r: Round, p: Player) => encodePose(TAG, r.id, poseOf(p), { hide: p.crouch })
export const encodeShot = (r: Round, p: Player) => encodeClaim(TAG, r.id, { ...poseOf(p), victim: 'ray' })
export function decodeGuest(raw: Record<string, unknown>): Guest | null {
  const pose = decodePose(raw, TAG, { reachX: EDGE, reachZ: EDGE, pitchLimit: PITCH_LIMIT })
  if (pose && typeof raw.hide === 'boolean') return { ...pose, kind: 'move', crouch: raw.hide }
  const shot = decodeClaim(raw, TAG, PITCH_LIMIT, (x, z) => Math.abs(x) <= EDGE && Math.abs(z) <= EDGE)
  return shot ? { ...shot, kind: 'shot' } : null
}
export function encodeSnapshot(r: Round): Record<string, unknown> {
  return { ...encodeHeader(TAG, r, r.hunterId, ROLES), players: r.players.map((p): Row => [p.id, p.x, p.z, p.yaw, p.pitch, p.crouch, p.alive, p.left, p.lastShot, p.shots, p.kills, p.bot]), shot: r.shot && { ...r.shot } }
}
export function decodeSnapshot(raw: Record<string, unknown>): Snapshot | null {
  const header = decodeHeader(raw, TAG, ROLES)
  const rows = playerRows(raw.players, 12)
  if (!header || !rows || !rows.length || header.elapsed > 60) return null
  for (const p of rows) if (!finite(p[1], -EDGE, EDGE) || !finite(p[2], -EDGE, EDGE) || !finite(p[3], -Math.PI, Math.PI) || !finite(p[4], -PITCH_LIMIT, PITCH_LIMIT)
    || [5, 6, 7, 11].some((i) => typeof p[i] !== 'boolean') || !finite(p[8], -1, 60) || !isCount(p[9]) || !isCount(p[10]) || (p[9] as number) > 100 || (p[10] as number) > 7) return null
  if (!rows.some((p) => p[0] === header.oneId) || new Set(rows.map((p) => p[0])).size !== rows.length) return null
  let shot: Shot | null = null
  if (raw.shot !== null) {
    const s = raw.shot as Partial<Shot> | undefined
    if (!s || !isCount(s.seq) || !finite(s.at, 0, 60) || !finite(s.x, -EDGE, EDGE) || !finite(s.z, -EDGE, EDGE) || !finite(s.yaw, -Math.PI, Math.PI) || !finite(s.pitch, -PITCH_LIMIT, PITCH_LIMIT) || (s.victim !== null && !rows.some((p) => p[0] === s.victim))) return null
    shot = { seq: s.seq!, at: s.at, x: s.x, z: s.z, yaw: s.yaw, pitch: s.pitch, victim: s.victim ?? null }
  }
  return { ...header, hunterId: header.oneId, rows: rows as Row[], shot }
}
function shared(row: Row) { return { alive: row[6], left: row[7], shots: row[9], kills: row[10], bot: row[11] } }
function owned(row: Row) { return { x: row[1], z: row[2], yaw: row[3], pitch: row[4], crouch: row[5], lastShot: row[8] } }
export function applySnapshot(r: Round, snap: Snapshot, me: string): void {
  adoptRound(r, snap.id)
  r.seed = snap.seed; r.hunterId = snap.hunterId; r.over = snap.over; r.winner = snap.winner; r.shot = snap.shot
  r.players = mergePlayers(r.players, snap.rows, me, snap.over, {
    create: (row) => ({ id: row[0], mine: row[0] === me, role: row[0] === snap.hunterId ? 'hunter' : 'duck', drift: 0, ...shared(row), ...owned(row) }),
    shared: (row) => ({ ...shared(row), role: row[0] === snap.hunterId ? 'hunter' : 'duck' }), owned,
  })
}
/** The host clamps guest movement to its clock and resolves cover collision. */
export function hearMove(r: Round, p: Player, pose: Extract<Guest, { kind: 'move' }>, sinceLast: () => number): void {
  if (r.over || !p.alive || p.left) return
  p.crouch = p.role === 'duck' && pose.crouch
  p.yaw = wrapAngle(pose.yaw); p.pitch = pose.pitch
  const dx = pose.x - p.x, dz = pose.z - p.z, distance = Math.hypot(dx, dz)
  const allowed = speed(p) * Math.min(0.25, Math.max(0, sinceLast())) + 0.035
  const scale = distance > allowed ? allowed / distance : 1
  const position = slide(arenaFor(r.seed), p, { x: p.x + dx * scale, z: p.z + dz * scale })
  if (walkable(arenaFor(r.seed), position.x, position.z)) Object.assign(p, position)
}
