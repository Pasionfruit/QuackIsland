/**
 * The rules of Duck Hunt: a shot, the cooldown, a pop, and whose it was.
 */
import { describe, expect, it } from 'vitest'
import { BOT_ACCURACY, botShot, botShots } from '../internal/ai'
import { ARENA, balloonAt, lifetime } from '../internal/arena'
import { balloonsFor, createGame, fire, placings, ready, stepGame, timeLeft, type Game } from '../internal/game'
import { MAX_PLAYERS, SOLO_PLAYERS, gameRoster, newGame } from '../internal/setup'

const SEED = 777
const origin = { x: 0, y: 5, z: 20 }

function game(players = 3): Game {
  return createGame(SEED, Array.from({ length: players }, (_, i) => ({ id: `p${i}` })))
}

/** Runs the clock to the moment a balloon is well up. */
function upBalloon(g: Game, owner: number) {
  const balloon = g.balloons.find((b) => b.owner === owner && b.spawnAt >= g.elapsed)!
  stepTo(g, balloon.spawnAt + 1)
  return balloon
}

function stepTo(g: Game, time: number) {
  while (g.elapsed < time - 1e-9 && !g.over) stepGame(g, Math.min(0.25, time - g.elapsed))
}

describe('a shot', () => {
  it('pops your own balloon and scores', () => {
    const g = game()
    const b = upBalloon(g, 0)
    expect(fire(g, { shooter: 0, balloon: b.id, point: balloonAt(b, g.elapsed)! })).toBe(true)
    expect(g.popped.get(b.id)).toBe(0)
    expect(g.players[0].score).toBe(1)
    expect(g.players[0].lastShot).toMatchObject({ hit: true, own: true })
  })

  it("pops somebody else's without scoring - for anybody", () => {
    const g = game()
    const b = upBalloon(g, 1)
    fire(g, { shooter: 0, balloon: b.id, point: origin })
    expect(g.popped.get(b.id)).toBe(0)
    expect(g.players[0].score).toBe(0)
    expect(g.players[1].score).toBe(0)
    expect(g.players[0].lastShot).toMatchObject({ hit: true, own: false })
  })

  it('costs half a second, hit or miss', () => {
    const g = game()
    fire(g, { shooter: 0, balloon: null, point: origin })
    expect(g.players[0].cooldown).toBe(ARENA.cooldown)
    expect(ready(g, 0)).toBe(false)
    expect(g.players[0].shots).toBe(1)
    expect(g.players[0].lastShot).toMatchObject({ hit: false, own: false })
    stepTo(g, ARENA.cooldown)
    expect(ready(g, 0)).toBe(true)
  })

  it('is not taken at all while still cooling down', () => {
    const g = game()
    const b = upBalloon(g, 0)
    fire(g, { shooter: 0, balloon: null, point: origin })
    stepGame(g, 0.5)
    expect(fire(g, { shooter: 0, balloon: b.id, point: origin })).toBe(false)
    expect(g.popped.has(b.id)).toBe(false)
    expect(g.players[0].shots).toBe(1)
  })

  it('is taken a moment early, allowing for the network', () => {
    const g = game()
    fire(g, { shooter: 0, balloon: null, point: origin })
    stepTo(g, ARENA.cooldown - ARENA.cooldownGrace / 2)
    expect(g.players[0].cooldown).toBeGreaterThan(0)
    expect(fire(g, { shooter: 0, balloon: null, point: origin })).toBe(true)
  })

  it('cannot pop a balloon twice, or one that is not up', () => {
    const g = game()
    const b = upBalloon(g, 0)
    fire(g, { shooter: 1, balloon: b.id, point: origin })
    fire(g, { shooter: 0, balloon: b.id, point: origin })
    expect(g.popped.get(b.id)).toBe(1)
    expect(g.players[0].score).toBe(0)

    const later = g.balloons.find((x) => x.owner === 2 && x.spawnAt > g.elapsed + 5)!
    fire(g, { shooter: 2, balloon: later.id, point: origin })
    expect(g.popped.has(later.id)).toBe(false)
    expect(g.players[2].shots).toBe(1)

    const g2 = game()
    const gone = g2.balloons.find((x) => x.owner === 0)!
    stepTo(g2, gone.spawnAt + lifetime(gone) + ARENA.escapeGrace + 0.5)
    fire(g2, { shooter: 0, balloon: gone.id, point: origin })
    expect(g2.players[0].score).toBe(0)
  })

  it('is dealt with once, however many times it is said', () => {
    const g = game()
    const b = upBalloon(g, 0)
    for (let i = 0; i < 5; i++) fire(g, { shooter: 0, balloon: b.id, point: origin, seq: 1 })
    expect(g.players[0].shots).toBe(1)
    expect(g.players[0].seq).toBe(1)
    stepTo(g, g.elapsed + ARENA.cooldown)
    // An older number arriving late changes nothing.
    fire(g, { shooter: 0, balloon: null, point: origin, seq: 1 })
    expect(g.players[0].shots).toBe(1)
  })

  it('still counts as dealt with when refused for being too soon, so it is not said for ever', () => {
    const g = game()
    fire(g, { shooter: 0, balloon: null, point: origin, seq: 1 })
    expect(fire(g, { shooter: 0, balloon: null, point: origin, seq: 2 })).toBe(false)
    expect(g.players[0].seq).toBe(2)
  })

  it('is not taken once time is up', () => {
    const g = game()
    stepTo(g, ARENA.duration)
    expect(g.over).toBe(true)
    expect(fire(g, { shooter: 0, balloon: null, point: origin })).toBe(false)
  })
})

