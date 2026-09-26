import { createRng, hashSeed } from '../../00-core'
import type { BoardLandingContext, BoardLandingEffect, BoardMovementSnapshot } from '../../53-board-movement'

export const VOLCANO_TILE_ACTIONS = {
  regular: { count: 55, label: 'Regular space', colour: '#507a55' },
  spring5: { count: 18, label: 'Spring ±5', colour: '#35c7d4' },
  spring10: { count: 8, label: 'Spring ±10', colour: '#2764e7' },
  swap: { count: 7, label: 'Swap', colour: '#ad52e5' },
  jump: { count: 8, label: 'Jump ahead/back', colour: '#f0b63c' },
  volcano: { count: 4, label: 'Go in volcano', colour: '#e84835' },
  groupReturn: { count: 4, label: 'Group return', colour: '#d884c2' },
  oneVsOne: { count: 7, label: '1v1', colour: '#ff713e' },
  oneVsAll: { count: 5, label: '1vAll', colour: '#7b50c7' },
  backToStart: { count: 4, label: 'Back to start', colour: '#263646' },
} as const

export type VolcanoTileActionKind = 'regular' | 'spring_5' | 'spring_10' | 'swap' | 'jump' | 'volcano' | 'group_return' | 'one_vs_one' | 'one_vs_all' | 'back_to_start'

export interface VolcanoTileAction {
  tileIndex: number
  kind: VolcanoTileActionKind
  label: string
  colour: string
  effect: BoardLandingEffect | null
}

const definitions: Record<VolcanoTileActionKind, { count: number; label: string; colour: string }> = {
  regular: VOLCANO_TILE_ACTIONS.regular,
  spring_5: VOLCANO_TILE_ACTIONS.spring5,
  spring_10: VOLCANO_TILE_ACTIONS.spring10,
  swap: VOLCANO_TILE_ACTIONS.swap,
  jump: VOLCANO_TILE_ACTIONS.jump,
  volcano: VOLCANO_TILE_ACTIONS.volcano,
  group_return: VOLCANO_TILE_ACTIONS.groupReturn,
  one_vs_one: VOLCANO_TILE_ACTIONS.oneVsOne,
  one_vs_all: VOLCANO_TILE_ACTIONS.oneVsAll,
  back_to_start: VOLCANO_TILE_ACTIONS.backToStart,
}

export const VOLCANO_TILE_KINDS = Object.freeze(Object.keys(definitions) as VolcanoTileActionKind[])

function shuffle<T>(values: T[], rng: () => number): T[] {
  for (let index = values.length - 1; index > 0; index--) {
    const other = Math.floor(rng() * (index + 1))
    ;[values[index], values[other]] = [values[other], values[index]]
  }
  return values
}

function signedMove(rng: () => number, amount: number): number {
  return rng() < 0.5 ? -amount : amount
}

function fixedEffect(kind: VolcanoTileActionKind, tileIndex: number, rng: () => number): BoardLandingEffect | null {
  if (kind === 'regular' || kind === 'swap' || kind === 'group_return' || kind === 'one_vs_one' || kind === 'one_vs_all') return null
  const moveBy = kind === 'spring_5' ? signedMove(rng, 5)
    : kind === 'spring_10' ? signedMove(rng, 10)
      : kind === 'jump' ? signedMove(rng, 4)
        : kind === 'volcano' ? -15
          : -119
  return { id: `${kind}:${tileIndex}`, label: definitions[kind].label, moveBy }
}

