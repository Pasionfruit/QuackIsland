/**
 * The rules of Binary BS, as arithmetic.
 *
 * Everybody stands on a side of a giant gear - **as many sides as there are
 * players** - with a mark at the top. A number appears in the middle, and
 * everybody has **five seconds to vote 0 or 1**, in secret. Then the gear turns:
 *
 *     sides turned = the number - how many voted 0
 *
 * and whichever side that brings round to the mark is removed, with whoever is
 * on it. If everybody votes 1 the gear turns the number round, and the side
 * `number mod sides` goes - that side is marked while the vote is on. **Every 0
 * vote turns it one side less**, onto somebody else. Not voting counts as 1.
 *
 * The survivors stand on a new gear with a side fewer, a new number comes up,
 * and it goes again until one is left.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

/** Seconds of each phase of a round. */
export const PHASES = {
  /** The number is up: five seconds to vote. */
  vote: 5,
  /** The votes are shown. */
  reveal: 1.8,
  /** The gear turns. */
  turn: 2.6,
  /** The side at the mark drops away. */
  drop: 1.6,
  /** Everybody left steps onto the new gear. */
  reseat: 1.2,
} as const

export type Phase = keyof typeof PHASES
const ORDER: readonly Phase[] = ['vote', 'reveal', 'turn', 'drop', 'reseat']
export const ROUND_LENGTH = ORDER.reduce((sum, p) => sum + PHASES[p], 0)

/** The numbers that come up: never less than two, never more than this. */
export const NUMBERS = { least: 2, most: 15 } as const

export const ROUND = {
  countdown: 0,
  /** How long the host waits past the end of the vote for a guest's vote on the wire, seconds. */
  grace: 0.3,
} as const

/** The gear, in metres: where people can stand on their side, from the hub to the teeth. */
export const GEAR = { hub: 2.4, rim: 9, teeth: 10 } as const

export interface When {
  /** From 1. */
  round: number
  phase: Phase
  t: number
  length: number
  /** When the round started, in the clock. */
  start: number
}

/** Where the clock has got to. Every round is the same length. */
export function when(elapsed: number): When {
  const e = Math.max(0, elapsed)
  const round = Math.floor(e / ROUND_LENGTH) + 1
  const start = (round - 1) * ROUND_LENGTH
  let t = e - start
  for (const phase of ORDER) {
    if (t < PHASES[phase] || phase === 'reseat') return { round, phase, t, length: PHASES[phase], start }
    t -= PHASES[phase]
  }
  return { round, phase: 'reseat', t, length: PHASES.reseat, start }
}

/** When the vote of `round` closes, in the clock. */
export function voteEnds(round: number): number {
  return (round - 1) * ROUND_LENGTH + PHASES.vote
}

/** When round `round`'s side drops, in the clock. */
export function dropsAt(round: number): number {
  return (round - 1) * ROUND_LENGTH + PHASES.vote + PHASES.reveal + PHASES.turn
}

/** The number for a round, from the seed. */
export function numberFor(seed: number, round: number): number {
  const random = createRng(hashSeed(seed, `binary-bs:number:${round}`))
  return NUMBERS.least + Math.floor(random() * (NUMBERS.most - NUMBERS.least + 1))
}

/** A proper modulo: never negative. */
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

/** Which side goes if everybody votes 1: the one marked while the vote is on. */
export function markedSide(number: number, sides: number): number {
  return mod(number, sides)
}

/** How far the gear turns, and which side it brings to the mark, for so many 0 votes. */
export function tally(number: number, sides: number, zeros: number): { steps: number; side: number } {
  const steps = number - zeros
  return { steps, side: mod(steps, sides) }
}

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  /** Where they stand on their side, in the gear's own frame - before it turns. */
  x: number
  z: number
  /** Their vote this round, or null. Hidden from everybody else until the reveal. */
  vote: 0 | 1 | null
  /** When they were removed, or null while in. */
  out: number | null
  left: boolean
  leftAt: number | null
}

