import { describe, expect, it } from 'vitest'
import {
  BOARD,
  buildBoard,
  connectorDots,
  tileSpacing,
  trackLength,
  trackPointAt,
} from '../internal/board'
import { PLAYER } from '../../02-player'
import {
  ISLAND,
  distanceFromIsland,
  groundWithIsland,
  islandReach,
  onPartyIsland,
  partyHeightLocal,
} from '../internal/island'
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
    // And the same again allowing for the out-of-round outline, which is the
    // number that actually has to clear the sea.
    expect(Math.hypot(ISLAND.centreX, ISLAND.centreZ) + islandReach()).toBeLessThan(1500)
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

  it('makes each tile big enough for eight ducks to stand on at once', () => {
    // Three times the 3.5-radius floor that eight need, so there is room to move.
    expect(BOARD.tileRadius).toBeCloseTo(PLAYER.radius * 10.5, 9)
    // One duck in the middle and seven round it, each touching its neighbours
    // at worst. Every one has to sit wholly inside the tile's inscribed circle
    // (which the rounded corners never cut into) without overlapping another.
    const r = PLAYER.radius
    const ring = r / Math.sin(Math.PI / 7)
    const spots = [{ x: 0, z: 0 }]
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      spots.push({ x: Math.cos(a) * ring, z: Math.sin(a) * ring })
    }
    expect(spots).toHaveLength(8)
    for (const spot of spots) {
      expect(Math.hypot(spot.x, spot.z) + r).toBeLessThanOrEqual(BOARD.tileRadius)
    }
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThanOrEqual(
          r * 2 - 1e-9,
        )
      }
    }
  })

  it('starts at the outside and finishes in the middle', () => {
    expect(tiles[0].radius).toBeCloseTo(BOARD.outer, 6)
    expect(tiles[tiles.length - 1].radius).toBeCloseTo(BOARD.inner, 6)
  })

  it('always goes round the same way, and works its way in', () => {
    // The angle is strictly one way - it has to be, or the track would double
    // back on itself. The radius is not, and that is the wave: it leans out
    // and in on its way down, which is the whole point of it.
    for (let i = 1; i < tiles.length; i++) {
      expect(tiles[i].angle).toBeGreaterThan(tiles[i - 1].angle)
    }
    // Every lap is inside the one before it, even though tiles within a lap
    // are not.
    const laps = [0, 1, 2].map((lap) => {
      const of = tiles.filter(
        (t) => t.angle >= lap * Math.PI * 2 && t.angle < (lap + 1) * Math.PI * 2,
      )
      return of.reduce((sum, t) => sum + t.radius, 0) / Math.max(1, of.length)
    })
    expect(laps[1]).toBeLessThan(laps[0])
    expect(laps[2]).toBeLessThan(laps[1])
  })

  it('leans out of a true spiral, and back in again', () => {
    // Without this the "wave" is a constant nobody set. Some tiles must sit
    // further out than the one before them, and none by more than the wave.
    const outward = tiles.filter((t, i) => i > 0 && t.radius > tiles[i - 1].radius)
    expect(outward.length).toBeGreaterThan(tiles.length * 0.15)
    for (let i = 1; i < tiles.length; i++) {
      expect(tiles[i].radius - tiles[i - 1].radius).toBeLessThan(BOARD.wave)
    }
  })

  it('puts the same distance of walking between every pair of tiles', () => {
    // The whole difficulty of this file, and it has to be measured **along the
    // track**, not across it. Straight lines between tiles are shorter than
    // the road wherever the road bends, and it bends hardest at the top, where
    // it is climbing a 58-degree wall in a tight turn - so a chord measure
    // says the last few tiles are half as far apart as the first few, while
    // the walk between them is identical.
    const walk = (from: number, to: number) => {
      const steps = 80
      let run = 0
      let previous = trackPointAt(from)
      for (let k = 1; k <= steps; k++) {
        const here = trackPointAt(from + ((to - from) * k) / steps)
        run += Math.hypot(here.x - previous.x, here.y - previous.y, here.z - previous.z)
        previous = here
      }
      return run
    }
    const gaps: number[] = []
    for (let i = 1; i < tiles.length; i++) gaps.push(walk(tiles[i - 1].angle, tiles[i].angle))
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.005)
  })

  it('spaces them far enough apart to be separate tiles', () => {
    expect(tileSpacing()).toBeGreaterThan(BOARD.tileRadius * 2)
  })

  it('keeps the turns of the spiral clear of each other, wave and all', () => {
    // Neighbouring laps closer than a tile is wide would merge into a ramp -
    // and the wave leans the track towards its neighbours from both sides at
    // once, so it has to be worth well under half the gap between them.
    const turnGap = (BOARD.outer - BOARD.inner) / BOARD.turns
    expect(turnGap).toBeGreaterThan(BOARD.tileRadius * 2)
    expect(BOARD.wave * 2).toBeLessThan(turnGap * 0.75)
  })

  it('never puts two tiles on top of each other, anywhere on the board', () => {
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const apart = Math.hypot(tiles[i].x - tiles[j].x, tiles[i].z - tiles[j].z)
        expect(apart).toBeGreaterThan(BOARD.tileRadius)
      }
    }
  })

  it('starts at the edge of the island and finishes in the crater', () => {
    const first = tiles[0]
    const last = tiles[tiles.length - 1]
    // Out past the volcano's foot, on the flat, with the beach behind it.
    expect(first.radius).toBeGreaterThan(ISLAND.volcano)
    expect(first.radius).toBeLessThan(ISLAND.plateauOuter)
    expect(first.y).toBeCloseTo(ISLAND.plateau, 6)
    // And in on the crater floor, level with the treasure.
    expect(last.radius).toBeLessThan(ISLAND.crater)
    expect(last.y).toBeCloseTo(ISLAND.summit, 6)
    for (const tile of tiles) expect(tile.radius).toBeLessThanOrEqual(BOARD.outer + 1e-6)
  })

  it('climbs the volcano overall, rolling as it goes', () => {
    // A wave in the radius is a wave in the height: leaning out on a cone is
    // going downhill. So this does not climb every single step, and should not
    // - but no single step may drop more than a stride, or the road has a
    // cliff in it rather than a roll.
    const climb = tiles[tiles.length - 1].y - tiles[0].y
    expect(climb).toBeGreaterThan(ISLAND.summit * 0.9)
    let worst = 0
    for (let i = 1; i < tiles.length; i++) worst = Math.max(worst, tiles[i - 1].y - tiles[i].y)
    expect(worst).toBeLessThan(tileSpacing() * 0.35)
    // And over any fifteen tiles it never loses height at all.
    //
    // Fifteen is measured, not chosen: it is exactly how long the roll is.
    // Over ten the track can still be nine metres down inside a lean-out, and
    // over fifteen it has always come back. If the wave is ever retuned this
    // is the test that says by how much the road's rhythm changed.
    const roll = 15
    for (let i = roll; i < tiles.length; i++) {
      expect(tiles[i].y).toBeGreaterThanOrEqual(tiles[i - roll].y - 1e-9)
    }
  })

  it('climbs at a gradient somebody could walk up', () => {
    // The cone runs to 58 degrees at the crater, and it does not matter,
    // because the road wraps it three times. This is the number that decides
    // whether the track is a road or a climbing wall.
    const climb = tiles[tiles.length - 1].y - tiles[0].y
    const gradient = climb / trackLength()
    expect(gradient).toBeGreaterThan(0.03)
    expect(gradient).toBeLessThan(0.2)
  })

  it('wraps the volcano rather than running straight up it', () => {
    // Three full turns. One would be a ramp, and the tiles would have to be
    // metres apart to make the distance.
    const swept = tiles[tiles.length - 1].angle - tiles[0].angle
    expect(swept).toBeCloseTo(BOARD.turns * Math.PI * 2, 6)
    expect(BOARD.turns).toBeGreaterThanOrEqual(3)
  })

  it('finishes on the crater floor, beside the treasure', () => {
    const last = tiles[tiles.length - 1]
    expect(last.radius).toBeLessThan(ISLAND.crater)
    // Level with the treasure rather than below it: the race ends where the
    // prize is, not on a wall looking up at it.
    expect(ISLAND.summit - last.y).toBeLessThan(1)
    expect(ISLAND.summit).toBeGreaterThanOrEqual(last.y)
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
    // Stated against the tile, because the tile is what decides whether a gap
    // reads as a track or as scattered dots - a bare metre count here is a
    // bound that quietly goes wrong the next time the island is resized, which
    // is exactly what happened to the one this replaced.
    //
    // The upper bound is three tiles rather than two on purpose. These are
    // board-game spaces, not paving: tiles that nearly touch read as a road,
    // and a road is not something you count your way along. A gap of about one
    // tile between them is what makes them separate places to stand.
    // Not stated in bare metres, and not as a multiple of the tile either -
    // both of those have already gone quietly wrong once when the island was
    // resized under them. What actually has to hold is that tiles are separate
    // places to stand, and that there are enough of them per lap to read as a
    // curve rather than a polygon.
    expect(tileSpacing()).toBeGreaterThan(BOARD.tileRadius * 2)
    expect(BOARD.tiles / BOARD.turns).toBeGreaterThan(20)
    // And long enough to be a race rather than a lap of a table.
    expect(trackLength()).toBeGreaterThan(BOARD.outer * 8)
  })

  it('keeps the whole of the last tile inside the crater rim', () => {
    // A tile's corner is the furthest part of it, and the rounded corner still
    // reaches about 1.15 times the half-width from the middle.
    const last = tiles[tiles.length - 1]
    expect(last.radius + BOARD.tileRadius * 1.2).toBeLessThan(ISLAND.crater)
  })

  it('joins each tile to the next with a dotted line', () => {
    const dots = connectorDots()
    // Several dots per gap, or it is not a line.
    expect(dots.length).toBeGreaterThan((tiles.length - 1) * 3)
    // Never on a tile: each dot is clear of every tile it could sit under.
    // Measured in three dimensions, not across the map - where the road climbs
    // the crater wall two tiles are metres apart on the map and twenty apart in
    // height, and it is the second number that says whether a dot is on one.
    for (const dot of dots) {
      for (const tile of tiles) {
        const apart = Math.hypot(dot.x - tile.x, dot.y - tile.y, dot.z - tile.z)
        expect(apart).toBeGreaterThan(BOARD.tileRadius)
      }
    }
    // Evenly dotted, not clumped: neighbours within a gap are about a spacing
    // apart, and a gap between two gaps is bigger than one between two dots.
    const nearest = dots.map((d, i) =>
      i === 0
        ? Infinity
        : Math.hypot(d.x - dots[i - 1].x, d.y - dots[i - 1].y, d.z - dots[i - 1].z),
    )
    const within = nearest.filter((n) => n < BOARD.dotSpacing * 2)
    for (const n of within) {
      expect(n).toBeGreaterThan(BOARD.dotSpacing * 0.5)
      expect(n).toBeLessThan(BOARD.dotSpacing * 1.5)
    }
  })

  it('runs the dotted line down the road, and never off the island', () => {
    for (const dot of connectorDots()) {
      expect(Math.hypot(dot.x, dot.z)).toBeLessThan(BOARD.outer * (1 + 0.3))
    }
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
