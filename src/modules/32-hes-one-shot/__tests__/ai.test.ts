/**
 * The stand-ins.
 */
import { describe, expect, it } from 'vitest'
import { BOT, botSteer, sightedBy, yawTowards } from '../internal/ai'
import { arenaFor, blocked } from '../internal/arena'
import { BODY, ROUND, clock, createGame, stepGame, type Game } from '../internal/rules'
import { across, lane } from './places'

function bots(seed: number, n = 5): Game {
  return createGame(seed, Array.from({ length: n }, (_, i) => ({ id: `b${i}`, bot: true })), seed)
}

function play(g: Game, dt = 1 / 30, check?: (g: Game) => void): Game {
  for (let i = 0; i < (ROUND.countdown + ROUND.limit + 1) / dt && !g.over; i++) {
    botSteer(g, dt)
    stepGame(g, dt)
    check?.(g)
  }
  return g
}

describe('the stand-ins', () => {
  it('see somebody in front of them in the open, and nobody behind them or behind cover', () => {
    const g = createGame(11, [{ id: 'a', bot: true }, { id: 'b' }])
    while (clock(g) < ROUND.guard) stepGame(g, 0.25)
    const [a, b] = g.players
    const z = lane(11)
    Object.assign(a, { x: -6, z })
    Object.assign(b, { x: 6, z })
    a.yaw = yawTowards(a, b)
    expect(sightedBy(g, 0, null)).toBe(1)
    a.yaw += Math.PI
    expect(sightedBy(g, 0, null)).toBe(-1)
    // Still tracked while it turns round to them.
    expect(sightedBy(g, 0, 'b')).toBe(1)
    const { west, east } = across(11)
    Object.assign(a, west)
    Object.assign(b, east)
    a.yaw = yawTowards(a, b)
    expect(sightedBy(g, 0, null)).toBe(-1)
    // Too far off to notice.
    Object.assign(a, { x: -8, z })
    Object.assign(b, { x: -8 + BOT.sight + 0.5, z })
    a.yaw = yawTowards(a, b)
    expect(sightedBy(g, 0, null)).toBe(-1)
  })

  it('hunt each other down within the time, the same way every time, and never walk into anything', () => {
    for (const seed of [3, 4, 5]) {
      const runs = [1, 2].map(() =>
        play(bots(seed), 1 / 30, (g) => {
          for (const p of g.players) expect(blocked(arenaFor(seed), p, BODY.radius)).toBe(false)
        }),
      )
      const [g] = runs
      expect(g.over).toBe(true)
      const out = g.players.filter((p) => p.out !== null)
      // Plenty of shooting gets somewhere, and not everybody in the first seconds.
      expect(out.length).toBeGreaterThanOrEqual(3)
      expect(Math.max(...out.map((p) => p.out!))).toBeGreaterThan(5)
      expect(g.players.reduce((n, p) => n + p.kills, 0)).toBe(out.length)
      expect(runs[1].players.map((p) => [p.out, p.by])).toEqual(g.players.map((p) => [p.out, p.by]))
    }
  })

  it('keep shooting once they are hunters', () => {
    const g = play(bots(4, 6))
    const hunterKills = g.players.filter((p) => p.out !== null).map((p) => g.players.filter((q) => q.by === g.players.indexOf(p) && q.out! > p.out!).length)
    expect(hunterKills.reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
  })
})
