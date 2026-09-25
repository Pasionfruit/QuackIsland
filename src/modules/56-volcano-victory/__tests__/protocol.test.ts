import { describe, expect, it } from 'vitest'
import type { VolcanoVictorySnapshot } from '../index'
import {
  decodeVolcanoVictoryMessage,
  encodeVolcanoVictoryMessage,
} from '../index'

const snapshot: VolcanoVictorySnapshot = {
  sessionId: 'board-1:victory',
  boardSessionId: 'board-1',
  room: 'ABCD',
  revision: 1,
  boardRound: 3,
  tileCount: 59,
  rosterSize: 2,
  phase: 'won',
  winner: { playerId: 'a-host', name: 'Host', tileIndex: 58 },
}

describe('volcano victory protocol', () => {
  it('round-trips snapshots and sync requests', () => {
    const message = { kind: 'snapshot' as const, snapshot }
    expect(decodeVolcanoVictoryMessage(encodeVolcanoVictoryMessage(message))).toEqual(message)
    const sync = { kind: 'sync' as const, sessionId: snapshot.sessionId, boardSessionId: 'board-1' }
    expect(decodeVolcanoVictoryMessage(encodeVolcanoVictoryMessage(sync))).toEqual(sync)
  })

  it('rejects malformed, foreign and oversized identifier payloads', () => {
    expect(decodeVolcanoVictoryMessage(null)).toBeNull()
    expect(decodeVolcanoVictoryMessage({ wire: 'foreign', kind: 'sync' })).toBeNull()
    expect(decodeVolcanoVictoryMessage({
      wire: 'volcano-victory/v1',
      kind: 'sync',
      sessionId: 'x'.repeat(181),
      boardSessionId: 'board-1',
    })).toBeNull()
  })
})
