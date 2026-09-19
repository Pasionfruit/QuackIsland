/**
 * One game on the wire - and no scans on it.
 */
import { describe, expect, it } from 'vitest'
import { roomFor } from '../internal/room'
import { createGame, move, stepGame, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

function host(n = 3): Game {
  return createGame(7070, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 33)
}

describe('a snapshot', () => {
  it('carries every player and every bomb gone off, and a guest keeps its own facing', () => {
    const game = host(3)
    stepGame(game, 0.5)
    const b = roomFor(game.seed).bombs[5]
    Object.assign(game.players[1], { x: b.x, z: b.z })
    move(game, 0.01)
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect(copy.players.map((p) => [p.id, p.mine, p.how])).toEqual([
      ['p1', false, null],
      ['p2', false, 'bomb'],
      ['p3', true, null],
    ])
    expect(copy.blown).toEqual([{ bomb: 5, at: game.blown[0].at, by: 1 }])
    copy.players[2].yaw = 1.5
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect(copy.players[2].yaw).toBe(1.5)
  })

  it('refuses anything malformed, whole', () => {
    const game = host(3)
    const good = relay(encodeSnapshot(game))
    expect(decodeSnapshot(good)).not.toBe(null)
    const broken = (f: (m: Record<string, unknown>) => void) => {
      const m = relay(good)
      f(m)
      return decodeSnapshot(m)
    }
    expect(broken((m) => (m.t = 'x'))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][1] = 99999))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][6] = 1))).toBe(null)
    expect(broken((m) => (m.b = [[9999, 10, 0]]))).toBe(null)
    expect(broken((m) => (m.b = [[1, 10, 0], [1, 20, 1]]))).toBe(null)
  })
})

describe('what a guest sends', () => {
  it('goes there and back - walking and clicks, never a scan - and nonsense does not', () => {
    const i = { game: 3, mx: 0.6, mz: -0.8, clicks: 7 }
    const raw = relay(encodeIntent(i))
    expect(decodeIntent(raw)).toEqual(i)
    expect(Object.keys(raw).sort()).toEqual(['c', 'g', 't', 'x', 'z'])
    expect(decodeIntent({ ...raw, x: 2 })).toBe(null)
  })
})
