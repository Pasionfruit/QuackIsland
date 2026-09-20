import { BOARD, ISLAND, buildBoard, type Tile } from '../../10-party'

export interface BoardWorldPoint {
  x: number
  y: number
  z: number
}

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
