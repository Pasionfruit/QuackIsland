import { describe, expect, it } from 'vitest'
import { BOARD, buildBoard, tileSpacing, trackLength } from '../internal/board'
import { ISLAND, distanceFromIsland, groundWithIsland, onPartyIsland, partyHeightLocal } from '../internal/island'
import { PARTY, spawnFor } from '../internal/party'

const mainland = (x: number, z: number) => 12 - Math.hypot(x, z) * 0.05

describe('the island the board is on', () => {
  it('is a real island: land in the middle, sea round the outside', () => {
    expect(partyHeightLocal(0)).toBeGreaterThan(0)
    expect(partyHeightLocal(ISLAND.plateauOuter)).toBeGreaterThan(0)
    expect(partyHeightLocal(ISLAND.shore)).toBeCloseTo(0, 6)
    expect(partyHeightLocal(ISLAND.foot)).toBeLessThan(0)
  })

  it('has a volcano in the middle, and it is the highest thing on it', () => {
    expect(partyHeightLocal(0)).toBe(ISLAND.summit)
    for (let d = 0; d <= ISLAND.foot; d += 0.25) {
      expect(partyHeightLocal(d)).toBeLessThanOrEqual(ISLAND.summit + 1e-9)
    }
  })

  it('has a flat top to stand the treasure on', () => {
    // A spike would have nowhere to put anything, and nowhere to stand.
    for (let d = 0; d <= ISLAND.crater; d += 0.2) {
      expect(partyHeightLocal(d)).toBe(ISLAND.summit)
    }
    expect(partyHeightLocal(ISLAND.crater + 0.5)).toBeLessThan(ISLAND.summit)
  })

  it('has a genuinely flat board, so the race does not run uphill', () => {
    for (let d = ISLAND.volcano; d <= ISLAND.plateauOuter; d += 0.5) {
      expect(partyHeightLocal(d)).toBeCloseTo(ISLAND.plateau, 9)
    }
  })

  it('falls away without a step in it, anywhere', () => {
    // A crease is something to trip on and something you can see across the
    // water. The only sharp change allowed is at the foot of the volcano.
    let worst = 0
    for (let d = 0; d < ISLAND.foot; d += 0.05) {
      worst = Math.max(worst, Math.abs(partyHeightLocal(d + 0.05) - partyHeightLocal(d)))
    }
    expect(worst).toBeLessThan(0.35)
  })

  it('never rises again once it has reached the sea', () => {
    for (let d = ISLAND.shore; d <= ISLAND.foot * 2; d += 0.5) {
      expect(partyHeightLocal(d)).toBeLessThanOrEqual(1e-9)
    }
  })

  it('sits out across the water from the spawn island, not on top of it', () => {
    // "Another island, taken away from the host's island" - so it has to be
    // clear of it, with sea in between.
    const gap = Math.hypot(ISLAND.centreX, ISLAND.centreZ) - ISLAND.foot
    expect(gap).toBeGreaterThan(250)
  })

  it('sits inside the sea, because outside it there is no sea at all', () => {
    // The water is a plane 1800 m across baked once. An island beyond its edge
    // would stand in open nothing.
    const reach = Math.hypot(ISLAND.centreX, ISLAND.centreZ) + ISLAND.foot
    expect(reach).toBeLessThan(1500)
  })
})

describe('putting the island into the world', () => {
  it('is the island where the island is', () => {
    expect(groundWithIsland(ISLAND.centreX, ISLAND.centreZ, mainland)).toBe(ISLAND.summit)
  })

  it('is whatever was there before, everywhere else', () => {
    expect(groundWithIsland(0, 0, mainland)).toBe(mainland(0, 0))
    expect(groundWithIsland(-200, 40, mainland)).toBe(mainland(-200, 40))
  })

  it('does not cut a hole in the sea bed around itself', () => {
    // Past the beach the island has already reached the sea bed, and simply
    // replacing the mainland there would carve a circular trench.
    const edge = ISLAND.centreX + ISLAND.foot - 0.5
    expect(groundWithIsland(edge, 0, () => -4)).toBe(-4)
    expect(groundWithIsland(edge, 0, () => -400)).toBeGreaterThan(-400)
  })

  it('knows what is on it', () => {
    expect(onPartyIsland(ISLAND.centreX, ISLAND.centreZ)).toBe(true)
    expect(onPartyIsland(0, 0)).toBe(false)
    expect(distanceFromIsland(ISLAND.centreX, ISLAND.centreZ)).toBe(0)
  })
})

