/**
 * The rules: creeping, stopping, the spider, the chicken, and who is left.
 */
import { describe, expect, it } from 'vitest'
import { CELLAR, scheduleFor } from '../internal/nest'
import { BODY, STOP_SLACK, advanceRounds, canCreep, createGame, distance, isStanding, leave, move, placings, steer, stepGame, stop, victims, type Game } from '../internal/rules'

const SEED = 2024
const R1 = scheduleFor(SEED)[0]

function game(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 7)
}

/** Runs the clock to `until` with `step`, everybody doing whatever they were. */
function runTo(g: Game, until: number, step = 1 / 60): void {
  while (g.elapsed < until - 1e-9 && !g.over) stepGame(g, Math.min(step, until - g.elapsed))
}

/** Stands a player at `r` metres out, on their own spoke. */
function place(g: Game, i: number, r: number): void {
  const p = g.players[i]
  const d = distance(p)
  p.x = (p.x / d) * r
  p.z = (p.z / d) * r
}

describe('creeping', () => {
  it('cannot move while everybody is getting ready, then creeps in slowly', () => {
    const g = game()
    steer(g, 0, 1, 0)
    runTo(g, R1.creep - 0.1)
    expect(distance(g.players[0])).toBeCloseTo(CELLAR.far, 6)
    runTo(g, R1.creep + 2)
    expect(CELLAR.far - distance(g.players[0])).toBeCloseTo(BODY.speed * 2, 1)
  })

  it('stops at the trapdoor\'s edge and backs off no further than the ring', () => {
    const g = game()
    g.elapsed = R1.creep + 0.1
    steer(g, 0, 1, 0)
    for (let i = 0; i < 400; i++) move(g, 0.05)
    expect(distance(g.players[0])).toBeCloseTo(CELLAR.near, 6)
    steer(g, 0, -1, 0)
    for (let i = 0; i < 400; i++) move(g, 0.05)
    expect(distance(g.players[0])).toBeCloseTo(CELLAR.far, 6)
  })

  it('edges round the trapdoor without getting nearer', () => {
    const g = game(1)
    g.elapsed = R1.creep + 0.1
    const before = { x: g.players[0].x, z: g.players[0].z }
    steer(g, 0, 0, 1)
    for (let i = 0; i < 20; i++) move(g, 0.05)
    expect(distance(g.players[0])).toBeCloseTo(CELLAR.far, 6)
    expect(Math.hypot(g.players[0].x - before.x, g.players[0].z - before.z)).toBeGreaterThan(0.5)
  })
})

describe('a click', () => {
  it('stops you where you are for the rest of the round, and only in the creep', () => {
    const g = game()
    g.elapsed = R1.start + 0.5
    expect(stop(g, 0)).toBe(false)
    g.elapsed = R1.creep + 1
    steer(g, 0, 1, 0)
    expect(stop(g, 0)).toBe(true)
    expect(g.players[0].stoppedAt).toBeCloseTo(R1.creep + 1, 6)
    expect(canCreep(g, g.players[0])).toBe(false)
    const at = distance(g.players[0])
    steer(g, 0, 1, 0)
    for (let i = 0; i < 20; i++) move(g, 0.05)
    expect(distance(g.players[0])).toBeCloseTo(at, 6)
    expect(stop(g, 0)).toBe(false)
  })

  it('takes a guest\'s own reading of when it clicked - but not one from the future, nor too long ago', () => {
    const g = game()
    g.elapsed = R1.creep + 3
    stop(g, 1, R1.creep + 2.8)
    expect(g.players[1].stoppedAt).toBeCloseTo(R1.creep + 2.8, 6)
    stop(g, 2, R1.creep + 3.5)
    expect(g.players[2].stoppedAt).toBeCloseTo(R1.creep + 3, 6)
    stop(g, 0, R1.creep + 1)
    expect(g.players[0].stoppedAt).toBeCloseTo(R1.creep + 3 - STOP_SLACK, 6)
  })

  it('does not budge a stopped player for somebody walking into them', () => {
    const g = game(2)
    g.elapsed = R1.creep + 0.5
    Object.assign(g.players[0], { x: 0, z: 4 })
    Object.assign(g.players[1], { x: 0, z: 4.3 })
    stop(g, 0)
    move(g, 0.02)
    expect(g.players[0]).toMatchObject({ x: 0, z: 4 })
    expect(Math.hypot(g.players[1].x - g.players[0].x, g.players[1].z - g.players[0].z)).toBeGreaterThanOrEqual(BODY.radius * 2 - 1e-9)
  })
})

