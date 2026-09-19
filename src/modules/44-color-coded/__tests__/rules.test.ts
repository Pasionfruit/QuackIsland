/**
 * The rules: walking, shoving, falling, and who is left.
 */
import { describe, expect, it } from 'vitest'
import { GRID, HALF, PHASES, ROUND_LENGTH, dealFor, panelAt, panelCentre } from '../internal/arena'
import { BODY, PUSH, ROUND, createGame, isStanding, judgeEnd, leave, move, placings, push, steer, stepGame, tick, yawTowards, type Game } from '../internal/rules'

const SEED = 8080
const EAST = -Math.PI / 2

function game(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 5)
}

function stand(g: Game, i: number, x: number, z: number, yaw = 0): void {
  Object.assign(g.players[i], { x, z, yaw, kx: 0, kz: 0, mx: 0, mz: 0 })
}

/** Runs the clock to `until`, everybody holding still. */
function runTo(g: Game, until: number): void {
  while (g.elapsed < until - 1e-9 && !g.over) stepGame(g, Math.min(1 / 30, until - g.elapsed))
}

describe('walking', () => {
  it('goes where it is steered, no faster diagonally', () => {
    const g = game()
    stand(g, 0, 0, 0)
    steer(g, 0, 1, 1, 0)
    move(g, 0.1)
    expect(Math.hypot(g.players[0].x, g.players[0].z)).toBeCloseTo(BODY.speed * 0.1, 5)
  })

  it('keeps bodies apart', () => {
    const g = game(2)
    stand(g, 0, 0, 0)
    stand(g, 1, 0.1, 0)
    move(g, 0.01)
    expect(Math.hypot(g.players[0].x - g.players[1].x, g.players[0].z - g.players[1].z)).toBeGreaterThanOrEqual(BODY.radius * 2 - 1e-9)
  })

  it('off the edge is a fall, and out', () => {
    const g = game(3)
    stand(g, 0, HALF - 0.2, 0)
    steer(g, 0, 1, 0, EAST)
    for (let i = 0; i < 10; i++) stepGame(g, 0.05)
    expect(g.players[0].out).not.toBe(null)
    expect(g.players[0].by).toBe(null)
    for (let i = 0; i < 20; i++) stepGame(g, 0.05)
    expect(g.players[0].y).toBeLessThan(-2)
  })
})

describe('a shove', () => {
  it('knocks back whoever is in front and in reach, about a panel, and nobody behind', () => {
    const g = game(3)
    stand(g, 0, 0, 0, EAST)
    stand(g, 1, 1.2, 0)
    stand(g, 2, -1.2, 0)
    expect(push(g, 0)).toEqual([1])
    for (let i = 0; i < 60; i++) move(g, 1 / 30)
    const moved = g.players[1].x - 1.2
    expect(moved).toBeGreaterThan(GRID.cell * 0.7)
    expect(moved).toBeLessThan(GRID.cell * 1.4)
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

  it('off the edge is credited to whoever shoved', () => {
    const g = game(3)
    stand(g, 1, HALF - 0.8, 0)
    stand(g, 0, HALF - 2, 0, yawTowards({ x: HALF - 2, z: 0 }, { x: HALF, z: 0 }))
    stand(g, 2, -HALF + 1.5, -HALF + 1.5)
    push(g, 0)
    for (let i = 0; i < 30; i++) stepGame(g, 1 / 30)
    expect(g.players[1].out).not.toBe(null)
    expect(g.players[1].by).toBe(0)
    expect(g.players[0].kills).toBe(1)
  })
})

describe('the drop', () => {
  it('takes everybody off the colour and leaves everybody on it', () => {
    const g = game(3)
    const deal = dealFor(SEED, 1)
    const right = panelCentre(deal.panels.findIndex((c) => c === deal.colour))
    const wrong = panelCentre(deal.panels.findIndex((c) => c !== deal.colour))
    stand(g, 0, right.x, right.z)
    stand(g, 1, wrong.x, wrong.z)
    stand(g, 2, right.x + 0.8, right.z)
    runTo(g, PHASES.spin + PHASES.reveal - 0.05)
    expect(g.players.every(isStanding)).toBe(true)
    runTo(g, PHASES.spin + PHASES.reveal + 0.1)
    expect(g.players.map((p) => p.out !== null)).toEqual([false, true, false])
  })

  it('leaves anybody on the colour standing into the next round, with the gaps filled again', () => {
    const g = game(3)
    const deal = dealFor(SEED, 1)
    const right = panelCentre(deal.panels.findIndex((c) => c === deal.colour))
    stand(g, 0, right.x, right.z)
    stand(g, 1, right.x + 0.8, right.z)
    const wrong = panelCentre(deal.panels.findIndex((c) => c !== deal.colour))
    stand(g, 2, wrong.x, wrong.z)
    runTo(g, ROUND_LENGTH + 0.5)
    expect(g.players.map((p) => p.out !== null)).toEqual([false, false, true])
    // Round two: walk anywhere again.
    steer(g, 0, 1, 0, EAST)
    for (let i = 0; i < 10; i++) stepGame(g, 0.05)
    expect(g.players[0].out).toBe(null)
    expect(panelAt(g.players[0].x, g.players[0].z)).toBeGreaterThanOrEqual(0)
  })
})

describe('the end', () => {
  it('is over with one left, who wins; those who fell together share', () => {
    const g = game(3)
    const deal = dealFor(SEED, 1)
    const right = panelCentre(deal.panels.findIndex((c) => c === deal.colour))
    const wrongs = deal.panels.map((c, i) => (c === deal.colour ? -1 : i)).filter((i) => i >= 0)
    stand(g, 0, right.x, right.z)
    for (const k of [1, 2]) {
      const w = panelCentre(wrongs[k * 3])
      stand(g, k, w.x, w.z)
    }
    runTo(g, PHASES.spin + PHASES.reveal + 0.2)
    expect(judgeEnd(g)).toBe(true)
    expect(placings(g).map((e) => [e.index, e.place])).toEqual([
      [0, 1],
      [1, 2],
      [2, 2],
    ])
  })

  it('at the limit, everybody standing shares first', () => {
    const g = game(2)
    g.elapsed = ROUND.limit - 0.01
    stepGame(g, 0.02)
    expect(g.over).toBe(true)
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
