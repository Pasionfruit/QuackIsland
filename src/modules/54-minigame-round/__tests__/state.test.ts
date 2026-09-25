import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  net: { status: 'joined', room: 'ROOM', id: 'host', peers: 1, host: true, why: '' },
  board: {
    sessionId: 'board-session',
    orderSessionId: 'order-session',
    room: 'ROOM',
    seed: 1337,
    revision: 3,
    phase: 'round_complete',
    round: 1,
    tileCount: 120,
    players: [
      { id: 'host', name: 'Host' },
      { id: 'guest', name: 'Guest' },
    ],
    turnOrder: ['host', 'guest'],
    activeTurnIndex: 2,
    positions: [
      { playerId: 'host', tileIndex: 3 },
      { playerId: 'guest', tileIndex: 4 },
    ],
    moves: [],
    winnerId: '',
    appliedActionIds: [],
    error: '',
  },
  screen: { at: 'game', run: { id: 'zombie-tag', phase: 'briefing' } } as Record<string, unknown>,
  send: vi.fn(),
  acknowledgeBoard: vi.fn(() => true),
  visualSettled: true,
  open: vi.fn(),
  play: vi.fn(),
  listener: null as null | ((senderId: string, payload: unknown) => void),
}))

vi.mock('../../09-net', () => ({
  getNet: () => mocks.net,
  getPeers: () => [{ id: 'guest', name: 'Guest', colour: '#fff', ping: 1 }],
  isHost: (id: string) => id === 'host',
  sendToRoom: mocks.send,
  subscribeRoom: (listener: (senderId: string, payload: unknown) => void) => {
    mocks.listener = listener
    return () => {
      mocks.listener = null
    }
  },
}))

vi.mock('../../10-party', () => ({ getParty: () => ({ phase: 'playing' }) }))
vi.mock('../../13-modes', () => ({ getGameMode: () => 'island' }))
vi.mock('../../53-board-movement', () => ({
  acknowledgeBoardRound: mocks.acknowledgeBoard,
  getBoardMovement: () => mocks.board,
  isBoardMovementVisualSettled: () => mocks.visualSettled,
}))
vi.mock('../../15-minigames', () => ({
  builtMinigames: () => ['zombie-tag'],
  getMinigameScreen: () => mocks.screen,
  isMinigameId: (value: unknown) => value === 'zombie-tag',
  minigameById: () => ({ id: 'zombie-tag', kind: 'free-for-all', reserved: false }),
  minigamesOfKind: () => [{ id: 'zombie-tag', kind: 'free-for-all', reserved: false }],
  openMinigame: mocks.open,
  playMinigame: mocks.play,
  rankStandings: (standings: Array<{ id: string; place: number }>) => {
    const sorted = [...standings].sort((a, b) => a.place - b.place)
    const allTied = sorted.length > 1 && sorted.every((standing) => standing.place === sorted[0].place)
    return {
      allTied,
      placed: sorted.map((standing, index) => ({ ...standing, rank: index + 1 })),
    }
  },
}))

import {
  acknowledgeMinigameRound,
  continueToMinigameRewards,
  getMinigameRound,
  listenForMinigameRound,
  markMinigameRoundReady,
  recordFinalMinigame,
  resetMinigameRound,
  startFinalMinigame,
  startMinigamePractice,
  syncMinigameRoundLifecycle,
  isMinigameRoundReadyToStart,
} from '../internal/state'
import { encodeMinigameRoundReady } from '../internal/readiness'

