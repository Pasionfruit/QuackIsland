import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VolcanoVictorySnapshot } from '../../56-volcano-victory'

const mocks = vi.hoisted(() => ({
  net: { host: true },
  party: { phase: 'playing' },
  mode: 'island',
  endGame: vi.fn(),
  victory: null as VolcanoVictorySnapshot | null,
}))

vi.mock('../../09-net', () => ({ getNet: () => mocks.net }))
vi.mock('../../10-party', () => ({
  endGame: mocks.endGame,
  getParty: () => mocks.party,
}))
vi.mock('../../13-modes', () => ({ getGameMode: () => mocks.mode }))
vi.mock('../../56-volcano-victory', () => ({ getVolcanoVictory: () => mocks.victory }))

import { resetVolcanoPostgame, returnVolcanoToLobby } from '../index'

function victory(): VolcanoVictorySnapshot {
  return {
    sessionId: 'board-1:victory',
    boardSessionId: 'board-1',
    room: 'ABCD',
    revision: 1,
    boardRound: 8,
    tileCount: 59,
    rosterSize: 2,
    phase: 'won',
    winner: { playerId: 'host', name: 'Host', tileIndex: 58 },
  }
}

beforeEach(() => {
  mocks.net = { host: true }
  mocks.party = { phase: 'playing' }
  mocks.mode = 'island'
  mocks.victory = victory()
  mocks.endGame.mockReset()
  resetVolcanoPostgame()
})

describe('volcano postgame action', () => {
  it('returns the host party to its lobby exactly once per victory session', () => {
    expect(returnVolcanoToLobby()).toBe(true)
    expect(returnVolcanoToLobby()).toBe(false)
    expect(mocks.endGame).toHaveBeenCalledOnce()
  })

  it('does not let a guest end the match', () => {
    mocks.net = { host: false }
    expect(returnVolcanoToLobby()).toBe(false)
    expect(mocks.endGame).not.toHaveBeenCalled()
  })

  it('rejects stale victory, party and mode state', () => {
    mocks.victory = { ...victory(), phase: 'idle', winner: null }
    expect(returnVolcanoToLobby()).toBe(false)
    mocks.victory = victory()
    mocks.party = { phase: 'off' }
    expect(returnVolcanoToLobby()).toBe(false)
    mocks.party = { phase: 'playing' }
    mocks.mode = 'garden'
    expect(returnVolcanoToLobby()).toBe(false)
    expect(mocks.endGame).not.toHaveBeenCalled()
  })

  it('allows a later victory session after the prior guard', () => {
    expect(returnVolcanoToLobby()).toBe(true)
    mocks.victory = { ...victory(), sessionId: 'board-2:victory', boardSessionId: 'board-2' }
    expect(returnVolcanoToLobby()).toBe(true)
    expect(mocks.endGame).toHaveBeenCalledTimes(2)
  })
})
