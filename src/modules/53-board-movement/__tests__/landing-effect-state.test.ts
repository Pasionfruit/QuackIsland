import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TurnOrderSnapshot } from '../../52-turn-order'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  acknowledge: vi.fn(),
  net: { id: 'p1', room: 'ROOM', status: 'joined', host: true },
  order: null as TurnOrderSnapshot | null,
}))

vi.mock('../../09-net', () => ({
  getNet: () => mocks.net,
  getPeers: () => [{ id: 'p2', name: 'Guest' }],
  sendToRoom: mocks.send,
  subscribeRoom: () => () => undefined,
}))

vi.mock('../../10-party', () => ({
  BOARD: { tiles: 20 },
  getParty: () => ({ phase: 'playing' }),
}))

vi.mock('../../13-modes', () => ({ getGameMode: () => 'island' }))
vi.mock('../../52-turn-order', () => ({
  acknowledgeTurnOrder: mocks.acknowledge,
  comparePlayerIds: (left: string, right: string) => left.localeCompare(right),
  getTurnOrder: () => mocks.order,
}))

import {
  getBoardMovement,
  isBoardMovementVisualSettled,
  requestBoardRoll,
  resetBoardMovement,
  setBoardDiceProvider,
  setBoardLandingEffectResolver,
  syncBoardMovementLifecycle,
} from '../internal/state'

function completedOrder(): TurnOrderSnapshot {
  return {
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
      { playerId: 'p2', round: 1, value: 3 },
    ],
    turnOrder: ['p1', 'p2'],
    appliedActionIds: ['order:p1', 'order:p2'],
    error: null,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.order = completedOrder()
  mocks.send.mockReset()
  mocks.acknowledge.mockReset()
  resetBoardMovement()
  setBoardDiceProvider(() => [{ kind: 'base', sides: 6 }])
  setBoardLandingEffectResolver(null)
})

afterEach(() => {
  setBoardLandingEffectResolver(null)
  setBoardDiceProvider(null)
  resetBoardMovement()
  vi.useRealTimers()
})

describe('landing effect host orchestration', () => {
  it('resolves one registered effect only after the rolled move settles', () => {
    const resolver = vi.fn(() => ({ id: 'boost', label: 'Lava lift', moveBy: 2 }))
    setBoardLandingEffectResolver(resolver)
    syncBoardMovementLifecycle()
    requestBoardRoll()

    const rolled = getBoardMovement()
    const landingTile = rolled.moves[0].toTile
    expect(rolled.positions.find((position) => position.playerId === 'p1')?.tileIndex).toBe(landingTile)
    expect(resolver).not.toHaveBeenCalled()
    expect(isBoardMovementVisualSettled()).toBe(false)

    vi.runAllTimers()

    const resolved = getBoardMovement()
    expect(resolver).toHaveBeenCalledOnce()
    expect(resolved.positions.find((position) => position.playerId === 'p1')?.tileIndex).toBe(landingTile + 2)
    expect(resolved.moves[0].toTile).toBe(landingTile)
    expect(isBoardMovementVisualSettled()).toBe(true)
    expect(mocks.send).toHaveBeenCalledTimes(3)
  })
})
