/**
 * The rules: sliding on the ice, running, colliding, falling, and who is left.
 */
import { describe, expect, it } from 'vitest'
import { HALF, PHASES, ROUND_LENGTH, dealFor, panelAt, panelCentre } from '../internal/arena'
import { BODY, BUMP, ROUND, SLIDE, createGame, isStanding, judgeEnd, leave, move, placings, slide, speedOf, steer, stepGame, type Game } from '../internal/rules'

const SEED = 8080
const EAST = -Math.PI / 2

function game(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 5)
}

function stand(g: Game, i: number, x: number, z: number, yaw = 0): void {
  Object.assign(g.players[i], { x, z, yaw, vx: 0, vz: 0, mx: 0, mz: 0, run: false, knockedBy: null, knockedAt: -Infinity })
}

/** Runs the clock to `until`, everybody holding still. */
function runTo(g: Game, until: number): void {
  while (g.elapsed < until - 1e-9 && !g.over) stepGame(g, Math.min(1 / 30, until - g.elapsed))
}

/** Holds `mx`, `mz` for `seconds`, in 60ths. */
function hold(g: Game, i: number, mx: number, mz: number, seconds: number, run = false): void {
  steer(g, i, mx, mz, EAST, run)
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) move(g, 1 / 60)
}

describe('the ice', () => {
  it('gets up to a walk, and no faster on a diagonal', () => {
    const g = game()
    stand(g, 0, -4, -4)
    hold(g, 0, 1, 1, 3)
    expect(speedOf(g.players[0])).toBeGreaterThan(BODY.walk * 0.95)
    expect(speedOf(g.players[0])).toBeLessThanOrEqual(BODY.walk + 1e-9)
    // Not instantly: a third of a second in, it has got most of the way and not all of it.
    const h = game()
    stand(h, 0, 0, 0)
    hold(h, 0, 1, 0, 0.1)
    expect(speedOf(h.players[0])).toBeGreaterThan(0.1)
    expect(speedOf(h.players[0])).toBeLessThan(BODY.walk * 0.5)
  })

  it('keeps sliding when you let go, a long way', () => {
    const g = game()
    stand(g, 0, -8, 0)
    hold(g, 0, 1, 0, 2)
    const x = g.players[0].x
    const v = speedOf(g.players[0])
    hold(g, 0, 0, 0, 1)
    // A second on, still going at about half its speed - it is ice - and further along.
    expect(speedOf(g.players[0])).toBeGreaterThan(v * 0.4)
    expect(g.players[0].x).toBeGreaterThan(x + v * 0.5)
    hold(g, 0, 0, 0, 3)
    expect(g.players[0].x - x).toBeGreaterThan(4)
  })

  it('is stopped quicker by steering against it than by letting go', () => {
    const drift = game()
    const brake = game()
    for (const g of [drift, brake]) {
      stand(g, 0, -8, 0)
      hold(g, 0, 1, 0, 2)
    }
    hold(drift, 0, 0, 0, 0.3)
    hold(brake, 0, -1, 0, 0.3)
    // A third of a second on: the one that let go is still going, the one that steered against it has stopped and is coming back.
    expect(drift.players[0].vx).toBeGreaterThan(BODY.walk * 0.6)
    expect(brake.players[0].vx).toBeLessThan(drift.players[0].vx * 0.3)
  })

  it('has a runner nearly twice as fast, and slower to turn', () => {
    const walker = game()
    const runner = game()
    stand(walker, 0, -8, -8)
    stand(runner, 0, -8, -8)
    hold(walker, 0, 1, 0, 2.5)
    hold(runner, 0, 1, 0, 2.5, true)
    expect(speedOf(runner.players[0])).toBeGreaterThan(BODY.walk * 1.6)
    expect(speedOf(runner.players[0])).toBeLessThanOrEqual(BODY.run + 1e-9)
    // Then turn to go south: half a second later the walker has come round more than the runner.
    const heading = (g: Game) => Math.atan2(g.players[0].vz, g.players[0].vx)
    hold(walker, 0, 0, 1, 0.5)
    hold(runner, 0, 0, 1, 0.5, true)
    expect(heading(walker)).toBeGreaterThan(heading(runner) + 0.3)
  })

  it('is one function, pure, that a guest can run the same way: no time, no change; no speed, no drift', () => {
    expect(slide(3, -2, 1, 0, false, 0)).toEqual({ vx: 3, vz: -2 })
    expect(slide(0, 0, 0, 0, false, 1)).toEqual({ vx: 0, vz: 0 })
    const v = slide(20, 20, 0, 0, true, 0.1)
    expect(Math.hypot(v.vx, v.vz)).toBeLessThanOrEqual(SLIDE.cap + 1e-9)
    expect(slide(1, 1, 1, 0, false, -5)).toEqual({ vx: 1, vz: 1 })
  })

  it('does not move before the start', () => {
    const g = game()
    g.elapsed = -1
    stand(g, 0, 0, 0)
    steer(g, 0, 1, 0, EAST, true)
    move(g, 0.1)
    expect(g.players[0]).toMatchObject({ x: 0, z: 0, vx: 0, vz: 0 })
  })

  it('off the edge is a fall, and out', () => {
    const g = game(3)
    stand(g, 0, HALF - 0.2, 0)
    steer(g, 0, 1, 0, EAST)
    for (let i = 0; i < 20; i++) stepGame(g, 0.05)
    expect(g.players[0].out).not.toBe(null)
    expect(g.players[0].by).toBe(null)
    for (let i = 0; i < 20; i++) stepGame(g, 0.05)
    expect(g.players[0].y).toBeLessThan(-2)
  })

  it('slides off the edge with nobody steering, if it is going fast enough', () => {
    const g = game(3)
    stand(g, 0, HALF - 1.5, 0)
    g.players[0].vx = BODY.run
    for (let i = 0; i < 30; i++) stepGame(g, 0.05)
    expect(g.players[0].out).not.toBe(null)
  })
})

