/**
 * One game, on the wire - and what must never be on it.
 *
 * The seed decides which paths hold, so the first thing checked here is that
 * no snapshot ever carries it, nor the answer before the reveal.
 */
import { describe, expect, it } from 'vitest'
import { choose, confirm, createGame, stepGame, type Game } from '../internal/game'
import { waitingGame } from '../internal/setup'
import {
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
} from '../internal/wire'

const SEED = 987654321
const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

function host(): Game {
  return createGame(SEED, ['p1', 'p2', 'p3'].map((id) => ({ id })), 4242)
}

describe('what a snapshot never says', () => {
  it('never carries the seed', () => {
    const g = host()
    for (let i = 0; i < 400 && g.phase !== 'over'; i++) {
      const text = JSON.stringify(encodeSnapshot(g))
      expect(text).not.toContain(String(SEED))
      stepGame(g, 0.1)
    }
  })

  it('never says which paths hold before the reveal', () => {
    const g = host()
    while (g.phase === 'choosing') {
      expect(decodeSnapshot(relay(encodeSnapshot(g)))!.safe).toEqual([])
      stepGame(g, 0.1)
    }
    expect(decodeSnapshot(relay(encodeSnapshot(g)))!.safe).toEqual(g.safe)
  })
})

describe('a snapshot', () => {
  it('comes back as the game that went out', () => {
    const g = host()
    choose(g, 'p1', 0)
    confirm(g, 'p1')
    choose(g, 'p3', 2)
    while (g.phase === 'choosing') stepGame(g, 0.1)

    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(g)))!, 'p2')
    expect(copy.id).toBe(g.id)
    expect(copy.round).toBe(g.round)
    expect(copy.phase).toBe(g.phase)
    expect(copy.clock).toBeCloseTo(g.clock, 1)
    expect(copy.safe).toEqual(g.safe)
    expect(copy.players.map((p) => [p.id, p.pick, p.alive, p.outIn])).toEqual(
      g.players.map((p) => [p.id, p.pick, p.alive, p.outIn]),
    )
    expect(copy.players.filter((p) => p.mine).map((p) => p.id)).toEqual(['p2'])
    expect(copy.seed).toBe(0)
  })

  it('updates the players a guest already has rather than making new ones', () => {
    const g = host()
    const copy = applySnapshot(waitingGame(), decodeSnapshot(encodeSnapshot(g))!, 'p2')
    const before = [...copy.players]
    choose(g, 'p1', 2)
    applySnapshot(copy, decodeSnapshot(encodeSnapshot(g))!, 'p2')
    copy.players.forEach((p, i) => expect(p).toBe(before[i]))
    expect(copy.players[0].pick).toBe(2)
  })

  it('deals a guest into a new game when the id changes', () => {
    const copy = applySnapshot(waitingGame(), decodeSnapshot(encodeSnapshot(host()))!, 'p2')
    copy.players[0].alive = false
    const next = createGame(1, ['p1', 'p2'].map((id) => ({ id })), 5555)
    applySnapshot(copy, decodeSnapshot(encodeSnapshot(next))!, 'p2')
    expect(copy.id).toBe(5555)
    expect(copy.players.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(copy.players.every((p) => p.alive)).toBe(true)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    const players = good.p as unknown[][]
    const withPlayer = (i: number, v: unknown) => ({ ...good, p: [players[0].map((x, j) => (j === i ? v : x))] })
    expect(decodeSnapshot({ ...good, t: 'mm' })).toBeNull()
    expect(decodeSnapshot({ ...good, r: 6 })).toBeNull()
    expect(decodeSnapshot({ ...good, h: 3 })).toBeNull()
    expect(decodeSnapshot({ ...good, k: -1 })).toBeNull()
    expect(decodeSnapshot({ ...good, s: [3] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot(withPlayer(1, 3))).toBeNull()
    expect(decodeSnapshot(withPlayer(2, true))).toBeNull()
    expect(decodeSnapshot(withPlayer(4, 9))).toBeNull()
    expect(decodeSnapshot(withPlayer(0, ''))).toBeNull()
  })

  it('fits in a relay message with a full lobby in it', () => {
    const full = createGame(SEED, Array.from({ length: 16 }, (_, i) => ({ id: `p${i + 1}` })))
    expect(JSON.stringify(encodeSnapshot(full)).length).toBeLessThan(4096)
  })
})

describe('a wish', () => {
  it('comes back as what was wanted', () => {
    const wish = { round: 3, pick: 2, confirmed: true }
    expect(decodeIntent(relay(encodeIntent(wish)))).toEqual(wish)
  })

  it('is refused when it is not one', () => {
    expect(decodeIntent({ t: 'ps-in', r: 0, p: 3, c: 0 })).toBeNull()
    expect(decodeIntent({ t: 'ps-in', r: 7, p: 0, c: 0 })).toBeNull()
    expect(decodeIntent({ t: 'ps-in', r: 0, p: 1, c: 2 })).toBeNull()
    expect(decodeIntent({ t: 'mm-in', r: 0, p: 1, c: 0 })).toBeNull()
  })
})
