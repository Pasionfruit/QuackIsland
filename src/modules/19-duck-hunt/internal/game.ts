/**
 * The rules of Duck Hunt, as arithmetic.
 *
 * A minute of balloons. Each player has a colour and a shape, and a balloon in
 * them is theirs. Shoot one of yours: a point. Shoot somebody else's: no point
 * for you, one fewer for them - and either way, a second and a half before you
 * can shoot again. Miss, and the same.
 *
 * No three.js, no React, no clock of its own. `fire` takes which balloon a shot
 * hit - the shooter's own screen decides that, see `pickBalloon` - and `stepGame`
 * moves the clock on. Everything can be tested by calling them.
 */
import { ARENA, schedule, shootable, type Balloon, type Point } from './arena'

export interface Shot {
  /** Where it landed: on the balloon it hit, or somewhere it missed. */
  x: number
  y: number
  z: number
  /** When, in game seconds. */
  at: number
  /** Whether it popped a balloon, and whether that balloon was theirs. */
  hit: boolean
  own: boolean
}

export interface Shooter {
  id: string
  /** Balloons of their own they have popped. The score. */
  score: number
  /** Shots taken, hit or miss. */
  shots: number
  /** Seconds until they can shoot again. */
  cooldown: number
  /**
   * The number of the last shot the host has dealt with.
   *
   * Shots are events, and events can be lost; a guest says a shot again until
   * this reaches its number, and the host deals with each number once. See
   * `fire`.
   */
  seq: number
  lastShot: Shot | null
  mine: boolean
  bot: boolean
}

export interface Game {
  /** What the balloons are made from. Not a secret: knowing where a balloon will be does not aim for you. */
  seed: number
  /** Tells one game from the next. */
  id: number
  elapsed: number
  over: boolean
  /** In roster order, which is colour order: player 0 wears `COLOURS[0]`. */
  players: Shooter[]
  /** Every balloon of the game, from the seed. Never sent anywhere. */
  balloons: Balloon[]
  /** Popped balloons, and by whom - balloon id to player index. */
  popped: Map<number, number>
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
    over: false,
    players: entrants.map((e) => ({
      id: e.id,
      score: 0,
      shots: 0,
      cooldown: 0,
      seq: 0,
      lastShot: null,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
    })),
    balloons: schedule(seed, entrants.length),
    popped: new Map(),
  }
}

/** Whether a player could shoot this instant. */
export function ready(game: Game, index: number): boolean {
  const shooter = game.players[index]
  return !!shooter && !game.over && shooter.cooldown <= 0
}

export interface Fire {
  /** Who is shooting, by index. */
  shooter: number
  /** The balloon their screen says they hit, or `null` for a miss. */
  balloon: number | null
  /** Where the shot landed, for everybody else to see it. */
  point: Point
  /** The shot's number, from 1, for the host to deal with it once. `0` to skip the check. */
  seq?: number
}

/**
 * A shot. Returns whether it was taken at all.
 *
 * - **Too soon** - still cooling down, give or take `ARENA.cooldownGrace` - and
 *   it is not taken: no cooldown, no shot, nothing.
 * - Otherwise the **cooldown starts, hit or miss**.
 * - If it names a balloon that is still up and not already popped, it pops -
 *   whoever's it is. Popping your own scores; popping somebody else's only
 *   takes it away from them.
 * - A shot the host has already dealt with - the same `seq` said again - is
 *   ignored, so saying a shot twice never fires it twice.
 */
export function fire(game: Game, { shooter, balloon, point, seq = 0 }: Fire): boolean {
  const player = game.players[shooter]
  if (!player || game.over) return false
  if (seq > 0) {
    if (seq <= player.seq) return false
    player.seq = seq
  }
  if (player.cooldown > ARENA.cooldownGrace) return false

  player.cooldown = ARENA.cooldown
  player.shots += 1

  const target = balloon === null ? undefined : game.balloons[balloon]
  const pops = !!target && !game.popped.has(target.id) && shootable(target, game.elapsed)
  const own = pops && target.owner === shooter
  if (pops) game.popped.set(target.id, shooter)
  if (own) player.score += 1
  player.lastShot = { ...point, at: game.elapsed, hit: pops, own }
  return true
}

/** The clock and the cooldowns. `dt` is clamped, so a backgrounded tab does not skip the game. */
export function stepGame(game: Game, dt: number): Game {
  if (game.over) return game
  const step = Math.min(Math.max(dt, 0), 0.25)
  game.elapsed = Math.min(ARENA.duration, game.elapsed + step)
  for (const player of game.players) player.cooldown = Math.max(0, player.cooldown - step)
  if (game.elapsed >= ARENA.duration) game.over = true
  return game
}

/** Seconds left. */
export function timeLeft(game: Game): number {
  return Math.max(0, ARENA.duration - game.elapsed)
}

/** How many balloons a player has had to shoot at so far - everybody the same. */
export function balloonsFor(game: Game, index: number): number {
  return game.balloons.filter((b) => b.owner === index && b.spawnAt <= game.elapsed).length
}

/** Everybody, most pops first, with places shared on a tie. */
export function placings(game: Game): { player: Shooter; index: number; place: number }[] {
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => b.player.score - a.player.score)
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => other.player.score > entry.player.score).length,
  }))
}
