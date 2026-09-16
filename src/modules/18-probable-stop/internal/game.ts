/**
 * The rules of Probable Stop, as arithmetic.
 *
 * Six rounds. Each round there are three paths and a countdown; you stand on
 * one, and can move to another as often as you like until time runs out. Then
 * the paths are revealed: some hold, the rest drop into the sea with whoever
 * was on them. In the first four rounds two of the three paths hold. In the
 * last two only one does. Survive all six and you have won.
 *
 * No three.js, no React, no clock of its own: `stepGame` takes a game and how
 * long since last time, and everything - the countdown, the reveal, who falls -
 * can be tested by calling it with numbers.
 *
 * **Which paths hold is decided at the moment of the reveal, and not before.**
 * There is nothing to find out early, on this browser or on the wire, because
 * until the countdown ends the answer does not exist anywhere.
 */
import { createRng, hashSeed } from '../../00-core'

export const GAME = {
  /** How many rounds a game is. */
  rounds: 6,
  /** How many paths there are to choose between, every round. */
  paths: 3,
  /**
   * How many of the three paths hold, round by round.
   *
   * Two in three for the first four rounds, one in three for the last two, as
   * a count rather than a chance per path: "two chances in three" is exactly
   * two safe paths, not a coin that might make all three safe or none.
   */
  safePaths: [2, 2, 2, 2, 1, 1] as readonly number[],
  /** Seconds to choose, each round. */
  chooseTime: 10,
  /**
   * What the countdown drops to once everybody still in has confirmed.
   *
   * Not zero: a moment to see that everybody is in, and for anybody who
   * confirmed by mistake to change their mind.
   */
  allInTime: 1.5,
  /** Seconds the reveal takes: bridges drop, the rest cross. */
  revealTime: 4,
  /** Which path everybody stands on when a round begins: the middle. */
  startPath: 1,
} as const

export type Phase = 'choosing' | 'reveal' | 'over'

export interface Player {
  id: string
  /** Which path they are on, 0 to 2. What counts when the countdown ends. */
  pick: number
  /** Pressed confirm on the path they are on. Moving clears it. */
  confirmed: boolean
  /** Still in the game. */
  alive: boolean
  /** The round they fell in, from 0, or `null` while they are still in. */
  outIn: number | null
  /** True for the player this browser is. */
  mine: boolean
  /** True for a stand-in, choosing by `ai.ts`. */
  bot: boolean
}

export interface Game {
  /**
   * What this game's randomness comes from: which paths hold. Never sent to a
   * guest, who could otherwise work the answers out before the reveal.
   */
  seed: number
  /**
   * Tells one game from the next on the wire. Chosen separately from the seed,
   * not derived from it: anything worked out from the seed could be worked
   * back to it.
   */
  id: number
  /** The round being played, from 0. */
  round: number
  phase: Phase
  /** Seconds left of this phase. */
  clock: number
  /** The paths that held this round. Empty until the reveal. */
  safe: number[]
  players: Player[]
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

/** A game at its start: round one, everybody on the middle path, the clock running. */
export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    round: 0,
    phase: 'choosing',
    clock: GAME.chooseTime,
    safe: [],
    players: entrants.map((e) => ({
      id: e.id,
      pick: GAME.startPath,
      confirmed: false,
      alive: true,
      outIn: null,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
    })),
  }
}

/** Everybody still in. */
export function stillIn(game: Game): Player[] {
  return game.players.filter((p) => p.alive)
}

/** How many of the three paths hold in a round. */
export function safeCount(round: number): number {
  return GAME.safePaths[Math.max(0, Math.min(GAME.rounds - 1, round))]
}

/** Whether a player can change anything right now. */
function canChoose(game: Game, player: Player | undefined): player is Player {
  return !!player && player.alive && game.phase === 'choosing'
}

/** Stands a player on a path. Moving clears a confirm; standing where you are does not. */
export function choose(game: Game, id: string, path: number): void {
  const player = game.players.find((p) => p.id === id)
  if (!canChoose(game, player)) return
  const to = Math.max(0, Math.min(GAME.paths - 1, Math.round(path)))
  if (to === player.pick) return
  player.pick = to
  player.confirmed = false
}

