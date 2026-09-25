import { describe, expect, it } from 'vitest'
import type { MinigameRoundSnapshot } from '../../54-minigame-round'
import { decodeRewardDiceMessage, encodeRewardDiceMessage } from '../internal/protocol'
import { createRewardDice } from '../internal/rules'

function reward() {
  const minigame: MinigameRoundSnapshot = {
    sessionId: 'mini', boardSessionId: 'board', room: 'ROOM', seed: 1, revision: 3,
    boardRound: 1, phase: 'complete', minigameId: 'zombie-tag',
    players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    practiceAttempts: 0, continueRequested: true,
    placements: [
      { playerId: 'a', name: 'A', rank: 1 },
      { playerId: 'b', name: 'B', rank: 2 },
    ],
    appliedActionIds: [], error: '',
  }
  return createRewardDice(minigame)
}

describe('reward dice wire protocol', () => {
  it('round-trips a valid snapshot', () => {
    const message = encodeRewardDiceMessage({ kind: 'snapshot', snapshot: reward() })
    expect(decodeRewardDiceMessage(JSON.parse(JSON.stringify(message)))).toEqual(message)
  })

  it('accepts a bounded sync request', () => {
    const message = encodeRewardDiceMessage({ kind: 'sync', sessionId: 'reward', minigameSessionId: 'mini' })
    expect(decodeRewardDiceMessage(message)).toEqual(message)
  })

  it('rejects malformed and foreign messages', () => {
    expect(decodeRewardDiceMessage({ channel: 'other', kind: 'sync' })).toBeNull()
    expect(decodeRewardDiceMessage({ channel: 'reward-dice/v1', kind: 'snapshot', snapshot: {} })).toBeNull()
    expect(decodeRewardDiceMessage({ channel: 'reward-dice/v1', kind: 'sync', sessionId: '', minigameSessionId: 'x' })).toBeNull()
  })
})
