/**
 * The rules of Keyboard Warrior, as arithmetic.
 *
 * Fifteen letters float into the arena, one at a time. Each is worth a point to
 * whoever types it correctly first, and **everybody gets exactly one attempt at
 * each**: the first letter key you press after it appears is your answer, right
 * or wrong. A letter stays up for four seconds at most. The most points wins.
 *
 * **First is measured on your own screen.** Your reaction is the time from the
 * letter appearing in front of you to your key going down, so a slow connection
 * costs you nothing. The host compares reactions: once somebody has it right,
 * it waits a moment for anybody faster still on their way across the wire, then
 * gives the point to the quickest.
 *
 * Before each letter there is a pause, different every time, so nobody can press
 * a key on a rhythm. A key pressed before the letter is there is not an attempt.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const ROUND = {
  countdown: 3,
  /** How many letters in a game. */
  letters: 15,
  /** The pause before each letter, shortest and longest, seconds. */
  gap: [0.8, 2] as readonly [number, number],
  /** How long a letter stays up with nobody getting it, seconds. */
  window: 4,
  /** How long the host waits, after the first right answer it hears, for a faster one still coming. */
  grace: 0.3,
  /** How long the answer is shown before the next pause starts. */
  show: 1.3,
} as const

/** Where letters float: a box in front of everybody, metres. */
export const FLOAT = {
  x: [-3.2, 3.2] as readonly [number, number],
  y: [1.6, 3.1] as readonly [number, number],
  z: [-0.4, 1.6] as readonly [number, number],
} as const

/** How early, by the host's clock, an attempt may arrive: a guest's clock can run a little ahead. */
export const EARLY = 0.5

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  score: number
  /** The quickest right answer that won a point, seconds, or null. */
  best: number | null
  left: boolean
}

export interface Attempt {
  player: number
  /** The letter typed, A-Z. */
  key: string
  /** Seconds from the letter appearing on that player's screen to the key going down. */
  reaction: number
  /** When the host heard it, in `elapsed`. */
  heardAt: number
}

export interface Letter {
  index: number
  char: string
  x: number
  y: number
  z: number
  /** When it appears, in `elapsed`. */
  appearsAt: number
  /** When it was decided, in `elapsed`, or null while it is still up. */
  closedAt: number | null
  /** Who got the point, by index, or null. */
  winner: number | null
  attempts: Attempt[]
}

export interface Game {
  seed: number
  id: number
  /** Seconds since the game was dealt, countdown included. */
  elapsed: number
  over: boolean
  players: Player[]
  letter: Letter
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

export type Phase = 'countdown' | 'waiting' | 'up' | 'result' | 'over'

const between = (random: () => number, [lo, hi]: readonly [number, number]) => lo + random() * (hi - lo)

const planned = new Map<string, { char: string; gap: number; x: number; y: number; z: number }>()

/**
 * Letter `index` of a game: which letter, the pause before it, and where it
 * floats. The same seed, the same letters; never the same letter twice running.
 */
export function letterFor(seed: number, index: number): { char: string; gap: number; x: number; y: number; z: number } {
  const key = `${seed}:${index}`
  const known = planned.get(key)
  if (known) return known
  const random = createRng(hashSeed(seed, `keyboard-warrior:letter:${index}`))
  const before = index > 0 ? letterFor(seed, index - 1).char : null
  const pool = before ? LETTERS.replace(before, '') : LETTERS
  const plan = {
    char: pool[Math.floor(random() * pool.length)],
    gap: between(random, ROUND.gap),
    x: between(random, FLOAT.x),
    y: between(random, FLOAT.y),
    z: between(random, FLOAT.z),
  }
  planned.set(key, plan)
  if (planned.size > 256) planned.delete(planned.keys().next().value!)
  return plan
}

/** Letter `index`, to appear after its pause from `from`. */
export function openLetter(seed: number, index: number, from: number): Letter {
  const plan = letterFor(seed, index)
  return { index, char: plan.char, x: plan.x, y: plan.y, z: plan.z, appearsAt: from + plan.gap, closedAt: null, winner: null, attempts: [] }
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    players: entrants.map((e) => ({ id: e.id, mine: e.mine ?? false, bot: e.bot ?? false, score: 0, best: null, left: false })),
    letter: openLetter(seed, 0, ROUND.countdown),
  }
}

