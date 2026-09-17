/**
 * One race, on the wire.
 *
 * The host sends the seed - every browser shows the same sentence from it - its
 * clock, and where everybody has got to: counts, mistakes, splits, places. A
 * guest sends **its own account of its race**: strokes, pedals, characters
 * typed and mistakes. All of them only ever go forward, so repeating it is
 * harmless and losing a message loses nothing.
 */
import type { Race, Racer, Self } from './rules'

export const SNAPSHOT_TAG = 'tri'
export const INTENT_TAG = 'tri-in'

/** `[id, strokes, pedals, typed, mistakes, swim at, bike at, finish at (-1 for not yet), place (0 for none), left (0/1)]`. */
export type WireRacer = [string, number, number, number, number, number, number, number, number, number]

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
const split = (v: number | null) => (v === null ? -1 : r2(v))
const unsplit = (v: number) => (v < 0 ? null : v)

export function encodeSnapshot(race: Race): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: race.id,
    s: race.seed,
    e: r2(race.elapsed),
    o: race.over ? 1 : 0,
    r: race.racers.map(
      (r): WireRacer => [r.id, r.strokes, r.pedals, r.typed, r.mistakes, split(r.swimAt), split(r.bikeAt), split(r.finishAt), r.place ?? 0, r.left ? 1 : 0],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.r) || message.r.length === 0 || message.r.length > 8) return null
  const racers: WireRacer[] = []
  for (const raw of message.r) {
    if (!Array.isArray(raw) || raw.length !== 10) return null
    const [id, strokes, pedals, typed, mistakes, swimAt, bikeAt, finishAt, place, left] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (![strokes, pedals, typed, mistakes, place].every(isCount)) return null
    if (![swimAt, bikeAt, finishAt].every((v) => isNumber(v) && (v === -1 || v >= 0))) return null
    if (left !== 0 && left !== 1) return null
    racers.push([id, strokes, pedals, typed, mistakes, swimAt, bikeAt, finishAt, place, left])
  }
  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, racers }
}

/** Brings a guest's copy into line with the host's: everything but the clock, which the caller eases. */
export function applySnapshot(race: Race, snap: Snapshot, me: string): Race {
  if (race.id !== snap.id) {
    race.racers = []
    race.elapsed = snap.elapsed
  }
  race.id = snap.id
  race.seed = snap.seed
  race.over = snap.over
  if (snap.over) race.elapsed = snap.elapsed
  const next: Racer[] = []
  for (const [id, strokes, pedals, typed, mistakes, swimAt, bikeAt, finishAt, place, left] of snap.racers) {
    const racer: Racer =
      race.racers.find((r) => r.id === id) ??
      { id, mine: false, bot: false, strokes: 0, pedals: 0, typed: 0, mistakes: 0, swimAt: null, bikeAt: null, finishAt: null, place: null, left: false }
    Object.assign(racer, {
      mine: id === me,
      strokes,
      pedals,
      typed,
      mistakes,
      swimAt: unsplit(swimAt),
      bikeAt: unsplit(bikeAt),
      finishAt: unsplit(finishAt),
      place: place === 0 ? null : place,
      left: left === 1,
    })
    next.push(racer)
  }
  race.racers = next
  return race
}

/** A guest's account of its race, for one race: the counts start again at zero every race. */
export function encodeIntent(self: Self, race: number): Record<string, unknown> {
  return { t: INTENT_TAG, g: race, a: self.strokes, b: self.pedals, c: self.typed, m: self.mistakes }
}

export function decodeIntent(message: Record<string, unknown>): { race: number; self: Self } | null {
  if (message.t !== INTENT_TAG) return null
  if (![message.g, message.a, message.b, message.c, message.m].every(isCount)) return null
  return {
    race: message.g as number,
    self: { strokes: message.a as number, pedals: message.b as number, typed: message.c as number, mistakes: message.m as number, stumbling: 0 },
  }
}
