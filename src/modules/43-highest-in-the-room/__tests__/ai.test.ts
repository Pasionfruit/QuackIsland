/**
 * The stand-ins: they climb, they slip, one is left - the same way every time.
 */
import { describe, expect, it } from 'vitest'
import { BOT, botSteer } from '../internal/ai'
import { ROUND, createGame, placings, stepGame, type Game } from '../internal/rules'

function play(seed: number, n = 5): Game {
  const g = createGame(seed, Array.from({ length: n }, (_, i) => ({ id: `stand-in ${i}`, bot: true })), seed)
  for (let step = 0; step < ROUND.limit * 60 && !g.over; step++) {
    botSteer(g)
    stepGame(g, 1 / 60)
  }
  return g
}

describe('the stand-ins', () => {
  it('climb at about the pace they are set to, and slip now and then', () => {
    const g = createGame(3, [{ id: 'a', bot: true }, { id: 'b', bot: true }], 3)
    for (let step = 0; step < 10 * 60; step++) {
      botSteer(g)
      // No knock-outs, just the climbing.
      g.elapsed += 1 / 60
    }
    for (const p of g.players) {
      expect(p.inputs).toBeGreaterThan(10 / (BOT.interval[1] * 1.8))
      expect(p.inputs).toBeLessThan(10 / (BOT.interval[0] * 0.7))
      expect(p.typed).toBeGreaterThan(p.misses * 4)
    }
    expect(g.players.some((p) => p.misses > 0)).toBe(true)
  })

  it('play a game down to one left', () => {
    let early = 0
    for (let seed = 1; seed <= 12; seed++) {
      const g = play(seed * 31)
      expect(g.over).toBe(true)
      if (g.elapsed < ROUND.limit) {
        early += 1
        expect(g.players.filter((p) => p.out === null)).toHaveLength(1)
      }
    }
    expect(early).toBeGreaterThanOrEqual(10)
  }, 30000)

  it('play the same way every time', () => {
    const a = play(777)
    const b = play(777)
    expect(placings(a).map((e) => [e.player.id, e.player.out, e.player.height])).toEqual(placings(b).map((e) => [e.player.id, e.player.out, e.player.height]))
  })
})
