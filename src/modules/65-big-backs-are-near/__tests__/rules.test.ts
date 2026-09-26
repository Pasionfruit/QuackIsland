import { describe, expect, it } from 'vitest'
import { MAZE, mazeFor } from '../internal/maze'
import {
  CATCH,
  HEAR_WINDOW,
  HIDER,
  HUNTER,
  ROUND,
  STRIDE,
  canAct,
  catches,
  catchHiders,
  createRound,
  hearFootsteps,
  hearingRadius,
  hidersOf,
  hunterOf,
  isStanding,
  judgeEnd,
  leave,
  report,
  resolveHunter,
  tick,
  walkHider,
  walkHunter,
  type Entrant,
} from '../internal/rules'

const roster = (n: number): Entrant[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, bot: i > 0 }))

describe('resolveHunter', () => {
  it('is whoever was chosen, if they are in the roster', () => {
    expect(resolveHunter(roster(4), 'p2')).toBe('p2')
  })

  it('falls back to the roster\'s first entry when nobody was chosen', () => {
    expect(resolveHunter(roster(4), null)).toBe('p0')
  })

  it('falls back the same way when the chosen id has since left the roster', () => {
    expect(resolveHunter(roster(4), 'ghost')).toBe('p0')
  })
})

describe('createRound', () => {
  it('gives everyone but the Hunter the hider role, spread over distinct pen cells', () => {
    const round = createRound(5, roster(4), 'p0')
    expect(round.hunterId).toBe('p0')
    const hiders = hidersOf(round)
    expect(hiders).toHaveLength(3)
    expect(hiders.every((h) => h.role === 'hider')).toBe(true)
    expect(hunterOf(round)?.role).toBe('hunter')
  })

  it('is an instant win for the Hunter with an empty roster', () => {
    const round = createRound(0, [], null)
    expect(round.over).toBe(true)
    expect(round.winner).toBe('hunter')
  })
})

describe('speed', () => {
  it('a Hider is meaningfully slower than even the Hunter\'s own walk, and sprint is faster still', () => {
    expect(HIDER.speed).toBeLessThan(HUNTER.moveSpeed)
    expect(HUNTER.moveSpeed).toBeLessThan(HUNTER.sprintSpeed)
  })
})

describe('footsteps', () => {
  it('fires only while actually moving, and resets the accumulator', () => {
    const round = createRound(1, roster(2), 'p0')
    const index = round.players.findIndex((p) => p.role === 'hider')
    const before = round.players[index].steppedAt
    // Standing still: no step, ever.
    for (let i = 0; i < 40; i++) walkHider(round, index, { forward: 0, right: 0 }, 0.1)
    expect(round.players[index].steppedAt).toBe(before)
    expect(round.players[index].distanceSinceStep).toBe(0)

    // Moving far enough to cross STRIDE fires exactly one step and resets it.
    tick(round, 1)
    for (let i = 0; i < 20; i++) walkHider(round, index, { forward: 1, right: 0 }, 0.1)
    expect(round.players[index].steppedAt).toBeGreaterThan(before)
    expect(round.players[index].distanceSinceStep).toBeLessThan(STRIDE)
  })

  it('a Hunter never accumulates a footstep of their own', () => {
    const round = createRound(1, roster(2), 'p0')
    const index = round.players.findIndex((p) => p.role === 'hunter')
    for (let i = 0; i < 20; i++) walkHunter(round, index, { forward: 1, right: 0 }, 0.1)
    expect(round.players[index].steppedAt).toBe(-Infinity)
  })
})

describe('hearing', () => {
  it('pings only within the hearing radius, and only while the footstep is fresh', () => {
    const round = createRound(9, roster(2), 'p0')
    const hi = round.players.findIndex((p) => p.role === 'hider')
    const hu = round.players.findIndex((p) => p.role === 'hunter')
    round.players[hi].x = round.players[hu].x + 1
    round.players[hi].z = round.players[hu].z
    round.players[hi].steppedAt = round.elapsed
    expect(hearFootsteps(round).some((p) => p.hiderId === round.players[hi].id)).toBe(true)

    round.players[hi].x = round.players[hu].x + HUNTER.hearing + 5
    expect(hearFootsteps(round)).toHaveLength(0)

    round.players[hi].x = round.players[hu].x + 1
    round.elapsed += HEAR_WINDOW + 0.5
    expect(hearFootsteps(round)).toHaveLength(0)
  })

  it('sprinting mutes hearing entirely: a step within radius produces no ping while sprinting is true', () => {
    const round = createRound(9, roster(2), 'p0')
    const hi = round.players.findIndex((p) => p.role === 'hider')
    const hu = round.players.findIndex((p) => p.role === 'hunter')
    round.players[hi].x = round.players[hu].x + 1
    round.players[hi].z = round.players[hu].z
    round.players[hi].steppedAt = round.elapsed
    expect(hearingRadius(round.players[hu])).toBe(HUNTER.hearing)
    round.players[hu].sprinting = true
    expect(hearingRadius(round.players[hu])).toBe(0)
    expect(hearFootsteps(round)).toHaveLength(0)
  })
})

