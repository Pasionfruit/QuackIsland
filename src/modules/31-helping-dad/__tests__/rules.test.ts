/**
 * The maze, the turn, Dad's junk, the torch, the end and the placings, and the
 * stand-ins.
 */
import { describe, expect, it } from 'vitest'
import { BOT_PACE, botSteer, botWalk } from '../internal/ai'
import {
  GRID,
  HALF,
  JUNK,
  ROTATE,
  cellAt,
  cellCentre,
  intoMaze,
  intoWorld,
  isOpen,
  junkAt,
  mazeAngle,
  mazeFor,
  nextCell,
  routeTarget,
  stepsToFinish,
  touchesWall,
  type Point,
} from '../internal/maze'
import { ROUND, TORCH, clock, createGame, finishPoint, inJunk, leave, placings, report, startPoint, steer, stepGame, type Game, type SteerResult } from '../internal/rules'

const SEED = 20240917

function game(n = 3, bots = false): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0, bot: bots && i > 0 })), 5)
}

/** Past the countdown. */
function started(g: Game): Game {
  while (clock(g) < 0) stepGame(g, 0.25)
  return g
}

/**
 * A careful mouse a little ahead of a torch, along the way out - and the torch's
 * own place, holding it still, when a piece of Dad's junk is in front of it or
 * where its next step would land. Standing still is how anybody gets past one;
 * only what is ahead counts, or a piece that had just gone by would keep it
 * standing there for ever.
 */
function careful(g: Game, player: number, dt: number): Point {
  const torch = g.players[player]
  const here = { x: torch.x, z: torch.z }
  if (!torch.held) return here
  const goal = routeTarget(mazeFor(g.seed), torch)
  const d = Math.hypot(goal.x - torch.x, goal.z - torch.z)
  if (d < 1e-6) return goal
  const to = (m: number) => ({ x: torch.x + ((goal.x - torch.x) / d) * m, z: torch.z + ((goal.z - torch.z) / d) * m })
  if (inJunk(g, to(Math.min(d, TORCH.speed * dt))) || inJunk(g, to(0.3))) return here
  return to(Math.min(d, 0.25))
}

/** Leads player `player`'s torch along the way out for `seconds`, with a careful mouse. */
function walk(g: Game, player: number, seconds: number, dt = 1 / 60) {
  const torch = g.players[player]
  for (let t = 0; t < seconds && torch.finished === null && !g.over; t += dt) {
    steer(g, player, careful(g, player, dt), dt)
    stepGame(g, dt)
  }
}

describe('the maze', () => {
  it('is the same for the same seed, and different for another', () => {
    expect(mazeFor(SEED).east).toEqual(mazeFor(SEED).east)
    const a = createGame(SEED, []).seed
    expect(mazeFor(a).south).toEqual(mazeFor(SEED).south)
    expect(mazeFor(SEED + 1).east).not.toEqual(mazeFor(SEED).east)
  })

  it('has one way to every cell, and knows how far each is from the finish', () => {
    for (const seed of [1, 2, 3, SEED]) {
      const maze = mazeFor(seed)
      let openings = 0
      for (let row = 0; row < GRID.rows; row++) {
        for (let col = 0; col < GRID.cols; col++) {
          if (isOpen(maze, { col, row }, 1, 0)) openings++
          if (isOpen(maze, { col, row }, 0, 1)) openings++
          expect(stepsToFinish(maze, { col, row })).toBeGreaterThanOrEqual(0)
        }
      }
      // A tree: one opening fewer than there are cells.
      expect(openings).toBe(GRID.cols * GRID.rows - 1)
      expect(stepsToFinish(maze, maze.finish)).toBe(0)
      let cell = maze.start
      let steps = 0
      for (let next = nextCell(maze, cell); next; next = nextCell(maze, cell)) {
        cell = next
        steps++
      }
      expect(cell).toEqual(maze.finish)
      expect(steps).toBe(stepsToFinish(maze, maze.start))
    }
  })

  it('has walls where cells are closed and none where they are open', () => {
    const maze = mazeFor(SEED)
    for (let row = 0; row < GRID.rows; row++) {
      for (let col = 0; col < GRID.cols - 1; col++) {
        const c = cellCentre(col, row)
        const edge = { x: c.x + GRID.cell / 2, z: c.z }
        expect(touchesWall(maze, edge, 0.01)).toBe(!isOpen(maze, { col, row }, 1, 0))
      }
    }
    expect(touchesWall(maze, { x: -HALF.x, z: 0 }, 0.01)).toBe(true)
  })

  it('leaves a torch in the middle of any cell clear of every wall - but only just', () => {
    const maze = mazeFor(SEED)
    const room = (GRID.cell - GRID.wall) / 2
    for (let row = 0; row < GRID.rows; row++) {
      for (let col = 0; col < GRID.cols; col++) {
        const c = cellCentre(col, row)
        expect(touchesWall(maze, c, TORCH.radius)).toBe(false)
        expect(touchesWall(maze, c, room + 0.01)).toBe(true)
        expect(cellAt(c)).toEqual({ col, row })
      }
    }
    // Narrow: a torch in the middle of a corridor has less room either side of it
    // than it is wide, so there is no leading it by eye.
    const spare = room - TORCH.radius
    expect(spare).toBeGreaterThan(0.1)
    expect(spare).toBeLessThan(TORCH.radius)
    // And the mouse cannot be on a dropped torch from inside the wall beside it.
    expect(TORCH.grab).toBeLessThan(room)
  })
})

