/**
 * Changing your name while you are in a lobby.
 *
 * There is no rename message: the name rides on every duck update. So what is
 * worth checking is the real client, end to end against a stand-in socket -
 * that the name leaving the browser is the new one, straight away and on every
 * send after, without leaving the lobby to get it there.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyName, getNet, joinLobby, leaveLobby, publish, renameSelf } from '../internal/client'

class FakeSocket {
  static OPEN = 1
  static last: FakeSocket | null = null
  readyState = 0
  sent: Record<string, unknown>[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor() {
    FakeSocket.last = this
  }

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }

  close() {}

  /** Opens, and has the relay put you in a room with somebody already in it. */
  arrive() {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
    this.onmessage?.({ data: JSON.stringify({ t: 'joined', id: 'p2', room: 'ABCDE', peers: ['p1'] }) })
  }

  ducks() {
    return this.sent.filter((m) => m.t === 'duck')
  }
}

const duck = { x: 1, y: 2, z: 3, facing: 0, lean: 0, swimming: false, speed: 0 }

describe('renaming in a lobby', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeSocket)
  })

  afterEach(() => {
    leaveLobby()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('sends the new name at once, without leaving the lobby', () => {
    joinLobby('ABCDE', 'abe')
    const socket = FakeSocket.last!
    socket.arrive()
    publish(duck)

    expect(renameSelf('bea')).toBe('bea')
    expect(getMyName()).toBe('bea')
    expect(socket.ducks().slice(-1)[0]?.name).toBe('bea')
    // Still the same connection, still in the room.
    expect(FakeSocket.last).toBe(socket)
    expect(getNet().status).toBe('joined')
    expect(socket.sent.filter((m) => m.t === 'join')).toHaveLength(1)
  })

  it('keeps sending the new name on every update after', () => {
    joinLobby('ABCDE', 'abe')
    const socket = FakeSocket.last!
    socket.arrive()
    publish(duck)
    renameSelf('bea')

    socket.sent = []
    vi.advanceTimersByTime(1000)
    const ducks = socket.ducks()
    expect(ducks.length).toBeGreaterThan(5)
    expect(ducks.every((m) => m.name === 'bea')).toBe(true)
  })

  it('cleans the name the same way joining does', () => {
    expect(renameSelf('   ')).toBe('duck')
    expect(renameSelf('x'.repeat(40))).toHaveLength(16)
  })
})
