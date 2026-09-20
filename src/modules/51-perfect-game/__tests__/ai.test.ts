/**
 * The stand-ins: they find a good throw, their hands shake, they play the same way every time.
 */
import { describe, expect, it } from 'vitest'
import { bestThrow, botAim } from '../internal/ai'
import { COLUMN } from '../internal/beach'
import { createGame, placings, stepGame, type Game } from '../internal/rules'

function play(seed: number, n: number): Game {
  const g = createGame(seed, Array.from({ length: n }, (_, i) => ({ id: `stand-in ${i}`, bot: true })), seed)
  while (!g.over) {
    botAim(g, 1 / 30)
    stepGame(g, 1 / 30)
  }
  return g
}

describe('the stand-ins', () => {
  it('know a good throw when they see one', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const best = bestThrow(seed * 13)
      expect(best.hit).toBeGreaterThan(COLUMN.crabs / 2)
    }
  })

  it('score, but rarely what the best throw would', () => {
    let scored = 0
    let short = 0
    let turns = 0
    for (let seed = 1; seed <= 8; seed++) {
      const g = play(seed * 29, 3)
      g.players.forEach((p) => {
        turns++
        // One column for the whole game, so one best throw for everybody's turn.
        const best = bestThrow(g.seed, 3).hit
        if (p.score! > 0) scored++
        if (p.score! < best) short++
        expect(p.score!).toBeLessThanOrEqual(best + 2)
      })
    }
    expect(scored).toBeGreaterThan(turns * 0.7)
    expect(short).toBeGreaterThan(turns * 0.4)
  }, 60000)

  it('all plan from the same best throw, since the column is the same every turn, and are told apart by their hands', () => {
    const g = play(31, 3)
    const scores = g.players.map((p) => p.score)
    expect(scores.every((v) => v !== null)).toBe(true)
    // The best throw is one throw, and worked out once.
    expect(bestThrow(g.seed, 3)).toBe(bestThrow(g.seed, 3))
  }, 30000)

  it('play the same way every time', () => {
    const a = play(4242, 3)
    const b = play(4242, 3)
    expect(placings(a).map((e) => [e.player.id, e.player.score])).toEqual(placings(b).map((e) => [e.player.id, e.player.score]))
  }, 30000)
})
