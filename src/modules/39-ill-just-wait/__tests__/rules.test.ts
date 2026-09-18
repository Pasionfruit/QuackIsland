/**
 * The race: winding, answering, moving on, and the end.
 */
import { describe, expect, it } from 'vitest'
import { botMoves, botPace } from '../internal/ai'
import {
  CLOCK,
  answerFor,
  confirm,
  createGame,
  finished,
  handAngles,
  leave,
  newHand,
  placings,
  press,
  setHand,
  stageOf,
  stepGame,
  sweepRate,
  turnHand,
  type Game,
} from '../internal/rules'
import { TARGETS } from '../internal/wording'

const game = (): Game => createGame(4242, [{ id: 'a', mine: true }, { id: 'b' }, { id: 'c' }])

describe('answering', () => {
  it('starts everybody at 12:00 on the first target', () => {
    const g = game()
    expect(g.players.every((p) => p.minutes === 0 && stageOf(p) === 0)).toBe(true)
  })

  it('moves you on when right, and back to 12:00', () => {
    const g = game()
    g.clock = 12
    setHand(g, 0, answerFor(g, 0))
    expect(confirm(g, 0, 0, answerFor(g, 0))).toBe('right')
    expect(g.players[0].solved[0]).toBe(12)
    expect(stageOf(g.players[0])).toBe(1)
    expect(g.players[0].minutes).toBe(0)
  })

  it('keeps you on the same target when wrong, back at 12:00', () => {
    const g = game()
    setHand(g, 0, answerFor(g, 0) + 1)
    expect(confirm(g, 0, 0, answerFor(g, 0) + 1)).toBe('wrong')
    expect(stageOf(g.players[0])).toBe(0)
    expect(g.players[0].minutes).toBe(0)
    // And as often as it takes.
    expect(confirm(g, 0, 0, answerFor(g, 0))).toBe('right')
  })

  it('does not count an answer for a target you are not on', () => {
    const g = game()
    expect(confirm(g, 0, 1, answerFor(g, 1))).toBeNull()
    confirm(g, 0, 0, answerFor(g, 0))
    expect(confirm(g, 0, 0, answerFor(g, 0))).toBeNull()
  })

  it('ends the game on the first player to get all three', () => {
    const g = game()
    for (let i = 0; i < TARGETS; i++) {
      g.clock = 10 * (i + 1)
      expect(g.over).toBe(false)
      confirm(g, 1, i, answerFor(g, i))
    }
    expect(finished(g.players[1])).toBe(true)
    expect(g.over).toBe(true)
    expect(confirm(g, 0, 0, answerFor(g, 0))).toBeNull()
    expect(placings(g)[0]).toMatchObject({ index: 1, place: 1 })
  })

  it('ends at the time limit otherwise', () => {
    const g = game()
    for (let t = 0; t < CLOCK.limit + 1; t += 0.25) stepGame(g, 0.25)
    expect(g.over).toBe(true)
  })

  it('does not wait on somebody who left', () => {
    const g = createGame(1, [{ id: 'a' }, { id: 'b' }])
    for (let i = 0; i < TARGETS - 1; i++) confirm(g, 0, i, answerFor(g, i))
    leave(g, 1)
    stepGame(g, 0.1)
    expect(g.over).toBe(false)
    leave(g, 0)
    stepGame(g, 0.1)
    expect(g.over).toBe(true)
  })

  it('places by targets got, then by how soon the last one was', () => {
    const g = game()
    g.clock = 20
    confirm(g, 1, 0, answerFor(g, 0))
    g.clock = 30
    confirm(g, 2, 0, answerFor(g, 0))
    confirm(g, 2, 1, answerFor(g, 1))
    const order = placings(g)
    expect(order.map((e) => e.player.id)).toEqual(['c', 'b', 'a'])
    expect(order.map((e) => e.place)).toEqual([1, 2, 3])
  })
})

describe('the hand', () => {
  it('moves one minute on a press, either way, and wraps round twelve', () => {
    const hand = newHand()
    press(hand, 1)
    expect(hand.minutes).toBe(1)
    press(hand, -1)
    press(hand, -1)
    expect(hand.minutes).toBe(719)
  })

  it('sweeps slowly at first and faster the longer it is held', () => {
    expect(sweepRate(0)).toBe(CLOCK.sweep[0])
    expect(sweepRate(CLOCK.holdDelay + CLOCK.ramp)).toBe(CLOCK.sweep[1])
    const hand = newHand()
    press(hand, 1)
    for (let i = 0; i < 60; i++) turnHand(hand, 1, 1 / 60)
    const afterOne = hand.minutes
    expect(afterOne).toBeGreaterThan(1)
    expect(afterOne).toBeLessThan(10)
    for (let i = 0; i < 180; i++) turnHand(hand, 1, 1 / 60)
    expect(hand.minutes - afterOne).toBeGreaterThan(60)
    // Always on a whole minute.
    expect(Number.isInteger(hand.minutes)).toBe(true)
  })

  it('stops when let go', () => {
    const hand = newHand()
    press(hand, 1)
    turnHand(hand, 0, 1)
    const at = hand.minutes
    turnHand(hand, 0, 1)
    expect(hand.minutes).toBe(at)
  })

  it('points the hands where a clock would', () => {
    expect(handAngles(3 * 60 + 30).minute).toBeCloseTo(Math.PI)
    expect(handAngles(3 * 60 + 30).hour).toBeCloseTo((3.5 / 12) * Math.PI * 2)
  })
})

describe('the stand-ins', () => {
  it('read, wind the short way round, and get all three', () => {
    const g = createGame(777, [{ id: 'me', mine: true }, { id: 'bot', bot: true }])
    const seen = new Set<number>()
    while (!g.over) {
      for (const move of botMoves(g)) {
        if (move.answer) confirm(g, move.player, move.answer.stage, answerFor(g, move.answer.stage), move.answer.at)
        else setHand(g, move.player, move.minutes)
        seen.add(g.players[move.player].minutes)
      }
      stepGame(g, 1 / 30)
    }
    expect(finished(g.players[1])).toBe(true)
    expect(g.clock).toBeLessThan(CLOCK.limit)
    // Its clock visibly moved on the way.
    expect(seen.size).toBeGreaterThan(10)
  })

  it('reads the harder words for longer', () => {
    const mean = (stage: number) => {
      let sum = 0
      for (let s = 1; s <= 100; s++) sum += botPace({ seed: s }, 'bot', stage).read
      return sum / 100
    }
    expect(mean(1)).toBeGreaterThan(mean(0))
    expect(mean(2)).toBeGreaterThan(mean(1))
  })
})
