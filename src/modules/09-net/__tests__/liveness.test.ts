/**
 * Who is still in the lobby, and so who is host.
 *
 * A peer is dropped when nothing has been heard from them for `NET.timeout`,
 * and the host is the lowest id of whoever is left - so being dropped wrongly
 * does not just hide a body, it hands somebody else the round. Found with
 * eight tabs open: a tab too busy to draw sent no ducks, was dropped, and a
 * guest promoted itself mid-game.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NET } from '../internal/protocol'
import { getNet, getPeers, joinLobby, leaveLobby, sweep } from '../internal/client'

class FakeSocket {
  static OPEN = 1
  static last: FakeSocket | null = null
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    FakeSocket.last = this
  }
  send() {}
  close() {}
  hear(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

let clock = 100_000
const seconds = () => clock / 1000

describe('staying in the lobby', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    // Joined as p2, into a room p1 is already in: p1 hosts.
    joinLobby('ABCDE', 'bea')
    const socket = FakeSocket.last!
    socket.readyState = FakeSocket.OPEN
    socket.onopen?.()
    socket.hear({ t: 'joined', id: 'p2', room: 'ABCDE', peers: ['p1'] })
  })

  afterEach(() => {
    leaveLobby()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('does not drop somebody the relay has only just announced', () => {
    // A sweep a frame after joining, long before any duck could arrive.
    clock += 16
    sweep(seconds())
    expect(getPeers().map((p) => p.id)).toEqual(['p1'])
    expect(getNet().host).toBe(false)
  })

  it('keeps somebody who sends no ducks but is still talking', () => {
    // p1 is not drawing - no ducks at all - but its pings keep coming.
    for (let t = 0; t < 30; t += 2) {
      clock += 2000
      FakeSocket.last!.hear({ t: 'ping', n: t, from: 'p1' })
      sweep(seconds())
    }
    expect(getPeers().map((p) => p.id)).toEqual(['p1'])
    expect(getNet().host).toBe(false)
  })

  it('still drops somebody who has gone quiet, and takes over as host', () => {
    clock += (NET.timeout + 1) * 1000
    sweep(seconds())
    expect(getPeers()).toEqual([])
    expect(getNet().host).toBe(true)
  })
})
