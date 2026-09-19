/**
 * One game on the wire.
 */
import { describe, expect, it } from 'vitest'
import { HALF } from '../internal/arena'
import { createGame, push, stepGame, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

function host(n = 3): Game {
  return createGame(9090, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 12)
}

describe('a snapshot', () => {
  it('carries every player, and a guest keeps its own facing', () => {
    const game = host(3)
    Object.assign(game.players[0], { x: 0, z: 0, yaw: -Math.PI / 2 })
    Object.assign(game.players[1], { x: 1, z: 0 })
    stepGame(game, 0.1)
    push(game, 0)
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    expect(copy.players.map((p) => [p.id, p.mine])).toEqual([
      ['p1', false],
      ['p2', true],
      ['p3', false],
    ])
    expect(copy.players[0].x).toBeCloseTo(game.players[0].x, 2)
    expect(copy.players[0].pushedAt).toBeCloseTo(game.players[0].pushedAt, 2)
    copy.players[1].yaw = 2
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    expect(copy.players[1].yaw).toBe(2)
  })

  it('carries a fall: out, who shoved, and how far down', () => {
    const game = host(3)
    Object.assign(game.players[1], { x: HALF - 0.9, z: 0 })
    Object.assign(game.players[0], { x: HALF - 2.1, z: 0, yaw: -Math.PI / 2 })
    Object.assign(game.players[2], { x: -HALF + 1.5, z: -HALF + 1.5 })
    stepGame(game, 0.05)
    push(game, 0)
    for (let i = 0; i < 30; i++) stepGame(game, 1 / 30)
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect(copy.players[1]).toMatchObject({ out: game.players[1].out, by: 0 })
    expect(copy.players[1].y).toBeLessThan(0)
    expect(copy.players[0].kills).toBe(1)
  })

  it('refuses anything malformed, whole', () => {
    const good = relay(encodeSnapshot(host()))
    expect(decodeSnapshot(good)).not.toBe(null)
    const broken = (f: (m: Record<string, unknown>) => void) => {
      const m = relay(good)
      f(m)
      return decodeSnapshot(m)
    }
    expect(broken((m) => (m.t = 'x'))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][1] = 1e7))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][3] = 50))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][6] = 7))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0].pop()))).toBe(null)
  })
})

describe('what a guest sends', () => {
  it('goes there and back, and nonsense does not', () => {
    const i = { game: 3, mx: 0.707, mz: -0.707, yaw: 1.25, clicks: 4 }
    expect(decodeIntent(relay(encodeIntent(i)))).toEqual(i)
    expect(decodeIntent({ ...relay(encodeIntent(i)), x: 3 })).toBe(null)
    expect(decodeIntent({ ...relay(encodeIntent(i)), c: -1 })).toBe(null)
  })
})
