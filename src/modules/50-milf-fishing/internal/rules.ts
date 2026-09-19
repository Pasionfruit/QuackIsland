/**
 * The rules of M.I.L.F (fishing), as arithmetic.
 *
 * Everybody fishes off the same dock for 25 seconds, each with their own rod
 * and their own fish. **Watch your rod**: when a fish takes the bait it bends -
 * a little for a small one, right over for a big one - tugs for a second or two,
 * and lets go. **Click to pull.** Pull while a fish is on and you land it; pull
 * when the rod is not bent and you land nothing. Either way the line is out of
 * the water for a moment while you cast again, and anything that bites then is
 * missed.
 *
 * So every bite is a choice: take this fish, or wait for a bigger one that may
 * never come. **Biggest total catch wins.**
 *
 * Everything here is pure.
 */
import { LENGTH, RECAST, bitesFor, playBack, type Bite } from './pond'

/** How long ago a guest's pull may say it happened, seconds: no earlier than that is believed. */
export const PULL_SLACK = 0.5

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  /** When they pulled, on the game's clock, in order - only pulls that counted. */
  pulls: number[]
  left: boolean
  leftAt: number | null
}

export interface Game {
  seed: number
  id: number
  elapsed: number
  over: boolean
  players: Player[]
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

const round2 = (v: number) => Math.round(v * 100) / 100

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    players: entrants.map((e) => ({ id: e.id, mine: e.mine ?? false, bot: e.bot ?? false, pulls: [], left: false, leftAt: null })),
  }
}

/** A player's bites. */
export function bitesOf(game: Game, player: number): Bite[] {
  return bitesFor(game.seed, player)
}

/** What a player has landed, in order. */
export function catches(game: Game, player: number): Bite[] {
  return playBack(bitesOf(game, player), game.players[player].pulls).landed.filter((b): b is Bite => b !== null)
}

/** A player's whole catch, kilograms. */
export function total(game: Game, player: number): number {
  return round2(catches(game, player).reduce((sum, b) => sum + b.weight, 0))
}

/** How long until a player's line is back in the water, seconds: nought when it is in. */
export function castLeft(game: Game, player: number): number {
  const p = game.players[player]
  const last = p.pulls.length ? p.pulls[p.pulls.length - 1] : -Infinity
  return Math.max(0, RECAST - (game.elapsed - last))
}

export function canPull(game: Game, player: number): boolean {
  const p = game.players[player]
  return !!p && !game.over && !p.left && game.elapsed >= 0 && game.elapsed <= LENGTH && castLeft(game, player) <= 1e-9
}

/**
 * A pull, at `at` on the game's clock if given - a guest's own reading of when
 * it clicked - but never later than now, never more than `PULL_SLACK` before
 * now, and never while the line is still being cast. What it landed: a fish, or
 * null for nothing - or undefined if it did not count at all.
 */
export function pull(game: Game, player: number, at?: number): Bite | null | undefined {
  const p = game.players[player]
  if (!p || game.over || p.left) return undefined
  const last = p.pulls.length ? p.pulls[p.pulls.length - 1] : -Infinity
  const t = round2(Math.min(game.elapsed, Math.max(at ?? game.elapsed, game.elapsed - PULL_SLACK, 0)))
  if (t - last < RECAST - 1e-9 || t > LENGTH) return undefined
  p.pulls.push(t)
  const played = playBack(bitesOf(game, player), p.pulls)
  return played.landed[played.landed.length - 1]
}

/** The clock, on every screen. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  game.elapsed += Math.min(Math.max(dt, 0), 0.25)
}

/** Over when the 25 seconds are up, or nobody is left fishing. Only the host decides. */
export function judgeEnd(game: Game): boolean {
  if (game.over) return true
  if (game.elapsed >= LENGTH || game.players.every((p) => p.left)) game.over = true
  return game.over
}

export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
  judgeEnd(game)
  return game
}

export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (!p || p.left || game.over) return
  p.leftAt = round2(game.elapsed)
  p.left = true
}

/**
 * Everybody, best first, with their place: the biggest total catch first -
 * level catches share; then anybody who left, the last to leave first.
 */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const key = (p: Player, i: number): [number, number] => (p.left ? [1, -(p.leftAt ?? 0)] : [0, -total(game, i)])
  const keys = game.players.map((p, i) => key(p, i))
  const better = (a: number, b: number) => (keys[a][0] !== keys[b][0] ? keys[a][0] < keys[b][0] : keys[a][1] < keys[b][1] - 1e-9)
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => (better(a.index, b.index) ? -1 : better(b.index, a.index) ? 1 : a.index - b.index))
  return ranked.map((entry) => ({ ...entry, place: 1 + ranked.filter((other) => better(other.index, entry.index)).length }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const