describe('colliding', () => {
  it('keeps bodies apart', () => {
    const g = game(2)
    stand(g, 0, 0, 0)
    stand(g, 1, 0.1, 0)
    move(g, 0.01)
    expect(Math.hypot(g.players[0].x - g.players[1].x, g.players[0].z - g.players[1].z)).toBeGreaterThanOrEqual(BODY.radius * 2 - 1e-9)
  })

  it('sends somebody standing still off with almost all of a runner’s speed, and stops the runner nearly dead', () => {
    const g = game(3)
    stand(g, 0, -4, 0)
    stand(g, 1, -1, 0)
    stand(g, 2, 6, 6)
    g.players[0].vx = BODY.run
    // The runner's speed just before they touch: it has been sliding, and so slowing a little.
    let before = 0
    for (let i = 0; i < 60 && g.players[1].vx < 1; i++) {
      before = g.players[0].vx
      move(g, 1 / 60)
    }
    expect(before).toBeGreaterThan(BODY.run * 0.7)
    expect(g.players[1].vx).toBeGreaterThan(before * 0.9)
    expect(g.players[0].vx).toBeLessThan(before * 0.1)
    // Equal bodies: what one lost the other gained - the speed is handed over, not made or lost, bar the little that drifted in the step.
    expect(g.players[0].vx + g.players[1].vx).toBeCloseTo(before, 0)
  })

  it('bounces two runners off each other', () => {
    const g = game(3)
    stand(g, 0, -1.5, 0)
    stand(g, 1, 1.5, 0)
    stand(g, 2, 6, 6)
    g.players[0].vx = BODY.run
    g.players[1].vx = -BODY.run
    for (let i = 0; i < 60 && g.players[0].vx > 0; i++) move(g, 1 / 60)
    expect(g.players[0].vx).toBeLessThan(-BODY.run * BUMP.bounce * 0.9)
    expect(g.players[1].vx).toBeGreaterThan(BODY.run * BUMP.bounce * 0.9)
  })

  it('credits a hard knock to whoever was going faster into the other, and not a nudge', () => {
    const g = game(3)
    stand(g, 0, -3, 0)
    stand(g, 1, -0.3, 0)
    stand(g, 2, 6, 6)
    g.players[0].vx = BODY.run
    for (let i = 0; i < 60 && g.players[1].vx < 1; i++) move(g, 1 / 60)
    expect(g.players[1]).toMatchObject({ knockedBy: 0 })
    expect(g.players[0].knockedBy).toBe(null)

    const gentle = game(3)
    stand(gentle, 0, -1.1, 0)
    stand(gentle, 1, 0, 0)
    stand(gentle, 2, 6, 6)
    gentle.players[0].vx = BUMP.hard * 0.5
    for (let i = 0; i < 240 && gentle.players[1].vx < 0.2; i++) move(gentle, 1 / 60)
    expect(gentle.players[1].vx).toBeGreaterThan(0.2)
    expect(gentle.players[1].knockedBy).toBe(null)
  })

  it('off the edge is credited to whoever knocked, if it was just now', () => {
    const g = game(3)
    stand(g, 1, HALF - 1.2, 0)
    stand(g, 0, HALF - 4.2, 0)
    stand(g, 2, -HALF + 1.5, -HALF + 1.5)
    g.players[0].vx = BODY.run
    for (let i = 0; i < 90; i++) stepGame(g, 1 / 30)
    expect(g.players[1].out).not.toBe(null)
    expect(g.players[1].by).toBe(0)
    expect(g.players[0].kills).toBe(1)
    // The runner stopped where it hit, and is still standing.
    expect(isStanding(g.players[0])).toBe(true)
  })

  it('does not credit a fall that comes long after the knock', () => {
    const g = game(3)
    stand(g, 1, HALF - 0.3, 0)
    stand(g, 2, -HALF + 1.5, -HALF + 1.5)
    g.players[1].knockedBy = 0
    g.players[1].knockedAt = g.elapsed - BUMP.credit - 1
    steer(g, 1, 1, 0, EAST)
    for (let i = 0; i < 20; i++) stepGame(g, 0.05)
    expect(g.players[1].out).not.toBe(null)
    expect(g.players[1].by).toBe(null)
    expect(g.players[0].kills).toBe(0)
  })

  it('comes out the same every time', () => {
    const run = () => {
      const g = game(4)
      stand(g, 0, -4, 0)
      stand(g, 1, -1, 0.3)
      stand(g, 2, 1, -0.4)
      stand(g, 3, 3, 0)
      g.players[0].vx = BODY.run
      for (let i = 0; i < 90; i++) move(g, 1 / 60)
      return g.players.map((p) => [p.x, p.z, p.vx, p.vz, p.knockedBy])
    }
    expect(run()).toEqual(run())
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
    // Decided, but the last fall is watched before it is over.
    expect(judgeEnd(g)).toBe(false)
    runTo(g, g.elapsed + ROUND.finish + 0.1)
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