describe('the spiral', () => {
  const tiles = buildBoard()

  it('has a hundred and twenty tiles', () => {
    expect(tiles).toHaveLength(120)
    expect(BOARD.tiles).toBe(120)
  })

  it('starts at the outside and finishes in the middle', () => {
    expect(tiles[0].radius).toBeCloseTo(BOARD.outer, 6)
    expect(tiles[tiles.length - 1].radius).toBeCloseTo(BOARD.inner, 6)
  })

  it('spirals inwards the whole way, never back out', () => {
    for (let i = 1; i < tiles.length; i++) {
      expect(tiles[i].radius).toBeLessThan(tiles[i - 1].radius)
      expect(tiles[i].angle).toBeGreaterThan(tiles[i - 1].angle)
    }
  })

  it('spaces every tile the same distance from the last', () => {
    // The whole difficulty of this file. Stepping by angle instead of by arc
    // length crams the tiles together as the spiral tightens, so the last
    // stretch would be a jam and the first a hike.
    const gaps: number[] = []
    for (let i = 1; i < tiles.length; i++) {
      gaps.push(Math.hypot(tiles[i].x - tiles[i - 1].x, tiles[i].z - tiles[i - 1].z))
    }
    const smallest = Math.min(...gaps)
    const largest = Math.max(...gaps)
    // Chords across a curve, so they are a hair shorter than the arc; the
    // check is that they are all the *same*, not that they equal the arc.
    expect(largest / smallest).toBeLessThan(1.02)
  })

  it('spaces them far enough apart to be separate tiles', () => {
    expect(tileSpacing()).toBeGreaterThan(BOARD.tileRadius * 2)
  })

  it('keeps the turns of the spiral clear of each other', () => {
    // Neighbouring turns closer than a tile is wide would merge into a ramp.
    const turnGap = (BOARD.outer - BOARD.inner) / BOARD.turns
    expect(turnGap).toBeGreaterThan(BOARD.tileRadius * 2)
  })

  it('never puts two tiles on top of each other, anywhere on the board', () => {
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const apart = Math.hypot(tiles[i].x - tiles[j].x, tiles[i].z - tiles[j].z)
        expect(apart).toBeGreaterThan(BOARD.tileRadius)
      }
    }
  })

  it('lays every tile on the flat part of the island', () => {
    for (const tile of tiles) {
      expect(tile.radius).toBeGreaterThanOrEqual(ISLAND.volcano)
      expect(tile.radius).toBeLessThanOrEqual(ISLAND.plateauOuter)
      expect(tile.y).toBeCloseTo(ISLAND.plateau, 9)
    }
  })

  it('finishes at the foot of the volcano, with the treasure above it', () => {
    const last = tiles[tiles.length - 1]
    expect(last.radius).toBeGreaterThan(ISLAND.volcano)
    expect(last.radius).toBeLessThan(ISLAND.volcano + 4)
    // And the treasure really is up from there.
    expect(ISLAND.summit).toBeGreaterThan(last.y + 20)
  })

  it('marks every tenth tile, and neither end', () => {
    expect(tiles.filter((t) => t.marked)).toHaveLength(11)
    expect(tiles[0].marked).toBe(false)
    expect(tiles[tiles.length - 1].marked).toBe(false)
    expect(tiles[BOARD.markEvery - 1].marked).toBe(true)
  })

  it('is a track worth racing along', () => {
    // Stated against the tile rather than in bare metres, because the tile is
    // what decides whether a gap reads as a road or as a dotted line - and an
    // absolute bound here is a bound that quietly becomes wrong the next time
    // the island is resized, which is exactly what happened to the last one.
    const diameter = BOARD.tileRadius * 2
    expect(tileSpacing()).toBeGreaterThan(diameter)
    expect(tileSpacing()).toBeLessThan(diameter * 2)
    // And long enough to be a race rather than a lap of a table.
    expect(trackLength()).toBeGreaterThan(BOARD.outer * 8)
  })

  it('gives the same board every time', () => {
    expect(buildBoard()).toEqual(buildBoard())
  })

  it('copes with being asked for a different number of tiles', () => {
    for (const count of [2, 7, 60, 400]) {
      const some = buildBoard(count)
      expect(some).toHaveLength(count)
      expect(some[0].radius).toBeCloseTo(BOARD.outer, 6)
      expect(some[count - 1].radius).toBeCloseTo(BOARD.inner, 6)
    }
  })
})

