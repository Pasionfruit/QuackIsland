import {
  decodeClaim, decodeHeader, decodePose, encodeClaim, encodeHeader, encodePose,
  isCount, isNumber, playerRows, sides,
} from '../../68-minigame-kit'
import { AURA, TRAPS, type Hands, type Hazard, type Player, type Round } from './rules'

const SNAP = 'aura:snapshot', MOVE = 'aura:move', TRAP = 'aura:trap'
const ROLES = sides('rider', 'trappers')
const bounds = { reachX: 1, reachZ: 1, pitchLimit: 0 }
const finite = (v: unknown, lo: number, hi: number): v is number => isNumber(v) && v >= lo && v <= hi
export type Guest = { round: number; kind: 'move'; steer: number; throttle: number } |
  { round: number; kind: 'trap'; trap: typeof TRAPS[number]; x: number; sequence: number }
export interface Snapshot { elapsed: number; round: Round }

export function encodeSnapshot(r: Round): Record<string, unknown> {
  return { ...encodeHeader(SNAP, r, r.oneId, ROLES),
    rider: [r.x, r.vx, r.distance, r.balance, r.stability, r.steer, r.throttle, r.slippery],
    course: [r.serial, r.nextCourse, r.lastRelease], reason: r.reason,
    players: r.players.map(p => [p.id, p.bot, p.left, p.cooldown, p.sequence]),
    hazards: r.hazards.map(h => [h.id, h.kind, h.x, h.at, h.warning, h.hit, h.owner]),
  }
}

export function decodeSnapshot(raw: Record<string, unknown>): Snapshot | null {
  const h = decodeHeader(raw, SNAP, ROLES)
  const a = raw.rider, c = raw.course, rows = playerRows(raw.players, 5, 16)
  if (!h || !rows || !rows.length || !Array.isArray(a) || a.length !== 8 || !Array.isArray(c) || c.length !== 3 ||
      !Array.isArray(raw.hazards) || raw.hazards.length > AURA.maxHazards || typeof raw.reason !== 'string' || raw.reason.length > 80) return null
  const ranges = [[-20,20],[-50,50],[0,10000],[-3,3],[-200,100],[-1,1],[-1,1],[0,3]]
  if (!a.every((v,i) => finite(v, ranges[i][0], ranges[i][1])) || !isCount(c[0]) ||
      !finite(c[1],0,200) || !finite(c[2],-10,200)) return null
  const players: Player[] = []
  for (const row of rows) {
    const [id, bot, left, cooldown, sequence] = row
    if (typeof bot !== 'boolean' || typeof left !== 'boolean' || !finite(cooldown,0,5) || !isCount(sequence) || players.some(p => p.id === id)) return null
    players.push({ id, bot, left, cooldown, sequence, mine: false, sent: 0, inputX: 0, inputY: 0 })
  }
  if (!players.some(p => p.id === h.oneId && !p.bot)) return null
  const hazards: Hazard[] = []
  for (const row of raw.hazards) {
    if (!Array.isArray(row) || row.length !== 7) return null
    const [id, kind, x, at, warning, hit, owner] = row
    if (!isCount(id) || !TRAPS.includes(kind) || !finite(x,-5,5) || !finite(at,0,10000) ||
        !finite(warning,0,AURA.warning) || typeof hit !== 'boolean' || typeof owner !== 'string' || owner.length > 80 || hazards.some(h => h.id === id)) return null
    hazards.push({ id, kind, x, at, warning, hit, owner })
  }
  return { elapsed: h.elapsed, round: { ...h, players, hazards, x: a[0], vx: a[1], distance: a[2], balance: a[3],
    stability: a[4], steer: a[5], throttle: a[6], slippery: a[7], serial: c[0], nextCourse: c[1], lastRelease: c[2], reason: raw.reason } }
}

export function applySnapshot(r: Round, s: Snapshot, me: string) {
  const old = r.players
  Object.assign(r, s.round)
  r.players = s.round.players.map(p => {
    const local = old.find(o => o.id === p.id)
    return { ...p, mine: p.id === me, sent: local?.sent ?? 0, inputX: local?.inputX ?? 0, inputY: local?.inputY ?? 0 }
  })
}

export const encodeMove = (r: Round, p: Player) => encodePose(MOVE, r.id, { x: p.inputX, z: p.inputY, yaw: 0, pitch: 0 })
export const encodeTrap = (r: Round, hands: Hands) => ({
  ...encodeClaim(TRAP, r.id, { victim: null, x: hands.aim, z: 0, yaw: 0, pitch: 0 }), k: hands.trap, q: hands.sequence,
})

export function decodeGuest(raw: Record<string, unknown>): Guest | null {
  const pose = decodePose(raw, MOVE, bounds)
  if (pose) return { round: pose.round, kind: 'move', steer: pose.x, throttle: pose.z }
  const claim = decodeClaim(raw, TRAP, 0, (x,z) => Math.abs(x) <= 4.9 && z === 0)
  if (!claim || !TRAPS.includes(raw.k as typeof TRAPS[number]) || !isCount(raw.q) || raw.q < 1) return null
  return { round: claim.round, kind: 'trap', trap: raw.k as typeof TRAPS[number], x: claim.x, sequence: raw.q }
}
