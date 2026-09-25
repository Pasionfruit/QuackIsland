import { describe, expect, it } from 'vitest'
import type { TurnOrderSnapshot } from '../../52-turn-order'
import {
  activeBoardPlayer,
  applyBoardLandingEffect,
  applyBoardRoll,
  beginNextBoardRound,
  boardLandingContext,
  boardPosition,
  canAcknowledgeBoardRound,
  createBoardMovement,
  reconcileBoardPlayers,
  type BoardDieRoll,
  type BoardMovementSnapshot,
} from '../internal/rules'

function completedOrder(ids: readonly string[]): TurnOrderSnapshot {
  return {
    sessionId: 'ROOM:order',
    room: 'ROOM',
    seed: 1337,
    revision: 20,
    phase: 'complete',
    players: ids.map((id) => ({ id, name: `Player ${id}` })),
    pendingPlayerIds: [],
    rolls: ids.map((id, index) => ({ playerId: id, round: 1, value: Math.max(1, 6 - index) as 1 | 2 | 3 | 4 | 5 | 6 })),
    turnOrder: [...ids],
    appliedActionIds: ids.map((id) => `order:${id}`),
    error: null,
  }
}

const base = (value: number): BoardDieRoll[] => [{ kind: 'base', sides: 6, value }]
const begin = (ids: readonly string[], tileCount = 120): BoardMovementSnapshot =>
  createBoardMovement(completedOrder(ids), 4242, tileCount)

