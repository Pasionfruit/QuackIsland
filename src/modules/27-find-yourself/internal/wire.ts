/**
 * One game, on the wire.
 *
 * The host sends the seed - every browser deals and animates the same shuffles
 * from it - the stage, the phase and its clock, scores, and picks. **A pick is
 * sent as "has picked" until the cups come up**: nobody can copy somebody who
 * kept their eye on the right cup. A stage's picks go out once its result is
 * showing.
 *
 * A guest sends its pick: which game, which stage, which slot. Said again until
 * the host says it has picked, and counted once.
 */
import { PHASES, TABLE, type Finder, type Game } from './rules'

export const SNAPSHOT_TAG = 'fy'
export const INTENT_TAG = 'fy-in'

/** `[id, score, left (0/1), picks: a slot per stage, -1 for none, -2 for picked but not shown yet]`. */
export type WireFinder = [string, number, number, number[]]

export interface Snapshot {
  id: number
  seed: number
  stage: number
  phase: (typeof PHASES)[number]
  clock: number
  elapsed: number
  finders: WireFinder[]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

/** Whether a stage's picks can be shown in this game's phase. */
export function picksShown(game: Pick<Game, 'stage' | 'phase'>, stage: number): boolean {
  if (stage < game.stage) return true
  return stage === game.stage && (game.phase === 'result' || game.phase === 'over')
}

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    st: game.stage,
    p: PHASES.indexOf(game.phase),
    c: r2(game.clock),
    e: r2(game.elapsed),
    f: game.players.map(
      (f): WireFinder => [f.id, f.score, f.left ? 1 : 0, f.picks.map((slot, stage) => (slot === null ? -1 : picksShown(game, stage) ? slot : -2))],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isCount(message.st) || (message.st as number) >= TABLE.points.length) return null
  if (!isCount(message.p) || PHASES[message.p as number] === undefined) return null
  if (!isNumber(message.c) || message.c < 0 || !isNumber(message.e) || message.e < 0) return null
  if (!Array.isArray(message.f) || message.f.length === 0 || message.f.length > 8) return null
  const cups = Math.max(TABLE.fewestCups, message.f.length + 1)
  const finders: WireFinder[] = []
  for (const raw of message.f) {
    if (!Array.isArray(raw) || raw.length !== 4) return null
    const [id, score, left, picks] = raw
    if (typeof id !== 'string' || id.length === 0 || !isCount(score) || (left !== 0 && left !== 1)) return null
    if (!Array.isArray(picks) || picks.length !== TABLE.points.length) return null
    if (!picks.every((s) => s === -1 || s === -2 || (isCount(s) && s < cups))) return null
    finders.push([id, score, left, picks as number[]])
  }
  return {
    id: message.g as number,
    seed: message.s as number,
    stage: message.st as number,
    phase: PHASES[message.p as number],
    clock: message.c,
    elapsed: message.e,
    finders,
  }
}

/**
 * Brings a guest's copy into line with the host's: everything but the clock,
 * which the caller eases. A pick the host has not shown yet stays as whatever
 * this browser already has - its own pick, which it knows - or a pick of -1
 * standing for "picked something".
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) game.players = []
  game.id = snap.id
  game.seed = snap.seed
  game.stage = snap.stage
  game.phase = snap.phase
  game.elapsed = Math.max(game.elapsed, snap.elapsed)
  const next: Finder[] = []
  for (const [id, score, left, picks] of snap.finders) {
    const finder: Finder = game.players.find((p) => p.id === id) ?? { id, mine: false, bot: false, score: 0, picks: TABLE.points.map(() => null), left: false }
    Object.assign(finder, {
      mine: id === me,
      score,
      left: left === 1,
      picks: picks.map((slot, stage) => (slot >= 0 ? slot : slot === -2 ? (finder.picks[stage] ?? HIDDEN) : null)),
    })
    next.push(finder)
  }
  game.players = next
  return game
}

/** A pick a guest knows was made, but not where. */
export const HIDDEN = -1

export function encodeIntent(game: number, stage: number, slot: number): Record<string, unknown> {
  return { t: INTENT_TAG, g: game, st: stage, c: slot }
}

export function decodeIntent(message: Record<string, unknown>): { game: number; stage: number; slot: number } | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isCount(message.st) || !isCount(message.c) || (message.c as number) >= 9) return null
  return { game: message.g as number, stage: message.st as number, slot: message.c as number }
}
