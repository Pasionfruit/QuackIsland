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
  open: vi.fn(),
  play: vi.fn(),
}))

vi.mock('../../09-net', () => ({
  getNet: () => mocks.net,
  getPeers: () => [{ id: 'guest', name: 'Guest', colour: '#fff', ping: 1 }],
  isHost: (id: string, ids: Iterable<string>) => id === [...ids].sort()[0],
  sendToRoom: mocks.send,
  subscribeRoom: () => () => undefined,
}))

vi.mock('../../10-party', () => ({ getParty: () => ({ phase: 'playing' }) }))
vi.mock('../../13-modes', () => ({ getGameMode: () => 'island' }))
vi.mock('../../53-board-movement', () => ({
  acknowledgeBoardRound: mocks.acknowledgeBoard,
  getBoardMovement: () => mocks.board,
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
  getMinigameRound,
  recordFinalMinigame,
  resetMinigameRound,
  startFinalMinigame,
  startMinigamePractice,
  syncMinigameRoundLifecycle,
} from '../internal/state'

describe('host minigame-round coordination', () => {
  beforeEach(() => {
    resetMinigameRound()
    mocks.net.host = true
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

  it('runs practices, locks the final, and records host standings', () => {
    syncMinigameRoundLifecycle()
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
    expect(acknowledgeMinigameRound(complete.sessionId)).toBe(true)
  })

  it('does not let a guest start or finish an attempt', () => {
    syncMinigameRoundLifecycle()
    mocks.net.host = false
    expect(startMinigamePractice()).toBe(false)
    expect(startFinalMinigame()).toBe(false)
    expect(recordFinalMinigame([])).toBe(false)
  })
})
