/**
 * The roster, the one-vs-all deal, and the wire base.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const lobby = vi.hoisted(() => ({
  net: { status: 'joined', room: 'ROOM', id: 'p1' as string | null, host: true },
  peers: [] as { id: string }[],
  chosen: null as string | null,
}))

vi.mock('../../09-net', () => ({
  getNet: () => lobby.net,
  getPeers: () => lobby.peers,
}))

vi.mock('../../15-minigames', () => ({
  getTheOne: () => lobby.chosen,
}))

import {
  MAX_PLAYERS,
  ME,
  castOneVsAll,
  cs,
  decodeClaim,
  decodeHeader,
  decodePose,
  encodeClaim,
  encodeHeader,
  encodePose,
  entrantsOf,
  lobbyRoster,
  mergePlayers,
  myId,
  oneVsAllProblems,
  oneVsAllSetup,
  playerRows,
  resolveTheOne,
  seedDealer,
  sides,
} from '..'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

beforeEach(() => {
  lobby.net = { status: 'joined', room: 'ROOM', id: 'p1', host: true }
  lobby.peers = []
  lobby.chosen = null
})

describe('the roster', () => {
  const rule = { solo: 4, standIn: (seat: number) => `bot ${seat}` }

  it('is you and stand-ins, numbered from seat 2, when the lobby is only you', () => {
    expect(lobbyRoster(rule)).toEqual([
      { id: 'p1', bot: false },
      { id: 'bot 2', bot: true },
      { id: 'bot 3', bot: true },
      { id: 'bot 4', bot: true },
    ])
  })

  it('is the lobby, you first, capped, and no stand-ins', () => {
    lobby.peers = Array.from({ length: 10 }, (_, i) => ({ id: `g${i}` }))
    const roster = lobbyRoster(rule)
    expect(roster).toHaveLength(MAX_PLAYERS)
    expect(roster[0]).toEqual({ id: 'p1', bot: false })
    expect(roster.every((s) => !s.bot)).toBe(true)
    expect(lobbyRoster({ ...rule, max: 3 })).toHaveLength(3)
  })

  it('is you as ME, offline', () => {
    lobby.net = { status: 'offline', room: 'ROOM', id: null, host: true }
    expect(myId()).toBe(ME)
    expect(lobbyRoster(rule)[0].id).toBe(ME)
  })

  it('marks which entrant is yours', () => {
    expect(entrantsOf([{ id: 'a', bot: false }, { id: 'b', bot: true }], 'b')).toEqual([
      { id: 'a', bot: false, mine: false },
      { id: 'b', bot: true, mine: true },
    ])
  })

  it('deals a different seed every time, and differently per game', () => {
    const a = seedDealer('game-a')
    const b = seedDealer('game-b')
    expect(a()).not.toBe(a())
    expect(a()).not.toBe(b())
  })
})

describe('the one-vs-all deal', () => {
  it('honours the pick, refuses a stand-in, and falls back to the first human', () => {
    const roster = [
      { id: 'bot', bot: true },
      { id: 'a', bot: false },
      { id: 'b', bot: false },
    ]
    expect(resolveTheOne(roster, 'b')).toBe('b')
    expect(resolveTheOne(roster, 'bot')).toBe('a')
    expect(resolveTheOne(roster, 'ghost')).toBe('a')
    expect(resolveTheOne(roster, null)).toBe('a')
    expect(resolveTheOne([], 'a')).toBe('')
  })

  it('splits the 1 from the rest, in roster order', () => {
    const { oneId, rest } = castOneVsAll([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'b')
    expect(oneId).toBe('b')
    expect(rest.map((e) => e.id)).toEqual(['a', 'c'])
  })

  // A toy game built the way a real one is, so the self-check is checked too.
  interface Toy {
    over: boolean
    winner: 'one' | 'rest' | null
    oneId: string
    players: { id: string; bot: boolean }[]
  }
  const toy = oneVsAllSetup<Toy>({
    game: 'toy',
    solo: 3,
    standIn: (seat) => `stand-in ${seat}`,
    createRound: (_seed, entrants, chosen) => {
      const { oneId } = castOneVsAll(entrants, chosen)
      return { over: entrants.length === 0, winner: entrants.length === 0 ? 'one' : null, oneId, players: [...entrants] }
    },
  })
  const oneOf = (r: Toy) => r.players.find((p) => p.id === r.oneId)

  it('is sound for a game built on it', () => {
    expect(oneVsAllProblems(toy, oneOf, (r) => r.players)).toEqual([])
  })

  it('holds a waiting round that never reads as over, though an empty real one would', () => {
    expect(toy.waitingRound()).toMatchObject({ over: false, winner: null, players: [] })
  })

  it('reads the host pick by default', () => {
    lobby.peers = [{ id: 'p2' }, { id: 'p3' }]
    lobby.chosen = 'p3'
    expect(toy.newRound().oneId).toBe('p3')
  })

  it('catches a game that skips the base case', () => {
    const naive = { ...toy, waitingRound: () => ({ over: true, winner: 'one' as const, oneId: '', players: [] }) }
    expect(oneVsAllProblems(naive, oneOf, (r) => r.players)).toEqual(['the waiting round reads as over', 'the waiting round has a winner'])
  })
})

describe('the wire base', () => {
  it('clamps centiseconds, so "never" goes over as 0', () => {
    expect(cs(-Infinity)).toBe(0)
    expect(cs(1.234)).toBe(123)
    expect(cs(1e9)).toBe(10000000)
  })

  it('round-trips a pose, and refuses one out of bounds or of another game', () => {
    const bounds = { reachX: 10, reachZ: 10, pitchLimit: 1 }
    const sent = relay(encodePose('g-mv', 7, { x: 1.23456, z: -2, yaw: 3, pitch: 0.5 }, { s: 1 }))
    expect(decodePose(sent, 'g-mv', bounds)).toEqual({ round: 7, x: 1.235, z: -2, yaw: 3, pitch: 0.5 })
    expect(sent.s).toBe(1)
    expect(decodePose(sent, 'other', bounds)).toBeNull()
    expect(decodePose({ ...sent, x: 11 }, 'g-mv', bounds)).toBeNull()
    expect(decodePose({ ...sent, p: 2 }, 'g-mv', bounds)).toBeNull()
  })

  it('round-trips a claim, with or without a victim', () => {
    const anywhere = () => true
    expect(decodeClaim(relay(encodeClaim('g-sh', 2, { x: 1, z: 2, yaw: 3, pitch: 0, victim: 'v' })), 'g-sh', 1, anywhere)).toEqual({
      round: 2,
      x: 1,
      z: 2,
      yaw: 3,
      pitch: 0,
      victim: 'v',
    })
    expect(decodeClaim(relay(encodeClaim('g-sh', 2, { x: 1, z: 2, yaw: 3, pitch: 0, victim: null })), 'g-sh', 1, anywhere)!.victim).toBeNull()
    expect(decodeClaim(relay(encodeClaim('g-sh', 2, { x: 1, z: 2, yaw: 3, pitch: 0, victim: null })), 'g-sh', 1, () => false)).toBeNull()
  })

  it('round-trips a one-vs-all header', () => {
    const roles = sides('one', 'rest')
    const sent = relay(encodeHeader('g', { id: 4, seed: 9, elapsed: 1.239, winner: 'rest', over: true }, 'p1', roles))
    expect(decodeHeader(sent, 'g', roles)).toEqual({ id: 4, seed: 9, oneId: 'p1', elapsed: 1.24, winner: 'rest', over: true })
    expect(decodeHeader({ ...sent, o1: '' }, 'g', roles)).toBeNull()
    expect(decodeHeader({ ...sent, w: 3 }, 'g', roles)).toBeNull()
  })

  it('accepts only well-formed player rows', () => {
    expect(playerRows([['a', 1]], 2)).toEqual([['a', 1]])
    expect(playerRows([], 2)).toBeNull()
    expect(playerRows([['a', 1, 2]], 2)).toBeNull()
    expect(playerRows([['', 1]], 2)).toBeNull()
    expect(playerRows(Array.from({ length: 9 }, () => ['a', 1]), 2)).toBeNull()
  })

  it('keeps your own body yours mid-round, and takes the host word for it once over', () => {
    type Body = { id: string; mine: boolean; x: number; hp: number }
    const parts = {
      create: ([id, x, hp]: readonly [string, number, number]): Body => ({ id, mine: false, x, hp }),
      shared: ([, , hp]: readonly [string, number, number]) => ({ hp }),
      owned: ([, x]: readonly [string, number, number]) => ({ x }),
    }
    const mine: Body = { id: 'me', mine: true, x: 5, hp: 3 }
    const rows: [string, number, number][] = [['me', 0, 2], ['them', 9, 1]]
    const merged = mergePlayers([mine], rows, 'me', false, parts)
    expect(merged).toEqual([
      { id: 'me', mine: true, x: 5, hp: 2 },
      { id: 'them', mine: false, x: 9, hp: 1 },
    ])
    expect(mergePlayers(merged, rows, 'me', true, parts)[0].x).toBe(0)
  })
})
