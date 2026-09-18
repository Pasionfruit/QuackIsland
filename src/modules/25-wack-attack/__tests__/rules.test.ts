/**
 * The field, the moles, the hammer, and the stand-ins.
 */
import { describe, expect, it } from 'vitest'
import { BOT_IGNORES, botIntents } from '../internal/ai'
import {
  FIELD,
  HOLES,
  canSwing,
  createGame,
  holeAt,
  isStunned,
  isUp,
  molesFor,
  placings,
  schedule,
  stepGame,
  strikePoint,
  swing,
  timeLeft,
  walk,
  whackOf,
  type Game,
  type Intent,
  type Mole,
} from '../internal/rules'

const SEED = 9001
const NONE = new Map<string, Intent>()

function whackers(n: number, bots = false) {
  return Array.from({ length: n }, (_, i) => ({ id: `w${i + 1}`, bot: bots }))
}

/** The clock straight to a moment, walking nobody. */
function at(game: Game, time: number) {
  while (game.elapsed < time - 1e-9) stepGame(game, NONE, Math.min(0.05, time - game.elapsed))
}

/** Stands a whacker just short of a hole, facing it, so the hammer lands on it. */
function lineUp(game: Game, player: number, hole: number) {
  const h = holeAt(hole)
  Object.assign(game.players[player], { x: h.x - FIELD.strike, y: h.y, facing: 0 })
}

describe('the field', () => {
  it('has sixteen holes on a grid, all inside the fence with room to stand round them', () => {
    expect(HOLES).toBe(16)
    const holes = Array.from({ length: HOLES }, (_, i) => holeAt(i))
    expect(new Set(holes.map((h) => `${h.x},${h.y}`)).size).toBe(16)
    for (const h of holes) {
      expect(Math.abs(h.x) + FIELD.hole + FIELD.strike).toBeLessThan(FIELD.half)
      expect(Math.abs(h.y) + FIELD.hole + FIELD.strike).toBeLessThan(FIELD.half)
    }
  })
})

describe('the moles', () => {
  it('come up through the round, the same for the same seed', () => {
    const moles = schedule(SEED)
    expect(moles.length).toBeGreaterThan(60)
    expect(moles[0].at).toBeCloseTo(FIELD.firstAt)
    for (const m of moles) {
      expect(m.at + m.up).toBeLessThan(FIELD.duration + 2.5)
      expect(m.hole).toBeGreaterThanOrEqual(0)
      expect(m.hole).toBeLessThan(HOLES)
    }
    expect(schedule(SEED)).toEqual(moles)
    expect(schedule(SEED + 1)).not.toEqual(moles)
    const first = moles[0]
    expect(isUp(first, first.at - 0.01)).toBe(false)
    expect(isUp(first, first.at)).toBe(true)
    expect(isUp(first, first.at + first.up)).toBe(false)
  })

  it('never come out of a hole another mole is still in or sinking into, nor the one just used', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const moles = schedule(seed)
      moles.forEach((m, i) => {
        if (i > 0) expect(m.hole).not.toBe(moles[i - 1].hole)
        for (const other of moles.slice(0, i)) {
          if (other.hole === m.hole) expect(other.at + other.up + FIELD.sink).toBeLessThanOrEqual(m.at + 1e-9)
        }
      })
    }
  })

  it('include golden moles now and then, which do not stay up as long', () => {
    let golden = 0
    let total = 0
    for (let seed = 1; seed <= 30; seed++) {
      for (const m of schedule(seed)) {
        total += 1
        if (m.golden) {
          golden += 1
          expect(m.up).toBeLessThanOrEqual(FIELD.goldenUp[1])
        } else {
          expect(m.up).toBeGreaterThanOrEqual(FIELD.up[0])
        }
      }
    }
    expect(golden / total).toBeGreaterThan(0.07)
    expect(golden / total).toBeLessThan(0.18)
  })

  it('come up faster as the round goes on', () => {
    const moles = schedule(SEED)
    const inFirst = moles.filter((m) => m.at < 15).length
    const inLast = moles.filter((m) => m.at >= FIELD.duration - 15.5 && m.at < FIELD.duration - 0.5).length
    expect(inLast).toBeGreaterThan(inFirst)
  })
})

