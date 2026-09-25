/**
 * One round, on the wire.
 *
 * The host runs the round and sends where everybody has got to; a guest
 * sends **its own running `stage` and `mistakes`, ever** - the same
 * idempotent counter idiom as every other minigame's click count, so a
 * dropped or repeated message can neither lose progress nor double it. No
 * challenge content is ever sent - see `rules.ts` - only how far somebody
 * has got.
 */
import { STAGE_COUNT, type Intent, type Player, type Round } from './rules'

export const SNAPSHOT_TAG = 'opf'
export const INTENT_TAG = 'opf-in'

/** `[id, stage, finishAt cs (-1 for not yet), mistakes]`. */
export type WirePlayer = [string, number, number, number]

export interface Snapshot {
  id: number
  elapsed: number
  over: boolean
  players: WirePlayer[]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const cs = (n: number) => Math.round(n * 100)
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

export function encodeSnapshot(round: Round): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: round.id,
    e: r2(round.elapsed),
    o: round.over ? 1 : 0,
    p: round.players.map((p): WirePlayer => [p.id, p.stage, p.finishAt === null ? -1 : cs(p.finishAt), p.mistakes]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > 8) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 4) return null
    const [id, stage, finishAt, mistakes] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isCount(stage) || stage > STAGE_COUNT) return null
    if (!isNumber(finishAt)) return null
    if (!isCount(mistakes)) return null
    players.push([id, stage, finishAt, mistakes])
  }
  return { id: message.g as number, elapsed: message.e, over: message.o === 1, players }
}

/** A guest's intent, for one round - the round is part of it so a new round starts every count at zero. */
export function encodeIntent(intent: Intent, round: number): Record<string, unknown> {
  return { t: INTENT_TAG, r: round, s: intent.stage, m: intent.mistakes }
}

export function decodeIntent(message: Record<string, unknown>): { round: number; intent: Intent } | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.r) || !isCount(message.s) || !isCount(message.m)) return null
  return { round: message.r as number, intent: { stage: message.s, mistakes: message.m } }
}

/**
 * Brings a guest's copy of the players into line with the host's. Players
 * are updated in place, and a new id is a new round.
 */
export function applySnapshot(round: Round, snap: Snapshot, me: string): Round {
  if (round.id !== snap.id) round.players = []
  round.id = snap.id
  round.elapsed = snap.elapsed
  round.over = snap.over
  const seen = new Set<string>()
  for (const [id, stage, finishAt, mistakes] of snap.players) {
    seen.add(id)
    let p: Player | undefined = round.players.find((each) => each.id === id)
    if (!p) {
      p = { id, stage: 0, lastAdvance: -Infinity, lockedUntil: -Infinity, mistakes: 0, finishAt: null, mine: false, bot: false }
      round.players.push(p)
    }
    Object.assign(p, {
      stage,
      finishAt: finishAt < 0 ? null : finishAt / 100,
      mistakes,
      mine: id === me,
    })
  }
  round.players = round.players.filter((p) => seen.has(p.id))
  return round
}
