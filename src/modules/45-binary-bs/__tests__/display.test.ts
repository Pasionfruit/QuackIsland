/**
 * The sample round before the game, the votes added into the total one at a time, and the
 * gear clicking round a side at a time with a counter going down.
 */
import { describe, expect, it } from 'vitest'
import { botSteer } from '../internal/ai'
import { SAMPLE, clicksOf, hubValue, isSample, sampleCaption, tallied, totalAfter, turnAngle, turnState, viewOf } from '../internal/display'
import { PHASES, REVEAL, ROUND, ROUND_LENGTH, TURN, canVote, clock, createGame, numberFor, stepGame, when, type Game, type Result } from '../internal/rules'
import { MAX_PLAYERS } from '../internal/setup'

const SEED = 4242

/** A game of `n` with the sample round ahead of it, as a real one is. */
function real(n = 4): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 5, ROUND.demo)
}

/** A round's result, made up: `n` seats, the votes, and the number. */
function result(votes: (0 | 1)[], number: number): Result {
  const seats = votes.map((_, i) => i)
  const zeros = votes.filter((v) => v === 0).length
  const steps = number - zeros
  const side = ((steps % seats.length) + seats.length) % seats.length
  return { round: 1, number, seats, votes, zeros, steps, side, victim: seats[side] }
}

const at = (phase: 'vote' | 'reveal' | 'turn' | 'drop' | 'reseat', t: number) => ({ phase, t })

describe('the rounds', () => {
  it('have room for the most players there can be: the votes added in one at a time, and every click of a gear of that many sides', () => {
    expect(MAX_PLAYERS).toBe(8)
    expect(PHASES.reveal).toBeGreaterThanOrEqual(REVEAL.show + MAX_PLAYERS * REVEAL.each)
    expect(PHASES.turn).toBeGreaterThanOrEqual((MAX_PLAYERS - 1) * TURN.pace)
    expect(ROUND_LENGTH).toBeCloseTo(PHASES.vote + PHASES.reveal + PHASES.turn + PHASES.drop + PHASES.reseat, 9)
  })
})

describe('adding the votes into the total', () => {
  const r = result([1, 0, 1, 0, 1], 9)

  it('adds them one at a time, after the votes have been shown for a moment, and all are in by the end of the reveal', () => {
    expect(tallied(r, at('vote', 4))).toBe(0)
    expect(tallied(r, at('reveal', 0))).toBe(0)
    expect(tallied(r, at('reveal', REVEAL.show - 0.01))).toBe(0)
    expect(tallied(r, at('reveal', REVEAL.show + 0.01))).toBe(1)
    expect(tallied(r, at('reveal', REVEAL.show + REVEAL.each + 0.01))).toBe(2)
    expect(tallied(r, at('reveal', PHASES.reveal - 0.001))).toBe(5)
    expect(tallied(r, at('turn', 0))).toBe(5)
    let last = 0
    for (let t = 0; t < PHASES.reveal; t += 0.02) {
      const k = tallied(r, at('reveal', t))
      expect(k).toBeGreaterThanOrEqual(last)
      expect(k - last).toBeLessThanOrEqual(1)
      last = k
    }
  })

  it('takes one off the total for each 0, and nothing for a 1, ending at what the gear turns', () => {
    expect([0, 1, 2, 3, 4, 5].map((k) => totalAfter(r, k))).toEqual([9, 9, 8, 8, 7, 7])
    expect(totalAfter(r, 5)).toBe(r.steps)
    // In the order of the sides.
    expect(totalAfter(result([0, 1, 1], 6), 1)).toBe(5)
    expect(totalAfter(result([1, 1, 0], 6), 2)).toBe(6)
  })

  it('shows in the middle: the number, then the total as it is added to, then the count as it turns', () => {
    const g = real(5)
    const round = { ...r, round: 1 }
    expect(hubValue(g, round, 1)).toEqual({ value: numberFor(g.seed, 1), phase: 'number' })
    expect(hubValue(g, round, PHASES.vote + REVEAL.show + 0.01)).toEqual({ value: 9, phase: 'total' })
    expect(hubValue(g, round, PHASES.vote + REVEAL.show + REVEAL.each + 0.01)).toEqual({ value: 8, phase: 'total' })
    expect(hubValue(g, round, PHASES.vote + PHASES.reveal - 0.01)).toEqual({ value: 7, phase: 'total' })
    // Then it counts down from the sides to turn: 7 mod 5 = 2.
    expect(hubValue(g, round, PHASES.vote + PHASES.reveal + 0.01)).toEqual({ value: 2, phase: 'count' })
  })
})