describe('the spider', () => {
  it('takes everybody who never stopped or clicked too late, and nobody who clicked in time', () => {
    const g = game(4)
    g.elapsed = R1.judged - 0.1
    g.players[0].stoppedAt = R1.creep + 2 // long before
    g.players[1].stoppedAt = R1.springs + R1.window - 0.01 // just in time
    g.players[2].stoppedAt = R1.springs + R1.window + 0.05 // just too late
    // players[3] never stopped
    const result = victims(g, R1)
    expect(result).toEqual({ who: [2, 3], how: 'eaten' })
  })

  it('takes the chicken when nobody was too late: furthest from the trapdoor', () => {
    const g = game(3)
    place(g, 0, 3)
    place(g, 1, 5)
    place(g, 2, 2)
    for (const p of g.players) p.stoppedAt = R1.springs + 0.2
    expect(victims(g, R1)).toEqual({ who: [1], how: 'chicken' })
  })

  it('breaks a tie of distance by who was further from the moment it sprang', () => {
    const g = game(3)
    for (const i of [0, 1, 2]) place(g, i, CELLAR.near)
    g.players[0].stoppedAt = R1.springs + 0.2
    g.players[1].stoppedAt = R1.springs - 3
    g.players[2].stoppedAt = R1.springs + 0.3
    expect(victims(g, R1)).toEqual({ who: [1], how: 'chicken' })
  })

  it('takes nobody when everybody is exactly level', () => {
    const g = game(2)
    for (const i of [0, 1]) {
      place(g, i, 4)
      g.players[i].stoppedAt = R1.springs + 0.25
    }
    expect(victims(g, R1)).toEqual({ who: [], how: 'chicken' })
  })

  it('comes out at the round\'s moment on the clock, and everybody left goes again from the ring', () => {
    const g = game(3)
    runTo(g, R1.creep + 0.5)
    stop(g, 0)
    place(g, 1, 3)
    stop(g, 1)
    // players[2] never clicks.
    runTo(g, R1.judged - 0.02)
    expect(g.players.every(isStanding)).toBe(true)
    runTo(g, R1.judged + 0.05)
    expect(g.players[2]).toMatchObject({ out: 1, how: 'eaten' })
    expect(g.players[2].outAt).toBeCloseTo(R1.judged, 2)
    runTo(g, R1.end + 0.05)
    expect(g.round).toBe(2)
    expect(g.players.filter(isStanding).every((p) => p.stoppedAt === null && Math.abs(distance(p) - CELLAR.far) < 1e-6)).toBe(true)
  })

  it('never judges a round twice, however big the step', () => {
    const g = game(3)
    g.elapsed = R1.judged + 0.1
    advanceRounds(g)
    const out = g.players.map((p) => p.out)
    advanceRounds(g)
    expect(g.players.map((p) => p.out)).toEqual(out)
    expect(g.judged).toBe(1)
  })
})

describe('the end', () => {
  it('is over once the reveal with one left is done, not before - the spider is seen', () => {
    const g = game(2)
    runTo(g, R1.creep + 0.5)
    stop(g, 0)
    runTo(g, R1.judged + 0.5)
    expect(g.players[1].out).toBe(1)
    expect(g.over).toBe(false)
    runTo(g, R1.end + 0.1)
    expect(g.over).toBe(true)
    expect(placings(g).map((e) => [e.index, e.place])).toEqual([
      [0, 1],
      [1, 2],
    ])
  })

  it('places the later out higher, and those out together share', () => {
    const g = game(4)
    for (const [i, round] of [
      [1, 1],
      [2, 2],
      [3, 2],
    ] as const) {
      g.players[i].out = round
      g.players[i].how = 'eaten'
    }
    expect(placings(g).map((e) => [e.index, e.place])).toEqual([
      [0, 1],
      [2, 2],
      [3, 2],
      [1, 4],
    ])
  })

  it('everybody taken together in the last round share first', () => {
    const g = game(2)
    g.elapsed = R1.judged + 0.01
    advanceRounds(g)
    expect(g.players.every((p) => p.out === 1)).toBe(true)
    expect(placings(g).map((e) => e.place)).toEqual([1, 1])
  })

  it('puts anybody who left while in last, and ends if only one is left', () => {
    const g = game(3)
    g.elapsed = R1.creep + 0.5
    leave(g, 1)
    stepGame(g, 0.1)
    expect(g.over).toBe(false)
    leave(g, 2)
    stepGame(g, 0.1)
    expect(g.over).toBe(true)
    expect(placings(g).map((e) => e.index)).toEqual([0, 2, 1])
  })
})