describe('the turn', () => {
  it('is the same on every screen: one way round, eased in from a standstill, and never back on itself', () => {
    const spin = mazeFor(SEED).spin
    expect(Math.abs(spin)).toBe(1)
    expect(mazeAngle(SEED, -5)).toBe(0)
    expect(mazeAngle(SEED, 0)).toBe(0)
    // Eased: the first second turns far less than a second at full rate...
    expect(Math.abs(mazeAngle(SEED, 1))).toBeLessThan(ROTATE.rate * 0.5)
    // ...and past the ramp it is flat out.
    expect(Math.abs(mazeAngle(SEED, 21) - mazeAngle(SEED, 20))).toBeCloseTo(ROTATE.rate, 9)
    // Always the same way round, and more than a whole turn in a round.
    let last = -1
    for (let t = 0; t <= ROUND.limit; t += 0.5) {
      const now = mazeAngle(SEED, t) * spin
      expect(now).toBeGreaterThanOrEqual(last)
      last = now
    }
    expect(Math.abs(mazeAngle(SEED, ROUND.limit))).toBeGreaterThan(Math.PI * 2)
  })

  it('reads a point on the board back to the point in the maze it is over', () => {
    for (const t of [0, 3, 17.5, 60]) {
      const angle = mazeAngle(SEED, t)
      for (const p of [{ x: 0, z: 0 }, { x: HALF.x - 0.3, z: -HALF.z + 0.4 }, { x: -1.2, z: 2.6 }]) {
        const back = intoMaze(intoWorld(p, angle), angle)
        expect(back.x).toBeCloseTo(p.x, 9)
        expect(back.z).toBeCloseTo(p.z, 9)
      }
    }
    // Which is the whole of the difficulty: a torch standing still in the maze
    // is somewhere else on the board a moment later, so the mouse has to go with it.
    const still = { x: 2, z: 1 }
    const moved = intoWorld(still, mazeAngle(SEED, 30))
    expect(Math.hypot(moved.x - still.x, moved.z - still.z)).toBeGreaterThan(0.5)
  })
})

