import { describe, expect, it } from 'vitest'
import { botIntents } from '../internal/ai'
import {
  ANSWER,
  KINDS,
  ROUND,
  STAGE_COUNT,
  THINGS,
  answer,
  challengeFor,
  checkGuess,
  createRound,
  placings,
  stepRound,
  timeLeft,
  type Guess,
  type Intent,
  type Round,
} from '../internal/rules'

/** Runs a round for `seconds`, at a fixed 1/60 step, applying the same intents every tick. */
function run(round: Round, seconds: number, intents: ReadonlyMap<string, Intent>): Round {
  const ticks = Math.round(seconds * 60)
  for (let i = 0; i < ticks && !round.over; i++) stepRound(round, intents, 1 / 60)
  return round
}

describe('the challenge pool', () => {
  it('is deterministic for the same seed and stage', () => {
    expect(challengeFor(42, 3)).toEqual(challengeFor(42, 3))
  })

  it('gives every seed a different sequence, most of the time', () => {
    const a = Array.from({ length: STAGE_COUNT }, (_, i) => challengeFor(1, i).kind)
    const b = Array.from({ length: STAGE_COUNT }, (_, i) => challengeFor(2, i).kind)
    expect(a).not.toEqual(b)
  })

  it('never repeats the same kind two stages running', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let last: string | null = null
      for (let stage = 0; stage < STAGE_COUNT; stage++) {
        const kind = challengeFor(seed, stage).kind
        expect(kind).not.toBe(last)
        last = kind
      }
    }
  })

  it('only ever produces the six kinds the brief asked for', () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (let stage = 0; stage < STAGE_COUNT; stage++) {
        expect(KINDS).toContain(challengeFor(seed, stage).kind)
      }
    }
  })

  it('every kind, wherever it turns up, has exactly one right answer among its options', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 60 && seen.size < KINDS.length; seed++) {
      for (let stage = 0; stage < STAGE_COUNT; stage++) {
        const c = challengeFor(seed, stage)
        seen.add(c.kind)
        if (c.kind === 'match') expect(c.options[0] === c.target || c.options.some((o) => o === c.target)).toBe(true)
        if (c.kind === 'identify') {
          const oddThing = THINGS[c.options[c.oddIndex]]
          const rest = c.options.filter((_, i) => i !== c.oddIndex)
          expect(rest.every((o) => THINGS[o].cat !== oddThing.cat)).toBe(true)
          // Exactly one odd one: every other option shares a single category.
          const majorityCat = THINGS[rest[0]].cat
          expect(rest.every((o) => THINGS[o].cat === majorityCat)).toBe(true)
        }
        if (c.kind === 'pattern') expect(c.options[c.answerIndex]).toBeTypeOf('number')
        if (c.kind === 'checkboxes') {
          expect(c.correct.length).toBeGreaterThan(0)
          expect(c.correct.every((i) => THINGS[c.options[i]].cat === c.category)).toBe(true)
          const notCorrect = c.options.map((_, i) => i).filter((i) => !c.correct.includes(i))
          expect(notCorrect.every((i) => THINGS[c.options[i]].cat !== c.category)).toBe(true)
        }
        if (c.kind === 'count') {
          expect(c.field.filter((i) => i === c.target)).toHaveLength(c.answer)
          expect(c.choices).toContain(c.answer)
          expect(new Set(c.choices).size).toBe(c.choices.length)
        }
      }
    }
    expect(seen.size).toBe(KINDS.length)
  })

  it('warped text is short, and answered case-insensitively, trimmed', () => {
    const c = challengeFor(7, 1)
    // Find a text stage within a handful of seeds - stage/kind is seeded, so hunt briefly.
    let text = c.kind === 'text' ? c.text : null
    for (let seed = 1; seed < 40 && !text; seed++) {
      for (let stage = 0; stage < STAGE_COUNT; stage++) {
        const ch = challengeFor(seed, stage)
        if (ch.kind === 'text') { text = ch.text; break }
      }
    }
    expect(text).not.toBeNull()
    expect(text!.length).toBe(6)
    expect(checkGuess({ kind: 'text', text: text! }, { kind: 'text', text: `  ${text!.toLowerCase()}  ` })).toBe(true)
    expect(checkGuess({ kind: 'text', text: text! }, { kind: 'text', text: 'wrong!' })).toBe(false)
  })
})

describe('checking a guess', () => {
  it('a guess of the wrong shape is just wrong', () => {
    const c = challengeFor(1, 0)
    const wrongShape: Guess = c.kind === 'match' ? { kind: 'text', text: 'anything' } : { kind: 'match', pick: 0 }
    expect(checkGuess(c, wrongShape)).toBe(false)
  })
})

