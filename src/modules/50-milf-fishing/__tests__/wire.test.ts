/**
 * One game on the wire.
 */
import { describe, expect, it } from 'vitest'
import { bitesFor } from '../internal/pond'
import { catches, createGame, pull, total, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

function host(n = 3): Game {
  return createGame(8080, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 6)
}

describe('a snapshot', () => {
  it('carries only the pulls - and every screen lands the same fish from them', () => {
    const g = host(3)
    const [a] = bitesFor(g.seed, 1)
    g.elapsed = a.start + 0.4
    pull(g, 1)
    g.elapsed += 2
    pull(g, 1)
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(g)))!, 'p2')
    expect(copy.players.map((p) => [p.id, p.mine])).toEqual([
      ['p1', false],
      ['p2', true],
      ['p3', false],
    ])
    expect(copy.players[1].pulls).toEqual(g.players[1].pulls)
    expect(catches(copy, 1)).toEqual(catches(g, 1))
    expect(total(copy, 1)).toBe(total(g, 1))
  })

  it('refuses anything malformed, whole', () => {
    const g = host()
    g.elapsed = 5
    pull(g, 0)
    const good = relay(encodeSnapshot(g))
    expect(decodeSnapshot(good)).not.toBe(null)
    const broken = (f: (m: Record<string, unknown>) => void) => {
      const m = relay(good)
      f(m)
      return decodeSnapshot(m)
    }
    const players = (m: Record<string, unknown>) => m.p as unknown[][]
    expect(broken((m) => (m.t = 'x'))).toBe(null)
    expect(broken((m) => (players(m)[0][1] = [500, 400]))).toBe(null)
    expect(broken((m) => (players(m)[0][1] = [1e6]))).toBe(null)
    expect(broken((m) => (players(m)[0][2] = 3))).toBe(null)
    expect(broken((m) => (m.p = []))).toBe(null)
  })
})

describe('what a guest sends', () => {
  it('goes there and back, and nonsense does not', () => {
    const i = { game: 3, pulls: [1.25, 4.5, 9] }
    expect(decodeIntent(relay(encodeIntent(i)))).toEqual(i)
    expect(decodeIntent({ ...relay(encodeIntent(i)), p: [5, 3] })).toBe(null)
    expect(decodeIntent({ ...relay(encodeIntent(i)), p: [-1] })).toBe(null)
  })
})
