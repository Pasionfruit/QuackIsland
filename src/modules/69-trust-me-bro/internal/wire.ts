import { isCount, isId } from '../../68-minigame-kit'
import { cleanMessage, DOOR_COUNTS, type Intent, type Player, type Result, type Round } from './rules'

export const TAG = 'trust-me-bro'
export interface Snapshot {
  id: number; elapsed: number; soloId: string; stage: number; phase: Round['phase']; phaseTime: number
  selected: number; successes: number; history: Result[]; over: boolean; winner: Round['winner']; players: Player[]
}
const count = (n: unknown, max: number): n is number => isCount(n) && (n as number) <= max
const time = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 120
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function encodeIntent(intent: Intent): Record<string, unknown> { return { tag: TAG, kind: 'intent', ...intent } }
export function decodeIntent(raw: Record<string, unknown>): Intent | null {
  if (raw.tag !== TAG || raw.kind !== 'intent' || !count(raw.round, 0xffffffff) || !count(raw.stage, 3) || !count(raw.seq, 0x7fffffff) || raw.seq === 0) return null
  const base = { round: raw.round, stage: raw.stage, seq: raw.seq }
  if (raw.action === 'choose') return { ...base, action: 'choose' }
  if (raw.action === 'step' && (raw.value === -1 || raw.value === 1)) return { ...base, action: 'step', value: raw.value }
  if (raw.action === 'point' && count(raw.value, DOOR_COUNTS[raw.stage] - 1)) return { ...base, action: 'point', value: raw.value }
  if (raw.action === 'say' && typeof raw.text === 'string' && raw.text.length <= 120 && cleanMessage(raw.text)) return { ...base, action: 'say', text: cleanMessage(raw.text) }
  return null
}

export function encodeSnapshot(r: Round): Record<string, unknown> {
  return { tag: TAG, kind: 'snapshot', id: r.id, elapsed: r.elapsed, soloId: r.soloId, stage: r.stage,
    phase: r.phase, phaseTime: r.phaseTime, selected: r.selected, successes: r.successes,
    history: r.history.map((h) => ({ ...h })), over: r.over, winner: r.winner,
    players: r.players.map(({ id, bot, left, role, point, text, seq }) => ({ id, bot, left, role, point, text, seq })) }
}

export function decodeSnapshot(raw: Record<string, unknown>): Snapshot | null {
  if (raw.tag !== TAG || raw.kind !== 'snapshot' || !count(raw.id, 0xffffffff) || !time(raw.elapsed) || !isId(raw.soloId) || !count(raw.stage, 3)
    || !['choose', 'reveal', 'over'].includes(String(raw.phase)) || !time(raw.phaseTime) || !count(raw.selected, DOOR_COUNTS[raw.stage] - 1)
    || !count(raw.successes, 4) || typeof raw.over !== 'boolean' || ![null, 'solo', 'advisers'].includes(raw.winner as null)
    || !Array.isArray(raw.players) || raw.players.length < 1 || raw.players.length > 8 || !Array.isArray(raw.history) || raw.history.length > 4) return null
  const players: Player[] = []
  for (const p of raw.players) {
    if (!object(p) || !isId(p.id) || typeof p.bot !== 'boolean' || typeof p.left !== 'boolean' || !['solo', 'adviser'].includes(String(p.role))
      || (p.point !== null && !count(p.point, DOOR_COUNTS[raw.stage] - 1)) || typeof p.text !== 'string' || p.text.length > 120 || !count(p.seq, 0x7fffffff)) return null
    players.push({ id: p.id, mine: false, bot: p.bot, left: p.left, role: p.role as Player['role'], point: p.point as number | null, text: cleanMessage(p.text), seq: p.seq, spokeAt: -1, botStage: -1 })
  }
  if (new Set(players.map((p) => p.id)).size !== players.length || players.filter((p) => p.role === 'solo').length !== 1 || !players.some((p) => p.id === raw.soloId && p.role === 'solo')) return null
  const history: Result[] = []
  for (const [i, h] of raw.history.entries()) {
    if (!object(h) || h.doors !== DOOR_COUNTS[i] || !count(h.safe, DOOR_COUNTS[i] - 1) || (h.pick !== null && !count(h.pick, DOOR_COUNTS[i] - 1)) || typeof h.ok !== 'boolean' || h.ok !== (h.pick === h.safe)) return null
    history.push({ doors: h.doors as number, safe: h.safe, pick: h.pick as number | null, ok: h.ok })
  }
  const phase = raw.phase as Round['phase']
  if (history.length !== raw.stage + (phase === 'choose' ? 0 : 1) && !(raw.over && history.length <= raw.stage)) return null
  if (raw.successes !== history.filter((h) => h.ok).length || raw.over !== (phase === 'over') || (raw.over ? raw.winner === null : raw.winner !== null)) return null
  return { id: raw.id, elapsed: raw.elapsed, soloId: raw.soloId, stage: raw.stage, phase, phaseTime: raw.phaseTime,
    selected: raw.selected, successes: raw.successes, history, over: raw.over, winner: raw.winner as Round['winner'], players }
}

export function applySnapshot(round: Round, snap: Snapshot, me: string): void {
  Object.assign(round, snap, { players: snap.players.map((p) => ({ ...p, mine: p.id === me })) })
  delete round.secret
}
