/**
 * The three mazes.
 *
 * Every test runs against all three, because the drawings in `layouts.ts` are
 * meant to be edited by hand and the properties below are what an edit must
 * not break. The one that matters most: **no route from any corner reaches
 * the middle without crossing two different spinning platforms.**
 */
import { describe, expect, it } from 'vitest'
import { LAYOUTS } from '../internal/layouts'
import {
  HALF,
  MAZE,
  MAZES,
  MIDDLE,
  cellAt,
  cellCentre,
  exits,
  inWall,
  isOpen,
  mazeFor,
  parseLayout,
  platformsOnRoute,
  pushOutOfBox,
  quarterOf,
  rotate,
  routeBetween,
  settle,
  stepsFrom,
  stepsTo,
  type Cell,
  type Maze,
} from '../internal/maze'

const middle: Cell = { x: MIDDLE, y: MIDDLE }

function everyCell(fn: (cell: Cell) => void): void {
  for (let y = 0; y < MAZE.size; y++) for (let x = 0; x < MAZE.size; x++) fn({ x, y })
}

/** The same maze with one wall knocked out - for proving the checks can fail. */
function withGap(maze: Maze, a: Cell, b: Cell): Maze {
  const openEast = maze.openEast.map((row) => [...row])
  const openSouth = maze.openSouth.map((row) => [...row])
  if (a.y === b.y) openEast[a.y][Math.min(a.x, b.x)] = true
  else openSouth[Math.min(a.y, b.y)][a.x] = true
  return { ...maze, openEast, openSouth }
}

describe('the grid', () => {
  it('is odd, so there is a middle cell to race to', () => {
    expect(MAZE.size % 2).toBe(1)
    expect(cellCentre(middle)).toEqual({ x: 0, y: 0 })
  })

  it('comes back to where it started after four quarter turns', () => {
    everyCell((cell) => expect(rotate(cell, 4)).toEqual(cell))
  })

  it('splits into four quarters that are each other turned, covering everything but the middle', () => {
    const counts = [0, 0, 0, 0]
    everyCell((cell) => {
      const quarter = quarterOf(cell)
      if (cell.x === MIDDLE && cell.y === MIDDLE) return expect(quarter).toBe(-1)
      counts[quarter] += 1
      expect(quarterOf(rotate(cell))).toBe((quarter + 1) % 4)
    })
    expect(new Set(counts).size).toBe(1)
  })

  it('finds the cell a point is in', () => {
    expect(cellAt(cellCentre({ x: 3, y: 11 }))).toEqual({ x: 3, y: 11 })
    expect(cellAt({ x: 9999, y: -9999 })).toEqual({ x: MAZE.size - 1, y: 0 })
  })
})

