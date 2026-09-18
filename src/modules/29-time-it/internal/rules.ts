/**
 * The rules of Time It, as arithmetic.
 *
 * A target time, and a stopwatch. After a three-second countdown the stopwatch
 * starts, and everybody can watch it run for two and a half seconds; then its
 * face is covered and you count in your head. Click to stop your own timer. The
 * round is over once everybody has stopped, or thirty seconds after the start.
 * Closest to the target wins; anybody who never stopped comes last.
 *
 * Everything here is pure. The target comes from the round's seed, shown to
 * everybody. **Your stop is timed on your own screen** - against the stopwatch
 * you are counting along with - and whoever runs the round takes it once, held
 * to what could have been clicked by now.
 */
import { createRng, hashSeed } from '../../00-core'

export const WATCH = {
  /**
   * Seconds before the stopwatch starts. None: the minigame screen's shared three-two-one runs before the game is
   * let go, and the stopwatch starts on its "Start!".
   */
  countdown: 0,
  /** How long the stopwatch can be seen once it starts. */
  visible: 2.5,
  /** The round is over this long after the stopwatch starts, stopped or not. */
  limit: 30,
  /** The target, least and most. Never under six and a half seconds. */
  target: [6.5, 15] as readonly [number, number],
  /** How far ahead of the host's stopwatch a guest's stop may be, for a guest a little ahead of it. */
  grace: 0.5,
} as const

/** The round's target, to the hundredth of a second. */
export function targetFor(seed: number): number {
  const random = createRng(hashSeed(seed, 'time-it:target'))
  return Math.round((WATCH.target[0] + random() * (WATCH.target[1] - WATCH.target[0])) * 100) / 100
}

export interface Timer {
  id: string
  mine: boolean
  bot: boolean
  /** The stopwatch time this player stopped at, or null. */
  stopped: number | null
  /** Left the lobby: not waited for. */
  left: boolean
}

export interface Game {
  /** The target. Not a secret: it is on everybody's screen. */
  seed: number
  id: number
  /** Seconds since the round was dealt; the stopwatch starts at `WATCH.countdown`. */
  elapsed: number
  over: boolean
  players: Timer[]
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
    players: entrants.map((e) => ({ id: e.id, mine: e.mine ?? false, bot: e.bot ?? false, stopped: null, left: false })),
  }
}

/** The stopwatch: seconds since it started, or negative during the countdown. */
export function stopwatch(game: Pick<Game, 'elapsed'>): number {
  return game.elapsed - WATCH.countdown
}

/** Whether the stopwatch's face can be seen right now. */
export function showing(game: Pick<Game, 'elapsed'>): boolean {
  const t = stopwatch(game)
  return t >= 0 && t < WATCH.visible
}

/**
 * A player stops their timer at a stopwatch time. Once only, not before the
 * start, and not later than the stopwatch could have got to - its own clock for
 * the host, a little ahead of it for a guest. Returns whether it counted.
 */
export function stop(game: Game, player: number, at: number, grace = 0): boolean {
  const timer = game.players[player]
  if (!timer || timer.left || timer.stopped !== null || game.over) return false
  const now = stopwatch(game)
  if (!Number.isFinite(at) || at < 0 || now < 0 || at > Math.min(WATCH.limit, now + grace)) return false
  timer.stopped = Math.round(at * 1000) / 1000
  return true
}

/** A player who has left the lobby is not waited for. */
export function leave(game: Game, player: number): void {
  const timer = game.players[player]
  if (timer && timer.stopped === null) timer.left = true
}

/** One step: the clock, and the end - everybody stopped or gone, or the limit. */
export function stepGame(game: Game, dt: number): Game {
  if (game.over) return game
  game.elapsed = Math.min(WATCH.countdown + WATCH.limit, game.elapsed + Math.min(Math.max(dt, 0), 0.25))
  const everybody = game.players.every((t) => t.stopped !== null || t.left)
  if (everybody || stopwatch(game) >= WATCH.limit) game.over = true
  return game
}

/** How far a stop was off the target, or null for no stop. */
export function offBy(game: Game, timer: Timer): number | null {
  return timer.stopped === null ? null : Math.round((timer.stopped - targetFor(game.seed)) * 1000) / 1000
}

/** Everybody, best first: closest to the target, then anybody who never stopped. Level shares a place. */
export function placings(game: Game): { timer: Timer; index: number; place: number }[] {
  const score = (t: Timer) => {
    const off = offBy(game, t)
    return off === null ? Infinity : Math.abs(off)
  }
  const ranked = game.players.map((timer, index) => ({ timer, index })).sort((a, b) => score(a.timer) - score(b.timer))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => score(other.timer) < score(entry.timer)).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#f2b33d', '#4fb35a', '#9c4bb0', '#f08a3c', '#35bdbd', '#ef7fb4'] as const
