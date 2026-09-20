/**
 * One game on the wire.
 */
import { describe, expect, it } from 'vitest'
import { HALF } from '../internal/arena'
import { BODY, createGame, move, stepGame, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

function host(n = 3): Game {
  return createGame(9090, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 12)
}

describe('a snapshot', () => {
  it('carries every player, and a guest keeps its own facing', () => {
    const game = host(3)
    Object.assign(game.players[0], { x: 0, z: 0, yaw: -Math.PI / 2, vx: 3.2, vz: -1.1, run: true })
    Object.assign(game.players[1], { x: 1, z: 0 })
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    expect(copy.players.map((p) => [p.id, p.mine])).toEqual([
      ['p1', false],
      ['p2', true],
      ['p3', false],
    ])
    expect(copy.players[0].x).toBeCloseTo(game.players[0].x, 2)
    // How fast everybody is going comes with it, to a tenth, and so does who is running.
    expect(copy.players[0].vx).toBeCloseTo(3.2, 1)
    expect(copy.players[0].vz).toBeCloseTo(-1.1, 1)
    expect(copy.players.map((p) => p.run)).toEqual([true, false, false])
    copy.players[1].yaw = 2
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    expect(copy.players[1].yaw).toBe(2)
  })

  it('carries a fall: out, who knocked, and how far down', () => {
    const game = host(3)
    Object.assign(game.players[1], { x: HALF - 1.2, z: 0 })
    Object.assign(game.players[0], { x: HALF - 4.2, z: 0, yaw: -Math.PI / 2, vx: BODY.run })
    Object.assign(game.players[2], { x: -HALF + 1.5, z: -HALF + 1.5 })
    for (let i = 0; i < 90; i++) stepGame(game, 1 / 30)
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
    // Nothing goes faster than the speed limit, and the flags are the three that there are.
    expect(broken((m) => ((m.p as unknown[][])[0][8] = 5000))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][10] = 8))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][9] = 0.5))).toBe(null)
  })

  it('keeps the speed of a body that has been hit hard, within the limit', () => {
    const game = host(3)
    Object.assign(game.players[0], { x: -2, z: 0, vx: BODY.run })
    Object.assign(game.players[1], { x: -0.5, z: 0 })
    Object.assign(game.players[2], { x: 6, z: 6 })
    for (let i = 0; i < 30; i++) move(game, 1 / 60)
    const wire = decodeSnapshot(relay(encodeSnapshot(game)))
    expect(wire).not.toBe(null)
    expect(Math.hypot(wire!.players[1][8], wire!.players[1][9]) / 10).toBeGreaterThan(BODY.run * 0.5)
  })
})

describe('what a guest sends', () => {
  it('goes there and back, and nonsense does not', () => {
    const i = { game: 3, mx: 0.707, mz: -0.707, yaw: 1.25, run: true, push: 2 }
    expect(decodeIntent(relay(encodeIntent(i)))).toEqual(i)
    expect(decodeIntent(relay(encodeIntent({ ...i, run: false })))).toEqual({ ...i, run: false })
    expect(decodeIntent({ ...relay(encodeIntent(i)), x: 3 })).toBe(null)
    expect(decodeIntent({ ...relay(encodeIntent(i)), r: 2 })).toBe(null)
    expect(decodeIntent({ ...relay(encodeIntent(i)), r: 'yes' })).toBe(null)
    expect(decodeIntent({ ...relay(encodeIntent(i)), p: -1 })).toBe(null)
    expect(decodeIntent({ ...relay(encodeIntent(i)), p: 1.5 })).toBe(null)
    expect(decodeIntent({ ...relay(encodeIntent(i)), p: undefined })).toBe(null)
  })
})
