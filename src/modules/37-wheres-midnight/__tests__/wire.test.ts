/**
 * One search on the wire: the host's snapshot, a guest's click, and who is
 * dealt in.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const lobby = vi.hoisted(() => ({
  net: { status: 'joined', room: 'ABCDE', id: 'p1', peers: 0, host: true, why: null },
  peers: [] as { id: string; name: string; ping: null }[],
}))

vi.mock('../../09-net', () => ({
  getNet: () => lobby.net,
  getPeers: () => lobby.peers,
}))

import { SEARCH, createGame, select, stepGame, type Game } from '../internal/rules'
import { MAX_SEEKERS, SOLO_SEEKERS, gameRoster, newGame, waitingGame } from '../internal/setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot } from '../internal/wire'
import { toward, yardFor } from '../internal/yard'

const SEED = 5504311
const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const atHer = () => toward(yardFor(SEED).midnight.points[0])

function host(n = 3): Game {
  return createGame(
    SEED,
    Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })),
    12,
  )
}

const hear = (game: Game, copy: Game, me: string) => applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, me)

describe('a snapshot', () => {
  it('carries the seed, the clock and everybody, and says which seeker is yours', () => {
    const game = host(3)
    stepGame(game, 0.2)
    select(game, 0, atHer())
    select(game, 2, { x: 0, y: 1, z: 0 })
    const snap = decodeSnapshot(relay(encodeSnapshot(game)))!
    expect(snap.elapsed).toBeCloseTo(game.elapsed, 2)
    const copy = hear(game, waitingGame(), 'p2')

    expect(copy).toMatchObject({ id: 12, seed: SEED, over: false })
    // The clock is the one thing the snapshot does not set: a guest runs its own
    // between snapshots and eases towards the host's, which is `useSearchNet`'s job.
    expect(copy.elapsed).toBe(0)
    expect(copy.players.map((s) => [s.id, s.mine])).toEqual([
      ['p1', false],
      ['p2', true],
      ['p3', false],
    ])
    expect(copy.players[0].foundAt).toBeCloseTo(game.players[0].foundAt!, 2)
    expect(copy.players[1].foundAt).toBeNull()
    expect(copy.players[2].misses).toBe(1)
    expect(copy.players[2].cooldown).toBeCloseTo(SEARCH.cooldown, 2)
  })

  it('carries the seed on purpose: every browser has to draw the same yard', () => {
    const message = relay(encodeSnapshot(host(2)))
    expect(message.s).toBe(SEED)
    const copy = hear(host(2), waitingGame(), 'p2')
    expect(yardFor(copy.seed).midnight).toEqual(yardFor(SEED).midnight)
  })

  it('carries the last click the host took, so a guest knows its own was heard', () => {
    const game = host(3)
    select(game, 1, { x: 0, y: 1, z: 0 }, { seq: 4 })
    const copy = hear(game, waitingGame(), 'p2')
    expect(copy.players[1].seq).toBe(4)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host(3)))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'wm-in' })).toBeNull()
    expect(decodeSnapshot({ ...good, e: -0.5 })).toBeNull()
    expect(decodeSnapshot({ ...good, o: 2 })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: Array.from({ length: 9 }, () => ['x', -1, 0, 0, 0, -1]) })).toBeNull()
    const rows = good.p as unknown[][]
    const bent = (at: number, to: unknown) => ({ ...good, p: rows.map((row, j) => (j === 0 ? row.map((v, k) => (k === at ? to : v)) : row)) })
    expect(decodeSnapshot(bent(0, ''))).toBeNull()
    expect(decodeSnapshot(bent(1, -2))).toBeNull()
    expect(decodeSnapshot(bent(2, -1))).toBeNull()
    expect(decodeSnapshot(bent(3, -1))).toBeNull()
  })

  it('keeps a guest on the same seeker when a new round starts', () => {
    const first = host(3)
    const copy = hear(first, waitingGame(), 'p2')
    expect(copy.players).toHaveLength(3)
    const second = createGame(SEED + 5, [{ id: 'p2' }, { id: 'p1' }], 13)
    hear(second, copy, 'p2')
    expect(copy.id).toBe(13)
    expect(copy.seed).toBe(SEED + 5)
    expect(copy.players.map((s) => [s.id, s.mine])).toEqual([
      ['p2', true],
      ['p1', false],
    ])
  })
})

describe("a guest's click", () => {
  it('carries which round, which click, where it went and when - and comes back unit length', () => {
    const said = { game: 12, seq: 3, dir: { x: 0, y: 3, z: -4 }, at: 12.34 }
    const heard = decodeIntent(relay(encodeIntent(said)))!
    expect(heard).toMatchObject({ game: 12, seq: 3, at: 12.34 })
    expect(Math.hypot(heard.dir.x, heard.dir.y, heard.dir.z)).toBeCloseTo(1, 6)
    expect(heard.dir.y).toBeCloseTo(0.6, 3)
    expect(heard.dir.z).toBeCloseTo(-0.8, 3)
  })

  it('is refused whole rather than half-read - a client may send anything at all', () => {
    const good = relay(encodeIntent({ game: 1, seq: 1, dir: { x: 0, y: 0, z: -1 }, at: 0 }))
    expect(decodeIntent(good)).not.toBeNull()
    expect(decodeIntent({ ...good, t: 'wm' })).toBeNull()
    expect(decodeIntent({ ...good, q: 0 })).toBeNull()
    expect(decodeIntent({ ...good, a: -1 })).toBeNull()
    expect(decodeIntent({ ...good, d: [0, 0, 0] })).toBeNull()
    expect(decodeIntent({ ...good, d: [0, 0] })).toBeNull()
    expect(decodeIntent({ ...good, d: [0, 'x', 1] })).toBeNull()
  })
})

describe('the roster in a lobby', () => {
  beforeEach(() => {
    lobby.peers = []
  })

  it('is you and stand-ins when nobody else has arrived', () => {
    const roster = gameRoster()
    expect(roster).toHaveLength(SOLO_SEEKERS)
    expect(roster[0]).toEqual({ id: 'p1', bot: false })
    expect(roster.slice(1).every((r) => r.bot)).toBe(true)
  })

  it('is everybody in the lobby and no stand-ins, all looking at one yard', () => {
    lobby.peers = [
      { id: 'p2', name: 'bea', ping: null },
      { id: 'p3', name: 'cal', ping: null },
    ]
    const game = newGame()
    expect(game.players.map((s) => s.id)).toEqual(['p1', 'p2', 'p3'])
    expect(game.players.some((s) => s.bot)).toBe(false)
    expect(game.players.filter((s) => s.mine).map((s) => s.id)).toEqual(['p1'])
  })

  it('stops at eight', () => {
    lobby.peers = Array.from({ length: 11 }, (_, i) => ({ id: `p${i + 2}`, name: `g${i}`, ping: null }))
    expect(gameRoster()).toHaveLength(MAX_SEEKERS)
  })

  it('gives a guest an empty yard to hold until the host says otherwise', () => {
    const waiting = waitingGame()
    expect(waiting.players).toEqual([])
    expect(waiting.over).toBe(false)
  })
})
