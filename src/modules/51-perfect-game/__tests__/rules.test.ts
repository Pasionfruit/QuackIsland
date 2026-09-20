/**
 * The rules: the turns, aiming, rolling, the score, and who placed where.
 */
import { describe, expect, it } from 'vitest'
import { BOX, columnFor, hits, travel } from '../internal/beach'
import { HOME, ROLL_SLACK, TURN, aimTo, createGame, leave, phaseOf, placings, roll, stepGame, tau, thrower, turnHits, turnOrder, type Game } from '../internal/rules'

const SEED = 4040

function game(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 2)
}

/** Runs the clock on, `step` at a time, until `until` is true or it is over. */
function runUntil(g: Game, until: (g: Game) => boolean, step = 1 / 30): void {
  for (let i = 0; i < 100000 && !g.over && !until(g); i++) stepGame(g, step)
}

describe('the turns', () => {
  it('go everybody once, in an order from the seed', () => {
    const order = turnOrder(SEED, 5)
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4])
    expect(turnOrder(SEED, 5)).toEqual(order)
  })

  it('start aiming at once for the first, and with a "next up" for every other', () => {
    const g = game(2)
    expect(phaseOf(g)).toBe('aim')
    runUntil(g, (x) => x.turn === 1)
    expect(phaseOf(g)).toBe('intro')
    expect(tau(g)).toBeCloseTo(-TURN.intro, 1)
  })

  it('aim, roll, roll on until off the beach, show the result, and move on', () => {
    const g = game(2)
    const who = thrower(g)
    aimTo(g, who, 3, 2.5, 0.1)
    expect(g.aim).toEqual({ x: 3, z: 2.5, angle: 0.1 })
    g.elapsed = 4
    expect(roll(g, who)).toBe(true)
    expect(g.rolledAt).toBe(4)
    expect(phaseOf(g)).toBe('rolling')
    // Nothing moves the aim once it has rolled.
    aimTo(g, who, -5, 2, -0.3)
    expect(g.aim.x).toBe(3)
    const t = { ...g.aim, at: 4 }
    g.elapsed = 4 + travel(t) + 0.01
    stepGame(g, 0.01)
    expect(phaseOf(g)).toBe('result')
    expect(g.players[who].score).toBe(hits(columnFor(SEED), t).length)
    runUntil(g, (x) => x.turn === 1)
    expect(thrower(g)).not.toBe(who)
    expect(g.aim).toEqual(HOME)
    expect(g.rolledAt).toBe(null)
  })

  it('roll by themselves when the ten seconds run out', () => {
    const g = game(2)
    runUntil(g, (x) => x.rolledAt !== null)
    expect(g.rolledAt).toBe(TURN.aim)
  })

  it('take only the thrower\'s aim and roll', () => {
    const g = game(3)
    const other = (thrower(g) + 1) % 3
    aimTo(g, other, 5, 2, 0.4)
    expect(g.aim).toEqual(HOME)
    expect(roll(g, other)).toBe(false)
  })

  it('keep the thrower in the box', () => {
    const g = game()
    aimTo(g, thrower(g), 99, -99, 0)
    expect(g.aim.x).toBe(BOX.x1)
    expect(g.aim.z).toBe(BOX.z0)
  })

  it('believe a guest\'s own reading of when it rolled - not the future, nor too long ago', () => {
    const g = game()
    const who = thrower(g)
    g.elapsed = 6
    roll(g, who, 5.8)
    expect(g.rolledAt).toBe(5.8)
    const h = game()
    h.elapsed = 6
    roll(h, thrower(h), 2)
    expect(h.rolledAt).toBe(6 - ROLL_SLACK)
    const k = game()
    k.elapsed = 6
    roll(k, thrower(k), 9)
    expect(k.rolledAt).toBe(6)
  })

  it('skip anybody who has left, and a thrower who leaves forfeits', () => {
    const g = game(3)
    const first = thrower(g)
    const second = g.order[1]
    leave(g, second)
    leave(g, first)
    stepGame(g, 0.1)
    expect(g.players[first].score).toBe(0)
    expect(thrower(g)).toBe(g.order[2])
  })
})

describe('the end', () => {
  it('comes after everybody\'s turn; the most crabs wins, level scores share, anybody who left last', () => {
    const g = game(3)
    runUntil(g, () => false)
    expect(g.over).toBe(true)
    expect(g.players.every((p) => p.score !== null)).toBe(true)
    const order = placings(g)
    for (let i = 1; i < order.length; i++) expect(order[i].player.score!).toBeLessThanOrEqual(order[i - 1].player.score!)
    const tie = game(3)
    tie.players.forEach((p) => (p.score = 7))
    tie.players[2].left = true
    expect(placings(tie).map((e) => [e.index, e.place])).toEqual([
      [0, 1],
      [1, 1],
      [2, 3],
    ])
  })

  it('a turn\'s hits are what its throw hits', () => {
    const g = game()
    g.elapsed = 6
    aimTo(g, thrower(g), -2, 3, -0.1)
    roll(g, thrower(g))
    expect(turnHits(g)).toEqual(hits(columnFor(SEED), { x: -2, z: 3, angle: -0.1, at: 6 }))
  })
})