describe("Dad's junk", () => {
  it('slides up and down a straight run of corridor, for ever, and never into a wall', () => {
    for (const seed of [1, 2, 3, SEED]) {
      const maze = mazeFor(seed)
      expect(maze.junk.length).toBe(JUNK.count)
      for (const piece of maze.junk) {
        const run = Math.hypot(piece.to.x - piece.from.x, piece.to.z - piece.from.z)
        expect(run).toBeGreaterThanOrEqual(GRID.cell - 1e-9)
        expect(run).toBeLessThanOrEqual((JUNK.span - 1) * GRID.cell + 1e-9)
        // Straight: it runs along one axis, not both.
        expect(Math.min(Math.abs(piece.to.x - piece.from.x), Math.abs(piece.to.z - piece.from.z))).toBeCloseTo(0, 9)
        for (let t = -2; t < 140; t += 0.05) {
          const at = junkAt(piece, t)
          expect(touchesWall(maze, at, JUNK.radius)).toBe(false)
          const cell = cellAt(at)
          expect(cell).not.toEqual(maze.start)
          expect(cell).not.toEqual(maze.finish)
        }
      }
      // And no two pieces ever shut the same corridor at once.
      for (let t = 0; t < 60; t += 0.1) {
        const at = maze.junk.map((piece) => junkAt(piece, t))
        for (let i = 0; i < at.length; i++) {
          for (let j = i + 1; j < at.length; j++) expect(Math.hypot(at[i].x - at[j].x, at[i].z - at[j].z)).toBeGreaterThan(JUNK.radius * 2)
        }
      }
    }
  })

  it('cannot be squeezed past: it is wider than the room a corridor leaves beside it', () => {
    const room = (GRID.cell - GRID.wall) / 2 - TORCH.radius
    expect(JUNK.radius + TORCH.radius).toBeGreaterThan(room)
  })

  it('is a bump like a wall when you go into one - and lets you out when it came to you', () => {
    const g = started(game(1))
    const torch = g.players[0]
    const maze = mazeFor(SEED)
    const piece = maze.junk[0]
    const at = junkAt(piece, clock(g))
    // From the far end of its run, so there is somewhere to come at it from.
    const start = Math.hypot(at.x - piece.from.x, at.z - piece.from.z) > Math.hypot(at.x - piece.to.x, at.z - piece.to.z) ? piece.from : piece.to
    torch.x = start.x
    torch.z = start.z
    torch.held = true
    expect(inJunk(g, torch)).toBe(false)

    // Straight at it: a bump, and the torch stops short of it.
    let result: SteerResult = null
    for (let i = 0; i < 400 && result !== 'hit'; i++) result = steer(g, 0, at, 1 / 60)
    expect(result).toBe('hit')
    expect(torch).toMatchObject({ hits: 1, held: false, stunned: TORCH.stun })
    expect(inJunk(g, torch)).toBe(false)

    // Standing still under one that slid onto it: not a bump, and not pinned either.
    torch.stunned = 0
    torch.held = true
    torch.hits = 0
    torch.x = at.x
    torch.z = at.z
    expect(inJunk(g, torch)).toBe(true)
    expect(steer(g, 0, { x: torch.x, z: torch.z }, 1 / 60)).toBeNull()
    expect(torch.hits).toBe(0)
    expect(steer(g, 0, start, 1 / 60)).toBe('moved')
    expect(torch.hits).toBe(0)
  })
})

