/**
 * The stand-ins: they read their rods, they land fish, they sometimes get it wrong - the same way every time.
 */
import { describe, expect, it } from 'vitest'
import { botPull, wantsAt } from '../internal/ai'
import { LENGTH } from '../internal/pond'
import { catches, createGame, placings, stepGame, total, type Game } from '../internal/rules'

function play(seed: number, n: number): Game {
  const g = createGame(seed, Array.from({ length: n }, (_, i) => ({ id: `stand-in ${i}`, bot: true })), seed)
  while (!g.over) {
    botPull(g)
    stepGame(g, 1 / 60)
  }
  return g
}

describe('the stand-ins', () => {
  it('land fish, big and small, and now and then pull on nothing', () => {
    let landed = 0
    let empty = 0
    const sizes = new Set<number>()
    for (let seed = 1; seed <= 10; seed++) {
      const g = play(seed * 17, 6)
      g.players.forEach((p, i) => {
        const got = catches(g, i)
        landed += got.length
        empty += p.pulls.length - got.length
        got.forEach((b) => sizes.add(b.size))
      })
    }
    expect(landed).toBeGreaterThan(100)
    expect(empty).toBeGreaterThan(5)
    expect(sizes.size).toBe(4)
  }, 30000)

  it('are choosier early and take anything at the end', () => {
    expect(wantsAt(3, 0)).toBe(3)
    expect(wantsAt(3, LENGTH - 8)).toBeLessThan(3)
    expect(wantsAt(3, LENGTH - 2)).toBe(0)
  })

  it('play the same way every time', () => {
    const a = play(4242, 6)
    const b = play(4242, 6)
    expect(placings(a).map((e) => [e.player.id, total(a, e.index)])).toEqual(placings(b).map((e) => [e.player.id, total(b, e.index)]))
  })
})
