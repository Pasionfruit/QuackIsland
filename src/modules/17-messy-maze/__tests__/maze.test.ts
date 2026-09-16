/**
 * The maze.
 *
 * The property that matters most is the one nobody would notice by playing
 * once: that every corner is exactly as far from the middle as every other,
 * whatever the seed. A race decided by where you were dealt is not a race.
 */
import { describe, expect, it } from 'vitest'
import {
  HALF,
  MAZE,
  MIDDLE,
  buildMaze,
  cellAt,
  cellCentre,
  exits,
  inWall,
  isOpen,
  mazeFor,
  pushOutOfBox,
  quarterOf,
  rotate,
  routeBetween,
  settle,
  stepsFrom,
  stepsTo,
  type Cell,
} from '../internal/maze'

const SEEDS = [1, 7, 42, 1337, 90210, 2 ** 31 + 5, 123456789, 555]
const middle: Cell = { x: MIDDLE, y: MIDDLE }

describe('the grid', () => {
  it('is odd, so there is a middle cell to race to', () => {
    expect(MAZE.size % 2).toBe(1)
    expect(cellCentre(middle)).toEqual({ x: 0, y: 0 })
  })

  it('comes back to where it started after four quarter turns', () => {
    for (let y = 0; y < MAZE.size; y++) {
      for (let x = 0; x < MAZE.size; x++) expect(rotate({ x, y }, 4)).toEqual({ x, y })
    }
  })

  it('splits into four quarters that are each other turned, covering everything but the middle', () => {
    const counts = [0, 0, 0, 0]
    for (let y = 0; y < MAZE.size; y++) {
      for (let x = 0; x < MAZE.size; x++) {
        const quarter = quarterOf({ x, y })
        if (x === MIDDLE && y === MIDDLE) {
          expect(quarter).toBe(-1)
          continue
        }
        counts[quarter] += 1
        expect(quarterOf(rotate({ x, y }))).toBe((quarter + 1) % 4)
      }
    }
    expect(new Set(counts).size).toBe(1)
    expect(counts[0] * 4).toBe(MAZE.size * MAZE.size - 1)
  })

  it('finds the cell a point is in', () => {
    const cell = { x: 3, y: 11 }
    expect(cellAt(cellCentre(cell))).toEqual(cell)
    expect(cellAt({ x: 9999, y: -9999 })).toEqual({ x: MAZE.size - 1, y: 0 })
  })
})

describe('a maze from a seed', () => {
  it('is the same maze every time for the same seed', () => {
    const a = buildMaze(42)
    const b = buildMaze(42)
    expect(a.openEast).toEqual(b.openEast)
    expect(a.openSouth).toEqual(b.openSouth)
    expect(a.platforms).toEqual(b.platforms)
  })

  it('is a different maze for a different seed', () => {
    expect(buildMaze(1).openEast).not.toEqual(buildMaze(2).openEast)
  })

  it('looks the same from every corner, turned', () => {
    for (const seed of SEEDS) {
      const maze = buildMaze(seed)
      for (let y = 0; y < MAZE.size; y++) {
        for (let x = 0; x < MAZE.size; x++) {
          for (const next of [
            { x: x + 1, y },
            { x, y: y + 1 },
          ]) {
            if (next.x >= MAZE.size || next.y >= MAZE.size) continue
            const open = isOpen(maze, { x, y }, next)
            expect(isOpen(maze, rotate({ x, y }), rotate(next)), `${seed} at ${x},${y}`).toBe(open)
          }
        }
      }
    }
  })

  it('puts every corner the same number of steps from the middle', () => {
    for (const seed of SEEDS) {
      const maze = buildMaze(seed)
      const field = stepsTo(maze, [middle])
      const steps = maze.corners.map((c) => stepsFrom(field, c))
      expect(steps.every((s) => Number.isFinite(s)), `${seed}`).toBe(true)
      expect(new Set(steps).size, `${seed}: ${steps}`).toBe(1)
    }
  })

  it('has every cell reachable, so nobody can be walled in', () => {
    for (const seed of SEEDS) {
      const field = stepsTo(buildMaze(seed), [middle])
      expect(field.every((s) => Number.isFinite(s)), `${seed}`).toBe(true)
    }
  })

  it('is messier than a perfect maze: there is more than one way through', () => {
    for (const seed of SEEDS) {
      const maze = buildMaze(seed)
      let open = 0
      for (let y = 0; y < MAZE.size; y++) {
        for (let x = 0; x < MAZE.size; x++) open += exits(maze, { x, y }).length
      }
      // A tree over n cells has n - 1 openings, each counted from both ends.
      expect(open / 2, `${seed}`).toBeGreaterThan(MAZE.size * MAZE.size - 1)
    }
  })

  it('lets routes cross from one quarter into the next, not only in the middle', () => {
    for (const seed of SEEDS) {
      const maze = buildMaze(seed)
      let crossings = 0
      for (let y = 0; y < MAZE.size; y++) {
        for (let x = 0; x < MAZE.size; x++) {
          const here = { x, y }
          for (const next of exits(maze, here)) {
            const a = quarterOf(here)
            const b = quarterOf(next)
            if (a !== -1 && b !== -1 && a !== b) crossings += 1
          }
        }
      }
      expect(crossings, `${seed}`).toBeGreaterThan(0)
    }
  })

  it('starts nobody inside a wall', () => {
    for (const seed of SEEDS) {
      const maze = buildMaze(seed)
      for (const corner of maze.corners) {
        expect(inWall(maze, cellCentre(corner), MAZE.radius)).toBe(false)
      }
      expect(inWall(maze, { x: 0, y: 0 }, MAZE.radius)).toBe(false)
    }
  })

  it('reuses a maze it has already built', () => {
    expect(mazeFor(77)).toBe(mazeFor(77))
  })
})

