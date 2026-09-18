/**
 * The field, the claims, and the stand-ins.
 */
import { describe, expect, it } from 'vitest'
import { BOT_MISS_EVERY, BOT_SPOTS, botClicks } from '../internal/ai'
import {
  FIELD,
  click,
  cloverAt,
  createGame,
  fieldFor,
  fourLeaf,
  layField,
  placings,
  spam,
  stepGame,
  timeLeft,
  type Game,
} from '../internal/rules'

const SEED = 31337
const LUCK = 4040

function hunters(n: number, bots = false) {
  return Array.from({ length: n }, (_, i) => ({ id: `h${i + 1}`, bot: bots }))
}

function run(game: Game, seconds: number, dt = 0.1) {
  for (let t = 0; t < seconds - 1e-9 && !game.over; t += dt) stepGame(game, dt)
}

/** A clover that is not four-leaf. */
function plain(game: Game): number {
  return fieldFor(game.seed).findIndex((_, i) => !fourLeaf(game, i))
}

const distance = (seed: number, a: number, b: number) => {
  const f = fieldFor(seed)
  return Math.hypot(f[a].x - f[b].x, f[a].z - f[b].z)
}

describe('the field', () => {
  it("is a meadow of clovers on a jittered grid, no clover's leaves over another's", () => {
    const field = layField(SEED)
    expect(field).toHaveLength(FIELD.columns * FIELD.rows)
    // The leaf shape reaches 1.08 of its 0.3 length, a clover is drawn up to
    // its largest scale, and a leaf up to 8% long on top of that.
    const leafReach = 0.3 * 1.08 * FIELD.scale[1] * 1.08
    for (let i = 0; i < field.length; i++) {
      for (let j = i + 1; j < field.length; j++) {
        expect(Math.hypot(field[i].x - field[j].x, field[i].z - field[j].z)).toBeGreaterThan(Math.max(FIELD.reach * 1.1, leafReach * 2))
      }
    }
    expect(layField(SEED)).toEqual(field)
    expect(layField(SEED + 1)).not.toEqual(field)
  })

  it('finds the clover under a point, or none on bare grass', () => {
    const field = fieldFor(SEED)
    field.forEach((c, i) => {
      expect(cloverAt(SEED, c.x, c.z)).toBe(i)
      // Clovers are at least a little over a reach apart, so half of that is always this one.
      expect(cloverAt(SEED, c.x + FIELD.reach * 0.5, c.z)).toBe(i)
    })
    expect(cloverAt(SEED, 500, 500)).toBeNull()
  })
})

describe('the four-leaf clovers', () => {
  it('are always exactly three hidden, well apart', () => {
    const game = createGame(SEED, LUCK, hunters(2))
    expect(game.lucky).toHaveLength(FIELD.hidden)
    for (let n = 0; n < 40; n++) {
      const [a, b, c] = game.lucky.map((l) => l.clover)
      expect(new Set([a, b, c]).size).toBe(3)
      for (const [x, y] of [[a, b], [a, c], [b, c]]) expect(distance(SEED, x, y)).toBeGreaterThanOrEqual(FIELD.apart)
      click(game, n % 2, game.lucky[n % 3].clover)
      expect(game.lucky).toHaveLength(FIELD.hidden)
    }
  })

  it('grow somewhere new, away from the one just claimed, and not where they can be guessed from the field', () => {
    const game = createGame(SEED, LUCK, hunters(1))
    const taken = game.lucky[0].clover
    click(game, 0, taken)
    const grown = game.lucky[game.lucky.length - 1]
    expect(grown.n).toBe(FIELD.hidden)
    expect(distance(SEED, grown.clover, taken)).toBeGreaterThanOrEqual(FIELD.apart)
    expect(fourLeaf(game, taken)).toBe(true)
    // Same field, different luck: different clovers.
    expect(createGame(SEED, LUCK + 1, hunters(1)).lucky.map((l) => l.clover)).not.toEqual(createGame(SEED, LUCK, hunters(1)).lucky.map((l) => l.clover))
  })
})

