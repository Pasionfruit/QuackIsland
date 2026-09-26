/**
 * The stand-ins: they dodge, they shove, one is left - the same way every time.
 */
import { describe, expect, it } from 'vitest'
import { botSteer } from '../internal/ai'
import { ROUND, createGame, move, placings, stepGame, tick, type Game } from '../internal/rules'

function play(seed: number, n: number): Game {
  const g = createGame(seed, Array.from({ length: n }, (_, i) => ({ id: `stand-in ${i}`, bot: true })), seed)
  while (!g.over) {
    botSteer(g)
    stepGame(g, 1 / 60)
  }
  return g
}

/** How long one body alone on the deck lasts: a stand-in dodging, or somebody standing still where they started. */
function lasts(seed: number, bot: boolean): number {
  const g = createGame(seed, [{ id: 'alone', bot }], seed)
  while (g.players[0].out === null && g.elapsed < ROUND.limit) {
    if (bot) botSteer(g)
    tick(g, 1 / 60)
    move(g, 1 / 60)
  }
  return g.players[0].out ?? ROUND.limit
}

describe('the stand-ins', () => {
  it('dodge: alone on the deck they last far longer than somebody standing still', () => {
    let dodging = 0
    let still = 0
    for (let seed = 1; seed <= 8; seed++) {
      dodging += lasts(seed * 31, true)
      still += lasts(seed * 31, false)
    }
    expect(dodging).toBeGreaterThan(still * 3)
    expect(dodging / 8).toBeGreaterThan(35)
  }, 30000)

  it('play a game down to one standing, shoving some of the others into the balls', () => {
    let shoved = 0
    for (let seed = 1; seed <= 10; seed++) {
      const g = play(seed * 97, 2 + (seed % 7))
      expect(g.over).toBe(true)
      expect(g.players.filter((p) => p.out === null).length).toBeLessThanOrEqual(1)
      shoved += g.players.filter((p) => p.by !== null).length
    }
    expect(shoved).toBeGreaterThan(5)
  }, 30000)

  it('play the same way every time', () => {
    const a = play(4242, 6)
    const b = play(4242, 6)
    expect(placings(a).map((e) => [e.player.id, e.player.out])).toEqual(placings(b).map((e) => [e.player.id, e.player.out]))
  })
})
