/**
 * One game on the wire.
 */
import { describe, expect, it } from 'vitest'
import { click, createGame, stepGame, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

function host(n = 3): Game {
  return createGame(6060, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 9)
}

describe('a snapshot', () => {
  it('carries everybody, their lists, their trolleys and where every item is', () => {
    const g = host(3)
    const item = g.items.findIndex((it) => g.players[0].list.includes(it.kind))
    Object.assign(g.items[item], { x: 0, z: 5, shelf: false })
    Object.assign(g.players[0], { x: 0, z: 5.5 })
    click(g, 0)
    const floor = g.items.findIndex((_, i) => i !== item)
    Object.assign(g.items[floor], { x: 1.5, z: 4, shelf: false })
    stepGame(g, 0.1)
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(g)))!, 'p2')
    expect(copy.players.map((p) => [p.id, p.mine])).toEqual([
      ['p1', false],
      ['p2', true],
      ['p3', false],
    ])
    expect(copy.players.map((p) => p.list)).toEqual(g.players.map((p) => p.list))
    expect(copy.players[0].cart).toEqual([item])
    expect(copy.items[item].holder).toBe(0)
    expect(copy.items.map((it) => it.kind)).toEqual(g.items.map((it) => it.kind))
    expect(copy.items[floor]).toMatchObject({ x: 1.5, z: 4, shelf: false, holder: null })
    expect(copy.players[0].x).toBeCloseTo(g.players[0].x, 2)
  })

  it('refuses anything malformed, whole', () => {
    const good = relay(encodeSnapshot(host()))
    expect(decodeSnapshot(good)).not.toBe(null)
    const broken = (f: (m: Record<string, unknown>) => void) => {
      const m = relay(good)
      f(m)
      return decodeSnapshot(m)
    }
    const players = (m: Record<string, unknown>) => m.p as unknown[][]
    expect(broken((m) => (m.t = 'x'))).toBe(null)
    expect(broken((m) => (m.i as unknown[]).pop())).toBe(null)
    expect(broken((m) => (players(m)[0][1] = 1e7))).toBe(null)
    // One item in two trolleys.
    expect(
      broken((m) => {
        players(m)[0][4] = [0]
        players(m)[1][4] = [0]
      }),
    ).toBe(null)
    expect(broken((m) => (players(m)[0][4] = [0, 1, 2, 3]))).toBe(null)
  })
})

describe('what a guest sends', () => {
  it('goes there and back, and nonsense does not', () => {
    const i = { game: 3, mx: 0.707, mz: -0.707, clicks: 4, rams: 2 }
    expect(decodeIntent(relay(encodeIntent(i)))).toEqual(i)
    expect(decodeIntent({ ...relay(encodeIntent(i)), x: 3 })).toBe(null)
    expect(decodeIntent({ ...relay(encodeIntent(i)), r: -1 })).toBe(null)
  })
})
