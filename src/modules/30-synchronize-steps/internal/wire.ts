/**
 * One game, on the wire.
 *
 * The host sends the round, the phase and its clock, and everybody's step, last
 * move and whether they are out. **This round's picks go out as "has picked"
 * until the reveal**: a pick you could see before you made yours is a pick you
 * would avoid, and the game is guessing.
 *
 * A guest sends its pick: which game, which round, which number. Said again for
 * as long as the round lasts - it may change its mind - and the latest counts.
 */
import { PHASES, TOWER, type Game, type Move, type Stepper } from './rules'

export const SNAPSHOT_TAG = 'ss'
export const INTENT_TAG = 'ss-in'

/** `[id, step, pick (0 none, -1 picked but hidden, else the number), last move or 0, out round (-1 still on), out from]`. */
export type WireStepper = [string, number, number, [number, number, number, number] | 0, number, number]

export interface Snapshot {
  id: number
  seed: number
  round: number
  phase: (typeof PHASES)[number]
  clock: number
  elapsed: number
  steppers: WireStepper[]
}

/** A pick a guest knows was made, but not what. */
export const HIDDEN = -1

const r2 = (n: number) => Math.round(n * 100) / 100
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

export function encodeSnapshot(game: Game): Record<string, unknown> {
  const shown = game.phase !== 'choose'
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    r: game.round,
    p: PHASES.indexOf(game.phase),
    c: r2(game.clock),
    e: r2(game.elapsed),
    f: game.players.map(
      (s): WireStepper => [
        s.id,
        s.step,
        s.pick === null ? 0 : shown ? s.pick : HIDDEN,
        s.last ? [s.last.pick, s.last.with, s.last.moved, s.last.auto ? 1 : 0] : 0,
        s.out ? s.out.round : -1,
        s.out ? s.out.from : 0,
      ],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isCount(message.r) || (message.r as number) >= TOWER.rounds) return null
  if (!isCount(message.p) || PHASES[message.p as number] === undefined) return null
  if (!isNumber(message.c) || message.c < 0 || !isNumber(message.e) || message.e < 0) return null
  if (!Array.isArray(message.f) || message.f.length === 0 || message.f.length > 8) return null
  const steppers: WireStepper[] = []
  for (const raw of message.f) {
    if (!Array.isArray(raw) || raw.length !== 6) return null
    const [id, step, pick, last, outRound, outFrom] = raw
    if (typeof id !== 'string' || id.length === 0 || !isCount(step) || step > TOWER.steps) return null
    if (!(pick === 0 || pick === HIDDEN || TOWER.options.includes(pick))) return null
    if (last !== 0) {
      if (!Array.isArray(last) || last.length !== 4) return null
      const [lp, lw, lm, la] = last
      if (!TOWER.options.includes(lp) || !isCount(lw) || !isCount(lm) || (la !== 0 && la !== 1)) return null
    }
    if (!(outRound === -1 || isCount(outRound)) || !isCount(outFrom)) return null
    steppers.push([id, step, pick, last, outRound, outFrom])
  }
  return {
    id: message.g as number,
    seed: message.s as number,
    round: message.r as number,
    phase: PHASES[message.p as number],
    clock: message.c,
    elapsed: message.e,
    steppers,
  }
}

/**
 * Brings a guest's copy into line with the host's: everything but the clock,
 * which the caller eases. A pick the host has not shown yet stays as whatever
 * this browser has - its own pick, which it knows - or `HIDDEN`.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) game.players = []
  game.id = snap.id
  game.seed = snap.seed
  game.round = snap.round
  game.phase = snap.phase
  game.elapsed = Math.max(game.elapsed, snap.elapsed)
  const next: Stepper[] = []
  for (const [id, step, pick, last, outRound, outFrom] of snap.steppers) {
    const stepper: Stepper = game.players.find((p) => p.id === id) ?? { id, mine: false, bot: false, step, pick: null, last: null, out: null }
    const move: Move | null = last === 0 ? null : { pick: last[0], with: last[1], moved: last[2], auto: last[3] === 1 }
    Object.assign(stepper, {
      mine: id === me,
      step,
      pick: pick === 0 ? null : pick === HIDDEN ? (id === me && stepper.pick !== null ? stepper.pick : HIDDEN) : pick,
      last: move,
      out: outRound < 0 ? null : { round: outRound, from: outFrom },
    })
    next.push(stepper)
  }
  game.players = next
  return game
}

export function encodeIntent(game: number, round: number, pick: number): Record<string, unknown> {
  return { t: INTENT_TAG, g: game, r: round, c: pick }
}

export function decodeIntent(message: Record<string, unknown>): { game: number; round: number; pick: number } | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isCount(message.r) || !TOWER.options.includes(message.c as number)) return null
  return { game: message.g as number, round: message.r as number, pick: message.c as number }
}
