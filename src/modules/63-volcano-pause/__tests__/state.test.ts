import { beforeEach, describe, expect, it, vi } from 'vitest'

const net = vi.hoisted(() => ({
  current: { status: 'joined', id: 'guest', host: false },
  sent: [] as Record<string, unknown>[],
}))

vi.mock('../../09-net', () => ({
  getMyName: () => 'Bea',
  getNet: () => net.current,
  getPeers: () => [{ id: 'host', name: 'Ali', ping: null }],
  isHost: (id: string, others: readonly string[]) => others.every((other) => id < other),
  sendToRoom: (message: Record<string, unknown>) => net.sent.push(message),
  subscribeRoom: () => () => undefined,
}))

import { clearVolcanoPause, getVolcanoPause, pauseVolcanoGame } from '../internal/state'

describe('Volcano party pause state', () => {
  beforeEach(() => {
    net.current = { status: 'joined', id: 'guest', host: false }
    net.sent = []
    clearVolcanoPause()
  })

  it('lets a guest pause and identifies them in the shared message', () => {
    pauseVolcanoGame()
    expect(getVolcanoPause()).toEqual({ paused: true, pausedBy: { id: 'guest', name: 'Bea' } })
    expect(net.sent).toEqual([{ t: 'volcano-pause', a: 'pause', i: 'guest', n: 'Bea' }])
  })
})
