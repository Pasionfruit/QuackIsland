import { describe, expect, it } from 'vitest'
import { ISLAND } from '../../10-party'
import {
  BOARD_CAMERA,
  advanceBoardCameraPosition,
  boardCameraPose,
  boardCameraSubject,
} from '../internal/camera'
import type { BoardMovementSnapshot } from '../internal/rules'

const snapshot = (overrides: Partial<BoardMovementSnapshot> = {}): BoardMovementSnapshot => ({
  sessionId: 'board-session',
  orderSessionId: 'order-session',
  room: 'ROOM',
  seed: 1337,
  revision: 1,
  phase: 'turn',
  round: 1,
  tileCount: 120,
  players: [
    { id: 'p1', name: 'One' },
    { id: 'p2', name: 'Two' },
  ],
  turnOrder: ['p1', 'p2'],
  activeTurnIndex: 0,
  positions: [
    { playerId: 'p1', tileIndex: 0 },
    { playerId: 'p2', tileIndex: 0 },
  ],
  moves: [],
  winnerId: '',
  appliedActionIds: [],
  error: '',
  ...overrides,
})

describe('board camera', () => {
  it('focuses the active roller before movement begins', () => {
    expect(boardCameraSubject(snapshot(), true)).toBe('p1')
  })

  it('keeps following the mover until landing, then passes to the next roller', () => {
    const afterRoll = snapshot({
      revision: 2,
      activeTurnIndex: 1,
      positions: [
        { playerId: 'p1', tileIndex: 5 },
        { playerId: 'p2', tileIndex: 0 },
      ],
      moves: [{
        round: 1,
        playerId: 'p1',
        dice: [{ kind: 'base', sides: 6, value: 5 }],
        total: 5,
        fromTile: 0,
        toTile: 5,
      }],
    })

    expect(boardCameraSubject(afterRoll, false)).toBe('p1')
    expect(boardCameraSubject(afterRoll, true)).toBe('p2')
  })

  it('keeps the last mover framed at round completion and the winner at the summit', () => {
    const lastMove = {
      round: 1,
      playerId: 'p2',
      dice: [{ kind: 'base' as const, sides: 6 as const, value: 4 as const }],
      total: 4,
      fromTile: 0,
      toTile: 4,
    }
    expect(boardCameraSubject(snapshot({ phase: 'round_complete', activeTurnIndex: 2, moves: [lastMove] }), true)).toBe('p2')
    expect(boardCameraSubject(snapshot({ phase: 'won', winnerId: 'p1', moves: [lastMove] }), true)).toBe('p1')
  })

  it('advances in either direction without overshooting', () => {
    expect(advanceBoardCameraPosition(2, 5, 1.5)).toBe(3.5)
    expect(advanceBoardCameraPosition(4, 1, 8)).toBe(1)
    expect(advanceBoardCameraPosition(3, 3, 1)).toBe(3)
  })

  it('places the camera above and outward from the focused board position', () => {
    const pose = boardCameraPose(snapshot(), 'p1', 0)
    expect(pose).not.toBeNull()
    if (!pose) return
    const focusRadius = Math.hypot(pose.focusX - ISLAND.centreX, pose.focusZ - ISLAND.centreZ)
    const cameraRadius = Math.hypot(pose.cameraX - ISLAND.centreX, pose.cameraZ - ISLAND.centreZ)
    expect(cameraRadius).toBeCloseTo(focusRadius + BOARD_CAMERA.distance, 5)
    expect(pose.cameraY - pose.focusY).toBeCloseTo(BOARD_CAMERA.height - BOARD_CAMERA.focusHeight)
  })

  it('uses a substantial pullback distance while a dice move is in flight', () => {
    expect(BOARD_CAMERA.rollingDistance).toBeGreaterThan(BOARD_CAMERA.distance * 2)
  })
})