describe('the clock', () => {
  it('runs a minute and stops', () => {
    const g = game()
    expect(timeLeft(g)).toBe(ARENA.duration)
    stepTo(g, ARENA.duration + 5)
    expect(g.over).toBe(true)
    expect(g.elapsed).toBe(ARENA.duration)
    expect(timeLeft(g)).toBe(0)
  })

  it('clamps a huge frame', () => {
    const g = game()
    stepGame(g, 30)
    expect(g.elapsed).toBeLessThanOrEqual(0.25)
  })

  it('has given everybody the same number of balloons at any moment', () => {
    const g = game(5)
    stepTo(g, 23.3)
    const counts = g.players.map((_, i) => balloonsFor(g, i))
    expect(new Set(counts).size).toBe(1)
  })
})

describe('the placings', () => {
  it('rank by own balloons popped, sharing a place on a tie', () => {
    const g = game(4)
    g.players[0].score = 5
    g.players[1].score = 9
    g.players[2].score = 5
    g.players[3].score = 1
    expect(placings(g).map((e) => [e.player.id, e.place])).toEqual([
      ['p1', 1],
      ['p0', 2],
      ['p2', 2],
      ['p3', 4],
    ])
  })
})

describe('the stand-ins', () => {
  it('only shoot when they can, and aim at their own balloons', () => {
    const g = createGame(SEED, Array.from({ length: 4 }, (_, i) => ({ id: `bot${i}`, bot: true })))
    let fired = 0
    while (!g.over) {
      for (const shot of botShots(g)) {
        expect(ready(g, shot.shooter)).toBe(true)
        if (shot.balloon !== null) expect(g.balloons[shot.balloon].owner).toBe(shot.shooter)
        expect(fire(g, shot)).toBe(true)
        fired += 1
      }
      stepGame(g, 1 / 30)
    }
    expect(fired).toBeGreaterThan(40)
    for (const p of g.players) {
      expect(p.score).toBeGreaterThan(0)
      // Beatable: nowhere near a shot every cooldown, and misses some.
      expect(p.shots).toBeLessThan(ARENA.duration / ARENA.cooldown)
      expect(p.score / p.shots).toBeLessThan(BOT_ACCURACY + 0.2)
    }
  })

  it('never shoots for a person', () => {
    const g = game()
    expect(botShot(g, 0)).toBeNull()
  })
})

describe('dealing a game', () => {
  it('is you and three stand-ins alone', () => {
    expect(gameRoster()).toHaveLength(SOLO_PLAYERS)
    const g = newGame()
    expect(g.players.filter((p) => p.mine)).toHaveLength(1)
    expect(g.players.filter((p) => p.bot)).toHaveLength(SOLO_PLAYERS - 1)
    expect(MAX_PLAYERS).toBe(8)
  })
})
