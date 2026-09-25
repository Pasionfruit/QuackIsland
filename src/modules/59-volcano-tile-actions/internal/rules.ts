import { createRng, hashSeed } from '../../00-core'
import type {
  BoardLandingContext,
  BoardLandingEffect,
  BoardMovementSnapshot,
} from '../../53-board-movement'

export const VOLCANO_TILE_ACTIONS = {
  firstEligibleTile: 4,
  summitBuffer: 1,
  minimumGap: 3,
  tilesPerPair: 12,
  maxPairs: 6,
  lavaLift: {
    kind: 'lava_lift',
    label: 'Lava Lift',
    description: 'Ride the lava surge forward 3 tiles.',
    moveBy: 3,
    colour: '#ff7a1a',
  },
  ashSlide: {
    kind: 'ash_slide',
    label: 'Ash Slide',
    description: 'Slide backward 2 tiles through loose ash.',
    moveBy: -2,
    colour: '#77808f',
  },
} as const

export type VolcanoTileActionKind = 'lava_lift' | 'ash_slide'

export interface VolcanoTileAction {
  tileIndex: number
  kind: VolcanoTileActionKind
  label: string
  description: string
  colour: string
  effect: BoardLandingEffect
}

function shuffle<T>(values: T[], rng: () => number): T[] {
  for (let index = values.length - 1; index > 0; index--) {
    const other = Math.floor(rng() * (index + 1))
    const value = values[index]
    values[index] = values[other]
    values[other] = value
  }
  return values
}

function definition(kind: VolcanoTileActionKind) {
  return kind === 'lava_lift' ? VOLCANO_TILE_ACTIONS.lavaLift : VOLCANO_TILE_ACTIONS.ashSlide
}

export function buildVolcanoTileActions(tileCount: number, seed: number): readonly VolcanoTileAction[] {
  if (!Number.isSafeInteger(tileCount) || tileCount < 12 || tileCount > 1_000) return []
  const seeded = hashSeed(seed >>> 0, 'volcano-tile-actions:v1')
  const rng = createRng(seeded)
  const lastEligible = tileCount - 1 - VOLCANO_TILE_ACTIONS.summitBuffer
  const candidates = shuffle(
    Array.from(
      { length: Math.max(0, lastEligible - VOLCANO_TILE_ACTIONS.firstEligibleTile + 1) },
      (_, index) => VOLCANO_TILE_ACTIONS.firstEligibleTile + index,
    ),
    rng,
  )
  const pairCount = Math.min(
    VOLCANO_TILE_ACTIONS.maxPairs,
    Math.max(1, Math.floor(tileCount / VOLCANO_TILE_ACTIONS.tilesPerPair)),
  )
  const selected: number[] = []
  for (const candidate of candidates) {
    if (selected.every((tile) => Math.abs(tile - candidate) >= VOLCANO_TILE_ACTIONS.minimumGap)) {
      selected.push(candidate)
      if (selected.length === pairCount * 2) break
    }
  }
  const balancedCount = Math.floor(selected.length / 2) * 2
  const tiles = selected.slice(0, balancedCount).sort((left, right) => left - right)
  const kinds = shuffle<VolcanoTileActionKind>([
    ...Array.from({ length: balancedCount / 2 }, () => 'lava_lift' as const),
    ...Array.from({ length: balancedCount / 2 }, () => 'ash_slide' as const),
  ], rng)
  return tiles.map((tileIndex, index) => {
    const action = definition(kinds[index])
    return {
      tileIndex,
      kind: action.kind,
      label: action.label,
      description: action.description,
      colour: action.colour,
      effect: {
        id: `${action.kind}:${tileIndex}`,
        label: action.label,
        moveBy: action.moveBy,
      },
    }
  })
}

export function volcanoTileActionAt(
  actions: readonly VolcanoTileAction[],
  tileIndex: number,
): VolcanoTileAction | null {
  return actions.find((action) => action.tileIndex === tileIndex) ?? null
}

export function resolveVolcanoTileAction(
  context: Readonly<BoardLandingContext>,
  snapshot: Readonly<BoardMovementSnapshot>,
): BoardLandingEffect | null {
  if (snapshot.sessionId !== context.sessionId || snapshot.tileCount !== context.tileCount) return null
  const action = volcanoTileActionAt(
    buildVolcanoTileActions(context.tileCount, snapshot.seed),
    context.landingTile,
  )
  return action ? { ...action.effect } : null
}
