/**
 * The stand-ins: they make for the colour, they shove, one is left - the same way every time.
 */
import { describe, expect, it } from 'vitest'
import { PHASES, dealFor, panelAt } from '../internal/arena'
import { botSteer } from '../internal/ai'
import { ROUND, createGame, placings, stepGame, type Game } from '../internal/rules'

function play(seed: number, n: number, until = ROUND.limit): Game {
  const g = createGame(seed, Array.from({ length: n }, (_, i) => ({ id: `stand-in ${i}`, bot: true })), seed)
  while (!g.over && g.elapsed < until) {
    botSteer(g)
    stepGame(g, 1 / 60)
  }
  return g
}

describe('the stand-ins', () => {
  it('are nearly all on the colour when the panels drop in the first round', () => {
    let on = 0
    let all = 0
    for (let seed = 1; seed <= 10; seed++) {
      const g = play(seed * 13, 4, PHASES.spin + PHASES.reveal - 0.02)
      const deal = dealFor(g.seed, 1)
      for (const p of g.players) {
        all += 1
        if (p.out === null && deal.panels[panelAt(p.x, p.z)] === deal.colour) on += 1
      }
    }
    expect(on / all).toBeGreaterThan(0.75)
  })

  it('play a game down to one standing, shoving some of the others off', () => {
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
