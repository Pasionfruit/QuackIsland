/**
 * Who the host deals into a round, while in a lobby.
 *
 * The lobby is stood in for here, because the thing worth pinning down is the
 * edge nobody tries with two browsers open: making a lobby and starting a
 * round before anybody else has arrived.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const lobby = vi.hoisted(() => ({
  net: { status: 'joined', room: 'ABCD', id: 'p1', peers: 0, host: true, why: null },
  peers: [] as { id: string; name: string; ping: null }[],
}))

vi.mock('../../09-net', () => ({
  getNet: () => lobby.net,
  getPeers: () => lobby.peers,
}))

import { SOLO_RUNNERS, lobbyRoster, newRound } from '../internal/setup'

describe('the roster in a lobby', () => {
  beforeEach(() => {
    lobby.peers = []
  })

  it('is solo when you are the only one in it, not a round that is already over', () => {
    expect(lobbyRoster()).toHaveLength(SOLO_RUNNERS)
    expect(lobbyRoster()[0]).toBe('p1')
    const round = newRound()
    expect(round.over).toBe(false)
    expect(round.bodies.find((b) => b.mine)?.id).toBe('p1')
  })

  it('is the host and then everybody else, with no stand-ins', () => {
    lobby.peers = [
      { id: 'p2', name: 'bea', ping: null },
      { id: 'p10', name: 'cal', ping: null },
    ]
    expect(lobbyRoster()).toEqual(['p1', 'p2', 'p10'])
    const round = newRound()
    expect(round.bodies.filter((b) => b.side === 'player').map((b) => b.id)).toEqual([
      'p1',
      'p2',
      'p10',
    ])
  })
})