describe('the gear turning', () => {
  it('turns as many sides as the count comes to round the gear: a gear of five and 7 sides to turn is two clicks, and a count below nothing wraps', () => {
    expect(clicksOf(result([1, 1, 1, 1, 1], 7))).toBe(2)
    expect(clicksOf(result([1, 1, 1, 1, 1], 5))).toBe(0)
    expect(clicksOf(result([0, 0, 0, 0, 0], 2))).toBe(2)
    expect(clicksOf(result([0, 0, 0, 0], 2))).toBe(2)
    expect(clicksOf({ steps: 3, seats: [] })).toBe(0)
  })

  it('moves one side at a time and stops it before the next moves: never two moving, and each at rest for a good while', () => {
    for (const clicks of [1, 2, 4, 7]) {
      let moving = 0
      let rest = 0
      let longestRest = 0
      let last = 0
      for (let t = 0; t < PHASES.turn; t += 0.01) {
        const s = turnState(clicks, at('turn', t))
        // Whole sides only, except while one is moving.
        if (!s.moving) expect(Number.isInteger(s.sides)).toBe(true)
        // The gear only ever goes forward, and by a fraction of a side at a time - never a rush.
        expect(s.sides).toBeGreaterThanOrEqual(last - 0.05)
        expect(s.sides - last).toBeLessThan(0.2)
        last = s.sides
        expect(s.done).toBeLessThanOrEqual(Math.ceil(s.sides + 1e-9))
        if (s.moving) {
          moving += 0.01
          longestRest = Math.max(longestRest, rest)
          rest = 0
          // Within the side that is moving: never past the next one by more than a hair.
          expect(s.sides).toBeLessThanOrEqual(s.done + 1.05)
        } else rest += 0.01
      }
      // It moves for TURN.move of every TURN.pace, so it is still for the rest of each.
      expect(moving).toBeCloseTo(clicks * TURN.move, 1)
      expect(TURN.pace - TURN.move).toBeGreaterThanOrEqual(0.3)
      expect(turnState(clicks, at('turn', PHASES.turn - 0.01)).sides).toBe(clicks)
      expect(turnState(clicks, at('drop', 0.1)).sides).toBe(clicks)
      expect(turnState(clicks, at('vote', 1)).sides).toBe(0)
      expect(turnState(clicks, at('reveal', 1)).sides).toBe(0)
    }
  })

  it('counts down by one as each side stops, from the count to nothing, and never skips one', () => {
    const clicks = 5
    let last = clicks
    const seen = new Set<number>([clicks])
    for (let t = 0; t < PHASES.turn; t += 0.005) {
      const left = clicks - turnState(clicks, at('turn', t)).done
      expect(left).toBeLessThanOrEqual(last)
      expect(last - left).toBeLessThanOrEqual(1)
      last = left
      seen.add(left)
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5])
    // It only goes down once a side has stopped, not while it is on its way.
    const early = turnState(clicks, at('turn', TURN.move / 2))
    expect(early.moving).toBe(true)
    expect(clicks - early.done).toBe(clicks)
    const after = turnState(clicks, at('turn', TURN.move + 0.02))
    expect(after.moving).toBe(false)
    expect(clicks - after.done).toBe(clicks - 1)
  })

  it('has nothing to turn when the count lands on the mark already', () => {
    for (let t = 0; t < PHASES.turn; t += 0.1) {
      expect(turnState(0, at('turn', t))).toEqual({ sides: 0, done: 0, moving: false })
    }
  })

  it('brings the side that goes round to the mark, whatever the count: the angle at the end is the count of sides', () => {
    for (const [votes, number] of [
      [[1, 0, 1, 1], 7],
      [[1, 1, 1, 1, 1], 8],
      [[0, 0, 1], 3],
    ] as const) {
      const r = result([...votes], number)
      const end = PHASES.vote + PHASES.reveal + PHASES.turn
      const angle = turnAngle(r, r.seats.length, end)
      // Turned by `side` sides, one way or the other, gets that side to the mark.
      expect(angle / ((Math.PI * 2) / r.seats.length)).toBeCloseTo(clicksOf(r), 9)
      expect(clicksOf(r)).toBe(r.side)
    }
  })
})

