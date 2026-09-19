/**
 * The rules of Perfect Game, as arithmetic.
 *
 * **Turn by turn**, in an order from the seed, each player gets one throw while
 * everybody else watches. A bent column of thirty crabs marches from left to
 * right across the beach. **Ten seconds** to choose where to stand behind the
 * line and the angle of the coconut - and when to let it go: click to roll it
 * early, or it rolls when the time runs out. It rolls in a straight line,
 * **every crab it hits is a point**, and the most points after everybody's turn
 * wins. Hit all thirty and that is a perfect game.
 *
 * Each turn deals its own column - an arc, an S or a hook, bent more or less -
 * so nobody gets to copy the throw before theirs.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'
import { clampThrow, columnFor, hits, travel, type Throw } from './beach'

export const TURN = {
  /** "Next up", seconds - not before the first turn, which the screen's own three-two-one counts in. */
  intro: 3,
  /** Aiming, seconds: then it rolls whether you have clicked or not. */
  aim: 10,
  /** The crabs a throw hit, shown for this long after it has rolled off the beach. */
  result: 3,
} as const

/** How long ago a guest's roll may say it happened, seconds: no earlier than that is believed. */
export const ROLL_SLACK = 0.5

/** Where a thrower stands at the start of their turn, aiming straight at the sea. */
export const HOME = { x: 0, z: 3, angle: 0 } as const

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  /** The crabs their throw hit, or null before their turn is done. */
  score: number | null
  left: boolean
}

export interface Game {
  seed: number
  id: number
  elapsed: number
  over: boolean
  players: Player[]
  /** Who throws in which turn, by index. */
  order: number[]
  turn: number
  /** When this turn's aiming starts, in `elapsed`: its "next up" is before. */
  startsAt: number
  /** Where the thrower stands and the angle they have chosen. */
  aim: { x: number; z: number; angle: number }
  /** When they rolled it, seconds into the aiming, or null. */
  rolledAt: number | null
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

export type Phase = 'intro' | 'aim' | 'rolling' | 'result' | 'over'

const round2 = (v: number) => Math.round(v * 100) / 100

/** The turn order: everybody once, shuffled by the seed. */
export function turnOrder(seed: number, count: number): number[] {
  const random = createRng(hashSeed(seed, 'perfect-game:order'))
  const order = Array.from({ length: count }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    players: entrants.map((e) => ({ id: e.id, mine: e.mine ?? false, bot: e.bot ?? false, score: null, left: false })),
    order: turnOrder(seed, entrants.length),
    turn: 0,
    startsAt: 0,
    aim: { ...HOME },
    rolledAt: null,
  }
}

/** Who is throwing, by index, or -1 once it is over. */
export function thrower(game: Game): number {
  return game.over ? -1 : (game.order[game.turn] ?? -1)
}

/** How far into this turn's aiming the clock is, seconds - negative during the "next up". */
export function tau(game: Game): number {
  return game.elapsed - game.startsAt
}

/** This turn's throw, once it is rolled. */
export function throwOf(game: Game): Throw | null {
  return game.rolledAt === null ? null : { ...game.aim, at: game.rolledAt }
}

/** Where this turn is up to. */
export function phaseOf(game: Game): Phase {
  if (game.over) return 'over'
  const t = tau(game)
  if (t < 0) return 'intro'
  const thrown = throwOf(game)
  if (!thrown) return 'aim'
  return t < thrown.at + travel(thrown) ? 'rolling' : 'result'
}

/** The crabs this turn's throw hits, and when. */
export function turnHits(game: Game): { crab: number; at: number }[] {
  const thrown = throwOf(game)
  return thrown ? hits(columnFor(game.seed, game.turn), thrown) : []
}

/** The thrower moves or aims: kept in the box and the angle in range. Only while aiming, only the thrower. */
export function aimTo(game: Game, player: number, x: number, z: number, angle: number): void {
  if (player !== thrower(game) || phaseOf(game) !== 'aim') return
  game.aim = clampThrow(x, z, angle)
}

/**
 * The thrower rolls it: at `at` seconds into the aiming if given - a guest's own
 * reading of when it clicked - but never later than now, never more than
 * `ROLL_SLACK` before now, never before the aiming began. Whether it rolled.
 */
export function roll(game: Game, player: number, at?: number): boolean {
  if (player !== thrower(game) || phaseOf(game) !== 'aim') return false
  const now = Math.min(tau(game), TURN.aim)
  game.rolledAt = round2(Math.max(0, Math.min(now, Math.max(at ?? now, now - ROLL_SLACK))))
  return true
}

/** The clock, on every screen. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  game.elapsed += Math.min(Math.max(dt, 0), 0.25)
}

/** On to the next turn - skipping anybody who has left - or the end. */
function nextTurn(game: Game): void {
  let turn = game.turn + 1
  while (turn < game.order.length && game.players[game.order[turn]].left) turn++
  if (turn >= game.order.length) {
    game.over = true
    return
  }
  game.turn = turn
  game.startsAt = round2(game.elapsed + TURN.intro)
  game.aim = { ...HOME }
  game.rolledAt = null
}

/**
 * The turn moves on: it rolls itself when the aiming runs out; its score is in
 * as the coconut leaves the beach; after the result the next turn is up. A
 * thrower who has left forfeits their turn. Only the host, or alone.
 */
export function advanceTurn(game: Game): void {
  if (game.over) return
  const who = thrower(game)
  if (who < 0) {
    game.over = true
    return
  }
  const p = game.players[who]
  if (p.left) {
    if (p.score === null) p.score = 0
    nextTurn(game)
    return
  }
  if (phaseOf(game) === 'aim' && tau(game) >= TURN.aim) roll(game, who, TURN.aim)
  const thrown = throwOf(game)
  if (!thrown) return
  const done = thrown.at + travel(thrown)
  if (tau(game) >= done && p.score === null) p.score = turnHits(game).length
  if (tau(game) >= done + TURN.result) nextTurn(game)
}

export function judgeEnd(game: Game): boolean {
  if (game.over) return true
  if (game.players.every((p) => p.left)) game.over = true
  return game.over
}

export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
  advanceTurn(game)
  judgeEnd(game)
  return game
}

export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (!p || p.left || game.over) return
  p.left = true
}

/**
 * Everybody, best first, with their place: the most crabs first - level scores
 * share; then anybody who left, whatever they scored.
 */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const key = (p: Player): [number, number] => (p.left ? [1, 0] : [0, -(p.score ?? 0)])
  const better = (a: Player, b: Player) => {
    const ka = key(a)
    const kb = key(b)
    return ka[0] !== kb[0] ? ka[0] < kb[0] : ka[1] < kb[1]
  }
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => (better(a.player, b.player) ? -1 : better(b.player, a.player) ? 1 : a.index - b.index))
  return ranked.map((entry) => ({ ...entry, place: 1 + ranked.filter((other) => better(other.player, entry.player)).length }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const