describe('host minigame-round coordination', () => {
  beforeEach(() => {
    resetMinigameRound()
    mocks.net.id = 'host'
    mocks.net.host = true
    mocks.visualSettled = true
    mocks.screen = { at: 'game', run: { id: 'zombie-tag', phase: 'briefing' } }
    mocks.send.mockClear()
    mocks.acknowledgeBoard.mockClear()
    mocks.open.mockClear()
    mocks.play.mockClear()
  })

  it('consumes one completed board round and announces a briefing', () => {
    syncMinigameRoundLifecycle()
    expect(getMinigameRound()).toMatchObject({
      phase: 'briefing',
      boardSessionId: 'board-session',
      minigameId: 'zombie-tag',
    })
    expect(mocks.acknowledgeBoard).toHaveBeenCalledWith('board-session', 1)
    expect(mocks.send).toHaveBeenCalledOnce()
  })

  it('waits for the final board movement to visibly settle', () => {
    mocks.visualSettled = false
    syncMinigameRoundLifecycle()
    expect(getMinigameRound().phase).toBe('idle')
    expect(mocks.acknowledgeBoard).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()

    mocks.visualSettled = true
    syncMinigameRoundLifecycle()
    expect(getMinigameRound().phase).toBe('briefing')
    expect(mocks.acknowledgeBoard).toHaveBeenCalledWith('board-session', 1)
  })

  it('runs practices, locks the final, and records host standings', () => {
    syncMinigameRoundLifecycle()
    expect(startMinigamePractice()).toBe(false)
    expect(markMinigameRoundReady()).toBe(true)
    const stop = listenForMinigameRound()
    mocks.listener?.('guest', encodeMinigameRoundReady(getMinigameRound().sessionId, 1))
    expect(isMinigameRoundReadyToStart()).toBe(true)
    expect(startMinigamePractice()).toBe(true)
    expect(getMinigameRound()).toMatchObject({ phase: 'practice', practiceAttempts: 1 })
    expect(mocks.play).toHaveBeenCalledOnce()

    mocks.screen = { at: 'game', run: { id: 'zombie-tag', phase: 'over' } }
    expect(startFinalMinigame()).toBe(true)
    expect(getMinigameRound().phase).toBe('final')
    expect(mocks.open).toHaveBeenCalledWith('zombie-tag')
    expect(startMinigamePractice()).toBe(false)

    expect(
      recordFinalMinigame([
        { id: 'guest', place: 1, name: 'Guest', colour: '#fff', mine: false },
        { id: 'host', place: 2, name: 'Host', colour: '#fff', mine: true },
      ]),
    ).toBe(true)
    const complete = getMinigameRound()
    expect(complete.phase).toBe('complete')
    expect(complete.placements.find((placement) => placement.playerId === 'guest')?.rank).toBe(1)
    expect(continueToMinigameRewards()).toBe(true)
    expect(getMinigameRound().continueRequested).toBe(true)
    expect(continueToMinigameRewards()).toBe(false)
    expect(acknowledgeMinigameRound(complete.sessionId)).toBe(true)
    stop()
  })

  it('preloads a selected game on a guest before the play call arrives', () => {
    syncMinigameRoundLifecycle()
    const payload = mocks.send.mock.calls[0]?.[0]
    expect(payload).toBeDefined()

    resetMinigameRound()
    mocks.open.mockClear()
    mocks.net.id = 'guest'
    mocks.net.host = false
    mocks.screen = { at: 'dashboard' }
    const stop = listenForMinigameRound()
    mocks.listener?.('host', payload)

    expect(getMinigameRound().phase).toBe('briefing')
    expect(mocks.open).toHaveBeenCalledWith('zombie-tag')
    expect(mocks.play).not.toHaveBeenCalled()
    stop()
  })

  it('retains the host briefing until the guest final movement settles', () => {
    syncMinigameRoundLifecycle()
    const payload = mocks.send.mock.calls[0]?.[0]
    expect(payload).toBeDefined()

    resetMinigameRound()
    mocks.open.mockClear()
    mocks.net.id = 'guest'
    mocks.net.host = false
    mocks.visualSettled = false
    mocks.screen = { at: 'dashboard' }
    const stop = listenForMinigameRound()
    mocks.listener?.('host', payload)

    expect(getMinigameRound().phase).toBe('idle')
    expect(mocks.open).not.toHaveBeenCalled()

    mocks.visualSettled = true
    syncMinigameRoundLifecycle()

    expect(getMinigameRound().phase).toBe('briefing')
    expect(mocks.open).toHaveBeenCalledWith('zombie-tag')
    expect(mocks.send).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'sync' }))
    stop()
  })

  it('does not let a guest start or finish an attempt', () => {
    syncMinigameRoundLifecycle()
    mocks.net.host = false
    expect(startMinigamePractice()).toBe(false)
    expect(startFinalMinigame()).toBe(false)
    expect(recordFinalMinigame([])).toBe(false)
  })
})
