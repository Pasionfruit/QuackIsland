/**
 * One race, on the wire.
 *
 * The host sends the seed - so every browser draws the same lights and the same
 * circle - its clock, and where everybody has got to. A guest sends **its own
 * account of its race**: how many steps it has taken, and whether it is out and
 * why. Both only ever go forward, so repeating it is harmless and losing a
 * message loses nothing.
 */
import { WHYS, type Race, type Racer, type Self } from './rules'

export const SNAPSHOT_TAG = 'sl'
export const INTENT_TAG = 'sl-in'

/** `[id, steps, why (-1 for still in), outAt, finishedAt (-1 for not yet), place (0 for none)]`. */
export type WireRacer = [string, number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  racers: WireRacer[]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

export function encodeSnapshot(race: Race): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: race.id,
    s: race.seed,
    e: r2(race.elapsed),
    o: race.over ? 1 : 0,
    p: race.racers.map(
      (r): WireRacer => [
        r.id,
        r.steps,
        r.out ? WHYS.indexOf(r.out.why) : -1,
        r.out ? r2(r.out.at) : 0,
        r.finishedAt === null ? -1 : r2(r.finishedAt),
        r.place ?? 0,
      ],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > 8) return null
  const racers: WireRacer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 6) return null
    const [id, steps, why, outAt, finishedAt, place] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isCount(steps) || !isCount(place) || !isNumber(outAt) || !isNumber(finishedAt)) return null
    if (!Number.isInteger(why) || why < -1 || why >= WHYS.length) return null
    racers.push([id, steps, why, outAt, finishedAt, place])
  }
  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, racers }
}

/**
 * A guest's account of its race, for one race.
 *
 * The race is part of it because the steps start again at zero every race: a
 * guest still repeating the last race's forty steps, as the next one starts,
 * must not be forty steps down the next track.
 */
export function encodeIntent(self: Self, race: number): Record<string, unknown> {
  return {
    t: INTENT_TAG,
    r: race,
    n: self.steps,
    w: self.out ? WHYS.indexOf(self.out.why) : -1,
    a: self.out ? r2(self.out.at) : 0,
  }
}

export function decodeIntent(message: Record<string, unknown>): { race: number; self: Self } | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.r) || !isCount(message.n) || !isNumber(message.a) || message.a < 0) return null
  const why = message.w
  // Pressed space on red, slipped, or walked out of the race.
  if (!Number.isInteger(why) || (why as number) < -1 || (why as number) >= WHYS.length) return null
  return {
    race: message.r as number,
    self: { steps: message.n as number, out: why === -1 ? null : { why: WHYS[why as number], at: message.a as number } },
  }
}

/**
 * Brings a guest's copy into line with the host's. Racers are updated in place
 * - the scene keeps a body per racer - and a new id is a new race.
 */
export function applySnapshot(race: Race, snap: Snapshot, me: string): Race {
  if (race.id !== snap.id) {
    race.racers = []
    race.elapsed = snap.elapsed
  }
  race.id = snap.id
  race.seed = snap.seed
  race.over = snap.over
  if (snap.over) race.elapsed = snap.elapsed
  const seen = new Set<string>()
  for (const [id, steps, why, outAt, finishedAt, place] of snap.racers) {
    seen.add(id)
    let r: Racer | undefined = race.racers.find((each) => each.id === id)
    if (!r) {
      r = { id, steps: 0, out: null, finishedAt: null, place: null, mine: false, bot: false }
      race.racers.push(r)
    }
    Object.assign(r, {
      steps,
      out: why < 0 ? null : { why: WHYS[why], at: outAt },
      finishedAt: finishedAt < 0 ? null : finishedAt,
      place: place === 0 ? null : place,
      mine: id === me,
    })
  }
  race.racers = race.racers.filter((r) => seen.has(r.id))
  return race
}
