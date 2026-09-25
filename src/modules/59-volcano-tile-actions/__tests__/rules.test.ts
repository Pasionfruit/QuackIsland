import { describe, expect, it } from 'vitest'
import {
  validBoardLandingEffect,
  type BoardLandingContext,
  type BoardMovementSnapshot,
} from '../../53-board-movement'
import {
  VOLCANO_TILE_ACTIONS,
  buildVolcanoTileActions,
  resolveVolcanoTileAction,
  volcanoTileActionAt,
} from '../index'

function board(playerCount: number): BoardMovementSnapshot {
  const players = Array.from({ length: playerCount }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
  }))
  return {
    sessionId: 'board:ROOM:order',
    orderSessionId: 'ROOM:order',
    room: 'ROOM',
    seed: 4242,
    revision: 2,
    phase: 'turn',
    round: 1,
    tileCount: 120,
    players,
    turnOrder: players.map((player) => player.id),
    activeTurnIndex: 1,
    positions: players.map((player) => ({ playerId: player.id, tileIndex: 0 })),
    moves: [],
    winnerId: null,
    appliedActionIds: [],
    error: null,
  }
}

function context(tileIndex: number): BoardLandingContext {
  return {
    sessionId: 'board:ROOM:order',
    playerId: 'p1',
    round: 1,
    moveNumber: 1,
    fromTile: Math.max(0, tileIndex - 4),
    landingTile: tileIndex,
    tileCount: 120,
  }
}

describe('volcano tile action layout', () => {
  it('is deterministic, balanced and seed-sensitive', () => {
    const first = buildVolcanoTileActions(120, 4242)
    const repeated = buildVolcanoTileActions(120, 4242)
    const other = buildVolcanoTileActions(120, 4243)
    expect(first).toEqual(repeated)
    expect(first).not.toEqual(other)
    expect(first).toHaveLength(VOLCANO_TILE_ACTIONS.maxPairs * 2)
    expect(first.filter((action) => action.kind === 'lava_lift')).toHaveLength(VOLCANO_TILE_ACTIONS.maxPairs)
    expect(first.filter((action) => action.kind === 'ash_slide')).toHaveLength(VOLCANO_TILE_ACTIONS.maxPairs)
  })

  it('reserves the opening and summit and keeps action tiles separated', () => {
    const actions = buildVolcanoTileActions(120, 99)
    for (const action of actions) {
      expect(action.tileIndex).toBeGreaterThanOrEqual(VOLCANO_TILE_ACTIONS.firstEligibleTile)
      expect(action.tileIndex).toBeLessThan(119)
      expect(validBoardLandingEffect(action.effect)).toBe(true)
    }
    for (let left = 0; left < actions.length; left++) {
      for (let right = left + 1; right < actions.length; right++) {
        expect(Math.abs(actions[left].tileIndex - actions[right].tileIndex)).toBeGreaterThanOrEqual(
          VOLCANO_TILE_ACTIONS.minimumGap,
        )
      }
    }
  })

  it('resolves the same host effect for two-player and eight-player boards', () => {
    const actions = buildVolcanoTileActions(120, 4242)
    const target = actions[0]
    expect(target).toBeDefined()
    expect(resolveVolcanoTileAction(context(target.tileIndex), board(2))).toEqual(target.effect)
    expect(resolveVolcanoTileAction(context(target.tileIndex), board(8))).toEqual(target.effect)
  })

  it('returns no effect for an ordinary tile or unrelated board session', () => {
    const actions = buildVolcanoTileActions(120, 4242)
    const ordinary = Array.from({ length: 120 }, (_, tile) => tile)
      .find((tile) => volcanoTileActionAt(actions, tile) === null) ?? 0
    expect(resolveVolcanoTileAction(context(ordinary), board(2))).toBeNull()
    expect(resolveVolcanoTileAction({ ...context(actions[0].tileIndex), sessionId: 'foreign' }, board(2))).toBeNull()
  })

  it('rejects tracks too short or too large for the board contract', () => {
    expect(buildVolcanoTileActions(11, 1)).toEqual([])
    expect(buildVolcanoTileActions(1_001, 1)).toEqual([])
  })
})
