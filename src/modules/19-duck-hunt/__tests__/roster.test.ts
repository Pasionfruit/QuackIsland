/**
 * Who is dealt into a game while in a lobby: a lobby of one, and a lobby too
 * big for eight colours.
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

import { MAX_PLAYERS, SOLO_PLAYERS, gameRoster, newGame } from '../internal/setup'

describe('the roster in a lobby', () => {
  beforeEach(() => {
    lobby.peers = []
  })

  it('is you and stand-ins when nobody else has arrived', () => {
    const roster = gameRoster()
    expect(roster).toHaveLength(SOLO_PLAYERS)
    expect(roster[0]).toEqual({ id: 'p1', bot: false })
  })

  it('is the host and then everybody else, in colour order, with no stand-ins', () => {
    lobby.peers = [
      { id: 'p2', name: 'bea', ping: null },
      { id: 'p3', name: 'cal', ping: null },
    ]
    const game = newGame()
    expect(game.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
    expect(game.players.some((p) => p.bot)).toBe(false)
  })

  it('stops at eight, because there are eight colours and eight shapes', () => {
    lobby.peers = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 2}`, name: `g${i}`, ping: null }))
    expect(gameRoster()).toHaveLength(MAX_PLAYERS)
    expect(gameRoster()[0].id).toBe('p1')
  })
})
