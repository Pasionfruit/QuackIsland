/**
 * The arena loop, against a fake room: what the host and a guest each do
 * with a frame, and the shared lessons - pause, leavers, the clock.
 */
import { describe, expect, it } from 'vitest'
import { createArenaLink, type ArenaRoom, type ArenaRules } from '../internal/arena'

interface P {
  id: string
  mine: boolean
  bot: boolean
  left: boolean
  x: number
}
interface R {
  id: number
  elapsed: number
  over: boolean
  players: P[]
}
type Move = { round: number; x: number }
type Snap = { id: number; elapsed: number; xs: [string, number][] }

const player = (id: string, mine = false, bot = false): P => ({ id, mine, bot, left: false, x: 0 })
const round = (...players: P[]): R => ({ id: 3, elapsed: 0, over: false, players })

function fakeRoom(host: boolean, peers: string[] = []) {
  const sent: Record<string, unknown>[] = []
  let now = 1000
  const room: ArenaRoom = {
    host: () => host,
    joined: () => true,
    me: () => 'me',
    peers: () => peers,
    send: (m) => sent.push(m),
    now: () => now,
  }
  return { room, sent, later: (ms: number) => (now += ms), peers }
}

const calls: string[] = []
const rules: ArenaRules<R, { dx: number }, Move, Snap, string> = {
  encodeSnapshot: (r) => ({ t: 'snap', id: r.id, elapsed: r.elapsed, xs: r.players.map((p) => [p.id, p.x]) }),
  decodeSnapshot: (raw) => (raw.t === 'snap' ? (raw as unknown as Snap) : null),
  applySnapshot: (r, s, me) => {
    r.id = s.id
    r.elapsed = s.elapsed
    r.players = s.xs.map(([id, x]) => ({ ...player(id, id === me), x }))
  },
  decodeGuest: (raw) => (raw.t === 'mv' ? { round: raw.g as number, x: raw.x as number } : null),
  reportMove: (r, mine) => ({ t: 'mv', g: r.id, x: mine.x }),
  tick: (r, dt) => {
    r.elapsed += dt
  },
  drive: (r, me, hands, _dt, authoritative, say) => {
    r.players[me].x += hands.dx
    if (!authoritative) say({ t: 'shot' })
    return authoritative ? 'host-shot' : 'guest-shot'
  },
  bots: () => calls.push('bots'),
  hear: (r, index, said, sinceLast) => {
    r.players[index].x = said.x
    calls.push(`heard ${r.players[index].id} after ${sinceLast()}`)
  },
  settle: () => calls.push('settle'),
  leave: (r, index) => {
    r.players[index].left = true
  },
  judgeEnd: () => calls.push('judge'),
}

describe('the host', () => {
  it('runs the round in order and sends it', () => {
    calls.length = 0
    const { room, sent } = fakeRoom(true, ['g'])
    const link = createArenaLink(rules, room)
    const r = round(player('me', true), player('g'), player('bot', false, true))
    link.hear('g', { t: 'mv', g: 3, x: 5 })
    link.hear('g', { t: 'mv', g: 99, x: 7 }) // an old round: ignored
    link.hear('g', { t: 'noise' })
    const step = link.advance(r, 0.5, { dx: 1 }, false)
    expect(step).toEqual({ changed: true, out: 'host-shot' })
    expect(r.players[0].x).toBe(1)
    expect(r.players[1].x).toBe(5)
    expect(calls).toEqual(['bots', 'heard g after 0.5', 'settle', 'judge'])
    expect(sent).toEqual([{ t: 'snap', id: 3, elapsed: 0.5, xs: [['me', 1], ['g', 5], ['bot', 0]] }])
  })

  it('throttles its snapshots', () => {
    const { room, sent, later } = fakeRoom(true, [])
    const link = createArenaLink(rules, room)
    const r = round(player('me', true))
    link.advance(r, 0.01, null, false)
    later(10)
    link.advance(r, 0.01, null, false)
    later(70)
    link.advance(r, 0.01, null, false)
    expect(sent).toHaveLength(2)
  })

  it('counts a guest who has left the lobby as out, but never a stand-in', () => {
    const { room } = fakeRoom(true, [])
    const r = round(player('me', true), player('gone'), player('bot', false, true))
    createArenaLink(rules, room).advance(r, 0.1, null, false)
    expect(r.players.map((p) => p.left)).toEqual([false, true, false])
  })

  it('does nothing with nobody dealt in, or while paused', () => {
    const { room, sent } = fakeRoom(true)
    const link = createArenaLink(rules, room)
    expect(link.advance(round(), 0.1, { dx: 1 }, false).changed).toBe(false)
    const r = round(player('me', true))
    expect(link.advance(r, 0.1, { dx: 1 }, true)).toEqual({ changed: false, out: null })
    expect(r.elapsed).toBe(0)
    expect(sent).toHaveLength(0)
  })
})

describe('a guest', () => {
  it('takes the host word, drives itself, says what the host must judge, and reports', () => {
    const { room, sent } = fakeRoom(false)
    const link = createArenaLink(rules, room)
    const r = round()
    expect(link.advance(r, 0.1, { dx: 1 }, false).changed).toBe(false) // nothing heard yet
    link.hear('host', { t: 'snap', id: 4, elapsed: 2, xs: [['host', 0], ['me', 3]] })
    const step = link.advance(r, 0.1, { dx: 1 }, false)
    expect(step).toEqual({ changed: true, out: 'guest-shot' })
    expect(r.id).toBe(4)
    expect(r.players[1].x).toBe(4)
    expect(sent).toEqual([{ t: 'shot' }, { t: 'mv', g: 4, x: 4 }])
  })

  it('eases its clock toward the host, and jumps when far out', () => {
    const { room, later } = fakeRoom(false)
    const link = createArenaLink(rules, room)
    const r = round()
    link.hear('host', { t: 'snap', id: 3, elapsed: 10, xs: [['me', 0]] })
    link.advance(r, 0, null, false)
    expect(r.elapsed).toBe(10)
    later(100)
    r.elapsed = 10.05
    link.advance(r, 0.05, null, false)
    // Host is at 10.1, ours ticked to 10.1: no correction needed.
    expect(r.elapsed).toBeCloseTo(10.1, 5)
    r.elapsed = 20
    link.advance(r, 0, null, false)
    expect(r.elapsed).toBeCloseTo(10.1, 5)
  })
})
