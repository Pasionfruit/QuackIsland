/**
 * A game, on the wire.
 *
 * The host sends the seed - which is all three targets - its clock, and for
 * every player where their clock reads and which targets they have got and
 * when. **Everybody's clock is on show**, so it all goes to everybody.
 *
 * A guest sends where its own clock reads, ten times a second, and with it any
 * answers the host has not shown yet: which target, and the reading. Only right
 * ones - a guest checks its own first, since it knows the targets - and said
 * again with every message until the host shows them got.
 */
import { TARGETS } from './wording'
import type { Game, Player } from './rules'

export const SNAPSHOT_TAG = 'ijw'
export const INTENT_TAG = 'ijw-in'

/** `[id, clock reading, per target: seconds in when got or -1, left (0/1)]`. */
export type WirePlayer = [string, number, number[], number]

export interface Snapshot {
  id: number
  seed: number
  clock: number
  over: boolean
  players: WirePlayer[]
}

/** An answer on its way to the host: which target, and what the clock read. */
export interface Answer {
  stage: number
  minutes: number
}

export interface Intent {
  game: number
  /** Where the guest's clock reads now. */
  minutes: number
  answers: Answer[]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isReading = (v: unknown): v is number => isCount(v) && v < 720

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    c: r2(game.clock),
    o: game.over ? 1 : 0,
    p: game.players.map((p): WirePlayer => [p.id, p.minutes, p.solved.map((s) => (s === null ? -1 : s)), p.left ? 1 : 0]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s)) return null
  if (!isNumber(message.c) || message.c < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > 8) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 4) return null
    const [id, minutes, solved, left] = raw
    if (typeof id !== 'string' || id.length === 0 || !isReading(minutes)) return null
    if (!Array.isArray(solved) || solved.length !== TARGETS) return null
    if (!solved.every((s) => isNumber(s) && (s >= 0 || s === -1))) return null
    if (left !== 0 && left !== 1) return null
    players.push([id, minutes, solved as number[], left])
  }
  return { id: message.g as number, seed: message.s as number, clock: message.c, over: message.o === 1, players }
}

/**
 * Brings a guest's copy into line with the host's: everything but the clock,
 * which the caller eases, and this browser's own reading, which is whatever
 * it has wound. Targets this browser has got and is still telling the host
 * about - `keep` - stay got until the host says, unless the game is over, when
 * the host's word is the only one.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string, keep: readonly number[] = []): Game {
  if (game.id !== snap.id) {
    game.players = []
    game.clock = snap.clock
  }
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  if (snap.over) game.clock = snap.clock
  const next: Player[] = []
  for (const [id, minutes, solved, left] of snap.players) {
    const player: Player =
      game.players.find((p) => p.id === id) ?? { id, mine: false, bot: false, minutes, solved: Array.from({ length: TARGETS }, () => null), left: false }
    const mine = id === me
    const was = player.solved
    player.mine = mine
    player.left = left === 1
    if (!mine) player.minutes = minutes
    player.solved = solved.map((s, stage) => (s >= 0 ? s : mine && !snap.over && keep.includes(stage) ? (was[stage] ?? null) : null))
    next.push(player)
  }
  game.players = next
  return game
}

export function encodeIntent(intent: Intent): Record<string, unknown> {
  return { t: INTENT_TAG, g: intent.game, m: intent.minutes, a: intent.answers.map((a) => [a.stage, a.minutes]) }
}

export function decodeIntent(message: Record<string, unknown>): Intent | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isReading(message.m) || !Array.isArray(message.a) || message.a.length > TARGETS) return null
  const answers: Answer[] = []
  for (const raw of message.a) {
    if (!Array.isArray(raw) || raw.length !== 2) return null
    const [stage, minutes] = raw
    if (!isCount(stage) || stage >= TARGETS || !isReading(minutes)) return null
    answers.push({ stage, minutes })
  }
  return { game: message.g as number, minutes: message.m, answers }
}
