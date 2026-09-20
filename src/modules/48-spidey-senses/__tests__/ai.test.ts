/**
 * The stand-ins: some brave, some chicken, some too slow - down to one, the same way every time.
 */
import { describe, expect, it } from 'vitest'
import { botSteer } from '../internal/ai'
import { CELLAR, scheduleFor } from '../internal/nest'
import { createGame, distance, placings, stepGame, type Game } from '../internal/rules'

function play(seed: number, n: number, until = Infinity): Game {
  const g = createGame(seed, Array.from({ length: n }, (_, i) => ({ id: `stand-in ${i}`, bot: true })), seed)
  while (!g.over && g.elapsed < until) {
    botSteer(g)
    stepGame(g, 1 / 60)
  }
  return g
}

describe('the stand-ins', () => {
  it('creep in to different spots, and have stopped by the time the spider comes out', () => {
    const g = play(99, 6, scheduleFor(99)[0].judged - 0.05)
    const spots = g.players.map(distance)
    expect(Math.min(...spots)).toBeLessThan(CELLAR.far - 2)
    expect(new Set(spots.map((d) => d.toFixed(1))).size).toBeGreaterThan(2)
    // Every one has clicked - in time or not - by the judging.
    expect(g.players.every((p) => p.stoppedAt !== null)).toBe(true)
  })

  it('play a game down to one, some as the chicken and some too slow', () => {
    let eaten = 0
    let chicken = 0
    for (let seed = 1; seed <= 12; seed++) {
      const g = play(seed * 97, 2 + (seed % 7))
      expect(g.over).toBe(true)
      expect(g.players.filter((p) => p.out === null).length).toBeLessThanOrEqual(1)
      eaten += g.players.filter((p) => p.how === 'eaten').length
      chicken += g.players.filter((p) => p.how === 'chicken').length
    }
    expect(eaten).toBeGreaterThan(3)
    expect(chicken).toBeGreaterThan(3)
  }, 30000)

  it('play the same way every time', () => {
    const a = play(4242, 6)
    const b = play(4242, 6)
    expect(placings(a).map((e) => [e.player.id, e.player.out, e.player.how])).toEqual(placings(b).map((e) => [e.player.id, e.player.out, e.player.how]))
  })
})