describe('the torch', () => {
  it('starts down in the start cell, and can be picked up at once', () => {
    // No count of its own: the minigame screen has already counted three, two, one.
    const g = game()
    expect(ROUND.countdown).toBe(0)
    expect(g.players.every((p) => !p.held && p.x === startPoint(SEED).x && p.z === startPoint(SEED).z)).toBe(true)
    started(g)
    const s = startPoint(SEED)
    expect(steer(g, 0, { x: s.x + TORCH.grab + 0.05, z: s.z }, 0.1)).toBeNull()
    expect(steer(g, 0, { x: s.x + TORCH.grab - 0.05, z: s.z }, 0.1)).toBe('grabbed')
    expect(g.players[0].held).toBe(true)
  })

  it('follows the mouse no faster than a careful walk', () => {
    const g = started(game())
    const s = startPoint(SEED)
    steer(g, 0, s, 0.1)
    const maze = mazeFor(SEED)
    // Along the way out from the start, a mouse far ahead.
    const next = nextCell(maze, maze.start)!
    const there = cellCentre(next.col, next.row)
    const far = { x: s.x + (there.x - s.x) * 0.5, z: s.z + (there.z - s.z) * 0.5 }
    expect(steer(g, 0, far, 0.1)).toBe('moved')
    expect(Math.hypot(g.players[0].x - s.x, g.players[0].z - s.z)).toBeCloseTo(TORCH.speed * 0.1, 5)
  })

  it('touches a wall rather than going through it, however fast the mouse goes, and is stunned', () => {
    const g = started(game())
    steer(g, 0, startPoint(SEED), 0.1)
    const end = finishPoint(SEED)
    let result = null
    for (let i = 0; i < 40 && result !== 'hit'; i++) result = steer(g, 0, end, 0.25)
    const torch = g.players[0]
    expect(result).toBe('hit')
    expect(torch).toMatchObject({ hits: 1, held: false, stunned: TORCH.stun })
    expect(touchesWall(mazeFor(SEED), torch, TORCH.radius)).toBe(false)
    expect(Math.hypot(torch.x - end.x, torch.z - end.z)).toBeGreaterThan(5)

    // Stunned: nothing moves it, not even picking it up.
    const at = { x: torch.x, z: torch.z }
    for (let i = 0; i < 4; i++) stepGame(g, 0.25)
    expect(steer(g, 0, at, 0.1)).toBeNull()
    stepGame(g, 0.25)
    stepGame(g, 0.25)
    expect(torch.stunned).toBe(0)
    // After: still down until the mouse picks it up.
    expect(steer(g, 0, end, 0.1)).toBeNull()
    expect(steer(g, 0, at, 0.1)).toBe('grabbed')
  })

  it('is not picked up again, after a stun, by a mouse left in the wall it touched', () => {
    const g = started(game())
    const maze = mazeFor(SEED)
    const s = startPoint(SEED)
    steer(g, 0, s, 0.1)
    // The middle of a closed side of the start cell: a mouse resting in the wall.
    const [dc, dr] = ([[1, 0], [0, -1], [-1, 0], [0, 1]] as const).find(([c, r]) => !isOpen(maze, maze.start, c, r))!
    const wall = { x: s.x + (dc * GRID.cell) / 2, z: s.z + (dr * GRID.cell) / 2 }
    let result = null
    for (let i = 0; i < 20 && result !== 'hit'; i++) result = steer(g, 0, wall, 1 / 60)
    expect(result).toBe('hit')
    const torch = g.players[0]
    expect(Math.hypot(wall.x - torch.x, wall.z - torch.z)).toBeLessThan(TORCH.grab)
    while (torch.stunned > 0) stepGame(g, 0.25)
    for (let i = 0; i < 30; i++) {
      expect(steer(g, 0, wall, 1 / 60)).toBeNull()
      stepGame(g, 1 / 60)
    }
    expect(torch).toMatchObject({ hits: 1, held: false })
    // Moved onto the torch, it is picked up.
    expect(steer(g, 0, { x: torch.x, z: torch.z }, 1 / 60)).toBe('grabbed')
  })

  it('reaches the finish along the way out without touching a wall, and places', () => {
    const g = started(game(2))
    walk(g, 0, 60)
    const torch = g.players[0]
    expect(torch.hits).toBe(0)
    expect(torch.finished).not.toBeNull()
    const route = stepsToFinish(mazeFor(SEED), mazeFor(SEED).start) * GRID.cell
    expect(torch.finished!).toBeGreaterThanOrEqual(route / TORCH.speed - 0.1)
    expect(g.over).toBe(false)
  })
})

describe("a guest's report", () => {
  it('is taken where the torch could have got to, and no further', () => {
    const g = started(game())
    const maze = mazeFor(SEED)
    const s = startPoint(SEED)
    const next = nextCell(maze, maze.start)!
    const there = cellCentre(next.col, next.row)
    const dir = { x: Math.sign(there.x - s.x), z: Math.sign(there.z - s.z) }
    report(g, 1, { x: s.x + dir.x * 0.3, z: s.z + dir.z * 0.3 }, 0, 0.1)
    expect(Math.hypot(g.players[1].x - s.x, g.players[1].z - s.z)).toBeCloseTo(0.3, 5)
    // Too far for the time since: as far as it could have got.
    report(g, 1, there, 0, 0.01)
    const allowed = 0.01 * TORCH.speed * 1.5 + 0.25
    expect(Math.hypot(g.players[1].x - s.x, g.players[1].z - s.z)).toBeCloseTo(0.3 + allowed, 5)
  })

  it('never takes a torch through a wall', () => {
    const g = started(game())
    const end = finishPoint(SEED)
    report(g, 1, end, 0, 1000)
    const torch = g.players[1]
    expect(torch.finished).toBeNull()
    expect(Math.hypot(torch.x - end.x, torch.z - end.z)).toBeGreaterThan(5)
  })

  it('stuns for walls touched that the host did not know of, once', () => {
    const g = started(game())
    const at: Point = { x: g.players[1].x, z: g.players[1].z }
    report(g, 1, at, 1, 0.05)
    expect(g.players[1]).toMatchObject({ hits: 1, stunned: TORCH.stun })
    stepGame(g, 0.25)
    report(g, 1, at, 1, 0.05)
    expect(g.players[1].stunned).toBeCloseTo(TORCH.stun - 0.25)
  })
})