/** Moves a player one path left (-1) or right (+1). Stops at the ends. */
export function step(game: Game, id: string, by: -1 | 1): void {
  const player = game.players.find((p) => p.id === id)
  if (!canChoose(game, player)) return
  choose(game, id, player.pick + by)
}

/** Confirms the path a player is on - or takes it back. */
export function confirm(game: Game, id: string, on = true): void {
  const player = game.players.find((p) => p.id === id)
  if (!canChoose(game, player)) return
  player.confirmed = on
}

/**
 * Which paths hold, for a game and a round.
 *
 * A shuffle of the three, seeded by the game and the round, and the first
 * `safeCount` of it. Called at the reveal and nowhere else.
 */
export function decideSafe(seed: number, round: number): number[] {
  const random = createRng(hashSeed(seed, `probable-stop:round:${round}`))
  const order = Array.from({ length: GAME.paths }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order.slice(0, safeCount(round)).sort()
}

/**
 * One step of the game.
 *
 * Mutates and returns the same game. `dt` is clamped, so a tab that comes back
 * from the background does not skip a whole round.
 *
 * - **Choosing**: the countdown runs; once everybody still in has confirmed it
 *   drops to `allInTime`; at zero, the reveal.
 * - **Reveal**: the paths are decided, everybody on one that did not hold is
 *   out, and when the reveal has played the next round begins - or the game is
 *   over, after the sixth round or when nobody is left.
 */
export function stepGame(game: Game, dt: number): Game {
  if (game.phase === 'over') return game
  const passed = Math.min(Math.max(dt, 0), 0.25)
  game.clock = Math.max(0, game.clock - passed)

  if (game.phase === 'choosing') {
    const left = stillIn(game)
    if (left.length > 0 && left.every((p) => p.confirmed) && game.clock > GAME.allInTime) {
      game.clock = GAME.allInTime
    }
    if (game.clock === 0) reveal(game)
    return game
  }

  if (game.clock === 0) {
    const lastRound = game.round >= GAME.rounds - 1
    if (lastRound || stillIn(game).length === 0) {
      game.phase = 'over'
      return game
    }
    game.round += 1
    game.phase = 'choosing'
    game.clock = GAME.chooseTime
    game.safe = []
    for (const player of game.players) player.confirmed = false
  }
  return game
}

function reveal(game: Game): void {
  game.safe = decideSafe(game.seed, game.round)
  for (const player of stillIn(game)) {
    if (game.safe.includes(player.pick)) continue
    player.alive = false
    player.outIn = game.round
  }
  game.phase = 'reveal'
  game.clock = GAME.revealTime
}

/**
 * Everybody, best first, with their place.
 *
 * Anybody who survived all six shares first. Everybody else is ranked by how
 * late they fell, and people who fell in the same round share a place - they
 * were on the same bridge, or on bridges that dropped together.
 */
export function placings(game: Game): { player: Player; place: number }[] {
  const score = (p: Player) => (p.alive ? GAME.rounds : (p.outIn ?? -1))
  const sorted = [...game.players].sort((a, b) => score(b) - score(a))
  return sorted.map((player) => ({
    player,
    place: 1 + sorted.filter((other) => score(other) > score(player)).length,
  }))
}

/** How many rounds a player got through. */
export function roundsSurvived(player: Player): number {
  return player.alive ? GAME.rounds : (player.outIn ?? 0)
}

/**
 * What somebody wants, whoever is deciding it: which path, and whether they
 * have confirmed it - for one round.
 *
 * The round is part of it on purpose. A guest's "confirmed" from the round
 * before, arriving just after the next one starts, must not confirm them into
 * a round they have not looked at yet.
 */
export interface Intent {
  round: number
  pick: number
  confirmed: boolean
}

/** Makes a player match what they want, if it is for this round and they can still choose. */
export function applyIntent(game: Game, id: string, intent: Intent): void {
  if (intent.round !== game.round) return
  choose(game, id, intent.pick)
  confirm(game, id, intent.confirmed)
}
