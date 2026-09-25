import { describe, expect, it } from 'vitest'
import type { VolcanoVictorySnapshot } from '../../56-volcano-victory'
import { volcanoPostgameDecision } from '../index'

const victory: VolcanoVictorySnapshot = {
  sessionId: 'board-1:victory',
  boardSessionId: 'board-1',
  room: 'ABCD',
  revision: 1,
  boardRound: 12,
  tileCount: 59,
  rosterSize: 2,
  phase: 'won',
  winner: { playerId: 'host', name: 'Host', tileIndex: 58 },
}

describe('volcano postgame eligibility', () => {
  it('offers the synchronized lobby return only to the host', () => {
    expect(volcanoPostgameDecision(victory, 'playing', 'island', true)).toEqual({
      visible: true,
      canReturnToLobby: true,
      reason: 'host_ready',
      victorySessionId: 'board-1:victory',
    })
    expect(volcanoPostgameDecision(victory, 'playing', 'island', false)).toMatchObject({
      visible: true,
      canReturnToLobby: false,
      reason: 'waiting_for_host',
    })
  })

  it('stays hidden outside a completed active Island match', () => {
    expect(volcanoPostgameDecision({ ...victory, phase: 'idle', winner: null }, 'playing', 'island', true).visible).toBe(false)
    expect(volcanoPostgameDecision(victory, 'off', 'island', true).visible).toBe(false)
    expect(volcanoPostgameDecision(victory, 'playing', 'garden', true).visible).toBe(false)
  })

  it('rejects incomplete winner identity even when the phase says won', () => {
    expect(volcanoPostgameDecision({ ...victory, sessionId: '' }, 'playing', 'island', true).reason).toBe('inactive')
    expect(volcanoPostgameDecision({ ...victory, winner: null }, 'playing', 'island', true).reason).toBe('inactive')
  })
})
