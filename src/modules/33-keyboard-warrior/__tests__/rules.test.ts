/**
 * The letters, the attempts, who gets the point, the end, and the stand-ins.
 */
import { describe, expect, it } from 'vitest'
import { BOT, botPlan, botType } from '../internal/ai'
import {
  EARLY,
  FLOAT,
  LETTERS,
  ROUND,
  attempt,
  createGame,
  judge,
  leave,
  letterFor,
  phase,
  placings,
  stepGame,
  type Game,
} from '../internal/rules'

const SEED = 20260921

function game(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 5)
}

/** Lets `seconds` go by, in small steps. */
function wait(g: Game, seconds: number, dt = 0.02) {
  for (let t = 0; t < seconds - 1e-9 && !g.over; t += dt) stepGame(g, Math.min(dt, seconds - t))
}

/** Until the letter up now is on the screen. */
function untilUp(g: Game) {
  for (let i = 0; phase(g) !== 'up'; i++) {
    if (i > 10000 || g.over) throw new Error(`never came up: ${phase(g)}`)
    stepGame(g, 0.01)
  }
}

describe('the letters', () => {
  it('are the same for the same seed, never the same twice running, and float in front of everybody', () => {
    const letters = Array.from({ length: ROUND.letters }, (_, i) => letterFor(SEED, i))
    expect(letters).toEqual(Array.from({ length: ROUND.letters }, (_, i) => letterFor(SEED, i)))
    expect(letters.map((l) => l.char).join('')).not.toBe(Array.from({ length: ROUND.letters }, (_, i) => letterFor(SEED + 1, i).char).join(''))
    for (const seed of [1, 2, 3, SEED]) {
      for (let i = 0; i < 200; i++) {
        const l = letterFor(seed, i)
        expect(LETTERS).toContain(l.char)
        if (i > 0) expect(l.char).not.toBe(letterFor(seed, i - 1).char)
        expect(l.gap).toBeGreaterThanOrEqual(ROUND.gap[0])
        expect(l.gap).toBeLessThanOrEqual(ROUND.gap[1])
        expect(l.x).toBeGreaterThanOrEqual(FLOAT.x[0])
        expect(l.x).toBeLessThanOrEqual(FLOAT.x[1])
      }
    }
    // Over a lot of letters, every letter turns up.
    expect(new Set(Array.from({ length: 400 }, (_, i) => letterFor(9, i).char)).size).toBe(26)
  })

  it('come after a pause, one after another, and the game ends after the last', () => {
    // No count of its own: the minigame screen has already counted three, two, one.
    const g = game()
    expect(ROUND.countdown).toBe(0)
    expect(phase(g)).toBe('waiting')
    untilUp(g)
    expect(g.elapsed).toBeCloseTo(ROUND.countdown + letterFor(SEED, 0).gap, 1)
    // Nobody types: it stays up its full time, then is decided for nobody, then the next.
    wait(g, ROUND.window + ROUND.grace - 0.1)
    expect(phase(g)).toBe('up')
    wait(g, 0.15)
    expect(phase(g)).toBe('result')
    expect(g.letter.winner).toBeNull()
    wait(g, ROUND.show + 0.05)
    expect(g.letter.index).toBe(1)
    expect(phase(g)).toBe('waiting')
    for (let i = 0; i < 100000 && !g.over; i++) stepGame(g, 0.02)
    expect(g.over).toBe(true)
    expect(g.letter.index).toBe(ROUND.letters - 1)
  })
})

describe('an attempt', () => {
  it('is only one, only a letter, and only while a letter is up', () => {
    const g = game()
    wait(g, ROUND.countdown)
    expect(attempt(g, 0, g.letter.char, 0.5)).toBeNull()
    untilUp(g)
    expect(attempt(g, 0, '1', 0.5)).toBeNull()
    expect(attempt(g, 0, 'Enter', 0.5)).toBeNull()
    const wrong = LETTERS.replace(g.letter.char, '')[0]
    expect(attempt(g, 0, wrong.toLowerCase(), 0.5)).toBe('wrong')
    // Out for this one: even the right letter does not count now.
    expect(attempt(g, 0, g.letter.char, 0.6)).toBeNull()
    expect(attempt(g, 1, g.letter.char.toLowerCase(), 0.7)).toBe('right')
    expect(g.letter.attempts.map((a) => [a.player, a.key])).toEqual([
      [0, wrong],
      [1, g.letter.char],
    ])
  })

  it('may arrive a little before the host has the letter up - a guest clock can run ahead - but no earlier', () => {
    const g = game()
    wait(g, ROUND.countdown)
    const early = g.letter.appearsAt - g.elapsed
    if (early > EARLY + 0.05) {
      expect(attempt(g, 0, g.letter.char, 0.2)).toBeNull()
      wait(g, early - EARLY + 0.02)
    }
    expect(attempt(g, 0, g.letter.char, 0.2)).toBe('right')
  })
})

