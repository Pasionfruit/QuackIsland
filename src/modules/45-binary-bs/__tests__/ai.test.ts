/**
 * The stand-ins: they vote, the marked one tries to get away, the game runs down to one.
 */
import { describe, expect, it } from 'vitest'
import { botSteer, wantedVote } from '../internal/ai'
import { ROUND_LENGTH, createGame, markedSide, numberFor, placings, stepGame, voteEnds, type Game } from '../internal/rules'

function play(seed: number, n: number, until = Infinity): Game {
  const g = createGame(seed, Array.from({ length: n }, (_, i) => ({ id: `stand-in ${i}`, bot: true })), seed)
  while (!g.over && g.elapsed < until) {
    botSteer(g, 1 / 30)
    stepGame(g, 1 / 30)
  }
  return g
}

describe('the stand-ins', () => {
  it('want 0 on the marked side and 1 anywhere else', () => {
    expect(wantedVote(7, 5, markedSide(7, 5))).toBe(0)
    expect(wantedVote(7, 5, (markedSide(7, 5) + 1) % 5)).toBe(1)
  })

  it('all vote before the five seconds are up', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = play(seed * 7, 6, voteEnds(1) - 0.01)
      expect(g.players.every((p) => p.vote !== null)).toBe(true)
      const marked = g.seats[markedSide(numberFor(g.seed, 1), 6)]
      expect(g.players[marked].vote).toBe(0)
    }
  })

  it('play down to one, one round a player', () => {
    for (let n = 2; n <= 8; n++) {
      const g = play(n * 101, n)
      expect(g.over).toBe(true)
      expect(g.players.filter((p) => p.out === null)).toHaveLength(1)
      expect(g.elapsed).toBeLessThanOrEqual(ROUND_LENGTH * (n - 1))
    }
  })

  it('play the same way every time', () => {
    const a = play(99, 6)
    const b = play(99, 6)
    expect(placings(a).map((e) => [e.player.id, e.player.out])).toEqual(placings(b).map((e) => [e.player.id, e.player.out]))
  })
})