describe('the starting line', () => {
  const tiles = buildBoard()
  const start = tiles[0]

  it('lines everybody up behind the first tile, along the track', () => {
    // Behind means back along the spiral, which near the start is almost
    // entirely sideways - the radius barely changes, so measuring by radius
    // says nothing. What matters is being further from the second tile than
    // the first tile is, and not standing on the first tile.
    const second = tiles[1]
    const startToSecond = Math.hypot(start.x - second.x, start.z - second.z)

    for (const count of [1, 2, 4, 8]) {
      for (let i = 0; i < count; i++) {
        const spot = spawnFor(i, count)
        const localX = spot.x - ISLAND.centreX
        const localZ = spot.z - ISLAND.centreZ

        const toSecond = Math.hypot(localX - second.x, localZ - second.z)
        expect(toSecond).toBeGreaterThan(startToSecond)

        const offStart = Math.hypot(localX - start.x, localZ - start.z)
        expect(offStart).toBeGreaterThanOrEqual(PARTY.startBack - 1e-9)
      }
    }
  })

  it('gives everybody the same distance to run', () => {
    // A ring would hand whoever spawned nearest the second tile a head start.
    const count = 6
    const runs = Array.from({ length: count }, (_, i) => {
      const spot = spawnFor(i, count)
      return Math.hypot(spot.x - ISLAND.centreX - start.x, spot.z - ISLAND.centreZ - start.z)
    })
    expect(Math.max(...runs) - Math.min(...runs)).toBeLessThan(PARTY.startSpread * count)
  })

  it('never puts two players in the same place', () => {
    for (const count of [2, 4, 8, 16]) {
      const spots = Array.from({ length: count }, (_, i) => spawnFor(i, count))
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThan(1.5)
        }
      }
    }
  })

  it('puts everybody on dry land, above the board', () => {
    for (const count of [1, 4, 16]) {
      for (let i = 0; i < count; i++) {
        const spot = spawnFor(i, count)
        const local = Math.hypot(spot.x - ISLAND.centreX, spot.z - ISLAND.centreZ)
        expect(partyHeightLocal(local)).toBeGreaterThan(0)
        expect(spot.y).toBeGreaterThan(partyHeightLocal(local))
      }
    }
  })

  it('spawns onto the party island, not the spawn island', () => {
    const spot = spawnFor(0, 1)
    expect(onPartyIsland(spot.x, spot.z)).toBe(true)
    expect(Math.hypot(spot.x, spot.z)).toBeGreaterThan(400)
  })

  it('copes with an index or a count that makes no sense', () => {
    for (const [index, count] of [[0, 0], [5, 1], [-3, 4], [99, 4]] as const) {
      const spot = spawnFor(index, count)
      for (const v of [spot.x, spot.y, spot.z]) expect(Number.isFinite(v)).toBe(true)
      expect(onPartyIsland(spot.x, spot.z)).toBe(true)
    }
  })
})
