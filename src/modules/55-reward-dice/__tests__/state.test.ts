import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  net: { status: 'joined', room: 'ROOM', id: 'host', peers: 1, host: true, why: '' },
  board: {
    sessionId: 'board-session', orderSessionId: 'order', room: 'ROOM', seed: 1, revision: 4,
    phase: 'round_complete', round: 1, tileCount: 120,
    players: [{ id: 'host', name: 'Host' }, { id: 'guest', name: 'Guest' }],
    turnOrder: ['host', 'guest'], activeTurnIndex: null,
    positions: [{ playerId: 'host', tileIndex: 5 }, { playerId: 'guest', tileIndex: 4 }],
    moves: [], winnerId: null, appliedActionIds: [], error: null,
  },
  minigame: {
    sessionId: 'board-session:minigame:1', boardSessionId: 'board-session', room: 'ROOM',
    seed: 2, revision: 5, boardRound: 1, phase: 'complete', minigameId: 'zombie-tag',
    players: [{ id: 'host', name: 'Host' }, { id: 'guest', name: 'Guest' }],
    practiceAttempts: 1, continueRequested: true,
    placements: [
      { playerId: 'host', name: 'Host', rank: 1 },
      { playerId: 'guest', name: 'Guest', rank: 2 },
    ],
    appliedActionIds: ['continue'], error: '',
  },
  send: vi.fn(),
  acknowledge: vi.fn(() => true),
  close: vi.fn(),
  resume: vi.fn(() => true),
  provider: null as null | ((playerId: string, board: Record<string, unknown>) => readonly unknown[]),
}))

vi.mock('../../09-net', () => ({
  getNet: () => mocks.net,
  getPeers: () => [{ id: 'guest' }],
  isHost: (id: string) => id === 'host',
  sendToRoom: mocks.send,
  subscribeRoom: () => () => undefined,
}))
vi.mock('../../10-party', () => ({ getParty: () => ({ phase: 'playing' }) }))
vi.mock('../../13-modes', () => ({ getGameMode: () => 'island' }))
vi.mock('../../15-minigames', () => ({ closeMinigames: mocks.close }))
vi.mock('../../53-board-movement', () => ({
  getBoardMovement: () => mocks.board,
  resumeBoardMovement: mocks.resume,
  setBoardDiceProvider: (provider: typeof mocks.provider) => { mocks.provider = provider },
}))
vi.mock('../../54-minigame-round', () => ({
  acknowledgeMinigameRound: mocks.acknowledge,
  getMinigameRound: () => mocks.minigame,
}))

import {
  getRewardDice,
  resetRewardDice,
  returnRewardsToBoard,
  syncRewardDiceLifecycle,
} from '../internal/state'

describe('reward dice coordination', () => {
  beforeEach(() => {
    resetRewardDice()
    mocks.net.id = 'host'
    mocks.net.host = true
    mocks.board.round = 1
    mocks.board.phase = 'round_complete'
    mocks.minigame.continueRequested = true
    mocks.send.mockClear()
    mocks.acknowledge.mockClear()
    mocks.close.mockClear()
    mocks.resume.mockClear()
    mocks.resume.mockImplementation(() => {
      mocks.board.round = 2
      mocks.board.phase = 'turn'
      return true
    })
  })

  it('creates, announces and reveals synchronized rewards', () => {
    syncRewardDiceLifecycle()
    expect(getRewardDice()).toMatchObject({
      phase: 'reveal',
      sourceBoardRound: 1,
      targetBoardRound: 2,
    })
    expect(mocks.acknowledge).toHaveBeenCalledWith('board-session:minigame:1')
    expect(mocks.close).toHaveBeenCalledOnce()
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.provider).not.toBeNull()
    expect(mocks.provider?.('host', mocks.board)).toEqual([
      { kind: 'base', sides: 6 },
    ])
    mocks.board.round = 2
    expect(mocks.provider?.('host', mocks.board)).toEqual([
      { kind: 'base', sides: 6 },
      { kind: 'gold', sides: 6 },
    ])
  })

  it('returns the party to the exact next board round once', () => {
    syncRewardDiceLifecycle()
    expect(returnRewardsToBoard()).toBe(true)
    expect(mocks.resume).toHaveBeenCalledWith('board-session', 1)
    expect(getRewardDice().phase).toBe('returned')
    expect(returnRewardsToBoard()).toBe(false)
    expect(mocks.resume).toHaveBeenCalledOnce()
  })

  it('does not let a guest create rewards or return the board', () => {
    mocks.net.id = 'guest'
    mocks.net.host = false
    syncRewardDiceLifecycle()
    expect(getRewardDice().phase).toBe('idle')
    expect(returnRewardsToBoard()).toBe(false)
    expect(mocks.resume).not.toHaveBeenCalled()
  })

  it('waits for the host Continue handoff', () => {
    mocks.minigame.continueRequested = false
    syncRewardDiceLifecycle()
    expect(getRewardDice().phase).toBe('idle')
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
