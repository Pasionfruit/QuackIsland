/**
 * What the gear shows, as arithmetic: the sample round before the game, the votes
 * being added into the middle one at a time, and the gear turning a side at a click.
 *
 * Pure, and all of it a function of the game and the clock - so every screen shows
 * the same thing at the same moment without being told.
 *
 * **The sample round.** Before round one there is a round played for show, on a gear of
 * four sides with four made-up players, so that anybody who has not played before sees
 * how it goes - the vote, the votes added into the number, the gear clicking round, the
 * side that drops - before it counts (`viewOf`). It is a real `Game` on its own
 * clock, run by the same rules, with the votes put in for it.
 *
 * **The tally.** Once the votes are shown they are added into the total in the middle
 * one at a time (`tallied`): a 0 takes one off, a 1 adds nothing.
 *
 * **The turn.** The gear moves a side at a time, like the teeth of a clicking gear:
 * each side swings round, stops, and holds still before the next one moves, and a
 * counter in the middle goes down by one as each stops (`turnState`).
 */
import { TURN, REVEAL, advance, clock, createGame, mod, numberFor, when, type Game, type Result, type When } from './rules'

/** The made-up players of the sample round, in side order. */
export const SAMPLE = {
  names: ['Ann', 'Bo', 'Cy', 'Di'],
  /** What each votes, and when, in seconds into the vote. Bo's 0 is the one that matters. */
  votes: [
    { v: 1, at: 1.0 },
    { v: 0, at: 1.9 },
    { v: 1, at: 2.8 },
    { v: 1, at: 3.7 },
  ] as const,
  /** The number the sample round comes up with. */
  number: 7,
} as const

const seedForSample = (() => {
  // Any seed whose first number is the sample's: found once, the same every time.
  for (let seed = 1; seed < 100000; seed++) if (numberFor(seed, 1) === SAMPLE.number) return seed
  return 1
})()

/**
 * How many sides the gear turns, one click each: the count the vote came to,
 * round the gear as often as it takes, so never more than one turn's worth of sides.
 */
export function clicksOf(result: Pick<Result, 'steps' | 'seats'>): number {
  return result.seats.length > 0 ? mod(result.steps, result.seats.length) : 0
}

/** How many of a round's votes have been added into the total by this moment in the reveal. */
export function tallied(result: Pick<Result, 'seats'>, w: Pick<When, 'phase' | 't'>): number {
  const voters = result.seats.length
  if (w.phase === 'vote') return 0
  if (w.phase !== 'reveal') return voters
  if (w.t < REVEAL.show) return 0
  return Math.min(voters, Math.floor((w.t - REVEAL.show) / REVEAL.each) + 1)
}

/** The total in the middle once the first `counted` votes are in: the number, less a one for each 0 among them. */
export function totalAfter(result: Pick<Result, 'seats' | 'votes' | 'number'>, counted: number): number {
  let total = result.number
  for (let k = 0; k < Math.min(counted, result.seats.length); k++) if (result.votes[result.seats[k]] === 0) total -= 1
  return total
}

export interface TurnState {
  /** How far round the gear is, in sides: whole once a side has come to rest, part way while one moves. */
  sides: number
  /** How many sides have stopped. */
  done: number
  /** Whether a side is moving just now. */
  moving: boolean
}

/** A section swinging round and settling: quick off the mark and a very little past, then still. */
function settle(k: number): number {
  const x = Math.max(0, Math.min(1, k)) - 1
  const c1 = 1.1
  return 1 + (c1 + 1) * x ** 3 + c1 * x ** 2
}

/**
 * The turn, a side at a time. Side `i` starts to move at `i * TURN.pace`, swings round
 * in `TURN.move` and then holds still for the rest of its `TURN.pace` - so each is at rest,
 * and clearly so, before the next one moves.
 */
