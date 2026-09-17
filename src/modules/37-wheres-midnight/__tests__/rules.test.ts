/**
 * The search: clicking, the cost of being wrong, the clock, the places, and
 * the stand-ins.
 */
import { describe, expect, it } from 'vitest'
import { BOT_FIND, botClicks, botPlan } from '../internal/ai'
import { SEARCH, createGame, placings, select, stepGame, timeLeft, type Game } from '../internal/rules'
import { toward, yardFor } from '../internal/yard'

const SEED = 3120977

function game(n = 3): Game {
  return createGame(
    SEED,
    Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })),
    9,
  )
}

/** Straight at her head, which is what a good click is. */
const atHer = (seed = SEED) => toward(yardFor(seed).midnight.points[0])
/** Straight up: sky, and never her. */
const atSky = { x: 0, y: 1, z: 0 }

function wait(g: Game, seconds: number, dt = 0.1) {
  for (let t = 0; t < seconds - 1e-9 && !g.over; t += dt) stepGame(g, Math.min(dt, seconds - t))
}

describe('finding her', () => {
  it('is a find, timed when it happened, and only once', () => {
    const g = game()
    wait(g, 4)
    expect(select(g, 0, atHer())).toBe('found')
    expect(g.players[0].foundAt).toBeCloseTo(4, 1)
    // Already found: a second click changes nothing.
    expect(select(g, 0, atHer())).toBe('ignored')
    expect(select(g, 0, atSky)).toBe('ignored')
    expect(g.players[0].misses).toBe(0)
  })

  it('ends the round the moment the last searcher has her', () => {
    const g = game(2)
    expect(select(g, 0, atHer())).toBe('found')
    expect(g.over).toBe(false)
    expect(select(g, 1, atHer())).toBe('found')
    expect(g.over).toBe(true)
  })
})

describe('clicking the wrong thing', () => {
  it('costs a second and a half, during which nothing counts - not even her', () => {
    const g = game()
    expect(select(g, 0, atSky)).toBe('miss')
    expect(g.players[0].misses).toBe(1)
    expect(g.players[0].cooldown).toBe(SEARCH.cooldown)
    expect(select(g, 0, atHer())).toBe('ignored')
    wait(g, SEARCH.cooldown - 0.3)
    expect(select(g, 0, atHer())).toBe('ignored')
    wait(g, 0.4)
    expect(g.players[0].cooldown).toBe(0)
    expect(select(g, 0, atHer())).toBe('found')
  })

  it('counts up, and never touches anybody else', () => {
    const g = game()
    select(g, 0, atSky)
    expect(g.players[1].cooldown).toBe(0)
    expect(select(g, 1, atHer())).toBe('found')
  })

  it('lets a click land that was made a hair before the cooldown ended, so a guest is not punished for its ping', () => {
    const g = game()
    select(g, 0, atSky)
    wait(g, SEARCH.cooldown - SEARCH.cooldownGrace / 2, 0.01)
    expect(g.players[0].cooldown).toBeGreaterThan(0)
    expect(g.players[0].cooldown).toBeLessThanOrEqual(SEARCH.cooldownGrace)
    expect(select(g, 0, atHer())).toBe('found')
  })
})

describe('a find said by a guest', () => {
  it('is timed on the guest, so being far away does not make you slower', () => {
    const g = game()
    wait(g, 5)
    expect(select(g, 1, atHer(), { at: 4.7, seq: 1 })).toBe('found')
    expect(g.players[1].foundAt).toBeCloseTo(4.7, 6)
  })

  it('is never earlier than the wire could carry, and never later than now', () => {
    const early = game()
    wait(early, 8)
    select(early, 1, atHer(), { at: 1, seq: 1 })
    expect(early.players[1].foundAt).toBeCloseTo(8 - SEARCH.lag, 1)

    const late = game()
    wait(late, 3)
    select(late, 1, atHer(), { at: 99, seq: 1 })
    expect(late.players[1].foundAt).toBeCloseTo(3, 1)
  })

  it('counts once however many times it arrives', () => {
    const g = game()
    expect(select(g, 1, atSky, { seq: 1 })).toBe('miss')
    expect(select(g, 1, atSky, { seq: 1 })).toBe('ignored')
    expect(g.players[1].misses).toBe(1)
    // A later click still lands once the cooldown is done.
    wait(g, SEARCH.cooldown + 0.1)
    expect(select(g, 1, atHer(), { seq: 2 })).toBe('found')
  })
})

