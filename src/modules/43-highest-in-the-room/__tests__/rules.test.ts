/**
 * The rules: a block for a right key, four down for a wrong one, out at ten behind.
 */
import { describe, expect, it } from 'vitest'
import { CLIMB, ROUND, arrowAt, arrowFor, behind, createGame, judgeEnd, knockOut, leader, leave, placings, press, stepGame, type Arrow, type Game } from '../internal/rules'

const SEED = 4711

function game(n = 3): Game {
  const g = createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 9)
  stepGame(g, 0.1)
  return g
}

const right = (g: Game, i: number) => arrowFor(g, g.players[i])
const wrong = (g: Game, i: number) => ((right(g, i) + 1) % 4) as Arrow

/** A player gets `n` right in a row. */
function climb(g: Game, i: number, n: number): void {
  for (let k = 0; k < n; k++) expect(press(g, i, right(g, i))).toBe(true)
}

describe('the arrows', () => {
  it('are the same for the same seed, however they are asked for, and never three alike running', () => {
    const late = Array.from({ length: 600 }, (_, i) => arrowAt(99, 599 - i)).reverse()
    const early = Array.from({ length: 600 }, (_, i) => arrowAt(99, i))
    expect(late).toEqual(early)
    expect(new Set(early)).toEqual(new Set([0, 1, 2, 3]))
    for (let i = 2; i < early.length; i++) expect(early[i] === early[i - 1] && early[i] === early[i - 2]).toBe(false)
    expect(Array.from({ length: 50 }, (_, i) => arrowAt(100, i))).not.toEqual(early.slice(0, 50))
  })

  it('are the same for everybody: the next one is whichever you are on', () => {
    const g = game(2)
    climb(g, 0, 5)
    expect(right(g, 0)).toBe(arrowAt(SEED, 5))
    expect(right(g, 1)).toBe(arrowAt(SEED, 0))
  })
})

describe('a key', () => {
  it('right puts a block under you and moves you on to the next arrow', () => {
    const g = game()
    climb(g, 0, 3)
    expect(g.players[0]).toMatchObject({ height: 3, typed: 3, inputs: 3, misses: 0, best: 3 })
  })

  it('wrong knocks you down four, never below the floor, and the arrow stays', () => {
    const g = game()
    climb(g, 0, 6)
    const before = right(g, 0)
    expect(press(g, 0, wrong(g, 0))).toBe(false)
    expect(g.players[0]).toMatchObject({ height: 6 - CLIMB.knock, typed: 6, inputs: 7, misses: 1, best: 6 })
    expect(right(g, 0)).toBe(before)
    press(g, 0, wrong(g, 0))
    expect(g.players[0].height).toBe(0)
  })

  it('does nothing before the start, once you are out, or once it is over', () => {
    const g = createGame(SEED, [{ id: 'a' }, { id: 'b' }])
    g.elapsed = -0.5
    expect(press(g, 0, right(g, 0))).toBe(null)
    g.elapsed = 1
    g.players[1].out = 1
    expect(press(g, 1, right(g, 1))).toBe(null)
    g.over = true
    expect(press(g, 0, right(g, 0))).toBe(null)
  })
})

describe('falling behind', () => {
  it('is out at ten blocks below the highest, and not at nine', () => {
    const g = game(3)
    climb(g, 0, CLIMB.behind + 2)
    climb(g, 1, 3)
    climb(g, 2, 2)
    expect(behind(g, g.players[1])).toBe(CLIMB.behind - 1)
    expect(knockOut(g)).toEqual([2])
    expect(g.players[2].out).not.toBe(null)
    expect(g.players[1].out).toBe(null)
    expect(leader(g)).toBe(0)
  })

  it('can come from a slip: four down puts you ten behind', () => {
    const g = game(2)
    climb(g, 0, 12)
    climb(g, 1, 6)
    knockOut(g)
    expect(g.players[1].out).toBe(null)
    press(g, 1, wrong(g, 1))
    stepGame(g, 0.1)
    expect(g.players[1].out).not.toBe(null)
  })

  it('takes everybody who is that far behind at once, and they share a place', () => {
    const g = game(4)
    climb(g, 0, 10)
    climb(g, 1, 10)
    stepGame(g, 0.1)
    expect(g.players[2].out).toBe(g.players[3].out)
    expect(g.players[2].out).not.toBe(null)
    expect(placings(g).map((e) => e.place)).toEqual([1, 1, 3, 3])
  })

  it('is measured against the highest still in, not somebody who has left', () => {
    const g = game(3)
    climb(g, 0, 15)
    climb(g, 1, 6)
    climb(g, 2, 6)
    leave(g, 0)
    stepGame(g, 0.1)
    expect(g.players[1].out).toBe(null)
  })
})

describe('the end', () => {
  it('is over when one is left, and they win; the last to go come next', () => {
    const g = game(3)
    climb(g, 0, 3)
    climb(g, 1, 0)
    stepGame(g, 1)
    climb(g, 0, 7)
    stepGame(g, 0.1)
    // Both at ten behind together.
    expect(g.over).toBe(true)
    expect(placings(g)[0]).toMatchObject({ index: 0, place: 1 })
  })

  it('at the time limit places whoever is left by how high they are', () => {
    const g = game(3)
    climb(g, 0, 4)
    climb(g, 1, 8)
    climb(g, 2, 4)
    while (!g.over) stepGame(g, 0.25)
    expect(g.elapsed).toBeGreaterThanOrEqual(ROUND.limit)
    expect(placings(g).map((e) => [e.index, e.place])).toEqual([
      [1, 1],
      [0, 2],
      [2, 2],
    ])
  })

  it('puts anybody who left while in after everybody knocked out', () => {
    const g = game(3)
    stepGame(g, 1)
    leave(g, 2)
    climb(g, 0, 10)
    stepGame(g, 0.1)
    expect(judgeEnd(g)).toBe(true)
    expect(placings(g).map((e) => e.index)).toEqual([0, 1, 2])
  })
})