describe('the end', () => {
  it('comes when everybody still here has finished, placed by when', () => {
    const g = started(game(3))
    leave(g, 2)
    walk(g, 1, 60)
    expect(g.over).toBe(false)
    walk(g, 0, 60)
    expect(g.over).toBe(true)
    expect(placings(g).map((e) => [e.torch.id, e.place])).toEqual([
      ['p2', 1],
      ['p1', 2],
      ['p3', 3],
    ])
  })

  it('comes at the time limit, with anybody still inside placed by how far they had left', () => {
    const g = started(game(3))
    walk(g, 1, 3)
    walk(g, 2, 1.5)
    expect(g.over).toBe(false)
    while (!g.over) stepGame(g, 0.25)
    expect(clock(g)).toBeGreaterThanOrEqual(ROUND.limit)
    expect(placings(g).map((e) => [e.torch.id, e.place])).toEqual([
      ['p2', 1],
      ['p3', 2],
      ['p1', 3],
    ])
  })

  it('shares a place between torches level with each other', () => {
    const g = started(game(3))
    while (!g.over) stepGame(g, 0.25)
    expect(placings(g).map((e) => e.place)).toEqual([1, 1, 1])
  })
})

describe('the stand-ins', () => {
  it('walk cell to cell to the finish, taking some wrong turnings and coming back', () => {
    const maze = mazeFor(SEED)
    const walks = ['b1', 'b2', 'b3', 'b4'].map((id) => botWalk(maze, SEED, id))
    const route = stepsToFinish(maze, maze.start)
    for (const walk of walks) {
      expect(walk[0]).toEqual(maze.start)
      expect(walk[walk.length - 1]).toEqual(maze.finish)
      for (let i = 1; i < walk.length; i++) {
        const dc = walk[i].col - walk[i - 1].col
        const dr = walk[i].row - walk[i - 1].row
        expect(Math.abs(dc) + Math.abs(dr)).toBe(1)
        expect(isOpen(maze, walk[i - 1], dc, dr)).toBe(true)
      }
    }
    expect(walks.some((w) => w.length > route + 1)).toBe(true)
    expect(botWalk(maze, SEED, 'b1')).toEqual(walks[0])
  })

  it('find the way out, now and then touching a wall, the same way every time', () => {
    const runs = [1, 2].map(() => {
      // Three, so the game - which ends once three are out - waits for every one of them.
      const g = createGame(SEED, Array.from({ length: ROUND.podium }, (_, i) => ({ id: `b${i}`, bot: true })), 1)
      for (let i = 0; i < 60 * 150 && !g.over; i++) {
        botSteer(g, 1 / 60)
        stepGame(g, 1 / 60)
      }
      return g
    })
    const [g] = runs
    expect(g.over).toBe(true)
    const route = stepsToFinish(mazeFor(SEED), mazeFor(SEED).start) * GRID.cell
    for (const bot of g.players) {
      expect(bot.finished).not.toBeNull()
      expect(bot.finished!).toBeGreaterThanOrEqual(route / BOT_PACE[1])
      expect(bot.finished!).toBeLessThan(ROUND.limit)
    }
    expect(g.players.reduce((n, p) => n + p.hits, 0)).toBeGreaterThan(0)
    expect(runs[1].players.map((p) => [p.finished, p.hits])).toEqual(g.players.map((p) => [p.finished, p.hits]))
  })

  it('never walk through a wall', () => {
    for (const seed of [3, 4, 5]) {
      const g = createGame(seed, [{ id: 'b', bot: true }, { id: 'c', bot: true }], 1)
      const maze = mazeFor(seed)
      for (let i = 0; i < 60 * 150 && !g.over; i++) {
        botSteer(g, 1 / 60)
        stepGame(g, 1 / 60)
        for (const bot of g.players) expect(touchesWall(maze, bot, TORCH.radius)).toBe(false)
      }
      expect(g.players.every((p) => p.finished !== null)).toBe(true)
    }
  })
})
