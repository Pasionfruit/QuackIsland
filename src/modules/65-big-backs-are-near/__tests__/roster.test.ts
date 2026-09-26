/**
 * Who is dealt into the maze, and who is the Hunter.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const lobby = vi.hoisted(() => ({
  net: { status: 'joined', room: 'ABCDE', id: 'p1', peers: 0, host: true, why: null },
  peers: [] as { id: string; name: string; ping: null }[],
  chosen: null as string | null,
}))

vi.mock('../../09-net', () => ({
  getNet: () => lobby.net,
  getPeers: () => lobby.peers,
}))

vi.mock('../../15-minigames', () => ({
  getTheOne: () => lobby.chosen,
}))

import { hunterOf } from '../internal/rules'
import { MAX_PLAYERS, SOLO_PLAYERS, newRound, gameRoster } from '../internal/setup'

describe('the roster in a lobby', () => {
  beforeEach(() => {
    lobby.peers = []
    lobby.chosen = null
  })

  it('is you and hider stand-ins when nobody else has arrived, and you are the Hunter', () => {
    const roster = gameRoster()
    expect(roster).toHaveLength(SOLO_PLAYERS)
    expect(roster[0]).toEqual({ id: 'p1', bot: false })
    expect(roster.slice(1).every((r) => r.bot)).toBe(true)
    const round = newRound()
    expect(hunterOf(round)!.id).toBe('p1')
    expect(hunterOf(round)!.bot).toBe(false)
    expect(round.players.filter((p) => p.role === 'hider').every((p) => p.bot)).toBe(true)
  })

  it('is the host and everybody else, with no stand-ins, once the lobby has arrived', () => {
    lobby.peers = [{ id: 'p2', name: 'bea', ping: null }]
    const round = newRound()
    expect(round.players.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(round.players.some((p) => p.bot)).toBe(false)
  })

  it('stops at eight', () => {
    lobby.peers = Array.from({ length: 11 }, (_, i) => ({ id: `p${i + 2}`, name: `g${i}`, ping: null }))
    expect(gameRoster()).toHaveLength(MAX_PLAYERS)
  })

  it('makes whoever the host chose the Hunter, once they are actually in the lobby', () => {
    lobby.peers = [
      { id: 'p2', name: 'bea', ping: null },
      { id: 'p3', name: 'cal', ping: null },
    ]
    lobby.chosen = 'p3'
    const round = newRound()
    expect(round.hunterId).toBe('p3')
    expect(hunterOf(round)!.id).toBe('p3')
  })

  it('falls back to the roster first if the choice is nobody in the lobby', () => {
    lobby.peers = [{ id: 'p2', name: 'bea', ping: null }]
    lobby.chosen = 'somebody-who-left'
    const round = newRound()
    expect(round.hunterId).toBe('p1')
  })

  it('a stand-in is never the Hunter, whatever the roster looks like', () => {
    const round = newRound()
    expect(round.players.filter((p) => p.bot).every((p) => p.role === 'hider')).toBe(true)
  })
})