describe('the sample round', () => {
  it('is played before round one: a real game starts in it, and nothing counts until it is over', () => {
    const g = real(4)
    expect(g.lead).toBe(ROUND.demo)
    expect(clock(g)).toBeLessThan(0)
    for (let i = 0; i < 30; i++) stepGame(g, 0.25)
    expect(clock(g)).toBeLessThan(0)
    expect(canVote(g, 0)).toBe(false)
    expect(g.results).toHaveLength(0)
    expect(g.players.every((p) => p.vote === null)).toBe(true)
    expect(when(clock(g) + ROUND.demo).round).toBe(1)
  })

  it('shows four made-up players on a four-sided gear, voting as the seconds go by, and the real game is not touched', () => {
    const g = real(6)
    g.elapsed = 0.5
    const early = viewOf(g)
    expect(isSample(early)).toBe(true)
    expect(early.players.map((p) => p.id)).toEqual([...SAMPLE.names])
    expect(early.seats).toEqual([0, 1, 2, 3])
    expect(numberFor(early.seed, 1)).toBe(SAMPLE.number)
    expect(early.players.every((p) => p.vote === null)).toBe(true)
    g.elapsed = 2.0
    expect(viewOf(g).players.map((p) => p.vote)).toEqual([1, 0, null, null])
    g.elapsed = 4.2
    expect(viewOf(g).players.map((p) => p.vote)).toEqual([1, 0, 1, 1])
    expect(g.players).toHaveLength(6)
    expect(g.players.every((p) => p.vote === null)).toBe(true)
  })

  it('is a round played by the real rules, and the 0 moves the trouble: seven on four sides would have been side 4, and it is side 3 that goes', () => {
    const g = real(5)
    g.elapsed = PHASES.vote + 0.5
    let sample = viewOf(g)
    expect(sample.results).toHaveLength(1)
    const r = sample.results[0]
    expect(r).toMatchObject({ number: 7, zeros: 1, steps: 6, side: 2 })
    expect(clicksOf(r)).toBe(2)
    expect(sample.players[r.victim].id).toBe('Cy')
    // Marked while the vote is on: 7 mod 4 = side 4, which is Di - not who goes.
    expect(SAMPLE.number % 4).toBe(3)
    expect(r.side).not.toBe(3)
    // It drops the side at the mark when the turn is done, and leaves three in it.
    g.elapsed = PHASES.vote + PHASES.reveal + PHASES.turn - 0.1
    sample = viewOf(g)
    expect(sample.players.filter((p) => p.out === null)).toHaveLength(4)
    g.elapsed = PHASES.vote + PHASES.reveal + PHASES.turn + PHASES.drop + 0.1
    sample = viewOf(g)
    expect(sample.players.filter((p) => p.out === null).map((p) => p.id)).toEqual(['Ann', 'Bo', 'Di'])
    expect(sample.over).toBe(false)
  })

  it('gives way to the real game when it is over, and starts it fresh', () => {
    const g = real(4)
    g.elapsed = ROUND.demo - 0.1
    expect(isSample(viewOf(g))).toBe(true)
    g.elapsed = ROUND.demo + 0.1
    expect(viewOf(g)).toBe(g)
    expect(clock(g)).toBeGreaterThan(0)
    expect(g.round).toBe(1)
  })

  it('says something at every point of it, and starts again if the clock goes back', () => {
    for (const phase of ['vote', 'reveal', 'turn', 'drop', 'reseat'] as const) {
      const c = sampleCaption(at(phase, 0.1))
      expect(c.title).toBe('Sample round')
      expect(c.text.length).toBeGreaterThan(20)
    }
    const g = real(4)
    g.elapsed = 10
    viewOf(g)
    g.elapsed = 1
    expect(viewOf(g).results).toHaveLength(0)
  })

  it('is not there in a game with no sample round, as in the rules’ own tests', () => {
    const g = createGame(SEED, [{ id: 'a' }, { id: 'b' }], 3)
    expect(g.lead).toBe(0)
    expect(viewOf(g)).toBe(g)
  })
})

describe('a whole game with the sample round in front', () => {
  it('is played to the end by the stand-ins, and takes the sample round longer than it would have', () => {
    const g = real(4)
    let steps = 0
    while (!g.over && steps < 60 * 30 * 8) {
      botSteer(g, 1 / 30)
      stepGame(g, 1 / 30)
      steps += 1
    }
    expect(g.over).toBe(true)
    expect(g.players.filter((p) => p.out === null)).toHaveLength(1)
    // Three rounds and the sample.
    expect(g.elapsed).toBeGreaterThan(ROUND.demo + 2 * ROUND_LENGTH)
    expect(g.elapsed).toBeLessThanOrEqual(ROUND.demo + 3 * ROUND_LENGTH + 1)
  })
})
