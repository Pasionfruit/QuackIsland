/**
 * The rules of I'll Just Wait, as arithmetic.
 *
 * A race through three targets. Each is a time said in awkward words -
 * "Quarter till 4:05" - and harder than the one before. Your clock starts at
 * 12:00; hold left click to wind it forward and right click to wind it back,
 * and Space says "that is it". Right, and you are on to the next target with
 * your clock back at 12:00. Wrong, and it goes back to 12:00 and you try the
 * same one again.
 *
 * **Everybody's clock is on show.** Which is where the name comes from: the
 * targets are the same for everybody, in the same order, so a player who is
 * behind can just wait for somebody ahead to show them where the hands go.
 * It costs time, and the race is to finish.
 *
 * The first to get all three wins, and the game ends there. Otherwise it ends
 * at the time limit, or once everybody has finished or gone. Places go by how
 * many targets you got, then by how early you got your last one.
 *
 * Everything here is pure. The targets come from the seed, which everybody has.
 */
import { DIAL, TARGETS, targetFor, wrap } from './wording'

export const CLOCK = {
  /** Seconds the whole game may run. */
  limit: 150,
  /** Holding a button: how long before a press becomes a sweep. */
  holdDelay: 0.3,
  /** The sweep, in minutes a second: where it starts, and where it tops out. */
  sweep: [4, 100] as readonly [number, number],
  /** Seconds of holding it takes to reach the top speed. */
  ramp: 2.5,
} as const

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  /** What this player's clock reads, 0 to 719. Everybody can see it. */
  minutes: number
  /** Per target: seconds into the game this player got it, or null. In order - the first null is the one they are on. */
  solved: (number | null)[]
  left: boolean
}

export interface Game {
  seed: number
  id: number
  /** Seconds since the start. */
  clock: number
  over: boolean
  players: Player[]
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
    clock: 0,
    over: entrants.length === 0,
    players: entrants.map((e) => ({
      id: e.id,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
      minutes: 0,
      solved: Array.from({ length: TARGETS }, () => null),
      left: false,
    })),
  }
}

/** Which target a player is on, 0 to 2 - or 3 once they have all three. */
export function stageOf(player: Pick<Player, 'solved'>): number {
  const next = player.solved.findIndex((s) => s === null)
  return next < 0 ? TARGETS : next
}

/** Whether a player has got all three. */
export function finished(player: Pick<Player, 'solved'>): boolean {
  return stageOf(player) >= TARGETS
}

/** Seconds left in the game. */
export function timeLeft(game: Pick<Game, 'clock'>): number {
  return Math.max(0, CLOCK.limit - game.clock)
}

/** The answer to target `stage`. */
export function answerFor(game: Pick<Game, 'seed'>, stage: number): number {
  return targetFor(game.seed, stage).minutes
}

export type Verdict = 'right' | 'wrong'

/**
 * A player says their clock reads `minutes` for target `stage`. Right gets
 * them it, timed at `at` seconds in, and puts their clock back to 12:00 for the
 * next - and the third one right ends the game. Wrong puts their clock back to
 * 12:00 for another go. Null when it does not count at all: the game over, or
 * a target they are not on.
 */
export function confirm(game: Game, player: number, stage: number, minutes: number, at = game.clock): Verdict | null {
  const p = game.players[player]
  if (!p || p.left || game.over || !Number.isFinite(minutes) || stage !== stageOf(p) || stage >= TARGETS) return null
  p.minutes = 0
  if (wrap(minutes) !== answerFor(game, stage)) return 'wrong'
  p.solved[stage] = Math.round(Math.min(Math.max(at, 0), CLOCK.limit) * 100) / 100
  if (finished(p)) game.over = true
  return 'right'
}

/** Where a player's clock is, as they have wound it. */
export function setHand(game: Game, player: number, minutes: number): void {
  const p = game.players[player]
  if (p && !game.over && Number.isFinite(minutes)) p.minutes = wrap(minutes)
}