describe('the spinning platforms', () => {
  it('are eight: two in every quarter', () => {
    for (const seed of SEEDS) {
      const maze = buildMaze(seed)
      expect(maze.platforms).toHaveLength(8)
      for (let quarter = 0; quarter < 4; quarter++) {
        expect(maze.platforms.filter((p) => p.quarter === quarter)).toHaveLength(2)
      }
      expect(maze.platforms.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    }
  })

  it('are on the way from each corner to the middle, never at either end', () => {
    for (const seed of SEEDS) {
      const maze = buildMaze(seed)
      maze.corners.forEach((corner, quarter) => {
        for (const platform of maze.platforms.filter((p) => p.quarter === quarter)) {
          expect(platform.cell).not.toEqual(corner)
          expect(platform.cell).not.toEqual(middle)
          expect(quarterOf(platform.cell)).toBe(quarter)
        }
      })
    }
  })

  it('are as far along for one corner as for every other', () => {
    for (const seed of SEEDS) {
      const maze = buildMaze(seed)
      const distances = maze.corners.map((corner, quarter) => {
        const field = stepsTo(maze, [corner])
        return maze.platforms
          .filter((p) => p.quarter === quarter)
          .map((p) => stepsFrom(field, p.cell))
      })
      for (const d of distances) expect(d).toEqual(distances[0])
    }
  })

  it('are two different cells, one after the other', () => {
    for (const seed of SEEDS) {
      const [a, b] = buildMaze(seed).platforms
      expect(a.cell).not.toEqual(b.cell)
    }
  })
})

describe('the walls', () => {
  it('stop a body walking through a closed wall', () => {
    const maze = buildMaze(42)
    const start = maze.corners[0]
    // Walk every way out of the corner cell for three seconds, a frame at a
    // time, and check the body only ever leaves by an opening.
    for (const step of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      let at = cellCentre(start)
      for (let i = 0; i < 180; i++) {
        at = settle(maze, { x: at.x + step.x * 0.12, y: at.y + step.y * 0.12 })
        expect(inWall(maze, at, MAZE.radius - 0.01)).toBe(false)
      }
      const ended = cellAt(at)
      if (ended.x !== start.x || ended.y !== start.y) {
        expect(isOpen(maze, start, { x: start.x + step.x, y: start.y + step.y })).toBe(true)
      }
    }
  })

  it('keep everybody inside the outer walls', () => {
    const maze = buildMaze(7)
    let at = cellCentre(maze.corners[0])
    for (let i = 0; i < 400; i++) at = settle(maze, { x: at.x - 0.3, y: at.y - 0.3 })
    expect(Math.abs(at.x)).toBeLessThan(HALF)
    expect(Math.abs(at.y)).toBeLessThan(HALF)
  })

  it('push a body that has ended up inside one out the nearest side', () => {
    const box = { x: 0, y: 0, width: 4, height: 1 }
    expect(pushOutOfBox({ x: 0.5, y: 0.2 }, 0.5, box)).toEqual({ x: 0.5, y: 1 })
  })

  it('lead from a corner to the middle by walking', () => {
    const maze = buildMaze(1337)
    const route = routeBetween(maze, maze.corners[2], middle)
    expect(route[0]).toEqual(maze.corners[2])
    expect(route[route.length - 1]).toEqual(middle)
    for (let i = 1; i < route.length; i++) expect(isOpen(maze, route[i - 1], route[i])).toBe(true)
  })
})
