import { describe, expect, it } from 'vitest'
import { BOARD, ISLAND } from '../../10-party'
import {
  BOARD_SHARED_TILE,
  BOARD_TILES,
  boardPointAt,
  sharedTileOffset,
  tileWorldPoint,
} from '../internal/position'

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

  it('keeps a player centred while they are alone on a tile', () => {
    expect(sharedTileOffset('p1', 4, ['p1', 'p2'], [
      { playerId: 'p1', tileIndex: 4 },
      { playerId: 'p2', tileIndex: 7 },
    ])).toEqual({ x: 0, z: 0 })
  })

  it('places two co-occupants opposite each other in locked order', () => {
    const positions = [
      { playerId: 'p1', tileIndex: 4 },
      { playerId: 'p2', tileIndex: 4 },
    ]
    const first = sharedTileOffset('p1', 4, ['p1', 'p2'], positions)
    const second = sharedTileOffset('p2', 4, ['p1', 'p2'], positions)

    expect(first.x + second.x).toBeCloseTo(0, 8)
    expect(first.z + second.z).toBeCloseTo(0, 8)
    expect(Math.hypot(first.x, first.z)).toBeCloseTo(BOARD_SHARED_TILE.twoPlayerRadius)
    expect(Math.hypot(second.x, second.z)).toBeCloseTo(BOARD_SHARED_TILE.twoPlayerRadius)
  })

  it('gives all eight co-occupants unique bounded slots on the same tile', () => {
    const order = Array.from({ length: 8 }, (_, index) => `p${index + 1}`)
    const positions = order.map((playerId) => ({ playerId, tileIndex: 11 }))
    const offsets = order.map((playerId) => sharedTileOffset(playerId, 11, order, positions))
    const unique = new Set(offsets.map(({ x, z }) => `${x.toFixed(6)}:${z.toFixed(6)}`))

    expect(unique.size).toBe(8)
    for (const offset of offsets) {
      expect(Math.hypot(offset.x, offset.z)).toBeLessThanOrEqual(BOARD_SHARED_TILE.maxRadius)
    }
    expect(offsets.reduce((sum, offset) => sum + offset.x, 0)).toBeCloseTo(0, 8)
    expect(offsets.reduce((sum, offset) => sum + offset.z, 0)).toBeCloseTo(0, 8)
  })

  it('derives slots from turn order rather than snapshot array order', () => {
    const ordered = sharedTileOffset('p1', 2, ['p1', 'p2'], [
      { playerId: 'p1', tileIndex: 2 },
      { playerId: 'p2', tileIndex: 2 },
    ])
    const shuffled = sharedTileOffset('p1', 2, ['p1', 'p2'], [
      { playerId: 'p2', tileIndex: 2 },
      { playerId: 'p1', tileIndex: 2 },
    ])

    expect(shuffled).toEqual(ordered)
  })
})
