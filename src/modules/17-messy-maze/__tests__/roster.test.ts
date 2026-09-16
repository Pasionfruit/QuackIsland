/**
 * Who is dealt into a race while in a lobby.
 *
 * The lobby is stood in for, because the edge worth pinning down is the one
 * nobody tries with two browsers open: making a lobby and racing before
 * anybody else has arrived.
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

import { SOLO_RACERS, newRace, raceRoster } from '../internal/setup'

describe('the roster in a lobby', () => {
  beforeEach(() => {
    lobby.peers = []
  })

  it('is you and stand-ins when nobody else has arrived', () => {
    const roster = raceRoster()
    expect(roster).toHaveLength(SOLO_RACERS)
    expect(roster[0]).toEqual({ id: 'p1', bot: false })
    expect(newRace().racers.find((r) => r.mine)?.id).toBe('p1')
  })

  it('is the host and then everybody else, with no stand-ins', () => {
    lobby.peers = [
      { id: 'p2', name: 'bea', ping: null },
      { id: 'p10', name: 'cal', ping: null },
    ]
    expect(raceRoster()).toEqual([
      { id: 'p1', bot: false },
      { id: 'p2', bot: false },
      { id: 'p10', bot: false },
    ])
    const race = newRace()
    expect(race.racers.map((r) => r.id)).toEqual(['p1', 'p2', 'p10'])
    expect(race.racers.some((r) => r.bot)).toBe(false)
  })
})
