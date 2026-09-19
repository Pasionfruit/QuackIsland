/**
 * The stand-ins: they shop, they get through, they ram - the same way every time.
 */
import { describe, expect, it } from 'vitest'
import { botSteer } from '../internal/ai'
import { createGame, gotten, placings, stepGame, type Game } from '../internal/rules'

function play(seed: number, n: number): Game {
  const g = createGame(seed, Array.from({ length: n }, (_, i) => ({ id: `stand-in ${i}`, bot: true })), seed)
  while (!g.over) {
    botSteer(g)
    stepGame(g, 1 / 60)
  }
  return g
}

describe('the stand-ins', () => {
  it('find their way round the shelves to their whole lists and through a checkout, well inside the limit', () => {
    let rammed = 0
    for (let seed = 1; seed <= 10; seed++) {
      const n = 2 + (seed % 7)
      const g = play(seed * 131, n)
      const through = g.players.filter((p) => p.doneAt !== null)
      expect(through.length).toBeGreaterThanOrEqual(Math.min(3, n - 1))
      expect(Math.min(...through.map((p) => p.doneAt!))).toBeLessThan(40)
      for (const p of through) expect(gotten(g, p)).toBe(3)
      rammed += g.players.filter((p) => Number.isFinite(p.stunUntil)).length
    }
    expect(rammed).toBeGreaterThan(3)
  }, 30000)

  it('play the same way every time', () => {
    const a = play(4242, 6)
    const b = play(4242, 6)
    expect(placings(a).map((e) => [e.player.id, e.player.doneAt])).toEqual(placings(b).map((e) => [e.player.id, e.player.doneAt]))
  })
})
