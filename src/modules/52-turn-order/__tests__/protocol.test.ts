import { describe, expect, it } from 'vitest'
import { createTurnOrder } from '../internal/rules'
import {
  decodeTurnOrderMessage,
  decodeTurnOrderSnapshot,
  encodeTurnOrderMessage,
} from '../internal/protocol'

describe('turn order wire protocol', () => {
  it('round-trips a bounded snapshot', () => {
    const snapshot = createTurnOrder(
      'ROOM:session',
      'ROOM',
      1337,
      [
        { id: 'p1', name: 'Host' },
        { id: 'p2', name: 'Guest' },
      ],
    )
    const message = encodeTurnOrderMessage({ type: 'snapshot', snapshot })
    expect(decodeTurnOrderMessage(message)).toEqual({ type: 'snapshot', snapshot })
  })

  it('rejects unknown, oversized and malformed input', () => {
    expect(decodeTurnOrderMessage({ channel: 'something-else', type: 'sync' })).toBeNull()
    expect(decodeTurnOrderMessage({ channel: 'turn-order/v1', type: 'roll', sessionId: '', actionId: 'x' })).toBeNull()
    expect(decodeTurnOrderSnapshot({})).toBeNull()

    const snapshot = createTurnOrder(
      'ROOM:session',
      'ROOM',
      1337,
      [
        { id: 'p1', name: 'Host' },
        { id: 'p2', name: 'Guest' },
      ],
    )
    expect(decodeTurnOrderSnapshot({ ...snapshot, pendingPlayerIds: ['p999'] })).toBeNull()
    expect(decodeTurnOrderSnapshot({ ...snapshot, seed: Number.NaN })).toBeNull()
  })
})
