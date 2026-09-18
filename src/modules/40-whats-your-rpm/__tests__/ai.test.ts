/**
 * The stand-ins: they scroll, they get stuck on ads, they skip them, and they finish.
 */
import { describe, expect, it } from 'vitest'
import { BOT_RATE, BOT_REACT, botRate, botReaction, stepBots } from '../internal/ai'
import { FEED, blocked, createGame, finished, stepGame } from '../internal/rules'

const game = () => createGame(2024, [{ id: 'me', mine: true }, { id: 'b1', bot: true }, { id: 'b2', bot: true }])

describe('the stand-ins', () => {
  it('have a pace and reactions inside their bounds, the same every time', () => {
    const g = game()
    for (const bot of ['b1', 'b2', 'b3']) {
      const rate = botRate(g, bot)
      expect(rate).toBeGreaterThanOrEqual(BOT_RATE[0])
      expect(rate).toBeLessThanOrEqual(BOT_RATE[1])
      expect(botRate(g, bot)).toBe(rate)
      for (let i = 0; i < 12; i++) {
        const t = botReaction(g, bot, i)
        expect(t).toBeGreaterThanOrEqual(BOT_REACT[0])
        expect(t).toBeLessThanOrEqual(BOT_REACT[1])
      }
    }
  })

  it('wait a moment at an ad before they skip it', () => {
    const g = game()
    let stuck = 0
    for (let i = 0; i < 400 && g.players[1].skipped === 0; i++) {
      stepBots(g, 1 / 60)
      stepGame(g, 1 / 60)
      if (blocked(g, g.players[1])) stuck += 1 / 60
    }
    expect(g.players[1].skipped).toBe(1)
    expect(stuck).toBeGreaterThanOrEqual(BOT_REACT[0] - 0.05)
  })

  it('get to the end in good time, and leave the human alone', () => {
    const g = game()
    for (let i = 0; i < FEED.limit * 60 && !g.over; i++) {
      stepBots(g, 1 / 60)
      stepGame(g, 1 / 60)
    }
    expect(g.players.some((p) => p.bot && finished(p))).toBe(true)
    expect(g.clock).toBeLessThan(45)
    expect(g.players[0].progress).toBe(0)
  })
})
