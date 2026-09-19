/**
 * The rules: walking, the rails, shoving, being hit, and who is left.
 */
import { describe, expect, it } from 'vitest'
import { DECK, SHOT, activeShots, barrageFor, offLine, type Shot } from '../internal/deck'
import { BODY, PUSH, ROUND, createGame, hitRange, isStanding, judgeEnd, leave, move, placings, push, steer, stepGame, tick, yawTowards, type Game } from '../internal/rules'

/** A seed whose first ball crosses near the middle of the deck, so there is room either side of its lane. */
const SEED = (() => {
  for (let seed = 1; ; seed++) {
    const s = barrageFor(seed)[0]
    if (Math.hypot(s.cx, s.cz) < 1.5) return seed
  }
})()
const FIRST = barrageFor(SEED)[0]

/** A game half a second in: under way, and well before the first ball lands. */
function game(n = 3, seed = SEED): Game {
  const g = createGame(seed, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 5)
  g.elapsed = 0.5
  return g
}

function stand(g: Game, i: number, x: number, z: number, yaw = 0): void {
  Object.assign(g.players[i], { x, z, yaw, kx: 0, kz: 0, mx: 0, mz: 0 })
}

/** Runs the clock to `until`, everybody holding still. */
function runTo(g: Game, until: number): void {
  while (g.elapsed < until - 1e-9 && !g.over) stepGame(g, Math.min(1 / 60, until - g.elapsed))
}

/** When a ball's middle reaches the point of its line nearest the middle of the deck. */
function arrives(s: Shot): number {
  return s.fire + SHOT.warn + (0 - s.sIn) / s.speed
}

/** Somewhere on the deck no lane touches before `until`. */
function safeSpot(seed: number, until: number): { x: number; z: number } {
  const lanes = barrageFor(seed).filter((s) => s.fire <= until)
  for (let x = -DECK.halfX + 1; x <= DECK.halfX - 1; x += 0.5) {
    for (let z = -DECK.halfZ + 1; z <= DECK.halfZ - 1; z += 0.5) {
      if (lanes.every((s) => offLine(s, x, z) > hitRange(s.radius) + 1)) return { x, z }
    }
  }
  throw new Error('nowhere safe')
}

describe('walking', () => {
  it('goes where it is steered, no faster diagonally, facing the way it walks', () => {
    const g = game()
    stand(g, 0, 0, 0)
    steer(g, 0, 1, 1)
    move(g, 0.1)
    expect(Math.hypot(g.players[0].x, g.players[0].z)).toBeCloseTo(BODY.speed * 0.1, 5)
    expect(g.players[0].yaw).toBeCloseTo(yawTowards({ x: 0, z: 0 }, { x: 1, z: 1 }), 6)
  })

  it('stops at the rails', () => {
    const g = game()
    stand(g, 0, 0, 0)
    steer(g, 0, 1, 0)
    for (let i = 0; i < 60; i++) move(g, 0.05)
    expect(g.players[0].x).toBeCloseTo(DECK.halfX - BODY.radius, 6)
    expect(isStanding(g.players[0])).toBe(true)
  })

  it('keeps bodies apart', () => {
    const g = game(2)
    stand(g, 0, 0, 0)
    stand(g, 1, 0.1, 0)
    move(g, 0.01)
    expect(Math.hypot(g.players[0].x - g.players[1].x, g.players[0].z - g.players[1].z)).toBeGreaterThanOrEqual(BODY.radius * 2 - 1e-9)
  })
})

describe('a shove', () => {
  const EAST = -Math.PI / 2

  it('knocks back whoever is in front and in reach a couple of metres, and nobody behind', () => {
    const g = game(3)
    stand(g, 0, 0, 0, EAST)
    stand(g, 1, 1.2, 0)
    stand(g, 2, -1.2, 0)
    expect(push(g, 0)).toEqual([1])
    for (let i = 0; i < 60; i++) move(g, 1 / 30)
    const moved = g.players[1].x - 1.2
    expect(moved).toBeGreaterThan(2)
    expect(moved).toBeLessThan(3.5)
    expect(Math.abs(g.players[2].x + 1.2)).toBeLessThan(0.05)
  })

  it('misses anybody out of reach or off to the side, and cannot be thrown again at once', () => {
    const g = game(3)
    stand(g, 0, 0, 0, EAST)
    stand(g, 1, PUSH.reach + 0.3, 0)
    stand(g, 2, 0, 1.2)
    expect(push(g, 0)).toEqual([])
    stand(g, 1, 1, 0)
    expect(push(g, 0)).toBe(null)
    for (let k = 0; k < 4; k++) tick(g, PUSH.cooldown / 4)
    expect(push(g, 0)).toEqual([1])
  })

  it('never puts anybody over the rail', () => {
    const g = game(2)
    stand(g, 1, DECK.halfX - 0.8, 0)
    stand(g, 0, DECK.halfX - 2, 0, EAST)
    push(g, 0)
    for (let i = 0; i < 30; i++) move(g, 1 / 30)
    expect(g.players[1].x).toBeLessThanOrEqual(DECK.halfX - BODY.radius + 1e-9)
    expect(isStanding(g.players[1])).toBe(true)
  })
})

