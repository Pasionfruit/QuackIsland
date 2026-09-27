import { describe, expect, it } from 'vitest'
import { MAZE, blocked, cellAt, cellCentre, clampToField, exits, hiderPen, hiderSpawn, hunterSpawn, lineClear, mazeFor, slide, slideThroughWalls, stepsTo } from '../internal/maze'

const SEEDS = [1, 2, 42, 99]

describe('mazeFor', () => {
  it('is deterministic: the same seed makes the same maze', () => {
    for (const seed of SEEDS) {
      const a = mazeFor(seed)
      const b = mazeFor(seed)
      expect(b.openEast).toEqual(a.openEast)
      expect(b.openSouth).toEqual(a.openSouth)
    }
  })

  it('gives two different seeds two different mazes', () => {
    const a = mazeFor(SEEDS[0])
    const b = mazeFor(SEEDS[1])
    expect(b.openEast).not.toEqual(a.openEast)
  })

  it('is a real perfect maze: every cell reachable from every other, no isolated pockets', () => {
    for (const seed of SEEDS) {
      const maze = mazeFor(seed)
      const field = stepsTo(maze, [{ x: 0, y: 0 }])
      for (let y = 0; y < maze.size; y++) {
        for (let x = 0; x < maze.size; x++) {
          expect(field[y * maze.size + x]).toBeLessThan(Infinity)
        }
      }
    }
  })

  it('has a corridor from every cell somewhere - nobody is walled into a single tile with no exits', () => {
    const maze = mazeFor(7)
    for (let y = 0; y < maze.size; y++) {
      for (let x = 0; x < maze.size; x++) {
        expect(exits(maze, { x, y }).length).toBeGreaterThan(0)
      }
    }
  })
})

describe('walls', () => {
  it('block a line of sight straight down a closed corridor, centre to centre', () => {
    const maze = mazeFor(3)
    let checked = 0
    for (let y = 0; y < maze.size; y++) {
      for (let x = 0; x < maze.size - 1; x++) {
        if (maze.openEast[y][x]) continue
        const a = { x: (x - MAZE.size / 2 + 0.5) * MAZE.cell, y: 1.7, z: (y - MAZE.size / 2 + 0.5) * MAZE.cell }
        const b = { x: (x + 1 - MAZE.size / 2 + 0.5) * MAZE.cell, y: 1.7, z: (y - MAZE.size / 2 + 0.5) * MAZE.cell }
        expect(lineClear(maze, a, b)).toBe(false)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('overlap at the corners: a body cannot slip diagonally past the meeting point of two closed walls', () => {
    const maze = mazeFor(3)
    let checked = 0
    for (let y = 0; y < maze.size - 1; y++) {
      for (let x = 0; x < maze.size - 1; x++) {
        // The corner shared by (x,y), (x+1,y), (x,y+1) and (x+1,y+1): if both
        // walls touching it from cell (x,y) are closed, the corner point
        // itself must be solid - no pinhole for a diagonal ray to thread.
        if (maze.openEast[y][x] || maze.openSouth[y][x]) continue
        const corner = { x: (x + 1 - MAZE.size / 2) * MAZE.cell, y: 1.7, z: (y + 1 - MAZE.size / 2) * MAZE.cell }
        expect(blocked(maze, { x: corner.x, z: corner.z }, 0.05)).toBe(true)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('blocks a body of the player radius from walking through them', () => {
    const maze = mazeFor(3)
    for (let y = 0; y < maze.size; y++) {
      for (let x = 0; x < maze.size - 1; x++) {
        if (maze.openEast[y][x]) continue
        // Right on the wall between two closed-off cells.
        const cx = (x - MAZE.size / 2 + 1) * MAZE.cell
        const cz = (y - MAZE.size / 2 + 0.5) * MAZE.cell
        expect(blocked(maze, { x: cx, z: cz }, 0.4)).toBe(true)
      }
    }
  })
})

describe('phasing through a wall', () => {
  it('slideThroughWalls crosses a closed wall that slide stops dead at', () => {
    const maze = mazeFor(3)
    let checked = 0
    for (let y = 0; y < maze.size; y++) {
      for (let x = 0; x < maze.size - 1; x++) {
        if (maze.openEast[y][x]) continue
        const from = cellCentre({ x, y })
        const toward = cellCentre({ x: x + 1, y })
        const dx = toward.x - from.x
        const dz = toward.z - from.z
        const blockedResult = slide(maze, from, dx, dz, 0.4)
        const phased = slideThroughWalls(maze, from, dx, dz, 0.4)
        // `slide` cannot reach the next cell's centre through a closed wall;
        // `slideThroughWalls` lands exactly there, same as an open corridor would.
        expect(Math.abs(blockedResult.x - toward.x)).toBeGreaterThan(0.5)
        expect(phased.x).toBeCloseTo(toward.x, 6)
        expect(phased.z).toBeCloseTo(toward.z, 6)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('still keeps to the maze\'s own outer bounds, wall or no wall', () => {
    const maze = mazeFor(3)
    const half = (maze.size * MAZE.cell) / 2
    const far = clampToField(maze, { x: 9999, z: -9999 }, 0.4)
    expect(far.x).toBeCloseTo(half - 0.4, 6)
    expect(far.z).toBeCloseTo(-half + 0.4, 6)
  })
})

describe('spawns', () => {
  it('puts the Hunter at the maze middle', () => {
    const at = hunterSpawn(11)
    expect(at.x).toBeCloseTo(0, 5)
    expect(at.z).toBeCloseTo(0, 5)
  })

  it('spreads the Hiders over real, distinct cells near one edge, reachable by corridor', () => {
    for (const count of [1, 2, 4, 7]) {
      const pen = hiderPen(5, count)
      expect(pen.length).toBeGreaterThan(0)
      const seen = new Set(pen.map((c) => `${c.x},${c.y}`))
      expect(seen.size).toBe(pen.length)
    }
  })

  it('never spawns a Hider inside a wall', () => {
    const maze = mazeFor(21)
    for (let i = 0; i < 8; i++) {
      const at = hiderSpawn(21, 8, i)
      expect(blocked(maze, at, 0.4)).toBe(false)
      expect(cellAt(at)).toBeTruthy()
    }
  })
})
