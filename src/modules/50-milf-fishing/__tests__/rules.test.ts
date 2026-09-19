/**
 * The rules: pulling, what it lands, the end, and who placed where.
 */
import { describe, expect, it } from 'vitest'
import { LENGTH, RECAST, bitesFor } from '../internal/pond'
import { PULL_SLACK, canPull, castLeft, catches, createGame, judgeEnd, leave, placings, pull, stepGame, tick, total, type Game } from '../internal/rules'

const SEED = 1357

function game(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 4)
}

describe('pulling', () => {
  it('lands the fish on the rod, adds its weight, and then casts', () => {
    const g = game()
    const [a] = bitesFor(SEED, 0)
    g.elapsed = a.start + 0.4
    expect(pull(g, 0)).toEqual(a)
    expect(catches(g, 0)).toEqual([a])
    expect(total(g, 0)).toBeCloseTo(a.weight, 6)
    // Pulls are kept to the hundredth of a second.
    expect(castLeft(g, 0)).toBeCloseTo(RECAST, 1)
    expect(canPull(g, 0)).toBe(false)
    expect(pull(g, 0)).toBe(undefined)
    g.elapsed += RECAST
    expect(canPull(g, 0)).toBe(true)
  })

  it('lands nothing on a straight rod - and still has to cast', () => {
    const g = game()
    const [a] = bitesFor(SEED, 0)
    g.elapsed = Math.max(0, a.start - 0.4)
    expect(pull(g, 0)).toBe(null)
    expect(total(g, 0)).toBe(0)
    expect(castLeft(g, 0)).toBeGreaterThan(0)
  })

  it('takes a guest\'s own reading of when it pulled - not from the future, nor too long ago', () => {
    const g = game()
    g.elapsed = 10
    pull(g, 1, 9.8)
    expect(g.players[1].pulls).toEqual([9.8])
    pull(g, 2, 12)
    expect(g.players[2].pulls).toEqual([10])
    pull(g, 0, 2)
    expect(g.players[0].pulls).toEqual([10 - PULL_SLACK])
  })

  it('never after the round is over', () => {
    const g = game()
    g.elapsed = LENGTH - 0.01
    stepGame(g, 0.02)
    expect(g.over).toBe(true)
    expect(pull(g, 0)).toBe(undefined)
  })

  it('every player fishes their own bites', () => {
    const g = game(2)
    const [a] = bitesFor(SEED, 0)
    const [b] = bitesFor(SEED, 1)
    g.elapsed = a.start + 0.4
    expect(pull(g, 0)).toEqual(a)
    g.elapsed = b.start + 0.4
    expect(pull(g, 1)).toEqual(b)
  })
})

describe('the end', () => {
  it('is at 25 seconds, and the biggest total catch wins; level catches share', () => {
    const g = game(3)
    const [a0] = bitesFor(SEED, 0)
    const [a1] = bitesFor(SEED, 1)
    g.elapsed = a0.start + 0.4
    pull(g, 0)
    g.elapsed = a1.start + 0.4
    pull(g, 1)
    while (!g.over) stepGame(g, 0.2)
    expect(g.elapsed).toBeGreaterThanOrEqual(LENGTH)
    const order = placings(g)
    const best = a0.weight >= a1.weight ? 0 : 1
    expect(order[0].index).toBe(best)
    expect(order[2]).toMatchObject({ index: 2 })
    // Nothing caught at all, all round: everybody shares.
    const empty = game(3)
    empty.elapsed = LENGTH
    judgeEnd(empty)
    expect(placings(empty).map((e) => e.place)).toEqual([1, 1, 1])
  })

  it('puts anybody who left last, and ends if everybody has', () => {
    const g = game(2)
    tick(g, 0.2)
    leave(g, 1)
    expect(judgeEnd(g)).toBe(false)
    expect(placings(g).map((e) => e.index)).toEqual([0, 1])
    leave(g, 0)
    expect(judgeEnd(g)).toBe(true)
  })
})