export function turnState(clicks: number, w: Pick<When, 'phase' | 't'>): TurnState {
  if (w.phase === 'vote' || w.phase === 'reveal') return { sides: 0, done: 0, moving: false }
  if (w.phase !== 'turn') return { sides: clicks, done: clicks, moving: false }
  const c = w.t / TURN.pace
  const i = Math.floor(c)
  if (i >= clicks) return { sides: clicks, done: clicks, moving: false }
  const into = (c - i) * TURN.pace
  if (into >= TURN.move) return { sides: i + 1, done: i + 1, moving: false }
  return { sides: i + settle(into / TURN.move), done: i, moving: true }
}

/** How far the gear has turned at `t`, radians counter-clockwise seen from above. */
export function turnAngle(result: Result | undefined, sides: number, t: number): number {
  if (!result) return 0
  const w = when(t)
  if (w.round !== result.round) return 0
  return (turnState(clicksOf(result), w).sides * Math.PI * 2) / Math.max(1, sides)
}

/**
 * What the middle of the gear says: the number while the vote is on, the total as the
 * votes are added in, the sides still to turn as it clicks round, and nothing left once
 * it has stopped.
 */
export function hubValue(game: Game, result: Result | undefined, t: number): { value: number; phase: 'number' | 'total' | 'count' } {
  const w = when(t)
  const number = numberFor(game.seed, game.round)
  if (!result || w.round !== result.round || w.phase === 'vote') return { value: number, phase: 'number' }
  if (w.phase === 'reveal') return { value: totalAfter(result, tallied(result, w)), phase: 'total' }
  if (w.phase === 'turn') return { value: clicksOf(result) - turnState(clicksOf(result), w).done, phase: 'count' }
  return { value: 0, phase: 'count' }
}

const samples = new Map<number, { game: Game; last: number }>()

/** A round of four made-up players to show how it goes, on its own clock from 0. */
export function sampleGame(): Game {
  const game = createGame(
    seedForSample,
    SAMPLE.names.map((id) => ({ id, bot: true })),
    -1,
  )
  return game
}

/**
 * The game as it is to be drawn. Before round one that is the sample round, brought up
 * to date with the clock - the made-up players voting as the seconds go by, the round
 * counted and the side dropped as the real rules do it - and otherwise the game itself.
 */
export function viewOf(game: Game): Game {
  if (game.lead <= 0 || game.players.length === 0 || clock(game) >= 0) return game
  let held = samples.get(game.id)
  if (!held || game.elapsed < held.last - 0.5) {
    held = { game: sampleGame(), last: 0 }
    samples.set(game.id, held)
    if (samples.size > 4) samples.delete(samples.keys().next().value!)
  }
  const demo = held.game
  const at = Math.max(0, game.elapsed)
  held.last = at
  demo.elapsed = at
  demo.players.forEach((p, i) => {
    const script = SAMPLE.votes[i]
    p.vote = at >= script.at ? script.v : null
  })
  advance(demo)
  return demo
}

/** Whether what is being drawn is the sample round. */
export function isSample(game: Game): boolean {
  return game.id === -1
}

/** What the sample round says about itself at each point, for the words over the gear. */
export function sampleCaption(w: Pick<When, 'phase' | 't'>): { title: string; text: string } {
  switch (w.phase) {
    case 'vote':
      return { title: 'Sample round', text: `Everybody secretly votes 0 or 1. The number is ${SAMPLE.number}, on a 4-sided gear - so the striped side goes if everybody votes 1.` }
    case 'reveal':
      return { title: 'Sample round', text: 'The votes are shown and added into the number: every 0 takes one off, every 1 adds nothing.' }
    case 'turn':
      return { title: 'Sample round', text: 'The gear turns that many sides - one click at a time - and counts them down.' }
    case 'drop':
      return { title: 'Sample round', text: 'Whoever ends up at the mark drops away - it was not the striped side, because somebody voted 0.' }
    default:
      return { title: 'Sample round', text: 'That was a sample. The real game starts now - it is the same, with you on the gear.' }
  }
}

/** Seconds of the sample round left, or 0 when it is over. */
export function sampleLeft(game: Game): number {
  return Math.max(0, -clock(game))
}

