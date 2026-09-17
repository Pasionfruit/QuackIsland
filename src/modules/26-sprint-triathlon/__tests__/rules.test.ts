/**
 * The legs, the race, and the stand-ins.
 */
import { describe, expect, it } from 'vitest'
import { BOT_MASH, botSelf } from '../internal/ai'
import {
  COURSE,
  FRESH,
  SENTENCES,
  click,
  createRace,
  leave,
  legOf,
  pedal,
  placings,
  progressOf,
  raceClock,
  report,
  sentenceFor,
  stepRace,
  type,
  type Race,
  type Self,
} from '../internal/rules'

const SEED = 314159
const GO = COURSE.start + 0.01

function racers(n: number, bots = false) {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, bot: bots }))
}

/** The race clock straight to a moment after the gun. */
function at(race: Race, sinceGun: number) {
  while (race.elapsed < COURSE.start + sinceGun - 1e-9) stepRace(race, Math.min(0.25, COURSE.start + sinceGun - race.elapsed))
}

/** An account partway through: `strokes`, `pedals`, `typed`. */
function account(strokes: number, pedals = 0, typed = 0): Self {
  return { ...FRESH, strokes, pedals, typed }
}

describe('the sentence', () => {
  it('is one of the run sentences, the same for the same seed', () => {
    expect(SENTENCES[0]).toContain('lemonade stand')
    const seen = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      const sentence = sentenceFor(seed)
      expect(SENTENCES).toContain(sentence)
      expect(sentenceFor(seed)).toBe(sentence)
      seen.add(sentence)
    }
    expect(seen.size).toBe(SENTENCES.length)
  })
})

describe('the legs', () => {
  const sentence = 'go on'

  it('go swim, bike, run, done, and progress is a third a leg', () => {
    expect(legOf(FRESH, sentence)).toBe('swim')
    expect(legOf(account(COURSE.strokes), sentence)).toBe('bike')
    expect(legOf(account(COURSE.strokes, COURSE.pedals), sentence)).toBe('run')
    expect(legOf(account(COURSE.strokes, COURSE.pedals, sentence.length), sentence)).toBe('done')
    expect(progressOf(account(COURSE.strokes), sentence)).toBeCloseTo(1 / 3)
    expect(progressOf(account(COURSE.strokes, COURSE.pedals / 2), sentence)).toBeCloseTo(0.5)
    expect(progressOf(account(COURSE.strokes, COURSE.pedals, sentence.length), sentence)).toBe(1)
  })

  it('a click is a stroke - only while swimming, and only after the gun', () => {
    expect(click(FRESH, sentence, COURSE.start - 0.1)).toBe(FRESH)
    expect(click(FRESH, sentence, GO).strokes).toBe(1)
    const swum = account(COURSE.strokes)
    expect(click(swum, sentence, GO)).toBe(swum)
  })

  it('a press of space is a pedal - only while biking', () => {
    expect(pedal(FRESH, sentence, GO)).toBe(FRESH)
    expect(pedal(account(COURSE.strokes), sentence, GO).pedals).toBe(1)
    const ridden = account(COURSE.strokes, COURSE.pedals)
    expect(pedal(ridden, sentence, GO)).toBe(ridden)
  })

  it('on the run, the right key is a stride; a wrong one is a mistake that trips you up', () => {
    let self = account(COURSE.strokes, COURSE.pedals)
    expect(type(FRESH, sentence, 'g', GO)).toBe(FRESH)
    self = type(self, sentence, 'g', GO)
    expect(self.typed).toBe(1)
    self = type(self, sentence, 'x', GO)
    expect(self).toMatchObject({ typed: 1, mistakes: 1, stumbling: GO + COURSE.stumble })
    // Tripped: even the right key does nothing for a moment.
    expect(type(self, sentence, 'o', GO + COURSE.stumble / 2)).toBe(self)
    self = type(self, sentence, 'o', GO + COURSE.stumble + 0.01)
    expect(self.typed).toBe(2)
    // Space is a character on the run, and case matters.
    self = type(self, sentence, ' ', GO + 1)
    expect(self.typed).toBe(3)
    expect(type(self, sentence, 'O', GO + 2).mistakes).toBe(2)
    // Keys that are not characters do nothing.
    expect(type(self, sentence, 'Shift', GO + 2)).toBe(self)
  })
})

