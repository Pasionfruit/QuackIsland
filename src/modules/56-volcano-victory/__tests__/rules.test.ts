import { describe, expect, it } from 'vitest'
import type { BoardMovementSnapshot } from '../../53-board-movement'
import {
  createVolcanoVictory,
  isVolcanoVictorySnapshot,
  volcanoWinner,
} from '../index'

function board(playerCount = 2): BoardMovementSnapshot {
  const players = Array.from({ length: playerCount }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
  }))
  return {
    sessionId: 'board-1',
    orderSessionId: 'order-1',
    room: 'ABCD',
    seed: 1337,
    revision: 12,
    phase: 'won',
    round: 4,
    tileCount: 59,
    players,
    turnOrder: players.map((player) => player.id),
    activeTurnIndex: null,
    positions: players.map((player, index) => ({
      playerId: player.id,
      tileIndex: index === playerCount - 1 ? 58 : 24 + index,
    })),
    moves: [],
    winnerId: players[players.length - 1]?.id ?? null,
    appliedActionIds: ['roll-12'],
    error: null,
  }
}

describe('volcano victory rules', () => {
  it('finds the board-declared player on the final tile', () => {
    expect(volcanoWinner(board())).toEqual({
      playerId: 'p2',
      name: 'Player 2',
      tileIndex: 58,
    })
  })

  it('waits for the visible final hop before creating victory', () => {
    expect(createVolcanoVictory(board(), false)).toBeNull()
    expect(createVolcanoVictory(board(), true)).toMatchObject({
      sessionId: 'board-1:victory',
      boardSessionId: 'board-1',
      boardRound: 4,
      phase: 'won',
    })
  })

  it('rejects a non-terminal board and an inconsistent winner position', () => {
    const active = { ...board(), phase: 'turn' as const, winnerId: null }
    expect(volcanoWinner(active)).toBeNull()
    const inconsistent = {
      ...board(),
      positions: board().positions.map((position) => ({ ...position, tileIndex: 10 })),
    }
    expect(volcanoWinner(inconsistent)).toBeNull()
  })

  it('supports a locked eight-player roster', () => {
    const result = createVolcanoVictory(board(8), true)
    expect(result?.rosterSize).toBe(8)
    expect(result?.winner?.playerId).toBe('p8')
  })

  it('validates the winner against session and final-tile bounds', () => {
    const result = createVolcanoVictory(board(), true)
    expect(isVolcanoVictorySnapshot(result)).toBe(true)
    expect(isVolcanoVictorySnapshot({ ...result, sessionId: 'foreign' })).toBe(false)
    expect(isVolcanoVictorySnapshot({
      ...result,
      winner: { ...result?.winner, tileIndex: 12 },
    })).toBe(false)
  })
})
