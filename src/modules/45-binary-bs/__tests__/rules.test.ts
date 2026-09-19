/**
 * The rules: the sum, the vote, the drop, the new gear, and the last one left.
 */
import { describe, expect, it } from 'vitest'
import {
  GEAR,
  PHASES,
  ROUND,
  ROUND_LENGTH,
  canVote,
  clampToSide,
  createGame,
  dropsAt,
  isIn,
  leave,
  markedSide,
  numberFor,
  placings,
  sideOf,
  stepGame,
  tally,
  vote,
  voteEnds,
  walk,
  when,
  type Game,
} from '../internal/rules'

const SEED = 4040

function game(n = 4): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 3)
}

function runTo(g: Game, until: number): void {
  while (g.elapsed < until - 1e-9 && !g.over) stepGame(g, Math.min(0.05, until - g.elapsed))
}

describe('the sum', () => {
  it('turns the number of sides, one fewer for every 0', () => {
    // Everybody votes 1: the number mod the sides.
    expect(tally(3, 3, 0)).toEqual({ steps: 3, side: 0 })
    expect(tally(7, 5, 0)).toEqual({ steps: 7, side: 2 })
    // A 0 each takes one off.
    expect(tally(7, 5, 1)).toEqual({ steps: 6, side: 1 })
    expect(tally(7, 5, 3)).toEqual({ steps: 4, side: 4 })
    // More zeros than the number: it turns back past the mark, never a negative side.
    expect(tally(2, 5, 4)).toEqual({ steps: -2, side: 3 })
    expect(markedSide(7, 5)).toBe(tally(7, 5, 0).side)
  })

  it('deals a number every round, from the seed, never below two', () => {
    const numbers = Array.from({ length: 30 }, (_, r) => numberFor(SEED, r + 1))
    expect(numbers.every((n) => n >= 2 && n <= 15)).toBe(true)
    expect(new Set(numbers).size).toBeGreaterThan(5)
    expect(numberFor(SEED, 4)).toBe(numberFor(SEED, 4))
  })
})

describe('the schedule', () => {
  it('goes vote (five seconds), reveal, turn, drop, reseat', () => {
    expect(PHASES.vote).toBe(5)
    expect(when(0)).toMatchObject({ round: 1, phase: 'vote' })
    expect(when(4.99).phase).toBe('vote')
    expect(when(5.01).phase).toBe('reveal')
    expect(when(dropsAt(1) + 0.01).phase).toBe('drop')
    expect(when(ROUND_LENGTH + 0.01)).toMatchObject({ round: 2, phase: 'vote' })
  })
})

describe('a vote', () => {
  it('can be changed until the five seconds are up, and not after (but for the grace on the wire)', () => {
    const g = game()
    stepGame(g, 1)
    expect(vote(g, 1, 0)).toBe(true)
    expect(vote(g, 1, 1)).toBe(true)
    expect(g.players[1].vote).toBe(1)
    runTo(g, voteEnds(1) + 0.1)
    expect(canVote(g, 1)).toBe(false)
    expect(vote(g, 1, 0)).toBe(false)
    expect(vote(g, 1, 0, ROUND.grace)).toBe(true)
  })
})

describe('a round', () => {
  it('removes whoever the count brings to the mark - everybody 1: the marked side', () => {
    const g = game(4)
    const number = numberFor(SEED, 1)
    const marked = markedSide(number, 4)
    stepGame(g, 0.5)
    for (let i = 0; i < 4; i++) vote(g, i, 1)
    runTo(g, dropsAt(1) + 0.05)
    const victim = g.seats[marked]
    expect(g.players.map((p, i) => [i, p.out !== null])).toEqual(g.players.map((_, i) => [i, i === victim]))
    expect(g.results[0]).toMatchObject({ number, zeros: 0, side: marked, victim })
  })

  it('removes the next side back for every 0 - and not voting counts as 1', () => {
    const g = game(4)
    const number = numberFor(SEED, 1)
    stepGame(g, 0.5)
    vote(g, 0, 0)
    vote(g, 2, 0)
    vote(g, 3, 1)
    // Player 1 does not vote.
    runTo(g, dropsAt(1) + 0.05)
    const side = ((number - 2) % 4 + 4) % 4
    expect(g.results[0]).toMatchObject({ zeros: 2, steps: number - 2, side, victim: g.seats[side] })
    expect(g.players[g.seats[side]].out).not.toBe(null)
  })

  it('seats everybody left on a gear with a side fewer, votes cleared', () => {
    const g = game(4)
    stepGame(g, 0.5)
    vote(g, 1, 0)
    runTo(g, ROUND_LENGTH + 0.1)
    expect(g.round).toBe(2)
    expect(g.seats).toHaveLength(3)
    expect(g.seats.every((i) => isIn(g.players[i]))).toBe(true)
    expect(g.players.every((p) => p.vote === null)).toBe(true)
    // In roster order, each on their own side.
    expect([...g.seats].sort((a, b) => a - b)).toEqual(g.seats)
  })

  it('goes on until one is left, who wins; the last to go comes second', () => {
    const g = game(4)
    runTo(g, ROUND_LENGTH * 4)
    expect(g.over).toBe(true)
    expect(g.players.filter(isIn)).toHaveLength(1)
    const order = placings(g)
    expect(order.map((e) => e.place)).toEqual([1, 2, 3, 4])
    expect(order[1].player.out).toBeGreaterThan(order[2].player.out!)
  })

  it('removes nobody if the side that comes round belongs to somebody who left', () => {
    const g = game(3)
    const marked = markedSide(numberFor(SEED, 1), 3)
    stepGame(g, 0.5)
    const leaver = g.seats[marked]
    leave(g, leaver)
    runTo(g, dropsAt(1) + 0.05)
    expect(g.results[0].victim).toBe(leaver)
    expect(g.players.filter((p) => p.out !== null)).toHaveLength(0)
    runTo(g, ROUND_LENGTH + 0.1)
    expect(g.seats).toHaveLength(2)
  })
})

describe('walking', () => {
  it('keeps you on your own side, however far you walk', () => {
    const g = game(5)
    stepGame(g, 0.5)
    for (let i = 0; i < 100; i++) walk(g, 0, 1, -1, 0.05)
    const p = g.players[0]
    const kept = clampToSide(sideOf(g, 0), 5, p)
    expect(Math.hypot(kept.x - p.x, kept.z - p.z)).toBeLessThan(1e-9)
    expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(GEAR.rim)
    expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(GEAR.hub)
  })
})
