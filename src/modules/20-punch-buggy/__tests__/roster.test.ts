/**
 * Who is dealt onto the platform while in a lobby.
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

import { MAX_FIGHTERS, SOLO_FIGHTERS, newRound, roundRoster } from '../internal/setup'

describe('the roster in a lobby', () => {
  beforeEach(() => {
    lobby.peers = []
  })

  it('is you and stand-ins when nobody else has arrived', () => {
    const roster = roundRoster()
    expect(roster).toHaveLength(SOLO_FIGHTERS)
    expect(roster[0]).toEqual({ id: 'p1', bot: false })
    expect(roster.slice(1).every((r) => r.bot)).toBe(true)
  })

  it('is the host and everybody else, with no stand-ins', () => {
    lobby.peers = [{ id: 'p2', name: 'bea', ping: null }]
    const round = newRound()
    expect(round.fighters.map((f) => f.id)).toEqual(['p1', 'p2'])
    expect(round.fighters.some((f) => f.bot)).toBe(false)
  })

  it('stops at eight', () => {
    lobby.peers = Array.from({ length: 11 }, (_, i) => ({ id: `p${i + 2}`, name: `g${i}`, ping: null }))
    expect(roundRoster()).toHaveLength(MAX_FIGHTERS)
  })
})
