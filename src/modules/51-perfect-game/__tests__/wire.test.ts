/**
 * One game on the wire.
 */
import { describe, expect, it } from 'vitest'
import { aimTo, createGame, roll, thrower, turnHits, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

function host(n = 3): Game {
  return createGame(3131, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 8)
}

describe('a snapshot', () => {
  it('carries the turn, the aim, the roll and the scores - and every screen hits the same crabs', () => {
    const g = host(3)
    g.elapsed = 6.5
    aimTo(g, thrower(g), -2.5, 2.8, -0.12)
    roll(g, thrower(g))
    g.players[1].score = 11
    const watcher = g.players.find((_, i) => i !== thrower(g))!.id
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(g)))!, watcher)
    expect(copy.order).toEqual(g.order)
    expect(copy.turn).toBe(g.turn)
    expect(copy.aim.x).toBeCloseTo(-2.5, 2)
    expect(copy.aim.angle).toBeCloseTo(-0.12, 3)
    expect(copy.rolledAt).toBe(6.5)
    expect(copy.players[1].score).toBe(11)
    expect(copy.players[0].score).toBe(null)
    expect(turnHits(copy).map((h) => h.crab)).toEqual(turnHits(g).map((h) => h.crab))
  })

  it('leaves a guest\'s own aim alone on its own turn', () => {
    const g = host(2)
    const who = thrower(g)
    const me = g.players[who].id
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(g)))!, me)
    copy.aim = { x: 4, z: 2, angle: 0.3 }
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(g)))!, me)
    expect(copy.aim).toEqual({ x: 4, z: 2, angle: 0.3 })
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
    expect(broken((m) => (m.u = 9))).toBe(null)
    expect(broken((m) => (m.m = [0, 0]))).toBe(null)
    expect(broken((m) => (m.m = [0, 0, 5000]))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][1] = 31))).toBe(null)
    expect(broken((m) => (m.p = []))).toBe(null)
  })
})

describe('what a guest sends', () => {
  it('goes there and back, and nonsense does not', () => {
    const i = { game: 3, turn: 1, aim: { x: 1.5, z: 2.5, angle: -0.25 }, rolledAt: 7.25 }
    expect(decodeIntent(relay(encodeIntent(i)))).toEqual(i)
    expect(decodeIntent(relay(encodeIntent({ ...i, rolledAt: null })))).toEqual({ ...i, rolledAt: null })
    expect(decodeIntent({ ...relay(encodeIntent(i)), m: [0, 0, 9999] })).toBe(null)
  })
})
