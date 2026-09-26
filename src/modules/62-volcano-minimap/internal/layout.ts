/** The palette is intentionally high contrast against the charcoal route. */
export const MINIMAP_COLOURS = ['#ff6b6b', '#ffd166', '#5eead4', '#60a5fa', '#c084fc', '#fb7185', '#a3e635', '#f59e0b'] as const

export interface MinimapPlayer {
  id: string
  position: number
  colour?: string
}

export interface MinimapDot {
  id: string
  colour: string
  percent: number
  lane: number
}

export interface MinimapRoutePoint {
  x: number
  y: number
}

/** Converts a zero-based board tile into a point on the minimap route. */
export function routePercent(position: number, tileCount: number): number {
  if (tileCount <= 1) return 0
  const clamped = Math.max(0, Math.min(tileCount - 1, position))
  return (clamped / (tileCount - 1)) * 100
}

/** Projects the public board route into a padded square minimap. */
export function spiralRoute(tileCount: number): readonly MinimapRoutePoint[] {
  const count = Math.max(2, Math.floor(tileCount))
  const points = Array.from({ length: count }, (_, index) => boardPointAt(index))
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minZ = Math.min(...points.map((point) => point.z))
  const maxZ = Math.max(...points.map((point) => point.z))
  const spanX = Math.max(1, maxX - minX)
  const spanZ = Math.max(1, maxZ - minZ)
  const pad = 7
  const span = 100 - pad * 2
  return points.map((point) => ({
    x: pad + ((point.x - minX) / spanX) * span,
    y: pad + ((maxZ - point.z) / spanZ) * span,
  }))
}

/** Looks up a route point while clamping positions at the start and summit. */
export function spiralPoint(position: number, tileCount: number): MinimapRoutePoint {
  const route = spiralRoute(tileCount)
  return route[Math.round(Math.max(0, Math.min(route.length - 1, position)))]
}

/** A player's colour belongs to their id, not their current order in the line. */
export function playerColour(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return MINIMAP_COLOURS[hash % MINIMAP_COLOURS.length]
}

/**
 * Stacks players sharing one tile above and below the route so every player
 * remains visible while their horizontal position stays exact.
 */
export function minimapDots(players: readonly MinimapPlayer[], tileCount: number): MinimapDot[] {
  const counts = new Map<number, number>()
  for (const player of players) {
    const tile = Math.round(Math.max(0, Math.min(tileCount - 1, player.position)))
    counts.set(tile, (counts.get(tile) ?? 0) + 1)
  }

  const seen = new Map<number, number>()
  return players.map((player) => {
    const tile = Math.round(Math.max(0, Math.min(tileCount - 1, player.position)))
    const index = seen.get(tile) ?? 0
    seen.set(tile, index + 1)
    return {
      id: player.id,
      colour: player.colour ?? playerColour(player.id),
      percent: routePercent(player.position, tileCount),
      lane: index - ((counts.get(tile) ?? 1) - 1) / 2,
    }
  })
}
import { boardPointAt } from '../../53-board-movement'
