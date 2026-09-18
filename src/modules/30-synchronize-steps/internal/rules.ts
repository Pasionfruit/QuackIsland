/**
 * The rules of Synchronize Steps, as arithmetic.
 *
 * Everybody starts on top of a tower twenty steps high. Every two seconds each
 * player picks how far to go down: 1, 4 or 6. Then the picks are revealed:
 *
 * - **Exactly two** picked the same number: both move down that many steps -
 *   except a pair on **1**, which drops eight. Otherwise 1 is the safe pick:
 *   the worst a pair on it costs is one step, and everybody would pick 1 every
 *   round.
 * - **Three or more** picked the same number: all of them drop eight.
 * - **Alone** on a number: you stay where you are.
 *
 * Reaching the bottom is out, and the game ends as soon as anybody does - or when
 * one player or none is left on the tower, or after thirty rounds, since two
 * players who never match would never move. Everybody is placed top to bottom:
 * still on the tower by how high, then everybody out, from higher up the better.
 *
 * A player who has not picked by the end of a round has a pick made for them at
 * random: sitting it out would otherwise be the best move there is.
 *
 * Everything here is pure. A round's random picks come from the seed.
 */
import { createRng, hashSeed } from '../../00-core'

export const TOWER = {
  /** Steps from the top to the bottom. */
  steps: 20,
  /** The picks. */
  options: [1, 4, 6] as readonly number[],
  /** How far three or more on the same pick drop - and a pair on the smallest pick. */
  crowdDrop: 8,
  /** Seconds to pick. */
  choose: 2,
  /** Seconds the picks are shown and everybody walks down, a step at a time. */
  reveal: 1.9,
  /** The most rounds a game has. */
  rounds: 30,
} as const

export type Phase = 'choose' | 'reveal' | 'over'
export const PHASES: readonly Phase[] = ['choose', 'reveal', 'over']

/** What happened to a player in a round. */
export interface Move {
  pick: number
  /** How many picked the same. */
  with: number
  /** How far down it took them. */
  moved: number
  /** Picked for them, because they had not. */
  auto: boolean
}

export interface Stepper {
  id: string
  mine: boolean
  bot: boolean
  /** Steps above the bottom. */
  step: number
  /** This round's pick, or null. */
  pick: number | null
  /** The last round's move. */
  last: Move | null
  /** Out: the round they reached the bottom, and the step they fell from. */
  out: { round: number; from: number } | null
}

export interface Game {
  seed: number
  id: number
  /** Which round, from 0. */
  round: number
  phase: Phase
  clock: number
  elapsed: number
  players: Stepper[]
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    round: 0,
    phase: entrants.length > 1 ? 'choose' : 'over',
    clock: 0,
    elapsed: 0,
    players: entrants.map((e) => ({ id: e.id, mine: e.mine ?? false, bot: e.bot ?? false, step: TOWER.steps, pick: null, last: null, out: null })),
  }
}

/** Everybody still on the tower. */
export function onTower(game: Game): Stepper[] {
  return game.players.filter((p) => !p.out)
}

/** Whether anybody has walked off the bottom of the tower. Somebody who left the lobby does not count. */
export function reachedBottom(game: Game): boolean {
  return game.players.some((p) => p.out !== null && p.last !== null)
}

/** A player picks, or changes their pick. Only while picking, only a real option, only while still on the tower. */
export function choose(game: Game, player: number, pick: number, round = game.round): boolean {
  const stepper = game.players[player]
  if (!stepper || stepper.out || game.phase !== 'choose' || round !== game.round) return false
  if (!TOWER.options.includes(pick)) return false
  stepper.pick = pick
  return true
}

/** How far a pick moves everybody on it, for how many made it. */
export function moveFor(pick: number, count: number): number {
  if (count >= 3) return TOWER.crowdDrop
  if (count === 2) return pick === TOWER.options[0] ? TOWER.crowdDrop : pick
  return 0
}

/** The end of a round: picks made for anybody who has not, then everybody moves. */
export function resolve(game: Game): void {
  const standing = game.players.filter((p) => !p.out)
  const auto = new Set<Stepper>()
  for (const stepper of standing) {
    if (stepper.pick !== null) continue
    const random = createRng(hashSeed(game.seed, `synchronize-steps:auto:${stepper.id}:${game.round}`))
    stepper.pick = TOWER.options[Math.floor(random() * TOWER.options.length)]
    auto.add(stepper)
  }
  const counts = new Map<number, number>()
  for (const stepper of standing) counts.set(stepper.pick!, (counts.get(stepper.pick!) ?? 0) + 1)
  for (const stepper of standing) {
    const pick = stepper.pick!
    const count = counts.get(pick) ?? 0
    const moved = moveFor(pick, count)
    const from = stepper.step
    stepper.step = Math.max(0, stepper.step - moved)
    stepper.last = { pick, with: count, moved, auto: auto.has(stepper) }
    if (stepper.step === 0) stepper.out = { round: game.round, from }
  }
}

/** One step of the clock: picking, the reveal, the next round, the end. */
export function stepGame(game: Game, dt: number): Game {
  if (game.phase === 'over') return game
  const step = Math.min(Math.max(dt, 0), 0.25)
  game.elapsed += step
  game.clock += step
  if (game.phase === 'choose' && game.clock >= TOWER.choose) {
    resolve(game)
    game.phase = 'reveal'
    game.clock = 0
  } else if (game.phase === 'reveal' && game.clock >= TOWER.reveal) {
    game.clock = 0
    if (reachedBottom(game) || onTower(game).length <= 1 || game.round + 1 >= TOWER.rounds) {
      game.phase = 'over'
    } else {
      game.round += 1
      game.phase = 'choose'
      for (const stepper of game.players) stepper.pick = null
    }
  }
  return game
}

/** A player who has left the lobby: out where they stand, this round. */
export function leave(game: Game, player: number): void {
  const stepper = game.players[player]
  if (!stepper || stepper.out || game.phase === 'over') return
  stepper.out = { round: game.round, from: stepper.step }
  stepper.step = 0
  stepper.pick = null
  stepper.last = null
}

/**
 * Everybody, best first, with their place: still on the tower by how high, then
 * everybody out, the later the round the better, and from higher up the better.
 */
export function placings(game: Game): { stepper: Stepper; index: number; place: number }[] {
  const score = (s: Stepper) => (s.out ? s.out.round * 100 + s.out.from : 100_000 + s.step)
  const ranked = game.players.map((stepper, index) => ({ stepper, index })).sort((a, b) => score(b.stepper) - score(a.stepper))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => score(other.stepper) > score(entry.stepper)).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#f2b33d', '#4fb35a', '#9c4bb0', '#f08a3c', '#35bdbd', '#ef7fb4'] as const
