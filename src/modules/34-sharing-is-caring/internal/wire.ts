/**
 * One round, on the wire.
 *
 * The host runs the round and sends where everybody is, who wears the crown and
 * everybody's score; a guest sends only which way it is walking. There is
 * nothing to count on the guest's side - picking up and stealing are both
 * decided where the bodies are, which is on the host.
 */
import type { Intent, Round, Wearer } from './rules'

export const SNAPSHOT_TAG = 'sc'
export const INTENT_TAG = 'sc-in'

/** `[id, x, y, facing, score, takes]`. */
export type WirePlayer = [string, number, number, number, number, number]

export interface Snapshot {
  id: number
  elapsed: number
  over: boolean
  holder: string | null
  heldSince: number
  players: WirePlayer[]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

export function encodeSnapshot(round: Round): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: round.id,
    e: r2(round.elapsed),
    o: round.over ? 1 : 0,
    h: round.holder ?? '',
    s: r2(round.heldSince),
    p: round.players.map((p): WirePlayer => [p.id, r2(p.x), r2(p.y), r2(p.facing), r2(p.score), p.takes]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (typeof message.h !== 'string' || !isNumber(message.s) || message.s < 0) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > 8) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 6) return null
    const [id, x, y, facing, score, takes] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (![x, y, facing, score].every(isNumber) || score < 0) return null
    if (!isCount(takes)) return null
    players.push([id, x, y, facing, score, takes])
  }
  const holder = message.h === '' ? null : message.h
  if (holder !== null && !players.some(([id]) => id === holder)) return null
  return { id: message.g as number, elapsed: message.e, over: message.o === 1, holder, heldSince: message.s, players }
}

/**
 * A guest's intent, for one round - so a guest still saying last round's
 * direction as the next one is dealt is not walked into it.
 */
export function encodeIntent(intent: Intent, round: number): Record<string, unknown> {
  return { t: INTENT_TAG, r: round, x: r2(intent.x), y: r2(intent.y) }
}

/** A guest's intent and its round, with the direction clamped: a client can send whatever it likes. */
export function decodeIntent(message: Record<string, unknown>): { round: number; intent: Intent } | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.r) || !isNumber(message.x) || !isNumber(message.y)) return null
  const length = Math.hypot(message.x, message.y)
  const scale = length > 1 ? 1 / length : 1
  return { round: message.r as number, intent: { x: message.x * scale, y: message.y * scale } }
}

/**
 * Brings a guest's copy into line with the host's. Players are updated in
 * place - the scene keeps a body per player - and a new id is a new round.
 */
export function applySnapshot(round: Round, snap: Snapshot, me: string): Round {
  if (round.id !== snap.id) round.players = []
  round.id = snap.id
  round.elapsed = snap.elapsed
  round.over = snap.over
  round.holder = snap.holder
  round.heldSince = snap.heldSince
  const seen = new Set<string>()
  for (const [id, x, y, facing, score, takes] of snap.players) {
    seen.add(id)
    let p: Wearer | undefined = round.players.find((each) => each.id === id)
    if (!p) {
      p = { id, x, y, facing, score: 0, takes: 0, mine: false, bot: false }
      round.players.push(p)
    }
    Object.assign(p, { x, y, facing, score, takes, mine: id === me })
  }
  round.players = round.players.filter((p) => seen.has(p.id))
  return round
}