describe('a cannonball', () => {
  it('sends anybody in its lane overboard as it reaches them, and misses everybody clear of it', () => {
    const g = game(3)
    const safe = safeSpot(SEED, arrives(FIRST) + 0.5)
    stand(g, 0, FIRST.cx, FIRST.cz)
    stand(g, 1, safe.x, safe.z)
    stand(g, 2, safe.x + (safe.x > 0 ? -0.9 : 0.9), safe.z)
    const reachedAt = arrives(FIRST) - hitRange(FIRST.radius) / FIRST.speed
    runTo(g, reachedAt - 0.05)
    expect(g.players.every(isStanding)).toBe(true)
    runTo(g, reachedAt + 0.05)
    expect(g.players[0].out).not.toBe(null)
    expect(g.players[0].out!).toBeCloseTo(reachedAt, 1)
    expect(g.players[0].by).toBe(null)
    expect(isStanding(g.players[1])).toBe(true)
    expect(isStanding(g.players[2])).toBe(true)
  })

  it('flings whoever it hits up, the way it was flying, over the rail and into the sea', () => {
    const g = game(3)
    const safe = safeSpot(SEED, arrives(FIRST) + 2)
    stand(g, 0, FIRST.cx, FIRST.cz)
    stand(g, 1, safe.x, safe.z)
    stand(g, 2, safe.x + (safe.x > 0 ? -0.9 : 0.9), safe.z)
    runTo(g, arrives(FIRST) + 0.2)
    const p = g.players[0]
    expect(p.y).toBeGreaterThan(0)
    const from = { x: p.x, z: p.z }
    runTo(g, arrives(FIRST) + 2)
    expect((p.x - from.x) * FIRST.dx + (p.z - from.z) * FIRST.dz).toBeGreaterThan(3)
    expect(p.y).toBeLessThan(-2)
  })

  it('shoved into its lane is credited to whoever shoved', () => {
    const g = game(3)
    // Beside the lane, and the shover beyond, facing it.
    const nx = -FIRST.dz
    const nz = FIRST.dx
    const side = hitRange(FIRST.radius) + 0.9
    const victim = { x: FIRST.cx + nx * side, z: FIRST.cz + nz * side }
    const shover = { x: victim.x + nx * 1.2, z: victim.z + nz * 1.2 }
    const safe = safeSpot(SEED, arrives(FIRST) + 0.5)
    stand(g, 0, shover.x, shover.z, yawTowards(shover, victim))
    stand(g, 1, victim.x, victim.z)
    stand(g, 2, safe.x, safe.z)
    runTo(g, arrives(FIRST) - 0.45)
    expect(g.players.every(isStanding)).toBe(true)
    expect(push(g, 0)).toEqual([1])
    runTo(g, arrives(FIRST) + 0.3)
    expect(g.players[1].out).not.toBe(null)
    expect(g.players[1].by).toBe(0)
    expect(g.players[0].kills).toBe(1)
    expect(isStanding(g.players[0])).toBe(true)
  })

  it('never hits anybody before the round starts', () => {
    const g = game(2)
    stand(g, 0, FIRST.cx, FIRST.cz)
    g.elapsed = -5
    move(g, 0.1)
    expect(isStanding(g.players[0])).toBe(true)
    expect(activeShots(SEED, -1)).toEqual([])
  })
})

describe('the end', () => {
  it('is over with one left, who wins; the last to go overboard places next', () => {
    const g = game(3)
    g.players[1].out = 10
    g.players[2].out = 20
    expect(judgeEnd(g)).toBe(true)
    expect(placings(g).map((e) => [e.index, e.place])).toEqual([
      [0, 1],
      [2, 2],
      [1, 3],
    ])
  })

  it('shares a place between two hit at the same moment', () => {
    const g = game(3)
    g.players[1].out = 12
    g.players[2].out = 12
    expect(placings(g).map((e) => e.place)).toEqual([1, 2, 2])
  })

  it('at the limit, everybody standing shares first', () => {
    const g = game(2)
    g.elapsed = ROUND.limit - 0.01
    expect(judgeEnd(g)).toBe(false)
    tick(g, 0.02)
    expect(judgeEnd(g)).toBe(true)
    expect(placings(g).map((e) => e.place)).toEqual([1, 1])
  })

  it('puts anybody who left standing last', () => {
    const g = game(3)
    stepGame(g, 0.5)
    leave(g, 1)
    expect(judgeEnd(g)).toBe(false)
    stepGame(g, 0.5)
    leave(g, 2)
    expect(judgeEnd(g)).toBe(true)
    expect(placings(g).map((e) => e.index)).toEqual([0, 2, 1])
  })
})
