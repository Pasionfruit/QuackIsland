/**
 * The target, the stopwatch, the stops, and the stand-ins.
 */
import { describe, expect, it } from 'vitest'
import { BOT_DRIFT, botStopAt, botStops } from '../internal/ai'
import { WATCH, createGame, leave, offBy, placings, showing, stepGame, stop, stopwatch, targetFor, type Game } from '../internal/rules'

const SEED = 24680

function timers(n: number, bots = false) {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, bot: bots }))
}

/** The stopwatch straight to a reading. */
function at(game: Game, reading: number) {
  while (stopwatch(game) < reading - 1e-9 && !game.over) stepGame(game, Math.min(0.25, reading - stopwatch(game)))
}

describe('the target', () => {
  it('is never under six and a half seconds, never over fifteen, to the hundredth, and the same for the same seed', () => {
    const seen = new Set<number>()
    for (let seed = 1; seed <= 200; seed++) {
      const target = targetFor(seed)
      expect(target).toBeGreaterThanOrEqual(6.5)
      expect(target).toBeLessThanOrEqual(15)
      expect(Math.round(target * 100) / 100).toBe(target)
      seen.add(Math.floor(target))
    }
    expect(seen.size).toBeGreaterThan(6)
    expect(targetFor(SEED)).toBe(targetFor(SEED))
  })
})

describe('the stopwatch', () => {
  it('starts after the countdown and shows for two and a half seconds', () => {
    const game = createGame(SEED, timers(2))
    expect(stopwatch(game)).toBe(-WATCH.countdown)
    expect(showing(game)).toBe(false)
    at(game, 0)
    expect(showing(game)).toBe(true)
    at(game, WATCH.visible - 0.05)
    expect(showing(game)).toBe(true)
    at(game, WATCH.visible + 0.01)
    expect(showing(game)).toBe(false)
  })
})

describe('a stop', () => {
  it('counts once, after the start, and no later than the stopwatch has got to', () => {
    const game = createGame(SEED, timers(2))
    at(game, -1)
    expect(stop(game, 0, 0)).toBe(false)
    at(game, 5)
    expect(stop(game, 0, 5.5)).toBe(false)
    expect(stop(game, 0, 5.5, WATCH.grace)).toBe(true)
    expect(game.players[0].stopped).toBe(5.5)
    expect(stop(game, 0, 4)).toBe(false)
    expect(stop(game, 1, -1)).toBe(false)
    expect(stop(game, 1, Number.NaN)).toBe(false)
  })

  it('is measured against the target', () => {
    const game = createGame(SEED, timers(1))
    at(game, 20)
    stop(game, 0, targetFor(SEED) - 0.25)
    expect(offBy(game, game.players[0])).toBeCloseTo(-0.25, 3)
  })
})

describe('the round', () => {
  it('ends once everybody has stopped or left', () => {
    const game = createGame(SEED, timers(3))
    at(game, 8)
    stop(game, 0, 7.9)
    stop(game, 1, 8)
    stepGame(game, 0.05)
    expect(game.over).toBe(false)
    leave(game, 2)
    stepGame(game, 0.05)
    expect(game.over).toBe(true)
  })

  it('ends at thirty seconds whoever has not stopped', () => {
    const game = createGame(SEED, timers(2))
    while (!game.over) stepGame(game, 0.25)
    expect(stopwatch(game)).toBe(WATCH.limit)
    expect(game.players.every((p) => p.stopped === null)).toBe(true)
  })

  it('ranks by how close, either side, and anybody who never stopped last', () => {
    const game = createGame(SEED, ['early', 'late', 'close', 'none', 'tie'].map((id) => ({ id })))
    const target = targetFor(SEED)
    at(game, 20)
    stop(game, 0, target - 1)
    stop(game, 1, target + 0.5)
    stop(game, 2, target + 0.1)
    stop(game, 4, target - 0.5)
    expect(placings(game).map((e) => [e.timer.id, e.place])).toEqual([
      ['close', 1],
      ['late', 2],
      ['tie', 2],
      ['early', 4],
      ['none', 5],
    ])
  })
})

describe('the stand-ins', () => {
  it('stop near the target, closer more often than not, once the stopwatch gets there', () => {
    let within = 0
    let total = 0
    for (let seed = 1; seed <= 60; seed++) {
      const game = createGame(seed, [{ id: 'me' }, ...timers(3, true)])
      while (!game.over) {
        for (const move of botStops(game)) stop(game, move.player, move.at)
        stepGame(game, 0.05)
      }
      const target = targetFor(seed)
      for (const bot of game.players.slice(1)) {
        expect(bot.stopped).not.toBeNull()
        expect(bot.stopped!).toBeCloseTo(botStopAt(game, bot.id), 2)
        const off = Math.abs(bot.stopped! - target)
        expect(off).toBeLessThanOrEqual(target * BOT_DRIFT + 0.01)
        total += 1
        if (off < target * BOT_DRIFT * 0.5) within += 1
      }
    }
    expect(within / total).toBeGreaterThan(0.6)
  })
})
