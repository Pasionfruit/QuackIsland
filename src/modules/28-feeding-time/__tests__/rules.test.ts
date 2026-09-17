/**
 * The flick, the throw, the ducks, and the stand-ins.
 */
import { describe, expect, it } from 'vitest'
import { BOT_EVERY, botThrows } from '../internal/ai'
import {
  FLICK,
  POND,
  canThrow,
  createGame,
  duckAt,
  duckCount,
  ducksFor,
  flickToThrow,
  flightTime,
  landing,
  layDucks,
  onPond,
  placings,
  spotOf,
  stepGame,
  throwCracker,
  timeLeft,
  type Game,
  type Throw,
} from '../internal/rules'

const SEED = 1357

function feeders(n: number, bots = false) {
  return Array.from({ length: n }, (_, i) => ({ id: `d${i + 1}`, bot: bots }))
}

function run(game: Game, seconds: number, dt = 0.05) {
  for (let t = 0; t < seconds - 1e-9 && !game.over; t += dt) stepGame(game, dt)
}

/** The exact throw that lands on a duck's spot when the cracker arrives. */
function aimAt(game: Game, player: number, duck: number): Throw {
  const from = spotOf(player, game.players.length)
  const d = ducksFor(game.seed, game.eating.length)[duck]
  let at = duckAt(d, game.elapsed)
  for (let i = 0; i < 6; i++) at = duckAt(d, game.elapsed + flightTime(Math.hypot(at.x - from.x, at.z - from.z)))
  return { angle: Math.atan2(at.x - from.x, from.z - at.z), distance: Math.hypot(at.x - from.x, at.z - from.z) }
}

describe('a flick', () => {
  it('throws only from the bottom third to the top third, quickly enough', () => {
    const low = { x: 0.5, y: 0.85 }
    const high = { x: 0.5, y: 0.2 }
    expect(flickToThrow(low, high, 0.3, 1.6)).not.toBeNull()
    expect(flickToThrow({ x: 0.5, y: 0.5 }, high, 0.3, 1.6)).toBeNull()
    expect(flickToThrow(low, { x: 0.5, y: 0.4 }, 0.3, 1.6)).toBeNull()
    expect(flickToThrow(low, high, FLICK.slowest + 0.01, 1.6)).toBeNull()
  })

  it('goes straight for a straight flick, and leans the way it leans', () => {
    expect(flickToThrow({ x: 0.5, y: 0.9 }, { x: 0.5, y: 0.2 }, 0.3, 1.6)!.angle).toBeCloseTo(0)
    expect(flickToThrow({ x: 0.5, y: 0.9 }, { x: 0.6, y: 0.2 }, 0.3, 1.6)!.angle).toBeGreaterThan(0.1)
    expect(flickToThrow({ x: 0.5, y: 0.9 }, { x: 0.4, y: 0.2 }, 0.3, 1.6)!.angle).toBeLessThan(-0.1)
    expect(Math.abs(flickToThrow({ x: 0.1, y: 0.7 }, { x: 0.99, y: 0.3 }, 0.1, 3)!.angle)).toBeLessThanOrEqual(POND.lean)
  })

  it('goes further the faster it is, within limits', () => {
    const slow = flickToThrow({ x: 0.5, y: 0.9 }, { x: 0.5, y: 0.25 }, 0.65, 1.6)!
    const fast = flickToThrow({ x: 0.5, y: 0.9 }, { x: 0.5, y: 0.25 }, 0.2, 1.6)!
    expect(fast.distance).toBeGreaterThan(slow.distance)
    expect(slow.distance).toBeGreaterThanOrEqual(POND.distance[0])
    expect(flickToThrow({ x: 0.5, y: 0.99 }, { x: 0.5, y: 0.01 }, 0.02, 1.6)!.distance).toBe(POND.distance[1])
  })
})

describe('the pond', () => {
  it('keeps every duck on the water, all the time', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const duck of layDucks(seed, duckCount(8))) {
        for (let t = 0; t < 120; t += 0.5) {
          const at = duckAt(duck, t)
          expect(onPond({ x: at.x * 1.05, z: POND.centreZ + (at.z - POND.centreZ) * 1.05 }), `${seed} ${t}`).toBe(true)
        }
      }
    }
  })

  it('has more ducks for more players, the same ducks for the same seed', () => {
    expect(duckCount(2)).toBe(POND.ducks)
    expect(duckCount(8)).toBe(POND.ducks + 4)
    expect(layDucks(SEED, 7)).toEqual(layDucks(SEED, 7))
    expect(layDucks(SEED + 1, 7)).not.toEqual(layDucks(SEED, 7))
  })

  it('reaches every duck from the bank, and swims them smoothly', () => {
    const d = ducksFor(SEED, 7)[0]
    const a = duckAt(d, 10)
    const b = duckAt(d, 10.05)
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.3)
    for (const spot of [spotOf(0, 8), spotOf(7, 8)]) {
      const far = Math.hypot(POND.radiusX, POND.centreZ - POND.radiusZ - spot.z)
      expect(far).toBeLessThanOrEqual(POND.distance[1] + POND.spot * 3.5)
      expect(landing(spot, { angle: 0, distance: POND.distance[0] }).z).toBeLessThan(POND.bankZ)
    }
  })
})

