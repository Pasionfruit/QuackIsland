/**
 * One race, on the wire.
 *
 * The host runs the race and sends where everybody is; a guest sends which
 * letters it is holding. **Letters, not directions**: the host reads them
 * through the racer's binding at that moment, so a spin on the host changes
 * what a guest's keys do on the very next frame, with nothing to reconcile.
 *
 * **The maze goes as its seed.** A guest builds the same walls from the same
 * number - see `mazeFor` - so a snapshot is who is where, never what the maze
 * looks like.
 *
 * All pure: what a message is, reading one back without trusting it, and
 * bringing a guest's copy into line with it. The half that touches a socket is
 * `useRaceNet`.
 */
import { heldLetters, isBinding } from './bindings'
import type { Race, Racer } from './race'

/** Host to everybody: the race. Unique across the build. */
export const SNAPSHOT_TAG = 'mm'
/** Guest to host: the letters being held. */
export const KEYS_TAG = 'mm-in'

/**
 * One racer on the wire.
 *
 * `[id, x, y, facing, binding, spins, touched, on, spin, finishedAt, place]`,
 * with `finishedAt` -1 and `place` 0 for somebody still racing. A tuple rather
 * than an object, rounded to the centimetre, because it goes out twenty times
 * a second.
 */
export type WireRacer = [string, number, number, number, string, number, number, number, number, number, number]

export interface Snapshot {
  seed: number
  elapsed: number
  over: boolean
  firstIn: number | null
  racers: WireRacer[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= -1

export function encodeSnapshot(race: Race): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    s: race.seed,
    e: round2(race.elapsed),
    o: race.over ? 1 : 0,
    f: race.firstIn === null ? -1 : round2(race.firstIn),
    r: race.racers.map(
      (r): WireRacer => [
        r.id,
        round2(r.x),
        round2(r.y),
        round2(r.facing),
        r.binding,
        r.spins,
        r.touched,
        r.on,
        round2(r.spin),
        r.finishedAt === null ? -1 : round2(r.finishedAt),
        r.place ?? 0,
      ],
    ),
  }
}

/**
 * Reads a snapshot, or `null` for anything that is not one.
 *
 * Refused whole rather than half-read. A racer with a binding that is not four
 * letters is a racer whose keys do nothing, and a seed that is not a whole
 * number is a maze nobody else is looking at.
 */
export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!Number.isInteger(message.s) || (message.s as number) < 0) return null
  if (!isNumber(message.e) || !isNumber(message.f) || !Array.isArray(message.r)) return null
  if (message.o !== 0 && message.o !== 1) return null

  const racers: WireRacer[] = []
  for (const raw of message.r) {
    if (!Array.isArray(raw) || raw.length !== 11) return null
    const [id, x, y, facing, binding, spins, touched, on, spin, finishedAt, place] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (![x, y, facing, spin, finishedAt].every(isNumber)) return null
    if (!isBinding(binding)) return null
    if (![spins, touched, on, place].every(isCount)) return null
    racers.push([id, x, y, facing, binding, spins, touched, on, spin, finishedAt, place])
  }

  // A real race always has somebody in it; an empty one would clear everybody's.
  if (racers.length === 0) return null

  return {
    seed: message.s as number,
    elapsed: message.e,
    over: message.o === 1,
    firstIn: message.f < 0 ? null : message.f,
    racers,
  }
}

export function encodeKeys(held: string): Record<string, unknown> {
  return { t: KEYS_TAG, k: heldLetters(held) }
}

/** The letters a guest is holding, tidied, or `null` if that is not what this is. */
export function decodeKeys(message: Record<string, unknown>): string | null {
  if (message.t !== KEYS_TAG || typeof message.k !== 'string') return null
  return heldLetters(message.k)
}

/**
 * Brings a guest's copy of the race into line with the host's.
 *
 * **Racers are moved, not replaced**, because the scene holds a body per racer
 * and rebuilding them twenty times a second would be building avatars twenty
 * times a second. A new seed is a new race, so the racers are dealt afresh.
 */
export function applySnapshot(race: Race, snap: Snapshot, me: string): Race {
  if (race.seed !== snap.seed) race.racers = []
  race.seed = snap.seed
  race.elapsed = snap.elapsed
  race.over = snap.over
  race.firstIn = snap.firstIn

  const seen = new Set<string>()
  for (const [id, x, y, facing, binding, spins, touched, on, spin, finishedAt, place] of snap.racers) {
    seen.add(id)
    let racer = race.racers.find((r) => r.id === id)
    if (!racer) {
      racer = {
        id,
        x,
        y,
        facing,
        binding,
        spins,
        touched,
        on,
        spin,
        daze: 0,
        finishedAt: null,
        place: null,
        mine: false,
        bot: false,
      } satisfies Racer
      race.racers.push(racer)
    }
    racer.x = x
    racer.y = y
    racer.facing = facing
    racer.binding = binding
    racer.spins = spins
    racer.touched = touched
    racer.on = on
    racer.spin = spin
    racer.finishedAt = finishedAt < 0 ? null : finishedAt
    racer.place = place > 0 ? place : null
    // Which racer is yours is this browser's business, not the host's.
    racer.mine = id === me
  }
  race.racers = race.racers.filter((r) => seen.has(r.id))
  return race
}
