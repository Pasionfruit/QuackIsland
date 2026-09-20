/**
 * One game on the wire.
 */
import { describe, expect, it } from 'vitest'
import { scheduleFor } from '../internal/nest'
import { createGame, stepGame, stop, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

function host(n = 3): Game {
  return createGame(5151, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 12)
}

describe('a snapshot', () => {
  it('carries everybody, the stops and the round, and marks only our own', () => {
    const g = host(3)
    const r1 = scheduleFor(g.seed)[0]
    g.players[0].toward = 1
    while (g.elapsed < r1.creep + 1) stepGame(g, 1 / 30)
    stop(g, 0)
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(g)))!, 'p2')
    expect(copy.players.map((p) => [p.id, p.mine])).toEqual([
      ['p1', false],
      ['p2', true],
      ['p3', false],
    ])
    expect(copy.players[0].x).toBeCloseTo(g.players[0].x, 2)
    expect(copy.players[0].stoppedAt).toBeCloseTo(g.players[0].stoppedAt!, 2)
    expect(copy.players[1].stoppedAt).toBe(null)
    expect(copy).toMatchObject({ seed: g.seed, round: 1, judged: 0 })
  })

  it('carries who the spider took, how, and when', () => {
    const g = host(3)
    const r1 = scheduleFor(g.seed)[0]
    while (g.elapsed < r1.creep + 0.5) stepGame(g, 1 / 30)
    stop(g, 0)
    stop(g, 1)
    while (g.elapsed < r1.judged + 0.2) stepGame(g, 1 / 30)
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(g)))!, 'p3')
    expect(copy.players[2]).toMatchObject({ out: 1, how: 'eaten' })
    expect(copy.players[2].outAt).toBeCloseTo(r1.judged, 6)
    expect(copy.judged).toBe(1)
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
    expect(broken((m) => (m.r = 0))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][1] = 1e7))).toBe(null)
    expect(broken((m) => ((m.p as unknown[][])[0][4] = 2))).toBe(null)
    expect(broken((m) => (m.p as unknown[][])[0].pop())).toBe(null)
    expect(broken((m) => (m.p = []))).toBe(null)
  })
})

describe('what a guest sends', () => {
  it('goes there and back with or without a click, and nonsense does not', () => {
    const walking = { game: 3, toward: 1, around: -0.5, stop: null }
    expect(decodeIntent(relay(encodeIntent(walking)))).toEqual(walking)
    const clicked = { game: 3, toward: 0, around: 0, stop: { at: 12.34, round: 2 } }
    expect(decodeIntent(relay(encodeIntent(clicked)))).toEqual(clicked)
    expect(decodeIntent({ ...relay(encodeIntent(walking)), f: 3 })).toBe(null)
    expect(decodeIntent({ ...relay(encodeIntent(clicked)), r: 0 })).toBe(null)
  })
})