describe('the hammer', () => {
  const firstOf = (game: Game, golden: boolean): Mole => molesFor(game.seed).find((m) => m.golden === golden)!

  it('whacks the mole it lands on, for a point', () => {
    const game = createGame(SEED, whackers(2))
    const mole = firstOf(game, false)
    at(game, mole.at + 0.1)
    lineUp(game, 0, mole.hole)
    expect(swing(game, 0)).toEqual(mole)
    expect(whackOf(game, mole.id)).toEqual({ mole: mole.id, player: 0, at: game.elapsed })
    expect(game.players[0]).toMatchObject({ score: FIELD.points.mole, whacks: 1, golden: 0 })
  })

  it('gives bonus points for the golden mole', () => {
    const game = createGame(SEED, whackers(1))
    const mole = firstOf(game, true)
    at(game, mole.at + 0.05)
    lineUp(game, 0, mole.hole)
    expect(swing(game, 0)?.golden).toBe(true)
    expect(game.players[0]).toMatchObject({ score: FIELD.points.golden, golden: 1 })
    expect(FIELD.points.golden).toBeGreaterThan(FIELD.points.mole)
  })

  it('hits standing right over the hole too, but not from a step away or facing elsewhere', () => {
    const game = createGame(SEED, whackers(2))
    const mole = firstOf(game, false)
    at(game, mole.at + 0.1)
    const h = holeAt(mole.hole)
    Object.assign(game.players[0], { x: h.x + 0.3, y: h.y, facing: Math.PI / 2 })
    expect(swing(game, 0)).toEqual(mole)

    const other = molesFor(game.seed).find((m) => m.id > mole.id && !m.golden)!
    at(game, other.at + 0.1)
    const o = holeAt(other.hole)
    Object.assign(game.players[1], { x: o.x - 2.5, y: o.y, facing: Math.PI })
    expect(swing(game, 1)).toBeNull()
    expect(game.players[1].score).toBe(0)
  })

  it('misses a mole not yet up, gone back down, or whacked already', () => {
    const game = createGame(SEED, whackers(2))
    const mole = firstOf(game, false)
    at(game, mole.at - 0.3)
    lineUp(game, 0, mole.hole)
    lineUp(game, 1, mole.hole)
    game.players[1].y += 0.5
    expect(swing(game, 0)).toBeNull()
    at(game, mole.at + 0.1)
    expect(swing(game, 0)).toEqual(mole)
    // The first whack takes it.
    expect(swing(game, 1)).toBeNull()
    expect(game.players[1].score).toBe(0)

    const late = molesFor(game.seed).find((m) => m.id > mole.id + 3)!
    at(game, late.at + late.up + FIELD.downGrace + 0.05)
    lineUp(game, 1, late.hole)
    expect(swing(game, 1)).toBeNull()
  })

  it('takes a moment to swing again, allowing the host a moment early', () => {
    const game = createGame(SEED, whackers(1))
    expect(swing(game, 0)).toBeNull()
    expect(swing(game, 0)).toBeUndefined()
    expect(canSwing(game, 0)).toBe(false)
    at(game, FIELD.swing - FIELD.swingGrace + 0.01)
    expect(canSwing(game, 0)).toBe(false)
    expect(swing(game, 0)).toBeNull()
    at(game, game.elapsed + FIELD.swing)
    expect(canSwing(game, 0)).toBe(true)
  })

  it('lands in front of you, the way you face', () => {
    const game = createGame(SEED, whackers(1))
    Object.assign(game.players[0], { x: 1, y: 2, facing: Math.PI / 2 })
    const p = strikePoint(game.players[0])
    expect(p.x).toBeCloseTo(1)
    expect(p.y).toBeCloseTo(2 + FIELD.strike)
  })
})