/** What a round came to. */
export interface Result {
  round: number
  number: number
  /** Who stood on which side, by player index, side by side. */
  seats: number[]
  /** Everybody's vote, by player index: null for nobody's. */
  votes: (0 | 1 | null)[]
  zeros: number
  steps: number
  side: number
  /** Who was on it, by index, or -1 if nobody was. */
  victim: number
}

export interface Game {
  seed: number
  id: number
  elapsed: number
  over: boolean
  players: Player[]
  /** Who is on which side this round, by player index - side 0 first, clockwise from the mark. */
  seats: number[]
  /** The round the seats and the votes are for. */
  round: number
  results: Result[]
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

const round2 = (v: number) => Math.round(v * 100) / 100

/** A side's middle, as an angle: side 0 at the mark (north), then clockwise as seen from above. */
export function sideAngle(side: number, sides: number): number {
  return (side * Math.PI * 2) / Math.max(1, sides)
}

/** A point on the gear's floor, `radius` out along the middle of side `side` turned by `offset` radians clockwise. */
export function onSide(side: number, sides: number, radius: number, offset = 0): { x: number; z: number } {
  const a = sideAngle(side, sides) + offset
  return { x: Math.sin(a) * radius, z: -Math.cos(a) * radius }
}

/** Where somebody stands to start with on a side: its middle, halfway out. */
export function seatSpot(side: number, sides: number): { x: number; z: number } {
  return onSide(side, sides, (GEAR.hub + GEAR.rim) / 2)
}

/**
 * The nearest place on side `side` to a point: between the hub and the rim, and
 * within the side's own wedge, a little in from its edges.
 */
export function clampToSide(side: number, sides: number, p: { x: number; z: number }): { x: number; z: number } {
  const r = Math.min(GEAR.rim - 0.6, Math.max(GEAR.hub + 0.6, Math.hypot(p.x, p.z)))
  const middle = sideAngle(side, sides)
  // Clockwise from north, the way the sides are numbered.
  const a = Math.atan2(p.x, -p.z)
  let off = a - middle
  off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
  const half = sides <= 1 ? Math.PI : (Math.PI / sides) * 0.8
  // Keep a body's width off the side's edges, more of the angle nearer the hub.
  const room = Math.max(0, half - 0.5 / r)
  off = Math.max(-room, Math.min(room, off))
  return onSide(side, sides, r, off)
}

/** Who is still in. */
export function isIn(p: Player): boolean {
  return p.out === null && !p.left
}

/** Seats the players still in, in their roster order, on a gear of their number of sides. */
function seat(game: Game): void {
  game.seats = game.players.map((p, i) => (isIn(p) ? i : -1)).filter((i) => i >= 0)
  game.seats.forEach((player, side) => {
    const spot = seatSpot(side, game.seats.length)
    const p = game.players[player]
    p.x = spot.x
    p.z = spot.z
  })
  for (const p of game.players) p.vote = null
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  const game: Game = {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    round: 1,
    seats: [],
    results: [],
    players: entrants.map((e) => ({ id: e.id, mine: e.mine ?? false, bot: e.bot ?? false, x: 0, z: 0, vote: null, out: null, left: false, leftAt: null })),
  }
  seat(game)
  return game
}

export function clock(game: Game): number {
  return game.elapsed - ROUND.countdown
}

/** Which side a player is on this round, or -1. */
export function sideOf(game: Game, player: number): number {
  return game.seats.indexOf(player)
}

/** Whether votes are open: the vote phase of the round the seats are for, and the player seated and in. */
export function canVote(game: Game, player: number, grace = 0): boolean {
  const p = game.players[player]
  if (!p || !isIn(p) || game.over || sideOf(game, player) < 0) return false
  const t = clock(game)
  return t >= 0 && when(t).round === game.round && t < voteEnds(game.round) + grace
}

/** A vote, 0 or 1. It can be changed until the vote closes. */
export function vote(game: Game, player: number, v: 0 | 1, grace = 0): boolean {
  if (!canVote(game, player, grace)) return false
  game.players[player].vote = v
  return true
}

/** Whether a player may walk just now: on their side, while the vote is on and the votes are shown. */
export function canWalk(game: Game, player: number): boolean {
  const p = game.players[player]
  if (!p || !isIn(p) || game.over || sideOf(game, player) < 0) return false
  const t = clock(game)
  const w = when(t)
  return t >= 0 && w.round === game.round && (w.phase === 'vote' || w.phase === 'reveal')
}

/** Walks a player about their side: `mx`, `mz` east and south, each -1 to 1. */
export function walk(game: Game, player: number, mx: number, mz: number, dt: number, speed = 4): void {
  if (!canWalk(game, player)) return
  const length = Math.hypot(mx, mz)
  if (length < 1e-6) return
  const k = (speed * Math.min(Math.max(dt, 0), 0.1)) / Math.max(1, length)
  const p = game.players[player]
  const to = clampToSide(sideOf(game, player), game.seats.length, { x: p.x + mx * k, z: p.z + mz * k })
  p.x = to.x
  p.z = to.z
}

/** Puts a player where they say they are, kept on their side. */
export function place(game: Game, player: number, at: { x: number; z: number }): void {
  if (!canWalk(game, player)) return
  const p = game.players[player]
  const to = clampToSide(sideOf(game, player), game.seats.length, at)
  p.x = to.x
  p.z = to.z
}

/**
 * The round's result, from the votes as they stand. Pure: nothing is removed
 * until `settle`.
 */
export function resultOf(game: Game): Result {
  const number = numberFor(game.seed, game.round)
  const votes = game.players.map((p, i) => (game.seats.includes(i) ? p.vote : null))
  const zeros = game.seats.filter((i) => game.players[i].vote === 0).length
  const { steps, side } = tally(number, game.seats.length, zeros)
  return { round: game.round, number, seats: [...game.seats], votes, zeros, steps, side, victim: game.seats[side] ?? -1 }
}

/**
 * The host moves the game on: at the end of the vote (and the grace for a
 * guest's vote on the wire) the votes are counted; at the drop whoever is on the
 * side at the mark is removed; at the next round everybody left is seated again.
 */
export function advance(game: Game): void {
  if (game.over) return
  const t = clock(game)
  if (t < 0) return
  const counted = game.results.some((r) => r.round === game.round)
  if (!counted && t >= voteEnds(game.round) + ROUND.grace) game.results.push(resultOf(game))
  const result = game.results.find((r) => r.round === game.round)
  if (result && t >= dropsAt(game.round)) {
    const victim = game.players[result.victim]
    if (victim && isIn(victim)) victim.out = round2(dropsAt(game.round))
    if (game.players.filter(isIn).length <= 1) {
      game.over = true
      return
    }
  }
  if (when(t).round > game.round && result) {
    game.round += 1
    seat(game)
  }
  if (game.results.length > 8) game.results = game.results.slice(-8)
}

/** The clock, on every screen. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  game.elapsed += Math.min(Math.max(dt, 0), 0.25)
}

/** Whether it is over: one or nobody left. Only the host decides. */
export function judgeEnd(game: Game): boolean {
  if (game.over) return true
  if (game.players.filter(isIn).length <= 1) game.over = true
  return game.over
}

/** One step for the host, or alone. */
export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
  advance(game)
  judgeEnd(game)
  return game
}

/** A player who has left the lobby. Their side stays on the gear until the round is over. */
export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (!p || p.left || game.over) return
  if (p.out === null) p.leftAt = round2(Math.max(0, clock(game)))
  p.left = true
}

/**
 * Everybody, best first: the last one left first; then the removed, the last to
 * go first; then anybody who left while in, the last to leave first.
 */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const key = (p: Player): [number, number] => (p.out !== null ? [1, -p.out] : p.left ? [2, -(p.leftAt ?? 0)] : [0, 0])
  const better = (a: Player, b: Player) => {
    const ka = key(a)
    const kb = key(b)
    return ka[0] !== kb[0] ? ka[0] < kb[0] : ka[1] < kb[1] - 1e-9
  }
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => (better(a.player, b.player) ? -1 : better(b.player, a.player) ? 1 : a.index - b.index))
  return ranked.map((entry) => ({ ...entry, place: 1 + ranked.filter((other) => better(other.player, entry.player)).length }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const
