/**
 * The stand-ins: they scan, pick their way through, shove, and some get out.
 */
import { describe, expect, it } from 'vitest'
import { botSteer } from '../internal/ai'
import { BODY, ROUND, createGame, placings, stepGame, type Game } from '../internal/rules'
import { ROOM } from '../internal/room'

function play(seed: number, n: number): Game {
  const g = createGame(seed, Array.from({ length: n }, (_, i) => ({ id: `stand-in ${i}`, bot: true })), seed)
  while (!g.over) {
    botSteer(g)
    stepGame(g, 1 / 30)
    for (const p of g.players) {
      if (Math.abs(p.x) > ROOM.halfX - BODY.radius + 1e-6 || Math.abs(p.z) > ROOM.halfZ - BODY.radius + 1e-6) throw new Error(`${p.id} is in the wall`)
    }
  }
  return g
}

describe('the stand-ins', () => {
  it('play a whole game: some get out, some do not, and it ends before the pin has rolled the room', () => {
    let out = 0
    let all = 0
    for (let seed = 1; seed <= 8; seed++) {
      const g = play(seed * 37, 5)
      expect(g.over).toBe(true)
      expect(g.elapsed).toBeLessThanOrEqual(ROUND.limit + 0.1)
      out += g.players.filter((p) => p.escaped !== null).length
      all += g.players.length
    }
    expect(out).toBeGreaterThan(all * 0.25)
    expect(out).toBeLessThan(all)
  }, 60000)

  it('play the same way every time', () => {
    const a = play(4242, 5)
    const b = play(4242, 5)
    expect(placings(a).map((e) => [e.player.id, e.player.escaped, e.player.out])).toEqual(placings(b).map((e) => [e.player.id, e.player.escaped, e.player.out]))
  }, 30000)
})