describe('a bonk on the head', () => {
  /** Stands whacker 1 right where whacker 0's hammer lands, well away from any hole. */
  function faceOff(game: Game) {
    Object.assign(game.players[0], { x: 0, y: 0, facing: 0 })
    Object.assign(game.players[1], { x: FIELD.strike, y: 0 })
  }

  it('stuns whoever the hammer lands on, when there is no mole there', () => {
    const game = createGame(SEED, whackers(2))
    at(game, 0.5)
    faceOff(game)
    expect(swing(game, 0)).toBeNull()
    expect(game.players[0].bonks).toBe(1)
    expect(isStunned(game.players[1], game.elapsed)).toBe(true)
    expect(game.players[1].stunnedUntil).toBeCloseTo(game.elapsed + FIELD.stun)
    // No points for a head.
    expect(game.players[0].score).toBe(0)
  })

  it('stops a stunned player walking or swinging until it wears off', () => {
    const game = createGame(SEED, whackers(2))
    at(game, 0.5)
    faceOff(game)
    swing(game, 0)
    const stuck = { x: game.players[1].x, y: game.players[1].y }
    const walking = new Map([['w2', { x: 1, y: 0, swings: 1 }]])
    for (let i = 0; i < 10; i++) stepGame(game, walking, 0.05)
    expect(game.players[1]).toMatchObject(stuck)
    expect(canSwing(game, 1)).toBe(false)
    expect(game.players[1].swungAt).toBe(-Infinity)
    at(game, game.players[1].stunnedUntil + 0.01)
    expect(canSwing(game, 1)).toBe(true)
    stepGame(game, walking, 0.05)
    expect(game.players[1].x).toBeGreaterThan(stuck.x)
  })

  it('cannot stun the same head again straight after, so nobody is stun-locked', () => {
    const game = createGame(SEED, whackers(2))
    at(game, 0.5)
    faceOff(game)
    swing(game, 0)
    const until = game.players[1].stunnedUntil
    at(game, until + 0.1)
    faceOff(game)
    swing(game, 0)
    expect(game.players[1].stunnedUntil).toBe(until)
    expect(game.players[0].bonks).toBe(1)
    at(game, until + FIELD.stunGuard + 0.01)
    faceOff(game)
    swing(game, 0)
    expect(game.players[0].bonks).toBe(2)
  })

  it('goes for the mole first when there is one under the hammer', () => {
    const game = createGame(SEED, whackers(2))
    const mole = molesFor(game.seed)[0]
    at(game, mole.at + 0.1)
    lineUp(game, 0, mole.hole)
    const h = holeAt(mole.hole)
    Object.assign(game.players[1], { x: h.x, y: h.y })
    expect(swing(game, 0)).toEqual(mole)
    expect(isStunned(game.players[1], game.elapsed)).toBe(false)
  })
})

describe('the round', () => {
  it('deals every swing in a running count once, and ends at a minute', () => {
    const game = createGame(SEED, whackers(1))
    const intents = new Map([['w1', { x: 0, y: 0, swings: 1 }]])
    stepGame(game, intents, 0.05)
    stepGame(game, intents, 0.05)
    expect(game.players[0].swings).toBe(1)
    expect(game.players[0].swungAt).toBeCloseTo(0.05)
    while (!game.over) stepGame(game, NONE, 0.05)
    expect(game.elapsed).toBe(FIELD.duration)
    expect(timeLeft(game)).toBe(0)
  })

  it('keeps everybody inside the fence and out of each other', () => {
    const game = createGame(SEED, whackers(4))
    const out = new Map(game.players.map((p) => [p.id, { x: p.x, y: p.y, swings: 0 }]))
    for (let i = 0; i < 100; i++) stepGame(game, out, 0.05)
    for (const p of game.players) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(FIELD.half - FIELD.body + 1e-9)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(FIELD.half - FIELD.body + 1e-9)
    }
    const inward = new Map(game.players.map((p) => [p.id, { x: -p.x, y: -p.y, swings: 0 }]))
    for (let i = 0; i < 100; i++) stepGame(game, inward, 0.05)
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        expect(Math.hypot(game.players[i].x - game.players[j].x, game.players[i].y - game.players[j].y)).toBeGreaterThan(FIELD.body * 2 - 0.05)
      }
    }
  })

  it('walks at its pace, facing the way it walks', () => {
    const body = { ...createGame(SEED, whackers(1)).players[0], x: 0, y: 0 }
    walk(body, { x: -1, y: 0 }, 0.25)
    expect(body.x).toBeCloseTo(-FIELD.speed * 0.25)
    expect(body.facing).toBeCloseTo(Math.PI)
  })

  it('ranks by points, level scores sharing a place', () => {
    const game = createGame(SEED, whackers(4))
    game.players.forEach((p, i) => (p.score = [3, 7, 3, 0][i]))
    expect(placings(game).map((e) => [e.index, e.place])).toEqual([
      [1, 1],
      [0, 2],
      [2, 2],
      [3, 4],
    ])
  })
})

describe('the stand-ins', () => {
  it('walk to moles and whack them, golden ones included, and let some go', () => {
    const totals: number[] = []
    let golden = 0
    let missed = 0
    for (let seed = 1; seed <= 10; seed++) {
      const game = createGame(seed, [{ id: 'me' }, ...whackers(3, true)])
      while (!game.over) stepGame(game, botIntents(game), 1 / 30)
      totals.push(game.whacks.length)
      golden += game.players.reduce((n, p) => n + p.golden, 0)
      missed += molesFor(seed).filter((m) => !whackOf(game, m.id)).length
      expect(game.whacks.every((w) => game.players[w.player].bot)).toBe(true)
    }
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length
    // Three stand-ins get plenty, but leave plenty for somebody quicker.
    expect(mean).toBeGreaterThan(20)
    expect(missed / 10).toBeGreaterThan(15)
    expect(golden).toBeGreaterThan(0)
    expect(BOT_IGNORES).toBeGreaterThan(0)
  })
})
