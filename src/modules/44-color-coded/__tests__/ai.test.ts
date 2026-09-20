/**
 * The stand-ins: they make for the colour on the ice, they run into each other, one is left - the same way every time.
 */
import { describe, expect, it } from 'vitest'
import { PHASES, dealFor, panelAt } from '../internal/arena'
import { botSteer } from '../internal/ai'
import { BODY, ROUND, SLIDE, createGame, placings, stepGame, type Game } from '../internal/rules'

function play(seed: number, n: number, until = ROUND.limit): Game {
  const g = createGame(seed, Array.from({ length: n }, (_, i) => ({ id: `stand-in ${i}`, bot: true })), seed)
  while (!g.over && g.elapsed < until) {
    botSteer(g)
    stepGame(g, 1 / 60)
  }
  return g
}

describe('the stand-ins', () => {
  it('are mostly on the colour when the panels drop in the first round', () => {
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
    // Most of them: the ice is slippery and some are pushed off by the others on the way.
    expect(on / all).toBeGreaterThan(0.6)
  })

  it('play a game down to one standing, knocking some of the others off', () => {
    let knocked = 0
    for (let seed = 1; seed <= 10; seed++) {
      const g = play(seed * 97, 2 + (seed % 7))
      expect(g.over).toBe(true)
      expect(g.players.filter((p) => p.out === null).length).toBeLessThanOrEqual(1)
      knocked += g.players.filter((p) => p.by !== null).length
    }
    expect(knocked).toBeGreaterThan(5)
  }, 30000)

  it('run when they have a long way to go, and are not sliding past their panel by the time they get there', () => {
    let ran = false
    let arrived = 0
    let settled = 0
    for (let seed = 1; seed <= 8; seed++) {
      const g = createGame(seed * 31, Array.from({ length: 3 }, (_, i) => ({ id: `stand-in ${i}`, bot: true })), seed)
      while (g.elapsed < PHASES.spin + PHASES.reveal - 0.02) {
        botSteer(g)
        stepGame(g, 1 / 60)
        if (g.players.some((p) => p.run)) ran = true
        // Never faster than the speed limit, however they were hit.
        for (const p of g.players) expect(Math.hypot(p.vx, p.vz)).toBeLessThanOrEqual(SLIDE.cap + 1e-9)
      }
      const deal = dealFor(g.seed, 1)
      for (const p of g.players) {
        arrived += 1
        if (deal.panels[panelAt(p.x, p.z)] === deal.colour && Math.hypot(p.vx, p.vz) < BODY.walk) settled += 1
      }
    }
    expect(ran).toBe(true)
    expect(settled / arrived).toBeGreaterThan(0.75)
  })

  it('play the same way every time', () => {
    const a = play(4242, 6)
    const b = play(4242, 6)
    expect(placings(a).map((e) => [e.player.id, e.player.out])).toEqual(placings(b).map((e) => [e.player.id, e.player.out]))
  })
})