describe('a click', () => {
  it('on a hidden four-leaf clover claims it for you, with no cooldown', () => {
    const game = createGame(SEED, LUCK, hunters(3))
    run(game, 2)
    const clover = game.lucky[1].clover
    expect(click(game, 2, clover)).toBe('claim')
    expect(game.claims).toEqual([{ clover, player: 2, at: game.elapsed }])
    expect(game.players[2]).toMatchObject({ score: 1, cooldown: 0, misses: 0 })
    expect(click(game, 2, game.lucky[0].clover)).toBe('claim')
  })

  it('on a claimed clover does not take it from its claimer, and is a miss', () => {
    const game = createGame(SEED, LUCK, hunters(2))
    const clover = game.lucky[0].clover
    click(game, 0, clover)
    expect(click(game, 1, clover)).toBe('miss')
    expect(game.claims.filter((c) => c.clover === clover)).toEqual([expect.objectContaining({ player: 0 })])
    expect(game.players[1]).toMatchObject({ score: -FIELD.penalty, misses: 1, cooldown: FIELD.cooldown })
  })

  it('on a three-leaf clover or bare grass is a miss, costs a point, and starts the cooldown', () => {
    const game = createGame(SEED, LUCK, hunters(1))
    const three = plain(game)
    expect(click(game, 0, three)).toBe('miss')
    expect(game.players[0].miss).toEqual({ clover: three, at: 0 })
    expect(game.players[0].score).toBe(-1)
    expect(click(game, 0, game.lucky[0].clover)).toBe('ignored')
    run(game, FIELD.cooldown - FIELD.cooldownGrace + 0.05)
    expect(click(game, 0, null)).toBe('miss')
    expect(game.players[0].miss?.clover).toBeNull()
    expect(game.players[0]).toMatchObject({ score: -2, misses: 2 })
  })

  it('during the cooldown is spam, a point a click, each counted once', () => {
    const game = createGame(SEED, LUCK, hunters(2))
    click(game, 0, plain(game))
    expect(spam(game, 0, 1)).toBe(1)
    expect(spam(game, 0, 3)).toBe(2)
    // Said again: nothing new.
    expect(spam(game, 0, 3)).toBe(0)
    expect(spam(game, 0, 2)).toBe(0)
    expect(game.players[0]).toMatchObject({ spams: 3, score: -4, misses: 1 })
    expect(game.players[0].cooldown).toBe(FIELD.cooldown)
    // A claim afterwards still counts.
    run(game, FIELD.cooldown)
    expect(click(game, 0, game.lucky[0].clover)).toBe('claim')
    expect(game.players[0].score).toBe(-3)
    expect(game.players[1]).toMatchObject({ spams: 0, score: 0 })
    run(game, FIELD.duration + 1)
    expect(spam(game, 0, 9)).toBe(0)
  })

  it('said twice counts once, and nothing counts after the round', () => {
    const game = createGame(SEED, LUCK, hunters(1))
    const clover = game.lucky[0].clover
    expect(click(game, 0, clover, 1)).toBe('claim')
    expect(click(game, 0, game.lucky[0].clover, 1)).toBe('ignored')
    expect(click(game, 0, game.lucky[0].clover, 2)).toBe('claim')
    run(game, FIELD.duration + 1)
    expect(game.over).toBe(true)
    expect(timeLeft(game)).toBe(0)
    expect(click(game, 0, game.lucky[0].clover, 3)).toBe('ignored')
  })
})

describe('the end', () => {
  it('ranks by claims, level scores sharing a place', () => {
    const game = createGame(SEED, LUCK, hunters(4))
    for (const [player, times] of [[0, 1], [1, 3], [2, 1], [3, 0]]) {
      for (let n = 0; n < times; n++) click(game, player, game.lucky[0].clover)
    }
    expect(placings(game).map((e) => [e.index, e.place])).toEqual([
      [1, 1],
      [0, 2],
      [2, 2],
      [3, 4],
    ])
  })
})

describe('the stand-ins', () => {
  it('spot a four-leaf clover some seconds after it grows, not at once', () => {
    const game = createGame(SEED, LUCK, [{ id: 'me' }, ...hunters(3, true)])
    run(game, BOT_SPOTS[0] - 0.2)
    expect(game.claims).toHaveLength(0)
    for (let t = 0; t < BOT_SPOTS[1] + 1; t += 0.1) {
      for (const move of botClicks(game)) click(game, move.player, move.clover)
      stepGame(game, 0.1)
    }
    expect(game.claims.length).toBeGreaterThan(0)
    expect(game.claims.every((c) => game.players[c.player].bot)).toBe(true)
  })

  it('miss now and then, and take a sensible share of a round', () => {
    const scores: number[] = []
    let misses = 0
    for (let luck = 1; luck <= 20; luck++) {
      const game = createGame(SEED, luck, [{ id: 'me' }, ...hunters(3, true)])
      while (!game.over) {
        for (const move of botClicks(game)) click(game, move.player, move.clover)
        stepGame(game, 0.1)
      }
      scores.push(game.claims.length)
      misses += game.players.reduce((n, p) => n + p.misses, 0)
    }
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length
    // Enough to beat somebody who is not looking, few enough to beat by looking.
    expect(mean).toBeGreaterThan(4)
    expect(mean).toBeLessThan(16)
    expect(misses / 20).toBeGreaterThan((FIELD.duration / BOT_MISS_EVERY) * 0.5)
  })
})
