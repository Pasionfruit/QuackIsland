import { describe, expect, it } from 'vitest'
import type { TurnOrderSnapshot } from '../../52-turn-order'
import { decodeBoardMovementMessage, decodeBoardMovementSnapshot, encodeBoardMovementMessage } from '../internal/protocol'
import { applyBoardLandingEffect, applyBoardRoll, createBoardMovement } from '../internal/rules'

const order: TurnOrderSnapshot = {
  sessionId: 'ROOM:order',
  room: 'ROOM',
  seed: 1337,
  revision: 4,
  phase: 'complete',
  players: [
    { id: 'p1', name: 'Host' },
    { id: 'p2', name: 'Guest' },
  ],
  pendingPlayerIds: [],
  rolls: [
    { playerId: 'p1', round: 1, value: 6 },
    { playerId: 'p2', round: 1, value: 2 },
  ],
  turnOrder: ['p1', 'p2'],
  appliedActionIds: ['a', 'b'],
  error: null,
}

describe('board movement wire protocol', () => {
  it('round-trips a moved snapshot', () => {
    let snapshot = createBoardMovement(order, 9001, 120)
    snapshot = applyBoardRoll(snapshot, 'p1', [{ kind: 'base', sides: 6, value: 4 }], 'move:p1')
    const encoded = encodeBoardMovementMessage({ type: 'snapshot', snapshot })
    expect(decodeBoardMovementMessage(encoded)).toEqual({ type: 'snapshot', snapshot })
  })

  it('round-trips the authoritative position after a landing displacement', () => {
    let snapshot = createBoardMovement(order, 9001, 120)
    snapshot = applyBoardRoll(snapshot, 'p1', [{ kind: 'base', sides: 6, value: 4 }], 'move:p1')
    snapshot = applyBoardLandingEffect(snapshot, { id: 'ash', label: 'Ash slide', moveBy: -2 }, 'effect:p1')
    const encoded = encodeBoardMovementMessage({ type: 'snapshot', snapshot })
    expect(decodeBoardMovementMessage(encoded)).toEqual({ type: 'snapshot', snapshot })
  })

  it('rejects malformed and internally inconsistent snapshots', () => {
    const snapshot = createBoardMovement(order, 9001, 120)
    expect(decodeBoardMovementMessage({ channel: 'other', type: 'sync' })).toBeNull()
    expect(decodeBoardMovementSnapshot({})).toBeNull()
    expect(decodeBoardMovementSnapshot({ ...snapshot, seed: Number.NaN })).toBeNull()
    expect(decodeBoardMovementSnapshot({ ...snapshot, turnOrder: ['p1', 'p9'] })).toBeNull()
    expect(decodeBoardMovementSnapshot({ ...snapshot, positions: [{ playerId: 'p1', tileIndex: 0 }] })).toBeNull()
  })
})
