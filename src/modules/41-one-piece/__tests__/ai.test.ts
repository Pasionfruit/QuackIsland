/**
 * The stand-ins: they get their pieces in one at a time, and finish in good time.
 */
import { describe, expect, it } from 'vitest'
import { BOT_LOOK, BOT_PIECE, botMask, botPlan, stepBots } from '../internal/ai'
import { FULL, PUZZLE, countPlaced, createGame, finished, stepGame } from '../internal/rules'

const game = () => createGame(2024, [{ id: 'me', mine: true }, { id: 'b1', bot: true }, { id: 'b2', bot: true }, { id: 'b3', bot: true }])

describe('the stand-ins', () => {
  it('get every piece in once, a piece at a time, inside their bounds, the same every time', () => {
    const g = game()
    for (const bot of ['b1', 'b2', 'b3']) {
      const plan = botPlan(g, bot)
      expect(plan).toEqual(botPlan(g, bot))
      expect(new Set(plan.map((s) => s.piece)).size).toBe(PUZZLE.pieces)
      expect(plan[0].at).toBeGreaterThanOrEqual(BOT_LOOK[0] + BOT_PIECE[0] - 0.01)
      for (let i = 1; i < plan.length; i++) {
        expect(plan[i].at - plan[i - 1].at).toBeGreaterThanOrEqual(BOT_PIECE[0] - 0.02)
        expect(plan[i].at - plan[i - 1].at).toBeLessThanOrEqual(BOT_PIECE[1] + 0.02)
      }
    }
  })

  it('have nothing in at the start and everything in by the end of their plan', () => {
    const g = game()
    const plan = botPlan(g, 'b1')
    expect(botMask(g, 'b1', 0)).toBe(0)
    expect(countPlaced(botMask(g, 'b1', plan[2].at))).toBe(3)
    expect(botMask(g, 'b1', plan[5].at)).toBe(FULL)
  })

  it('finish in good time, end the game at three, and leave the human alone', () => {
    const g = game()
    for (let i = 0; i < PUZZLE.limit * 60 && !g.over; i++) {
      stepBots(g)
      stepGame(g, 1 / 60)
    }
    expect(g.over).toBe(true)
    expect(g.players.filter((p) => p.bot && finished(p))).toHaveLength(3)
    expect(g.clock).toBeLessThan(40)
    expect(g.players[0].placed).toBe(0)
  })
})
