import { describe, expect, it } from 'vitest'
import { validBoardLandingEffect, type BoardLandingContext, type BoardMovementSnapshot } from '../../53-board-movement'
import { VOLCANO_TILE_ACTIONS, buildVolcanoTileActions, resolveVolcanoTileAction, volcanoTileActionAt } from '../index'

function board(): BoardMovementSnapshot {
  const players = ['p1', 'p2', 'p3'].map((id, index) => ({ id, name: `Player ${index + 1}` }))
  return {
    sessionId: 'board:ROOM:order', orderSessionId: 'ROOM:order', room: 'ROOM', seed: 4242, revision: 2,
    phase: 'turn', round: 1, tileCount: 120, players, turnOrder: players.map((player) => player.id), activeTurnIndex: 1,
    positions: [{ playerId: 'p1', tileIndex: 30 }, { playerId: 'p2', tileIndex: 45 }, { playerId: 'p3', tileIndex: 20 }],
    moves: [], winnerId: null, appliedActionIds: [], error: null,
  }
}

function context(tileIndex: number): BoardLandingContext {
  return { sessionId: 'board:ROOM:order', playerId: 'p1', round: 1, moveNumber: 1, fromTile: tileIndex - 4, landingTile: tileIndex, tileCount: 120 }
}

describe('volcano tile action layout', () => {
  it('uses every requested tile count with a distinct colour per type', () => {
    const actions = buildVolcanoTileActions(120, 4242)
    expect(actions).toHaveLength(120)
    expect(actions.filter((action) => action.kind === 'regular')).toHaveLength(VOLCANO_TILE_ACTIONS.regular.count)
    expect(actions.filter((action) => action.kind === 'spring_5')).toHaveLength(VOLCANO_TILE_ACTIONS.spring5.count)
    expect(actions.filter((action) => action.kind === 'spring_10')).toHaveLength(VOLCANO_TILE_ACTIONS.spring10.count)
    expect(actions.filter((action) => action.kind === 'swap')).toHaveLength(VOLCANO_TILE_ACTIONS.swap.count)
    expect(actions.filter((action) => action.kind === 'jump')).toHaveLength(VOLCANO_TILE_ACTIONS.jump.count)
    expect(actions.filter((action) => action.kind === 'volcano')).toHaveLength(VOLCANO_TILE_ACTIONS.volcano.count)
    expect(actions.filter((action) => action.kind === 'group_return')).toHaveLength(VOLCANO_TILE_ACTIONS.groupReturn.count)
    expect(actions.filter((action) => action.kind === 'one_vs_one')).toHaveLength(VOLCANO_TILE_ACTIONS.oneVsOne.count)
    expect(actions.filter((action) => action.kind === 'one_vs_all')).toHaveLength(VOLCANO_TILE_ACTIONS.oneVsAll.count)
    expect(actions.filter((action) => action.kind === 'back_to_start')).toHaveLength(VOLCANO_TILE_ACTIONS.backToStart.count)
    expect(new Set(actions.map((action) => `${action.kind}:${action.colour}`))).toHaveLength(10)
  })

  it('is seeded and keeps the start and summit regular', () => {
    expect(buildVolcanoTileActions(120, 4242)).toEqual(buildVolcanoTileActions(120, 4242))
    expect(buildVolcanoTileActions(120, 4242)).not.toEqual(buildVolcanoTileActions(120, 4243))
    expect(buildVolcanoTileActions(120, 4242)[0].kind).toBe('regular')
    expect(buildVolcanoTileActions(120, 4242)[119].kind).toBe('regular')
    expect(buildVolcanoTileActions(119, 1)).toEqual([])
  })

  it('resolves movement, swap, group, and competition tiles into valid host effects', () => {
    const actions = buildVolcanoTileActions(120, 4242)
    for (const kind of ['spring_5', 'spring_10', 'jump', 'volcano', 'back_to_start', 'swap', 'group_return', 'one_vs_one', 'one_vs_all'] as const) {
      const action = actions.find((entry) => entry.kind === kind)
      expect(action).toBeDefined()
      if (!action) continue
      const effect = resolveVolcanoTileAction(context(action.tileIndex), board())
      expect(validBoardLandingEffect(effect)).toBe(true)
    }
  })

  it('leaves regular spaces alone and rejects a foreign board', () => {
    const actions = buildVolcanoTileActions(120, 4242)
    expect(volcanoTileActionAt(actions, 0)?.kind).toBe('regular')
    expect(resolveVolcanoTileAction(context(0), board())).toBeNull()
    const special = actions.find((action) => action.kind === 'spring_5')!
    expect(resolveVolcanoTileAction({ ...context(special.tileIndex), sessionId: 'foreign' }, board())).toBeNull()
  })
})