/** Creates all 120 tile paints, with start and summit always regular. */
export function buildVolcanoTileActions(tileCount: number, seed: number): readonly VolcanoTileAction[] {
  if (!Number.isSafeInteger(tileCount) || tileCount !== 120) return []
  const rng = createRng(hashSeed(seed >>> 0, 'volcano-tile-actions:v2'))
  const kinds = shuffle([
    ...Array.from({ length: VOLCANO_TILE_ACTIONS.spring5.count }, () => 'spring_5' as const),
    ...Array.from({ length: VOLCANO_TILE_ACTIONS.spring10.count }, () => 'spring_10' as const),
    ...Array.from({ length: VOLCANO_TILE_ACTIONS.swap.count }, () => 'swap' as const),
    ...Array.from({ length: VOLCANO_TILE_ACTIONS.jump.count }, () => 'jump' as const),
    ...Array.from({ length: VOLCANO_TILE_ACTIONS.volcano.count }, () => 'volcano' as const),
    ...Array.from({ length: VOLCANO_TILE_ACTIONS.groupReturn.count }, () => 'group_return' as const),
    ...Array.from({ length: VOLCANO_TILE_ACTIONS.oneVsOne.count }, () => 'one_vs_one' as const),
    ...Array.from({ length: VOLCANO_TILE_ACTIONS.oneVsAll.count }, () => 'one_vs_all' as const),
    ...Array.from({ length: VOLCANO_TILE_ACTIONS.backToStart.count }, () => 'back_to_start' as const),
  ], rng)
  const eligible = shuffle(Array.from({ length: tileCount - 2 }, (_, index) => index + 1), rng)
  const kindByTile = new Map<number, VolcanoTileActionKind>(eligible.slice(0, kinds.length).map((tile, index) => [tile, kinds[index]]))
  return Array.from({ length: tileCount }, (_, tileIndex) => {
    const kind = kindByTile.get(tileIndex) ?? 'regular'
    return { tileIndex, kind, label: definitions[kind].label, colour: definitions[kind].colour, effect: fixedEffect(kind, tileIndex, rng) }
  })
}

export function volcanoTileActionAt(actions: readonly VolcanoTileAction[], tileIndex: number): VolcanoTileAction | null {
  return actions[tileIndex] ?? null
}

function destinations(snapshot: Readonly<BoardMovementSnapshot>, values: ReadonlyMap<string, number>): BoardLandingEffect | null {
  const entries = [...values].map(([playerId, tileIndex]) => ({ playerId, tileIndex: Math.max(0, Math.min(snapshot.tileCount - 1, tileIndex)) }))
  return entries.length > 0 ? { id: `multi:${snapshot.revision}`, label: 'Tile action', destinations: entries } : null
}

/** Resolves positional special tiles on the host; all results are broadcast in the board snapshot. */
export function resolveVolcanoTileAction(context: Readonly<BoardLandingContext>, snapshot: Readonly<BoardMovementSnapshot>): BoardLandingEffect | null {
  if (snapshot.sessionId !== context.sessionId || snapshot.tileCount !== context.tileCount) return null
  const action = volcanoTileActionAt(buildVolcanoTileActions(context.tileCount, snapshot.seed), context.landingTile)
  if (!action) return null
  if (action.effect) return { ...action.effect }
  const current = new Map(snapshot.positions.map((position) => [position.playerId, position.tileIndex]))
  const playerTile = current.get(context.playerId)
  if (playerTile === undefined) return null
  const others = snapshot.turnOrder.filter((id) => id !== context.playerId && current.has(id))
  if (action.kind === 'swap') {
    const selfIndex = snapshot.turnOrder.indexOf(context.playerId)
    const target = snapshot.turnOrder.slice(selfIndex + 1).find((id) => current.has(id)) ?? others[0]
    return target ? destinations(snapshot, new Map([[context.playerId, current.get(target)!], [target, playerTile]])) : null
  }
  if (action.kind === 'group_return') {
    const floor = Math.min(...current.values())
    return destinations(snapshot, new Map(snapshot.positions.map((position) => [position.playerId, floor])))
  }
  if (action.kind === 'one_vs_one') {
    const target = [...others].sort((left, right) => (current.get(right)! - current.get(left)!) || left.localeCompare(right))[0]
    return target ? destinations(snapshot, new Map([[context.playerId, playerTile + 3], [target, current.get(target)! - 3]])) : null
  }
  if (action.kind === 'one_vs_all') {
    return destinations(snapshot, new Map([[context.playerId, playerTile + 2], ...others.map((id) => [id, current.get(id)! - 2] as const)]))
  }
  return null
}
