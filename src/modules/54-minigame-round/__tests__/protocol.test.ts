import { describe, expect, it } from 'vitest'
import type { MinigameId } from '../../15-minigames'
import type { BoardMovementSnapshot } from '../../53-board-movement'
import { decodeMinigameRoundMessage, encodeMinigameRoundMessage } from '../internal/protocol'
import { createMinigameRound } from '../internal/rules'
import {
  allConnectedMinigamePlayersReady,
  decodeMinigameRoundReady,
  encodeMinigameRoundReady,
} from '../internal/readiness'

const board: BoardMovementSnapshot = {
  sessionId: 'board-session',
  orderSessionId: 'order-session',
  room: 'ROOM',
  seed: 42,
  revision: 5,
  phase: 'round_complete',
  round: 3,
  tileCount: 120,
  players: [
    { id: 'host', name: 'Host' },
    { id: 'guest', name: 'Guest' },
  ],
  turnOrder: ['host', 'guest'],
  activeTurnIndex: 2,
  positions: [
    { playerId: 'host', tileIndex: 9 },
    { playerId: 'guest', tileIndex: 7 },
  ],
  moves: [],
  winnerId: '',
  appliedActionIds: [],
  error: '',
}

describe('minigame round wire protocol', () => {
  it('round-trips a bounded snapshot', () => {
    const snapshot = createMinigameRound(board, ['zombie-tag'] as MinigameId[])
    const encoded = encodeMinigameRoundMessage({ kind: 'snapshot', snapshot })
    expect(decodeMinigameRoundMessage(JSON.parse(JSON.stringify(encoded)))).toEqual(encoded)
  })

  it('round-trips a late-subscriber sync request', () => {
    const encoded = encodeMinigameRoundMessage({
      kind: 'sync',
      sessionId: 'board-session:minigame:3',
      boardRound: 3,
    })
    expect(decodeMinigameRoundMessage(encoded)).toEqual(encoded)
  })

  it('rejects wrong channels and malformed or oversized values', () => {
    expect(decodeMinigameRoundMessage({ channel: 'other', kind: 'sync' })).toBeNull()
    expect(
      decodeMinigameRoundMessage({
        channel: 'minigame-round/v1',
        kind: 'sync',
        sessionId: 'x'.repeat(97),
        boardRound: 1,
      }),
    ).toBeNull()

    const snapshot = createMinigameRound(board, ['zombie-tag'] as MinigameId[])
    expect(
      decodeMinigameRoundMessage({
        channel: 'minigame-round/v1',
        kind: 'snapshot',
        snapshot: { ...snapshot, minigameId: 'reserved-41' },
      }),
    ).toBeNull()
  })
})

describe('minigame preload readiness', () => {
  it('round-trips a bounded ready acknowledgement', () => {
    const encoded = encodeMinigameRoundReady('board-session:minigame:3', 3)
    expect(decodeMinigameRoundReady(JSON.parse(JSON.stringify(encoded)))).toEqual(encoded)
    expect(decodeMinigameRoundReady({ ...encoded, sessionId: 'x'.repeat(97) })).toBeNull()
    expect(decodeMinigameRoundReady({ ...encoded, boardRound: 0 })).toBeNull()
  })

  it('requires every connected roster member and ignores disconnected members', () => {
    expect(allConnectedMinigamePlayersReady(
      ['host', 'guest', 'gone'],
      ['host', 'guest'],
      ['host'],
    )).toBe(false)
    expect(allConnectedMinigamePlayersReady(
      ['host', 'guest', 'gone'],
      ['host', 'guest'],
      ['host', 'guest'],
    )).toBe(true)
  })
})
