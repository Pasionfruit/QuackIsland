import { describe, expect, it } from 'vitest'
import { BOARD, ISLAND } from '../../10-party'
import { BOARD_TILES, boardPointAt, tileWorldPoint } from '../internal/position'

describe('board world placement', () => {
  it('converts island-local tiles to world coordinates and puts feet on top', () => {
    const tile = BOARD_TILES[0]
    const point = tileWorldPoint(tile)
    expect(point.x).toBeCloseTo(tile.x + ISLAND.centreX)
    expect(point.z).toBeCloseTo(tile.z + ISLAND.centreZ)
    expect(point.y).toBeCloseTo(tile.y + BOARD.tileLift + BOARD.tileThickness / 2)
  })

  it('interpolates with a visible hop and clamps at both ends', () => {
    const start = boardPointAt(-10)
    const first = tileWorldPoint(BOARD_TILES[0])
    expect(start).toEqual(first)

    const halfway = boardPointAt(0.5)
    expect(halfway.y).toBeGreaterThan(Math.min(BOARD_TILES[0].y, BOARD_TILES[1].y) + 1)

    expect(boardPointAt(9999)).toEqual(tileWorldPoint(BOARD_TILES[BOARD_TILES.length - 1]))
  })
})