describe('a throw', () => {
  it('flies from your spot and feeds the duck it lands by, for a point', () => {
    const game = createGame(SEED, feeders(2))
    run(game, 2)
    const cracker = throwCracker(game, 1, aimAt(game, 1, 3))!
    expect(cracker.from).toEqual(spotOf(1, 2))
    expect(cracker.lands).toBeCloseTo(game.elapsed + flightTime(Math.hypot(cracker.to.x - cracker.from.x, cracker.to.z - cracker.from.z)), 5)
    run(game, flightTime(POND.distance[1]) + 0.1)
    expect(cracker.fed).toBe(3)
    expect(game.players[1].score).toBe(1)
    expect(game.eating[3]).toBeCloseTo(cracker.lands + POND.eat)
  })

  it('feeds nobody far from a duck, or on the bank', () => {
    const game = createGame(SEED, feeders(1))
    const miss = throwCracker(game, 0, { angle: 0, distance: 3 })!
    run(game, 2)
    expect(onPond(miss.to) ? miss.fed : -1).toBe(-1)
    expect(game.players[0].score).toBe(0)
  })

  it('cannot feed a duck that is still eating', () => {
    const game = createGame(SEED, feeders(2))
    run(game, 3)
    throwCracker(game, 0, aimAt(game, 0, 1))
    throwCracker(game, 1, aimAt(game, 1, 1))
    run(game, 2)
    expect(game.players[0].score + game.players[1].score).toBe(1)
  })

  it('waits for the reload, counts a said-again throw once, and allows a guest a moment early', () => {
    const game = createGame(SEED, feeders(1))
    expect(throwCracker(game, 0, { angle: 0, distance: 8 })).not.toBeNull()
    expect(canThrow(game, 0)).toBe(false)
    expect(throwCracker(game, 0, { angle: 0, distance: 8 })).toBeNull()
    stepGame(game, POND.reload - POND.reloadGrace / 2)
    expect(throwCracker(game, 0, { angle: 0, distance: 8 })).toBeNull()
    expect(throwCracker(game, 0, { angle: 0, distance: 8 }, 1)).not.toBeNull()
    run(game, POND.reload + 0.05)
    expect(throwCracker(game, 0, { angle: 0, distance: 8 }, 1)).toBeNull()
    expect(game.players[0].throws).toBe(2)
  })

  it('clamps a throw asked for past the limits', () => {
    const game = createGame(SEED, feeders(1))
    const c = throwCracker(game, 0, { angle: 5, distance: 500 })!
    const d = Math.hypot(c.to.x - c.from.x, c.to.z - c.from.z)
    expect(d).toBeCloseTo(POND.distance[1])
  })
})

describe('the round', () => {
  it('ends at a minute, landing anything still in the air, and ranks by ducks fed', () => {
    const game = createGame(SEED, feeders(3))
    run(game, POND.duration - 0.1)
    const late = throwCracker(game, 2, aimAt(game, 2, 0))!
    run(game, 1)
    expect(game.over).toBe(true)
    expect(timeLeft(game)).toBe(0)
    expect(late.fed).not.toBeNull()
    game.players.forEach((p, i) => (p.score = [4, 9, 4][i]))
    expect(placings(game).map((e) => [e.index, e.place])).toEqual([
      [1, 1],
      [0, 2],
      [2, 2],
    ])
  })

  it('drops crackers a moment after they land', () => {
    const game = createGame(SEED, feeders(1))
    throwCracker(game, 0, { angle: 0, distance: 10 })
    run(game, flightTime(10) + POND.float + 0.2)
    expect(game.crackers).toHaveLength(0)
  })
})

describe('the stand-ins', () => {
  it('throw now and then, feed plenty, and miss some', () => {
    const scores: number[] = []
    let throws = 0
    for (let seed = 1; seed <= 8; seed++) {
      const game = createGame(seed, [{ id: 'me' }, ...feeders(3, true)])
      while (!game.over) {
        for (const move of botThrows(game)) throwCracker(game, move.player, move.thrown)
        stepGame(game, 1 / 30)
      }
      const bots = game.players.slice(1)
      scores.push(...bots.map((b) => b.score))
      throws += bots.reduce((n, b) => n + b.throws, 0)
      for (const bot of bots) {
        expect(bot.throws).toBeLessThanOrEqual(POND.duration / BOT_EVERY[0] + 1)
        expect(bot.throws).toBeGreaterThan(POND.duration / BOT_EVERY[1] - 10)
      }
    }
    const fed = scores.reduce((a, b) => a + b, 0)
    expect(fed / throws).toBeGreaterThan(0.25)
    expect(fed / throws).toBeLessThan(0.85)
  })
})
