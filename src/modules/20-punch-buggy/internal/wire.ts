/**
 * One round, on the wire.
 *
 * The host runs the round and sends where everybody is and what their fists are
 * doing; a guest sends which way it is walking and **how many times it has
 * clicked, ever**. A count rather than "clicked just now", so repeating it is
 * harmless and losing one message loses nothing: the host deals with every click
 * beyond the ones it already has.
 */
import { PUNCHES, type Fighter, type Intent, type Out, type Round } from './rules'

export const SNAPSHOT_TAG = 'pb'
export const INTENT_TAG = 'pb-in'

/** `[id, x, y, facing, alive, outAt, how, by, punch, reach, clicks]`. */
export type WireFighter = [string, number, number, number, 0 | 1, number, number, string, number, number, number]

export interface Snapshot {
  id: number
  elapsed: number
  over: boolean
  fighters: WireFighter[]
}

const HOW: readonly Out[] = ['in', 'punched', 'fell']
const r2 = (n: number) => Math.round(n * 100) / 100
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

export function encodeSnapshot(round: Round): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: round.id,
    e: r2(round.elapsed),
    o: round.over ? 1 : 0,
    f: round.fighters.map(
      (f): WireFighter => [
        f.id,
        r2(f.x),
        r2(f.y),
        r2(f.facing),
        f.alive ? 1 : 0,
        f.outAt === null ? -1 : r2(f.outAt),
        HOW.indexOf(f.how),
        f.by ?? '',
        PUNCHES.indexOf(f.punch),
        r2(f.reach),
        f.clicks,
      ],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.f) || message.f.length === 0 || message.f.length > 8) return null
  const fighters: WireFighter[] = []
  for (const raw of message.f) {
    if (!Array.isArray(raw) || raw.length !== 11) return null
    const [id, x, y, facing, alive, outAt, how, by, punch, reach, clicks] = raw
    if (typeof id !== 'string' || id.length === 0 || typeof by !== 'string') return null
    if (![x, y, facing, outAt, reach].every(isNumber) || reach < 0) return null
    if (alive !== 0 && alive !== 1) return null
    if (!Number.isInteger(how) || HOW[how] === undefined) return null
    if (!Number.isInteger(punch) || PUNCHES[punch] === undefined) return null
    if (!isCount(clicks)) return null
    fighters.push([id, x, y, facing, alive, outAt, how, by, punch, reach, clicks])
  }
  return { id: message.g as number, elapsed: message.e, over: message.o === 1, fighters }
}

/**
 * A guest's intent, for one round.
 *
 * The round is part of it because the click count starts again at zero every
 * round: a guest still repeating last round's count of five, as the next round
 * starts, must not throw five clicks' worth into it.
 */
export function encodeIntent(intent: Intent, round: number): Record<string, unknown> {
  return { t: INTENT_TAG, r: round, x: r2(intent.x), y: r2(intent.y), n: intent.clicks }
}

/** A guest's intent and its round, with the direction clamped: a client can send whatever it likes. */
export function decodeIntent(message: Record<string, unknown>): { round: number; intent: Intent } | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.r) || !isNumber(message.x) || !isNumber(message.y) || !isCount(message.n)) return null
  const length = Math.hypot(message.x, message.y)
  const scale = length > 1 ? 1 / length : 1
  return { round: message.r as number, intent: { x: message.x * scale, y: message.y * scale, clicks: message.n as number } }
}

/**
 * Brings a guest's copy into line with the host's. Fighters are updated in
 * place - the scene keeps a body per fighter - and a new id is a new round.
 */
export function applySnapshot(round: Round, snap: Snapshot, me: string): Round {
  if (round.id !== snap.id) round.fighters = []
  round.id = snap.id
  round.elapsed = snap.elapsed
  round.over = snap.over
  const seen = new Set<string>()
  for (const [id, x, y, facing, alive, outAt, how, by, punch, reach, clicks] of snap.fighters) {
    seen.add(id)
    let f: Fighter | undefined = round.fighters.find((each) => each.id === id)
    if (!f) {
      f = {
        id, x, y, facing, alive: true, outAt: null, how: 'in', by: null, punch: 'in', reach: 0,
        punchSince: 0, clicks: 0, shovedBy: null, shovedAt: -Infinity, mine: false, bot: false,
      }
      round.fighters.push(f)
    }
    Object.assign(f, {
      x,
      y,
      facing,
      alive: alive === 1,
      outAt: outAt < 0 ? null : outAt,
      how: HOW[how],
      by: by === '' ? null : by,
      punch: PUNCHES[punch],
      reach,
      clicks,
      mine: id === me,
    })
  }
  round.fighters = round.fighters.filter((f) => seen.has(f.id))
  return round
}