describe('answering', () => {
  it('advances your stage on a right guess', () => {
    const round = createRound(9, [{ id: 'a', mine: true }], 1)
    const p = round.players[0]
    const c = challengeFor(round.seed, 0)
    const guess: Guess =
      c.kind === 'match' ? { kind: 'match', pick: c.options.indexOf(c.target) }
      : c.kind === 'text' ? { kind: 'text', text: c.text }
      : c.kind === 'identify' ? { kind: 'identify', pick: c.oddIndex }
      : c.kind === 'pattern' ? { kind: 'pattern', pick: c.answerIndex }
      : c.kind === 'checkboxes' ? { kind: 'checkboxes', picks: c.correct }
      : { kind: 'count', pick: c.choices.indexOf(c.answer) }
    expect(answer(round, p, guess)).toBe(true)
    expect(p.stage).toBe(1)
  })

  it('a wrong guess does not advance you, and locks out the next attempt briefly', () => {
    const round = createRound(9, [{ id: 'a', mine: true }], 1)
    const p = round.players[0]
    const c = challengeFor(round.seed, 0)
    const wrongGuess: Guess = c.kind === 'text' ? { kind: 'text', text: 'zzzzzz' } : ({ kind: c.kind, pick: 999 } as Guess)
    expect(answer(round, p, wrongGuess)).toBe(false)
    expect(p.stage).toBe(0)
    expect(p.mistakes).toBe(1)
    expect(answer(round, p, wrongGuess)).toBe(false) // locked out, does not even count as a fresh mistake attempt being processed differently
    round.elapsed += ANSWER.lockout + 0.01
    // Past the lockout, a guess is judged again (still wrong here).
    expect(answer(round, p, wrongGuess)).toBe(false)
  })

  it('finishes at STAGE_COUNT and will not answer any further', () => {
    const round = createRound(9, [{ id: 'a', mine: true }], 1)
    const p = round.players[0]
    p.stage = STAGE_COUNT
    expect(answer(round, p, { kind: 'text', text: 'nope' })).toBe(false)
  })
})

describe('the round', () => {
  it('folds in reported progress, rate-clamped by ANSWER.minStageTime', () => {
    const round = createRound(1, [{ id: 'a', mine: true }], 1)
    // A guest claiming to have cleared every stage at once is not believed all at once.
    run(round, 0.05, new Map([['a', { stage: STAGE_COUNT, mistakes: 0 }]]))
    const a = round.players[0]
    expect(a.stage).toBeLessThan(STAGE_COUNT)
    expect(a.stage).toBeLessThanOrEqual(1)
  })

  it('eventually credits the full claimed stage once enough time has passed', () => {
    const round = createRound(1, [{ id: 'a', mine: true }], 1)
    run(round, ANSWER.minStageTime * STAGE_COUNT + 1, new Map([['a', { stage: STAGE_COUNT, mistakes: 0 }]]))
    expect(round.players[0].stage).toBe(STAGE_COUNT)
  })

  it('decides the instant somebody finishes, and ends after the outro', () => {
    const round = createRound(1, [{ id: 'a', mine: true }, { id: 'b' }], 1)
    round.players[0].stage = STAGE_COUNT - 1
    run(round, ANSWER.minStageTime + 0.02, new Map([['a', { stage: STAGE_COUNT, mistakes: 0 }]]))
    expect(round.players[0].finishAt).not.toBeNull()
    expect(round.decidedAt).not.toBeNull()
    expect(round.over).toBe(false)
    run(round, ROUND.outro + 0.1, new Map())
    expect(round.over).toBe(true)
  })

  it('ends at the safety-net limit if nobody has finished', () => {
    const round = createRound(1, [{ id: 'a', mine: true }], 1)
    round.elapsed = ROUND.limit - 0.01
    stepRound(round, new Map(), 1 / 60)
    expect(round.over).toBe(true)
    expect(timeLeft(round)).toBe(0)
  })
})

describe('placings', () => {
  it('ranks the finisher first, and the rest by how far they got', () => {
    const round = createRound(1, [{ id: 'a', mine: true }, { id: 'b' }, { id: 'c' }], 1)
    round.players[0].finishAt = 12
    round.players[1].stage = 6
    round.players[2].stage = 3
    const order = placings(round)
    expect(order.map((e) => e.player.id)).toEqual(['a', 'b', 'c'])
    expect(order.map((e) => e.place)).toEqual([1, 2, 3])
  })

  it('shares a place between two who got equally far', () => {
    const round = createRound(1, [{ id: 'a', mine: true }, { id: 'b' }], 1)
    round.players[0].stage = 4
    round.players[1].stage = 4
    const order = placings(round)
    expect(order.every((e) => e.place === 1)).toBe(true)
  })
})

describe('the stand-ins', () => {
  it('play a full round without erroring, and somebody finishes', () => {
    let finishes = 0
    for (let seed = 1; seed <= 4; seed++) {
      const round = createRound(
        seed,
        [
          { id: 'a', bot: true },
          { id: 'b', bot: true },
          { id: 'c', bot: true },
          { id: 'd', bot: true },
        ],
        seed,
      )
      const ticks = Math.round(ROUND.limit * 60)
      for (let i = 0; i < ticks && !round.over; i++) stepRound(round, botIntents(round), 1 / 60)
      expect(round.over).toBe(true)
      finishes += round.players.filter((p) => p.finishAt !== null).length
    }
    expect(finishes).toBeGreaterThan(0)
  })
})
