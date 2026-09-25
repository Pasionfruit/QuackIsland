import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardMovementSnapshot } from '../../53-board-movement'

const mocks = vi.hoisted(() => ({
  net: { id: 'a-host', room: 'ABCD', status: 'joined', host: true },
  peers: [{ id: 'b-guest', name: 'Guest' }],
  party: { phase: 'playing' },
  mode: 'island',
  settled: true,
  send: vi.fn(),
  handler: null as null | ((senderId: string, payload: unknown) => void),
  board: null as BoardMovementSnapshot | null,
}))

vi.mock('../../09-net', () => ({
  getNet: () => mocks.net,
  getPeers: () => mocks.peers,
  isHost: (id: string, ids: readonly string[]) => id === [...ids].sort()[0],
  sendToRoom: mocks.send,
  subscribeRoom: (handler: (senderId: string, payload: unknown) => void) => {
    mocks.handler = handler
    return () => { mocks.handler = null }
  },
}))

vi.mock('../../10-party', () => ({ getParty: () => mocks.party }))
vi.mock('../../13-modes', () => ({ getGameMode: () => mocks.mode }))
vi.mock('../../53-board-movement', () => ({
  getBoardMovement: () => mocks.board,
  isBoardMovementVisualSettled: () => mocks.settled,
}))

import {
  createVolcanoVictory,
  encodeVolcanoVictoryMessage,
  getVolcanoVictory,
  listenForVolcanoVictory,
  resetVolcanoVictory,
  syncVolcanoVictoryLifecycle,
} from '../index'

function wonBoard(): BoardMovementSnapshot {
  return {
    sessionId: 'board-1',
    orderSessionId: 'order-1',
    room: 'ABCD',
    seed: 1337,
    revision: 9,
    phase: 'won',
    round: 3,
    tileCount: 59,
    players: [
      { id: 'a-host', name: 'Host' },
      { id: 'b-guest', name: 'Guest' },
    ],
    turnOrder: ['a-host', 'b-guest'],
    activeTurnIndex: null,
    positions: [
      { playerId: 'a-host', tileIndex: 58 },
      { playerId: 'b-guest', tileIndex: 46 },
    ],
    moves: [],
    winnerId: 'a-host',
    appliedActionIds: ['roll-9'],
    error: null,
  }
}

let stop: (() => void) | null = null

beforeEach(() => {
  mocks.net = { id: 'a-host', room: 'ABCD', status: 'joined', host: true }
  mocks.peers = [{ id: 'b-guest', name: 'Guest' }]
  mocks.party = { phase: 'playing' }
  mocks.mode = 'island'
  mocks.settled = true
  mocks.board = wonBoard()
  mocks.send.mockReset()
  resetVolcanoVictory()
})

afterEach(() => {
  stop?.()
  stop = null
  resetVolcanoVictory()
})

describe('volcano victory coordination', () => {
  it('lets the host create and announce one settled winner', () => {
    syncVolcanoVictoryLifecycle()
    syncVolcanoVictoryLifecycle()
    expect(getVolcanoVictory()).toMatchObject({ phase: 'won', boardSessionId: 'board-1' })
    expect(mocks.send).toHaveBeenCalledOnce()
  })

  it('makes a guest request and adopt the host snapshot', () => {
    mocks.net = { id: 'b-guest', room: 'ABCD', status: 'joined', host: false }
    mocks.peers = [{ id: 'a-host', name: 'Host' }]
    stop = listenForVolcanoVictory()
    syncVolcanoVictoryLifecycle()
    expect(mocks.send).toHaveBeenCalledOnce()

    const snapshot = createVolcanoVictory(mocks.board!, true)!
    mocks.handler?.('a-host', encodeVolcanoVictoryMessage({ kind: 'snapshot', snapshot }))
    expect(getVolcanoVictory().winner?.playerId).toBe('a-host')
  })

  it('rejects a snapshot sent by a non-host peer', () => {
    mocks.net = { id: 'b-guest', room: 'ABCD', status: 'joined', host: false }
    mocks.peers = [{ id: 'a-host', name: 'Host' }]
    stop = listenForVolcanoVictory()
    const snapshot = createVolcanoVictory(mocks.board!, true)!
    mocks.handler?.('b-guest', encodeVolcanoVictoryMessage({ kind: 'snapshot', snapshot }))
    expect(getVolcanoVictory().phase).toBe('idle')
  })

  it('does not announce before the final movement visually lands', () => {
    mocks.settled = false
    syncVolcanoVictoryLifecycle()
    expect(getVolcanoVictory().phase).toBe('idle')
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