/** Seconds since the start; negative during the countdown. */
export function clock(game: Game): number {
  return game.elapsed - ROUND.countdown
}

/** What is happening just now. */
export function phase(game: Game): Phase {
  if (game.over) return 'over'
  if (game.elapsed < ROUND.countdown) return 'countdown'
  if (game.letter.closedAt !== null) return 'result'
  return game.elapsed < game.letter.appearsAt ? 'waiting' : 'up'
}

/** A key as a letter to answer with, or null if it is not one. */
export function asLetter(key: string): string | null {
  return /^[a-zA-Z]$/.test(key) ? key.toUpperCase() : null
}

/** A player's attempt at the letter up now, or undefined. */
export function attemptOf(game: Game, player: number): Attempt | undefined {
  return game.letter.attempts.find((a) => a.player === player)
}

/**
 * A player answers the letter that is up with `key`, `reaction` seconds after it
 * appeared on their screen. Their only attempt at it: a second is refused, as is
 * anything that is not a letter, or an answer to a letter not up. Returns whether
 * it was right, or null if it did not count at all.
 */
export function attempt(game: Game, player: number, key: string, reaction: number): 'right' | 'wrong' | null {
  const p = game.players[player]
  const letter = game.letter
  const typed = asLetter(key)
  if (!p || p.left || game.over || !typed || letter.closedAt !== null) return null
  if (game.elapsed < letter.appearsAt - EARLY || attemptOf(game, player)) return null
  letter.attempts.push({ player, key: typed, reaction: Math.min(Math.max(0, reaction), ROUND.window), heardAt: game.elapsed })
  return typed === letter.char ? 'right' : 'wrong'
}

/** The quickest right answer among the attempts - by reaction, then by who was heard first, then roster order - or undefined. */
export function fastest(letter: Letter): Attempt | undefined {
  return letter.attempts
    .filter((a) => a.key === letter.char)
    .sort((a, b) => a.reaction - b.reaction || a.heardAt - b.heardAt || a.player - b.player)[0]
}

/**
 * Decides the letter that is up, if it is time: once somebody is right and the
 * wait for anybody faster is over, or everybody here has had their attempt, or
 * the letter has been up its full time. Returns whether it was decided now.
 */
export function judge(game: Game): boolean {
  const letter = game.letter
  if (game.over || letter.closedAt !== null || game.elapsed < letter.appearsAt) return false
  const right = letter.attempts.filter((a) => a.key === letter.char)
  const everyone = game.players.every((p, index) => p.left || letter.attempts.some((a) => a.player === index))
  const firstRight = Math.min(...right.map((a) => a.heardAt))
  const waited = right.length > 0 && game.elapsed >= firstRight + ROUND.grace
  const timeUp = game.elapsed >= letter.appearsAt + ROUND.window + ROUND.grace
  if (!waited && !everyone && !timeUp) return false
  letter.closedAt = game.elapsed
  const best = fastest(letter)
  if (best) {
    letter.winner = best.player
    const p = game.players[best.player]
    p.score += 1
    p.best = p.best === null ? best.reaction : Math.min(p.best, best.reaction)
  }
  return true
}

/** After an answer has been shown: the next letter, or the end. */
export function nextLetter(game: Game): boolean {
  const letter = game.letter
  if (game.over || letter.closedAt === null || game.elapsed < letter.closedAt + ROUND.show) return false
  if (letter.index + 1 >= ROUND.letters) game.over = true
  else game.letter = openLetter(game.seed, letter.index + 1, game.elapsed)
  return true
}

/** The clock, on every screen. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  game.elapsed += Math.min(Math.max(dt, 0), 0.25)
}

/** One step of the clock, the judging and the next letter - for the host, or alone. */
export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
  judge(game)
  nextLetter(game)
  if (game.players.length > 0 && game.players.every((p) => p.left)) game.over = true
  return game
}

/** A player who has left the lobby. */
export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (!p || game.over) return
  p.left = true
}

/** Everybody, best first, with their place: most points first, anybody who left after everybody else. Level scores share a place. */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const key = (p: Player) => p.score - (p.left ? 1000 : 0)
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => key(b.player) - key(a.player) || a.index - b.index)
  return ranked.map((entry) => ({ ...entry, place: 1 + ranked.filter((other) => key(other.player) > key(entry.player)).length }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const