describe('the point', () => {
  it('goes to the quickest reaction, not the first heard, if it is heard in time', () => {
    const g = game()
    untilUp(g)
    wait(g, 0.8)
    // p2 is heard first, but p3 reacted faster on its own screen and is heard inside the wait.
    attempt(g, 1, g.letter.char, 0.8)
    wait(g, ROUND.grace - 0.1)
    attempt(g, 2, g.letter.char, 0.61)
    wait(g, 0.12)
    expect(phase(g)).toBe('result')
    expect(g.letter.winner).toBe(2)
    expect(g.players.map((p) => [p.score, p.best])).toEqual([
      [0, null],
      [0, null],
      [1, 0.61],
    ])
  })

  it('is decided at once when everybody has had their attempt, and not before the wait otherwise', () => {
    const g = game()
    untilUp(g)
    attempt(g, 0, g.letter.char, 0.5)
    judge(g)
    expect(phase(g)).toBe('up')
    attempt(g, 1, LETTERS.replace(g.letter.char, '')[3], 0.4)
    judge(g)
    expect(phase(g)).toBe('up')
    attempt(g, 2, g.letter.char, 0.45)
    judge(g)
    expect(phase(g)).toBe('result')
    expect(g.letter.winner).toBe(2)
  })

  it('goes to nobody when everybody is wrong, and ties go to whoever was heard first', () => {
    const g = game()
    untilUp(g)
    for (let i = 0; i < 3; i++) attempt(g, i, LETTERS.replace(g.letter.char, '')[i], 0.5)
    stepGame(g, 0.01)
    expect(g.letter.winner).toBeNull()

    const h = game()
    untilUp(h)
    attempt(h, 2, h.letter.char, 0.5)
    wait(h, 0.05)
    attempt(h, 1, h.letter.char, 0.5)
    wait(h, ROUND.grace)
    expect(h.letter.winner).toBe(2)
  })

  it('does not wait for somebody who has left', () => {
    const g = game()
    untilUp(g)
    leave(g, 2)
    attempt(g, 0, g.letter.char, 0.9)
    attempt(g, 1, g.letter.char, 0.7)
    stepGame(g, 0.01)
    expect(g.letter.winner).toBe(1)
  })
})

describe('the end', () => {
  it('puts the most points first, level scores sharing, anybody who left last', () => {
    const g = game(4)
    Object.assign(g.players[0], { score: 5 })
    Object.assign(g.players[1], { score: 7 })
    Object.assign(g.players[2], { score: 5 })
    Object.assign(g.players[3], { score: 9, left: true })
    expect(placings(g).map((e) => [e.player.id, e.place])).toEqual([
      ['p2', 1],
      ['p1', 2],
      ['p3', 2],
      ['p4', 4],
    ])
  })
})

describe('the stand-ins', () => {
  it('type after a reaction of their own, sometimes wrong, sometimes not at all, the same every time', () => {
    const plans = Array.from({ length: 2000 }, (_, i) => botPlan(SEED, `b${i % 3}`, i, 'K'))
    expect(plans).toEqual(Array.from({ length: 2000 }, (_, i) => botPlan(SEED, `b${i % 3}`, i, 'K')))
    const tried = plans.filter((p) => p !== null)
    const missed = 1 - tried.length / plans.length
    const wrong = tried.filter((p) => p!.key !== 'K').length / tried.length
    expect(missed).toBeGreaterThan(BOT.miss / 2)
    expect(missed).toBeLessThan(BOT.miss * 2)
    expect(wrong).toBeGreaterThan(BOT.wrong / 2)
    expect(wrong).toBeLessThan(BOT.wrong * 2)
    const reactions = tried.map((p) => p!.reaction).sort((a, b) => a - b)
    expect(reactions[0]).toBeGreaterThanOrEqual(BOT.reaction[0] - BOT.jitter - 1e-9)
    expect(reactions[Math.floor(reactions.length / 2)]).toBeGreaterThan(0.6)
    expect(reactions[Math.floor(reactions.length / 2)]).toBeLessThan(1)
  })

  it('play a whole game between them, sharing the letters out', () => {
    const runs = [1, 2].map(() => {
      const g = createGame(SEED, Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, bot: true })), 1)
      for (let i = 0; i < 100000 && !g.over; i++) {
        botType(g)
        stepGame(g, 1 / 60)
      }
      return g
    })
    const [g] = runs
    expect(g.over).toBe(true)
    const scores = g.players.map((p) => p.score)
    expect(scores.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(ROUND.letters - 2)
    expect(scores.filter((s) => s > 0).length).toBeGreaterThanOrEqual(2)
    expect(runs[1].players.map((p) => p.score)).toEqual(scores)
  })

  it('leave a person who reacts in two thirds of a second winning most letters', () => {
    let won = 0
    let letters = 0
    for (const seed of [11, 12, 13, 14]) {
      const g = createGame(seed, [{ id: 'you', mine: true }, ...Array.from({ length: 3 }, (_, i) => ({ id: `b${i}`, bot: true }))], 1)
      for (let i = 0; i < 100000 && !g.over; i++) {
        botType(g)
        if (phase(g) === 'up' && g.elapsed - g.letter.appearsAt >= 0.65) attempt(g, 0, g.letter.char, 0.65)
        stepGame(g, 1 / 60)
      }
      won += g.players[0].score
      letters += ROUND.letters
    }
    expect(won / letters).toBeGreaterThan(0.35)
    expect(won / letters).toBeLessThan(0.9)
  })
})