/** A player who has left the lobby is not waited for. */
export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (p) p.left = true
}

/** One step: the clock, and the end - somebody finished (see `confirm`), everybody done or gone, or the limit. */
export function stepGame(game: Game, dt: number): Game {
  if (game.over) return game
  game.clock = Math.min(CLOCK.limit, game.clock + Math.min(Math.max(dt, 0), 0.25))
  const everybody = game.players.every((p) => p.left || finished(p))
  if (everybody || game.clock >= CLOCK.limit) game.over = true
  return game
}

/** Targets got. */
export function pointsOf(player: Pick<Player, 'solved'>): number {
  return player.solved.filter((s) => s !== null).length
}

/** When a player got their last target - the tie-break. Nothing got is no time at all. */
export function lastAt(player: Pick<Player, 'solved'>): number {
  return player.solved.reduce<number>((most, s) => (s === null ? most : Math.max(most, s)), 0)
}

/** Everybody, best first: most targets, then soonest to the last of them. Level shares a place. */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const better = (a: Player, b: Player) => pointsOf(b) - pointsOf(a) || lastAt(a) - lastAt(b)
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => better(a.player, b.player))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => better(other.player, entry.player) < 0).length,
  }))
}

/**
 * Your own clock, while you wind it. Its reading goes to everybody; the rest
 * of it is how this screen turns a held button into minutes.
 */
export interface Hand {
  /** What the clock reads, 0 to 719. Whole minutes, so a stop is always on a mark. */
  minutes: number
  /** Which way it is being wound: 1 forward, -1 back, 0 not at all. */
  dir: -1 | 0 | 1
  /** Seconds this way has been held. */
  held: number
  /** Part of a minute swept but not yet on the clock. */
  carry: number
}

export function newHand(): Hand {
  return { minutes: 0, dir: 0, held: 0, carry: 0 }
}

/** Back to 12:00, as after an answer or a new game. */
export function resetHand(hand: Hand): Hand {
  return Object.assign(hand, newHand())
}

/**
 * A button going down: one minute that way at once, so a tap is a one-minute
 * nudge however short it was. Holding on sweeps - see `turnHand`.
 */
export function press(hand: Hand, dir: -1 | 1): Hand {
  hand.minutes = wrap(hand.minutes + dir)
  hand.dir = dir
  hand.held = 0
  hand.carry = 0
  return hand
}

/** How fast a hold sweeps after `held` seconds, in minutes a second. Slow at first, so it can be stopped on a mark. */
export function sweepRate(held: number): number {
  const k = Math.min(1, Math.max(0, (held - CLOCK.holdDelay) / CLOCK.ramp))
  return CLOCK.sweep[0] + (CLOCK.sweep[1] - CLOCK.sweep[0]) * k * k
}

/** A frame of holding `dir` (or nothing). */
export function turnHand(hand: Hand, dir: -1 | 0 | 1, dt: number): Hand {
  if (dir === 0) {
    hand.dir = 0
    hand.held = 0
    hand.carry = 0
    return hand
  }
  // Held the other way with no press seen: that is a press.
  if (dir !== hand.dir) return press(hand, dir)
  const step = Math.min(Math.max(dt, 0), 0.25)
  hand.held += step
  if (hand.held < CLOCK.holdDelay) return hand
  hand.carry += sweepRate(hand.held) * step
  const whole = Math.floor(hand.carry)
  hand.carry -= whole
  hand.minutes = wrap(hand.minutes + dir * whole)
  return hand
}

/** The hands' angles for a reading, in radians clockwise from twelve. The hour hand creeps with the minutes. */
export function handAngles(minutes: number): { hour: number; minute: number } {
  const m = wrap(minutes)
  return { hour: (m / DIAL) * Math.PI * 2, minute: ((m % 60) / 60) * Math.PI * 2 }
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#f2b33d', '#4fb35a', '#9c4bb0', '#f08a3c', '#35bdbd', '#ef7fb4'] as const