describe('the three mazes', () => {
  it('are three, each with its own name, read from their drawings', () => {
    expect(MAZES).toHaveLength(3)
    expect(new Set(MAZES.map((m) => m.name)).size).toBe(3)
    MAZES.forEach((maze, i) => expect(maze.id).toBe(i))
  })

  it('are three different mazes', () => {
    expect(MAZES[0].openEast).not.toEqual(MAZES[1].openEast)
    expect(MAZES[1].openEast).not.toEqual(MAZES[2].openEast)
    expect(MAZES[0].openEast).not.toEqual(MAZES[2].openEast)
  })

  it('are found by number, any whole number wrapping onto one of them', () => {
    expect(mazeFor(1)).toBe(MAZES[1])
    expect(mazeFor(4)).toBe(MAZES[1])
    expect(mazeFor(-1)).toBe(MAZES[2])
  })

  for (const maze of MAZES) {
    describe(maze.name, () => {
      it('looks the same from every corner, turned', () => {
        everyCell((cell) => {
          for (const next of [
            { x: cell.x + 1, y: cell.y },
            { x: cell.x, y: cell.y + 1 },
          ]) {
            if (next.x >= MAZE.size || next.y >= MAZE.size) continue
            expect(isOpen(maze, rotate(cell), rotate(next)), `${cell.x},${cell.y}`).toBe(isOpen(maze, cell, next))
          }
        })
      })

      it('makes every corner cross two different platforms to reach the middle, whatever way it goes', () => {
        for (const corner of maze.corners) {
          expect(platformsOnRoute(maze, corner, middle), `from ${corner.x},${corner.y}`).toBeGreaterThanOrEqual(2)
        }
      })

      it('puts every corner the same distance from the middle', () => {
        const field = stepsTo(maze, [middle])
        const steps = maze.corners.map((c) => stepsFrom(field, c))
        expect(steps.every(Number.isFinite)).toBe(true)
        expect(new Set(steps).size).toBe(1)
      })

      it('has every cell reachable, so nobody can be walled in', () => {
        expect(stepsTo(maze, [middle]).every(Number.isFinite)).toBe(true)
      })

      it('is messier than a perfect maze: there is more than one way round', () => {
        let open = 0
        everyCell((cell) => (open += exits(maze, cell).length))
        expect(open / 2).toBeGreaterThan(MAZE.size * MAZE.size - 1)
      })

      it('lets routes cross from one quarter into the next, not only in the middle', () => {
        let crossings = 0
        everyCell((cell) => {
          for (const next of exits(maze, cell)) {
            const [a, b] = [quarterOf(cell), quarterOf(next)]
            if (a !== -1 && b !== -1 && a !== b) crossings += 1
          }
        })
        expect(crossings).toBeGreaterThan(0)
      })

      it('has eight platforms, two per quarter, numbered in the order each corner reaches them', () => {
        expect(maze.platforms.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
        for (let quarter = 0; quarter < 4; quarter++) {
          const mine = maze.platforms.filter((p) => p.quarter === quarter)
          expect(mine).toHaveLength(2)
          const field = stepsTo(maze, [maze.corners[quarter]])
          expect(stepsFrom(field, mine[0].cell)).toBeLessThan(stepsFrom(field, mine[1].cell))
          for (const p of mine) {
            expect(quarterOf(p.cell)).toBe(quarter)
            expect(p.cell).not.toEqual(maze.corners[quarter])
          }
        }
      })

      it('puts nobody inside a wall at a corner, a platform or the middle', () => {
        for (const corner of maze.corners) expect(inWall(maze, cellCentre(corner), MAZE.radius)).toBe(false)
        for (const p of maze.platforms) expect(inWall(maze, p.at, MAZE.radius)).toBe(false)
        expect(inWall(maze, { x: 0, y: 0 }, MAZE.radius)).toBe(false)
      })
    })
  }
})

describe('checking the two platforms', () => {
  it('notices a wall knocked out that lets a corner past a platform', () => {
    // Knock through every wall next to quarter 0's first platform in turn; at
    // least one has to open a way round it, or the check could never fail.
    const maze = MAZES[0]
    const platform = maze.platforms[0].cell
    let foundOne = false
    everyCell((cell) => {
      for (const next of [
        { x: cell.x + 1, y: cell.y },
        { x: cell.x, y: cell.y + 1 },
      ]) {
        if (next.x >= MAZE.size || next.y >= MAZE.size || isOpen(maze, cell, next)) continue
        if (Math.abs(cell.x - platform.x) + Math.abs(cell.y - platform.y) > 3) continue
        if (platformsOnRoute(withGap(maze, cell, next), maze.corners[0], middle) < 2) foundOne = true
      }
    })
    expect(foundOne).toBe(true)
  })

  it('counts a platform once however it is walked over', () => {
    const maze = MAZES[1]
    const route = routeBetween(maze, maze.corners[0], middle)
    const crossed = maze.platforms.filter((p) => route.some((c) => c.x === p.cell.x && c.y === p.cell.y))
    expect(crossed.length).toBeGreaterThanOrEqual(2)
    expect(platformsOnRoute(maze, maze.corners[0], middle)).toBe(2)
  })
})

describe('reading a drawing', () => {
  const good = LAYOUTS[0]
  const change = (row: number, col: number, ch: string) => ({
    ...good,
    rows: good.rows.map((r, i) => (i === row ? r.slice(0, col) + ch + r.slice(col + 1) : r)),
  })

  it('reads the same maze every time', () => {
    expect(parseLayout(0, good).openEast).toEqual(MAZES[0].openEast)
  })

  it('refuses a gap in the outer wall', () => {
    expect(() => parseLayout(0, change(0, 5, ' '))).toThrow(/outer wall/)
  })

  it('refuses a missing corner post', () => {
    expect(() => parseLayout(0, change(2, 2, ' '))).toThrow(/corner post/)
  })

  it('refuses the wrong size', () => {
    expect(() => parseLayout(0, { ...good, rows: good.rows.slice(1) })).toThrow(/35 by 35/)
  })

  it('refuses a stray character, saying where', () => {
    expect(() => parseLayout(0, change(3, 3, '?'))).toThrow(/unexpected "\?"/)
  })

  it('refuses a start anywhere but a corner', () => {
    expect(() => parseLayout(0, change(3, 3, 'S'))).toThrow(/four corners/)
  })
})

describe('the walls', () => {
  it('stop a body walking through a closed wall', () => {
    const maze = MAZES[2]
    const start = maze.corners[0]
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
    const maze = MAZES[0]
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
    const maze = MAZES[1]
    const route = routeBetween(maze, maze.corners[2], middle)
    expect(route[0]).toEqual(maze.corners[2])
    expect(route[route.length - 1]).toEqual(middle)
    for (let i = 1; i < route.length; i++) expect(isOpen(maze, route[i - 1], route[i])).toBe(true)
  })
})