describe('the clock', () => {
  it('runs for ninety seconds and then stops the round wherever it is', () => {
    const g = game()
    expect(timeLeft(g)).toBe(SEARCH.duration)
    wait(g, SEARCH.duration - 1)
    expect(g.over).toBe(false)
    wait(g, 2)
    expect(g.over).toBe(true)
    expect(g.elapsed).toBe(SEARCH.duration)
    expect(timeLeft(g)).toBe(0)
    expect(select(g, 0, atHer())).toBe('ignored')
  })

  it('never runs backwards or leaps when a frame is slow', () => {
    const g = game()
    stepGame(g, 10)
    expect(g.elapsed).toBeLessThanOrEqual(0.25)
    stepGame(g, -5)
    expect(g.elapsed).toBeLessThanOrEqual(0.25)
    expect(g.elapsed).toBeGreaterThanOrEqual(0)
  })
})

describe('the places', () => {
  it('are the order she was found in, with whoever never found her sharing last', () => {
    const g = game(4)
    wait(g, 2)
    select(g, 2, atHer())
    wait(g, 3)
    select(g, 0, atHer())
    const order = placings(g)
    expect(order.map((e) => e.seeker.id)).toEqual(['p3', 'p1', 'p2', 'p4'])
    expect(order.map((e) => e.place)).toEqual([1, 2, 3, 3])
  })

  it('are shared by two who found her on the same hundredth', () => {
    const g = game(3)
    wait(g, 6)
    select(g, 0, atHer())
    select(g, 1, atHer())
    const order = placings(g)
    expect(order.slice(0, 2).map((e) => e.place)).toEqual([1, 1])
    expect(order[2].place).toBe(3)
  })
})

describe('the stand-ins', () => {
  it('plan a couple of wrong clicks and a find, from the seed and never otherwise', () => {
    const plan = botPlan(SEED, 'seeker 2')
    expect(botPlan(SEED, 'seeker 2')).toEqual(plan)
    expect(botPlan(SEED + 1, 'seeker 2')).not.toEqual(plan)
    // In order, and a find - if there is one - last.
    const times = plan.map((c) => c.at)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(plan.filter((c) => c.kind === 'find').length).toBeLessThanOrEqual(1)
    for (const click of plan) {
      expect(click.at).toBeGreaterThan(0)
      expect(click.at).toBeLessThanOrEqual(BOT_FIND[1])
    }
  })

  it('click their way through a round, finding her when they said they would', () => {
    const g = createGame(SEED, [{ id: 'me', mine: true }, { id: 'seeker 2', bot: true }, { id: 'seeker 3', bot: true }], 9)
    for (let i = 0; i < 1200 && !g.over; i++) {
      botClicks(g)
      stepGame(g, 0.1)
    }
    for (const [index, bot] of g.players.entries()) {
      if (!bot.bot) continue
      const plan = botPlan(g.seed, bot.id)
      const find = plan.find((c) => c.kind === 'find')
      if (find) {
        expect(bot.foundAt, `${index}`).not.toBeNull()
        // The cooldown from its own wrong clicks can only ever hold it up, not hurry it.
        expect(bot.foundAt!, `${index}`).toBeGreaterThanOrEqual(find.at - 0.2)
      } else {
        expect(bot.foundAt, `${index}`).toBeNull()
      }
      expect(bot.misses).toBe(plan.filter((c) => c.kind === 'miss').length)
    }
  })

  it('play the same round the same way twice', () => {
    const run = () => {
      const g = createGame(SEED, [{ id: 'seeker 2', bot: true }, { id: 'seeker 3', bot: true }], 9)
      for (let i = 0; i < 1200 && !g.over; i++) {
        botClicks(g)
        stepGame(g, 0.1)
      }
      return g.players.map((p) => [p.foundAt, p.misses])
    }
    expect(run()).toEqual(run())
  })
})