describe('catches', () => {
  it('requires both the radius and a clear line - one without the other catches nobody', () => {
    const round = createRound(4, roster(2), 'p0')
    const hu = round.players.findIndex((p) => p.role === 'hunter')
    const hi = round.players.findIndex((p) => p.role === 'hider')
    const maze = mazeFor(round.seed)
    const spawnHu = { x: round.players[hu].x, z: round.players[hu].z }

    // Close, but with a wall squarely between them: not caught, however near.
    let blockedPair: { hx: number; hz: number; ox: number; oz: number } | null = null
    for (let y = 0; y < maze.size && !blockedPair; y++) {
      for (let x = 0; x < maze.size - 1 && !blockedPair; x++) {
        if (maze.openEast[y][x]) continue
        blockedPair = {
          hx: (x - maze.size / 2 + 1) * MAZE.cell - 0.3,
          hz: (y - maze.size / 2 + 0.5) * MAZE.cell,
          ox: (x - maze.size / 2 + 1) * MAZE.cell + 0.3,
          oz: (y - maze.size / 2 + 0.5) * MAZE.cell,
        }
      }
    }
    expect(blockedPair).not.toBeNull()
    const { hx, hz, ox, oz } = blockedPair!
    round.players[hu].x = hx
    round.players[hu].z = hz
    round.players[hi].x = ox
    round.players[hi].z = oz
    expect(Math.hypot(ox - hx, oz - hz)).toBeLessThan(CATCH.radius)
    expect(catches(round, round.players[hu], round.players[hi])).toBe(false)

    // Back to the Hunter's own spawn, safely in the middle of its cell. Same
    // open cell as each other (guaranteed clear line, no wall between any two
    // points inside one cell) but well outside the catch radius: clear line,
    // too far - not caught.
    round.players[hu].x = spawnHu.x
    round.players[hu].z = spawnHu.z
    round.players[hi].x = spawnHu.x + 1.8
    round.players[hi].z = spawnHu.z
    expect(catches(round, round.players[hu], round.players[hi])).toBe(false)

    // Same open cell, and within the radius: both at once - caught.
    round.players[hi].x = spawnHu.x + CATCH.radius * 0.5
    round.players[hi].z = spawnHu.z
    expect(catches(round, round.players[hu], round.players[hi])).toBe(true)
    catchHiders(round)
    expect(round.players[hi].alive).toBe(false)
  })
})

describe('report', () => {
  it("never trusts a guest's claimed jump farther than the elapsed time allows", () => {
    const round = createRound(3, roster(2), 'p0')
    const index = round.players.findIndex((p) => p.role === 'hider')
    const before = { x: round.players[index].x, z: round.players[index].z }
    report(round, index, { x: before.x + 500, z: before.z }, 0, 0, 0.016, false)
    const moved = Math.hypot(round.players[index].x - before.x, round.players[index].z - before.z)
    expect(moved).toBeLessThan(5)
  })

  it("registers a guest Hider's footstep off the actually-allowed distance", () => {
    const round = createRound(3, roster(2), 'p0')
    const index = round.players.findIndex((p) => p.role === 'hider')
    const before = round.players[index].steppedAt
    let at = { x: round.players[index].x, z: round.players[index].z }
    for (let i = 0; i < 20; i++) {
      at = { x: at.x + 0.3, z: at.z }
      report(round, index, at, 0, 0, 0.1, false)
    }
    expect(round.players[index].steppedAt).toBeGreaterThan(before)
  })
})

describe('win conditions', () => {
  it('every Hider caught or gone wins it for the Hunter, in the same step', () => {
    const round = createRound(2, roster(3), 'p0')
    for (const p of hidersOf(round)) p.alive = false
    expect(judgeEnd(round)).toBe(true)
    expect(round.winner).toBe('hunter')
    expect(round.over).toBe(true)
  })

  it('the buzzer with a survivor wins it for the Hiders', () => {
    const round = createRound(2, roster(3), 'p0')
    round.elapsed = ROUND.limit + 1
    expect(judgeEnd(round)).toBe(true)
    expect(round.winner).toBe('hider')
  })

  it('the Hunter leaving wins it for the Hiders immediately, unambiguously', () => {
    const round = createRound(2, roster(3), 'p0')
    const hu = round.players.findIndex((p) => p.role === 'hunter')
    leave(round, hu)
    expect(judgeEnd(round)).toBe(true)
    expect(round.winner).toBe('hider')
  })

  it('all Hiders leaving wins it for the Hunter, the same as all of them being caught', () => {
    const round = createRound(2, roster(3), 'p0')
    for (const p of hidersOf(round)) {
      const index = round.players.indexOf(p)
      leave(round, index)
    }
    expect(judgeEnd(round)).toBe(true)
    expect(round.winner).toBe('hunter')
  })

  it('never keeps deciding once the round is already over', () => {
    const round = createRound(2, roster(3), 'p0')
    for (const p of hidersOf(round)) p.alive = false
    judgeEnd(round)
    round.winner = 'hunter'
    const hu = round.players.findIndex((p) => p.role === 'hunter')
    leave(round, hu)
    expect(round.players[hu].left).toBe(false) // leave() itself refuses once over
    expect(judgeEnd(round)).toBe(true)
    expect(round.winner).toBe('hunter')
  })
})

describe('canAct / isStanding', () => {
  it('nobody can act once the round is over, or once they have left', () => {
    const round = createRound(2, roster(2), 'p0')
    const index = 0
    leave(round, index)
    expect(canAct(round, round.players[index])).toBe(false)
    expect(isStanding(round.players[index])).toBe(false)
  })
})
