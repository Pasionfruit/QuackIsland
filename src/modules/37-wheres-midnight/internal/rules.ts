/**
 * The rules of Where's Midnight?, as arithmetic.
 *
 * Everybody searches the same junkyard, each with their own camera, for the same
 * cat. Click him and you have found him, at that moment; you place in the order
 * everybody does. A click on anything else - junk, ground, sky - costs a second
 * and a half before you can click again, so clicking everything is slower than
 * looking. The round ends when three have found him, everybody has, or after
 * ninety seconds; whoever has not found him by then shares last place.
 *
 * Pure. What a click lands on is `look`, in `yard.ts`.
 */
import { look, yardFor } from './yard'
import type { Vec3 } from './view'

export const SEARCH = {
  /** The round is over as soon as this many have found him. */
  podium: 3,
  /** Seconds in a round. */
  duration: 90,
  /** Seconds before you can click again after a click that was not Midnight. */
  cooldown: 1.5,
  /**
   * A click this close to the end of the cooldown still counts. A guest's click
   * leaves when its own copy of the cooldown is done; the host's copy may be a
   * few frames behind.
   */
  cooldownGrace: 0.15,
  /**
   * How far back a guest may say it found him, in seconds, when its click
   * reaches the host. A find is timed on the finder's own screen - otherwise the
   * host always wins a close one - but no earlier than this.
   */
  lag: 1,
} as const

export interface Seeker {
  id: string
  mine: boolean
  bot: boolean
  /** When they found him, in round seconds, or null. */
  foundAt: number | null
  misses: number
  /** Seconds before this seeker can click again. */
  cooldown: number
  /** The last click taken from this seeker, so a click said twice counts once. */
  seq: number
  /** When their last click that was not him landed, for drawing it. */
  missAt: number | null
  /** How far through its plan a stand-in is. Host only. */
  botStep: number
}

export interface Game {
  /** The junkyard, and so where he is. Everybody's. */
  seed: number
  id: number
  elapsed: number
  over: boolean
  players: Seeker[]
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
    elapsed: 0,
    over: entrants.length === 0,
    players: entrants.map((e) => ({
      id: e.id,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
      foundAt: null,
      misses: 0,
      cooldown: 0,
      seq: 0,
      missAt: null,
      botStep: 0,
    })),
  }
}

export type Outcome = 'found' | 'miss' | 'ignored'

export interface Select {
  /** When the seeker clicked, by their own clock. The host's clock if left out. */
  at?: number
  /** A guest's click number; a number already dealt with is ignored. */
  seq?: number
}

/**
 * A seeker clicks along `dir` from the camera.
 *
 * Midnight is a find, timed at `at` - held to no earlier than `SEARCH.lag` ago
 * and no later than now. Anything else is a miss and starts the cooldown.
 * Nothing counts during the cooldown, after the round, after they have found
 * him, or for a `seq` already dealt with.
 */
export function select(game: Game, player: number, dir: Vec3, { at, seq }: Select = {}): Outcome {
  const seeker = game.players[player]
  if (!seeker || game.over || seeker.foundAt !== null) return 'ignored'
  if (seq !== undefined) {
    if (seq <= seeker.seq) return 'ignored'
    seeker.seq = seq
  }
  if (seeker.cooldown > SEARCH.cooldownGrace) return 'ignored'

  if (look(yardFor(game.seed), dir) === 'midnight') {
    const said = at === undefined || !Number.isFinite(at) ? game.elapsed : at
    seeker.foundAt = Math.max(0, game.elapsed - SEARCH.lag, Math.min(game.elapsed, said))
    seeker.cooldown = 0
    const found = game.players.filter((p) => p.foundAt !== null).length
    if (found >= SEARCH.podium || found === game.players.length) game.over = true
    return 'found'
  }
  seeker.misses += 1
  seeker.cooldown = SEARCH.cooldown
  seeker.missAt = game.elapsed
  return 'miss'
}

export function stepGame(game: Game, dt: number): Game {
  if (game.over) return game
  const step = Math.min(Math.max(dt, 0), 0.25)
  game.elapsed = Math.min(SEARCH.duration, game.elapsed + step)
  for (const seeker of game.players) seeker.cooldown = Math.max(0, seeker.cooldown - step)
  if (game.elapsed >= SEARCH.duration) game.over = true
  return game
}

export function timeLeft(game: Game): number {
  return Math.max(0, SEARCH.duration - game.elapsed)
}

/** A find time as the wire carries it and as places are compared: to the hundredth. */
const hundredths = (seconds: number) => Math.round(seconds * 100)

/**
 * Everybody, first to find him first, with their place.
 *
 * Finds on the same hundredth share a place. Everybody who never found him
 * shares the place after the last who did.
 */
export function placings(game: Game): { seeker: Seeker; index: number; place: number }[] {
  const key = (s: Seeker) => (s.foundAt === null ? Infinity : hundredths(s.foundAt))
  const ranked = game.players.map((seeker, index) => ({ seeker, index })).sort((a, b) => key(a.seeker) - key(b.seeker))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => key(other.seeker) < key(entry.seeker)).length,
  }))
}

/** Eight colours that show up at night, one per player, in roster order. None of them black. */
export const COLOURS = ['#ff6b74', '#5aa9f0', '#ffc94d', '#6fd27a', '#c77ae0', '#ff9d52', '#4fd6d6', '#ff9ccb'] as const