describe('board movement rules', () => {
  it('starts every ordered player on tile zero', () => {
    const state = begin(['p2', 'p1'])
    expect(state.phase).toBe('turn')
    expect(state.turnOrder).toEqual(['p2', 'p1'])
    expect(activeBoardPlayer(state)).toBe('p2')
    expect(state.positions).toEqual([
      { playerId: 'p2', tileIndex: 0 },
      { playerId: 'p1', tileIndex: 0 },
    ])
  })

  it('accepts only the active player and completes after everyone moves', () => {
    let state = begin(['p1', 'p2'])
    expect(applyBoardRoll(state, 'p2', base(6), 'early')).toBe(state)

    state = applyBoardRoll(state, 'p1', base(4), 'p1:r1')
    expect(boardPosition(state, 'p1')).toBe(4)
    expect(activeBoardPlayer(state)).toBe('p2')
    expect(applyBoardRoll(state, 'p1', base(2), 'duplicate-turn')).toBe(state)

    state = applyBoardRoll(state, 'p2', base(3), 'p2:r1')
    expect(state.phase).toBe('round_complete')
    expect(state.activeTurnIndex).toBeNull()
    expect(boardPosition(state, 'p2')).toBe(3)
  })

  it('supports one validated bonus die without trusting it as a second base die', () => {
    let state = begin(['p1', 'p2'])
    state = applyBoardRoll(
      state,
      'p1',
      [
        { kind: 'base', sides: 6, value: 5 },
        { kind: 'silver', sides: 4, value: 3 },
      ],
      'bonus',
    )
    expect(boardPosition(state, 'p1')).toBe(8)
    expect(state.moves[0].total).toBe(8)

    const rejected = applyBoardRoll(
      state,
      'p2',
      [
        { kind: 'base', sides: 6, value: 2 },
        { kind: 'base', sides: 6, value: 2 },
      ],
      'two-base-dice',
    )
    expect(rejected).toBe(state)
  })

  it('applies one bounded landing displacement after the rolled landing', () => {
    let state = applyBoardRoll(begin(['p1', 'p2']), 'p1', base(4), 'roll:p1')
    expect(boardLandingContext(state)).toMatchObject({
      playerId: 'p1',
      landingTile: 4,
      moveNumber: 1,
    })
    const shifted = applyBoardLandingEffect(
      state,
      { id: 'lava-boost', label: 'Lava lift', moveBy: 3 },
      'effect:p1',
    )
    expect(boardPosition(shifted, 'p1')).toBe(7)
    expect(shifted.moves[0].toTile).toBe(4)
    expect(activeBoardPlayer(shifted)).toBe('p2')
    expect(boardLandingContext(shifted)).toBeNull()
    expect(applyBoardLandingEffect(shifted, { id: 'again', label: 'Again', moveBy: 2 }, 'effect:again')).toBe(shifted)
  })

  it('clamps a backward landing effect and can win from a forward effect', () => {
    let state = applyBoardRoll(begin(['p1', 'p2']), 'p1', base(3), 'roll:back')
    state = applyBoardLandingEffect(state, { id: 'ash', label: 'Ash slide', moveBy: -6 }, 'effect:back')
    expect(boardPosition(state, 'p1')).toBe(0)

    let winning = applyBoardRoll(begin(['p1', 'p2'], 10), 'p1', base(4), 'roll:win')
    winning = applyBoardLandingEffect(winning, { id: 'geyser', label: 'Geyser', moveBy: 5 }, 'effect:win')
    expect(winning.phase).toBe('won')
    expect(winning.winnerId).toBe('p1')
    expect(boardPosition(winning, 'p1')).toBe(9)
  })

  it('rejects malformed, zero and over-limit landing effects', () => {
    const state = applyBoardRoll(begin(['p1', 'p2']), 'p1', base(3), 'roll:invalid')
    expect(applyBoardLandingEffect(state, { id: '', label: 'Bad', moveBy: 2 }, 'effect:bad')).toBe(state)
    expect(applyBoardLandingEffect(state, { id: 'zero', label: 'Zero', moveBy: 0 }, 'effect:zero')).toBe(state)
    expect(applyBoardLandingEffect(state, { id: 'far', label: 'Far', moveBy: 13 }, 'effect:far')).toBe(state)
  })

  it('clamps to the final tile and ends immediately with a winner', () => {
    let state = begin(['p1', 'p2'], 5)
    state = applyBoardRoll(state, 'p1', base(6), 'summit')
    expect(state.phase).toBe('won')
    expect(state.winnerId).toBe('p1')
    expect(boardPosition(state, 'p1')).toBe(4)
    expect(boardLandingContext(state)).toBeNull()
    expect(applyBoardRoll(state, 'p2', base(6), 'too-late')).toBe(state)
  })

  it('starts the next round without resetting positions', () => {
    let state = begin(['p1', 'p2'])
    state = applyBoardRoll(state, 'p1', base(2), 'p1:r1')
    state = applyBoardRoll(state, 'p2', base(5), 'p2:r1')
    expect(canAcknowledgeBoardRound(state, state.sessionId ?? '', 1)).toBe(true)

    state = beginNextBoardRound(state, 'round:2')
    expect(state.phase).toBe('turn')
    expect(state.round).toBe(2)
    expect(activeBoardPlayer(state)).toBe('p1')
    expect(boardPosition(state, 'p1')).toBe(2)
    expect(boardPosition(state, 'p2')).toBe(5)
  })

  it('runs the same state machine for eight players', () => {
    const ids = Array.from({ length: 8 }, (_, index) => `p${index + 1}`)
    let state = begin(ids)
    ids.forEach((id, index) => {
      state = applyBoardRoll(state, id, base((index % 6) + 1), `eight:${id}`)
    })
    expect(state.phase).toBe('round_complete')
    expect(state.positions).toHaveLength(8)
    expect(state.moves).toHaveLength(8)
  })

  it('removes a disconnected pending player and advances safely', () => {
    let state = begin(['p1', 'p2', 'p3'])
    state = applyBoardRoll(state, 'p1', base(4), 'p1:r1')
    state = reconcileBoardPlayers(state, ['p1', 'p3'])
    expect(state.turnOrder).toEqual(['p1', 'p3'])
    expect(activeBoardPlayer(state)).toBe('p3')
  })
})
