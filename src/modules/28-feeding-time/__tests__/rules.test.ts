/**
 * The aim and the charge, the throw, the ducks, and the stand-ins.
 */
import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { BOT_EVERY, botThrows } from '../internal/ai'
import { FOV, frameScene, groundAt } from '../internal/camera'
import {
  CHARGE,
  POND,
  aimThrow,
  canThrow,
  chargePower,
  createGame,
  duckAt,
  duckCount,
  ducksFor,
  distancePower,
  flightTime,
  landing,
  layDucks,
  onPond,
  placings,
  powerDistance,
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

describe('the charge', () => {
  it('rises from nothing to full, then falls back and rises again', () => {
    expect(chargePower(0)).toBe(0)
    expect(chargePower(CHARGE.fill / 2)).toBeCloseTo(0.5)
    expect(chargePower(CHARGE.fill)).toBeCloseTo(1)
    expect(chargePower(CHARGE.fill * 1.5)).toBeCloseTo(0.5)
    expect(chargePower(CHARGE.fill * 2)).toBeCloseTo(0)
    expect(chargePower(CHARGE.fill * 2.25)).toBeCloseTo(0.25)
    for (let t = 0; t < 10; t += 0.07) {
      expect(chargePower(t)).toBeGreaterThanOrEqual(0)
      expect(chargePower(t)).toBeLessThanOrEqual(1)
    }
  })

  it('throws further for more power, within limits, and the reach reads back', () => {
    expect(powerDistance(0)).toBe(POND.distance[0])
    expect(powerDistance(1)).toBe(POND.distance[1])
    expect(powerDistance(0.6)).toBeGreaterThan(powerDistance(0.3))
    expect(powerDistance(5)).toBe(POND.distance[1])
    for (const d of [3, 7.5, 12, 20]) expect(powerDistance(distancePower(d))).toBeCloseTo(d)
    expect(distancePower(1)).toBe(0)
    expect(distancePower(40)).toBe(1)
  })
})

describe('the aim', () => {
  it('goes the way the pointer is, and lands on it with the power that reaches it', () => {
    const from = spotOf(1, 4)
    for (const target of [{ x: 0, z: -9 }, { x: -7, z: -5 }, { x: 5, z: -14 }]) {
      const power = distancePower(Math.hypot(target.x - from.x, target.z - from.z))
      const at = landing(from, aimThrow(from, target, power))
      expect(at.x).toBeCloseTo(target.x)
      expect(at.z).toBeCloseTo(target.z)
    }
  })

  it('goes straight ahead for a point straight ahead, and leans no further than the limit', () => {
    const from = spotOf(0, 1)
    expect(aimThrow(from, { x: from.x, z: -8 }, 0.5).angle).toBeCloseTo(0)
    expect(aimThrow(from, { x: from.x + 3, z: -8 }, 0.5).angle).toBeGreaterThan(0.1)
    expect(aimThrow(from, { x: from.x - 3, z: -8 }, 0.5).angle).toBeLessThan(-0.1)
    expect(Math.abs(aimThrow(from, { x: from.x + 30, z: from.z }, 0.5).angle)).toBeLessThanOrEqual(POND.lean)
  })

  it('finds the same spot under the pointer as the canvas camera does', () => {
    for (const aspect of [0.75, 1.6, 2.2]) {
      const shot = frameScene(aspect)
      const camera = new PerspectiveCamera(FOV, aspect, 0.5, 300)
      camera.position.set(shot.x, shot.y, shot.z)
      camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
      camera.updateMatrixWorld()
      for (const [across, down] of [[0.5, 0.5], [0.1, 0.2], [0.9, 0.8], [0.3, 0.95]]) {
        const ray = new Vector3(across * 2 - 1, 1 - down * 2, 0.5).unproject(camera).sub(camera.position).normalize()
        const s = -camera.position.y / ray.y
        const at = groundAt(across, down, aspect)!
        expect(at.x).toBeCloseTo(camera.position.x + ray.x * s, 4)
        expect(at.z).toBeCloseTo(camera.position.z + ray.z * s, 4)
      }
    }
  })

  it('finds the pond under the pointer at any window shape', () => {
    for (const aspect of [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.2, 3]) {
      // The middle of the view is on the water, left of it is left, higher is further.
      const middle = groundAt(0.5, 0.5, aspect)!
      expect(onPond(middle), `${aspect}`).toBe(true)
      expect(middle.x).toBeCloseTo(0)
      expect(groundAt(0.3, 0.5, aspect)!.x).toBeLessThan(-0.5)
      expect(groundAt(0.5, 0.3, aspect)!.z).toBeLessThan(middle.z - 0.5)
      // The top of the view is still ground, beyond the pond.
      expect(groundAt(0.5, 0, aspect)).not.toBeNull()
    }
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
