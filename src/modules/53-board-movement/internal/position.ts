import { BOARD, ISLAND, buildBoard, type Tile } from '../../10-party'

export interface BoardWorldPoint {
  x: number
  y: number
  z: number
}

export interface BoardTileOccupant {
  playerId: string
  tileIndex: number
}

export interface BoardTileOffset {
  x: number
  z: number
}

export const BOARD_SHARED_TILE = Object.freeze({
  twoPlayerRadius: 0.46,
  radiusStep: 0.09,
  maxRadius: 0.82,
})

export const BOARD_TILES = buildBoard()

export function tileWorldPoint(tile: Tile): BoardWorldPoint {
  return {
    x: tile.x + ISLAND.centreX,
    y: tile.y + BOARD.tileLift + BOARD.tileThickness / 2,
    z: tile.z + ISLAND.centreZ,
  }
}

export function boardPointAt(position: number, hopHeight = 1.4): BoardWorldPoint {
  const clamped = Math.max(0, Math.min(BOARD_TILES.length - 1, position))
  const fromIndex = Math.floor(clamped)
  const toIndex = Math.ceil(clamped)
  const amount = clamped - fromIndex
  const from = tileWorldPoint(BOARD_TILES[fromIndex])
  const to = tileWorldPoint(BOARD_TILES[toIndex])
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount + Math.sin(amount * Math.PI) * hopHeight,
    z: from.z + (to.z - from.z) * amount,
  }
}

/**
 * Gives players sharing one tile stable, evenly spaced world offsets.
 *
 * Slot order follows the immutable turn order, so every browser reaches the
 * same layout without another network message. A player alone stays exactly
 * at the tile centre.
 */
export function sharedTileOffset(
  playerId: string,
  tileIndex: number,
  turnOrder: readonly string[],
  positions: readonly BoardTileOccupant[],
): BoardTileOffset {
  const tileByPlayer = new Map(positions.map((position) => [position.playerId, position.tileIndex]))
  const occupants = turnOrder.filter((id) => tileByPlayer.get(id) === tileIndex)
  if (occupants.length <= 1) return { x: 0, z: 0 }

  const slot = occupants.indexOf(playerId)
  if (slot < 0) return { x: 0, z: 0 }

  const radius = Math.min(
    BOARD_SHARED_TILE.maxRadius,
    BOARD_SHARED_TILE.twoPlayerRadius + Math.max(0, occupants.length - 2) * BOARD_SHARED_TILE.radiusStep,
  )
  const angle = -Math.PI / 2 + (slot / occupants.length) * Math.PI * 2
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
  }
}