describe('the race', () => {
  const lengthOf = (race: Race) => sentenceFor(race.seed).length

  it('times each leg and the finish, and places finishers in the order they get there', () => {
    const race = createRace(SEED, racers(3))
    at(race, 8)
    report(race, 'r1', account(COURSE.strokes))
    report(race, 'r2', account(COURSE.strokes))
    expect(race.racers[0].swimAt).toBeCloseTo(8)
    at(race, 18)
    report(race, 'r2', account(COURSE.strokes, COURSE.pedals))
    at(race, 20)
    report(race, 'r1', account(COURSE.strokes, COURSE.pedals))
    at(race, 34)
    report(race, 'r2', account(COURSE.strokes, COURSE.pedals, lengthOf(race)))
    at(race, 40)
    report(race, 'r1', account(COURSE.strokes, COURSE.pedals, lengthOf(race)))
    expect(race.racers[1]).toMatchObject({ swimAt: 8, place: 1 })
    expect(race.racers[1].bikeAt).toBeCloseTo(18)
    expect(race.racers[1].finishAt).toBeCloseTo(34)
    expect(race.racers[0]).toMatchObject({ place: 2 })
    expect(race.racers[0].bikeAt).toBeCloseTo(20)
    expect(race.racers[0].finishAt).toBeCloseTo(40)
    expect(race.over).toBe(false)
  })

  it('takes a finished leg and the start of the next in one report', () => {
    const race = createRace(SEED, racers(1))
    at(race, 10)
    report(race, 'r1', account(COURSE.strokes, 5))
    expect(race.racers[0].swimAt).toBeCloseTo(10)
    expect(race.racers[0].pedals).toBe(5)
  })

  it('does not believe hands faster than any hands, and only goes forward', () => {
    const race = createRace(SEED, racers(2))
    at(race, 1)
    report(race, 'r1', account(COURSE.strokes, COURSE.pedals, lengthOf(race)))
    expect(race.racers[0].strokes).toBeLessThanOrEqual(COURSE.maxPressRate * 1.25 + 1)
    expect(race.racers[0].pedals).toBe(0)
    expect(race.racers[0].finishAt).toBeNull()
    report(race, 'r1', account(3))
    expect(race.racers[0].strokes).toBeGreaterThan(3)
    // Before the gun, nothing counts.
    const early = createRace(SEED, racers(1))
    report(early, 'r1', account(10))
    expect(early.racers[0].strokes).toBeLessThanOrEqual(5)
  })

  it('ends when everybody has finished or left, or at the time limit', () => {
    const race = createRace(SEED, racers(2))
    at(race, 60)
    report(race, 'r1', account(COURSE.strokes))
    at(race, 70)
    report(race, 'r1', account(COURSE.strokes, COURSE.pedals))
    at(race, 85)
    report(race, 'r1', account(COURSE.strokes, COURSE.pedals, lengthOf(race)))
    stepRace(race, 0.1)
    expect(race.over).toBe(false)
    leave(race, 'r2')
    stepRace(race, 0.1)
    expect(race.over).toBe(true)

    const slow = createRace(SEED, racers(2))
    while (!slow.over) stepRace(slow, 0.25)
    expect(raceClock(slow)).toBe(COURSE.timeLimit)
  })

  it('ranks finishers by time, then anybody still out there by how far they got, then anybody who left', () => {
    const race = createRace(SEED, ['fast', 'slow', 'far', 'near', 'gone'].map((id) => ({ id })))
    at(race, 10)
    for (const id of ['fast', 'slow', 'far']) report(race, id, account(COURSE.strokes))
    report(race, 'near', account(20))
    report(race, 'gone', account(COURSE.strokes))
    at(race, 20)
    for (const id of ['fast', 'slow']) report(race, id, account(COURSE.strokes, COURSE.pedals))
    report(race, 'far', account(COURSE.strokes, 40))
    at(race, 30)
    report(race, 'fast', account(COURSE.strokes, COURSE.pedals, lengthOf(race)))
    at(race, 40)
    report(race, 'slow', account(COURSE.strokes, COURSE.pedals, lengthOf(race)))
    leave(race, 'gone')
    expect(placings(race).map((e) => [e.racer.id, e.place])).toEqual([
      ['fast', 1],
      ['slow', 2],
      ['far', 3],
      ['near', 4],
      ['gone', 5],
    ])
  })
})

describe('the stand-ins', () => {
  it('swim, bike and run in order, and finish in a sensible time', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const race = createRace(seed, [{ id: 'me' }, ...racers(3, true)])
      let lastProgress = 0
      while (!race.over) {
        for (const r of race.racers) if (r.bot) report(race, r.id, botSelf(race, r))
        stepRace(race, 0.1)
        const bot = race.racers[1]
        const now = progressOf(bot, sentenceFor(seed))
        expect(now).toBeGreaterThanOrEqual(lastProgress)
        lastProgress = now
        if (race.racers.slice(1).every((r) => r.finishAt !== null)) break
      }
      for (const bot of race.racers.slice(1)) {
        expect(bot.finishAt).not.toBeNull()
        expect(bot.swimAt!).toBeLessThan(bot.bikeAt!)
        expect(bot.bikeAt!).toBeLessThan(bot.finishAt!)
        expect(bot.finishAt!).toBeGreaterThan(30)
        expect(bot.finishAt!).toBeLessThan(60)
        // Slower than somebody clicking eight times a second.
        expect(bot.swimAt!).toBeGreaterThan(COURSE.strokes / 8)
      }
    }
    expect(BOT_MASH[1]).toBeLessThan(8)
  })
})
