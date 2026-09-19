/**
 * The store: the lists, the stock, the floor, the way round.
 */
import { describe, expect, it } from 'vitest'
import { CART } from '../internal/rules'
import { GRID, ITEMS, LANES, LIST_SIZE, SLOTS, SOLIDS, STORE, blocked, cellMiddle, cellOf, collide, downhill, floorSpot, freeCell, inLane, inRect, listsFor, spawnPoint, stockFor, walkField } from '../internal/store'

const SEED = 1234

describe('the lists', () => {
  it('are three different things each, from the ten, the same for the same seed', () => {
    const lists = listsFor(SEED, 8)
    expect(lists).toEqual(listsFor(SEED, 8))
    for (const list of lists) {
      expect(list).toHaveLength(LIST_SIZE)
      expect(new Set(list).size).toBe(LIST_SIZE)
      expect(list.every((k) => k >= 0 && k < ITEMS.length)).toBe(true)
    }
    expect(new Set(lists.map((l) => l.join())).size).toBeGreaterThan(1)
    expect(ITEMS).toHaveLength(10)
  })
})

describe('the stock', () => {
  it('has one of each thing for everybody who needs it and one of anything nobody does, each on its own slot', () => {
    for (const count of [1, 2, 5, 8]) {
      const lists = listsFor(SEED, count)
      const stock = stockFor(SEED, count)
      ITEMS.forEach((_, kind) => {
        const need = lists.filter((l) => l.includes(kind)).length
        expect(stock.filter((s) => s.kind === kind)).toHaveLength(Math.max(1, need))
      })
      expect(new Set(stock.map((s) => s.slot)).size).toBe(stock.length)
    }
  })

  it('puts every slot on a shelf, with somewhere free to stand in reach of it', () => {
    for (const s of SLOTS) {
      expect(SOLIDS.some((r) => inRect(r, s.x, s.z))).toBe(true)
      const stand = cellMiddle(freeCell(s.standX, s.standZ, 0.55))
      expect(Math.hypot(s.x - stand.x, s.z - stand.z)).toBeLessThan(CART.reach)
    }
  })
})

describe('the floor', () => {
  it('pushes a body out of the shelves and keeps it inside the walls', () => {
    const s = SOLIDS[0]
    const p = { x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2 + 0.1 }
    collide(p, 0.55)
    expect(SOLIDS.some((r) => inRect(r, p.x, p.z, 0.54))).toBe(false)
    // Past a bare stretch of the east wall: back against it.
    const q = { x: STORE.halfX + 5, z: 8 }
    collide(q, 0.55)
    expect(q.x).toBeCloseTo(STORE.halfX - 0.55, 6)
    // Past the wall where a fridge stands against it: out in front of the fridge, never through the wall.
    const f = { x: STORE.halfX + 5, z: 0 }
    collide(f, 0.55)
    expect(f.x).toBeLessThan(STORE.halfX - 0.55)
    expect(SOLIDS.some((r) => inRect(r, f.x, f.z, 0.54))).toBe(false)
  })

  it('never puts a thing down inside a shelf', () => {
    const s = SOLIDS[3]
    const spot = floorSpot((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2)
    expect(SOLIDS.some((r) => inRect(r, spot.x, spot.z))).toBe(false)
  })

  it('starts everybody by the door, apart, with the tills between them and the shelves', () => {
    for (let n = 1; n <= 8; n++) {
      const spots = Array.from({ length: n }, (_, i) => spawnPoint(i, n))
      for (const s of spots) expect(blocked(0.55)[cellOf(s.x, s.z)]).toBe(0)
      for (let i = 1; i < n; i++) expect(Math.hypot(spots[i].x - spots[i - 1].x, spots[i].z - spots[i - 1].z)).toBeGreaterThan(1.1)
    }
    expect(LANES).toHaveLength(4)
    for (const l of LANES) expect(inLane((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2)).toBe(true)
    expect(inLane(0, 0)).toBe(false)
  })
})

describe('the way round', () => {
  it('reaches every free cell from the door, round the shelves', () => {
    const cells = blocked(0.55)
    const door = spawnPoint(0, 1)
    const field = walkField(cellOf(door.x, door.z), 0.55)
    let free = 0
    for (let i = 0; i < cells.length; i++) {
      if (cells[i]) continue
      free += 1
      expect(field[i]).toBeLessThan(Infinity)
    }
    expect(free).toBeGreaterThan(GRID.cols * GRID.rows * 0.4)
  })

  it('leads downhill from anywhere free to where it was made from', () => {
    const goal = freeCell(SLOTS[0].x, SLOTS[0].z, 0.55)
    const field = walkField(goal, 0.55)
    const door = spawnPoint(0, 1)
    let cell = cellOf(door.x, door.z)
    for (let steps = 0; steps < 400 && cell !== goal; steps++) {
      const way = downhill(field, cell)
      expect(way).not.toBe(null)
      const c = cell % GRID.cols
      const r = Math.floor(cell / GRID.cols)
      cell = (r + Math.round(way!.z)) * GRID.cols + (c + Math.round(way!.x))
    }
    expect(cell).toBe(goal)
  })

  it('finds a free cell next to anything on a shelf', () => {
    const cells = blocked(0.55)
    for (const s of SLOTS) expect(cells[freeCell(s.x, s.z, 0.55)]).toBe(0)
  })
})
