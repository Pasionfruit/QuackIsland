/**
 * The stand-ins make a round worth playing alone: they race for the crown,
 * pass it about, and do not simply win it.
 */
import { describe, expect, it } from 'vitest'
import { botIntent, botIntents } from '../internal/ai'
import { ARENA, createRound, stepRound, type Intent, type Round } from '../internal/rules'

function solo(): Round {
  return createRound(99, [{ id: 'you', mine: true }, { id: 'b2', bot: true }, { id: 'b3', bot: true }, { id: 'b4', bot: true }])
}

describe('a stand-in', () => {
  it('heads for the crown while it sits in the middle', () => {
    const r = solo()
    const bot = r.players[1]
    const want = botIntent(r, bot)
    expect(want.x * -bot.x + want.y * -bot.y).toBeGreaterThan(0)
  })

  it('chases whoever wears it', () => {
    const r = solo()
    Object.assign(r.players[0], { x: 5, y: 5 })
    r.holder = 'you'
    const bot = r.players[2]
    const want = botIntent(r, bot)
    expect(want.x * (5 - bot.x) + want.y * (5 - bot.y)).toBeGreaterThan(0)
  })

  it('runs from a chaser when it wears it, and along the wall rather than into it', () => {
    const r = solo()
    const bot = r.players[1]
    Object.assign(bot, { x: 0, y: 0 })
    Object.assign(r.players[0], { x: -2, y: 0 })
    r.holder = 'b2'
    expect(botIntent(r, bot).x).toBeGreaterThan(0)

    Object.assign(bot, { x: ARENA.radius - 1, y: 0 })
    Object.assign(r.players[0], { x: ARENA.radius - 3, y: 0 })
    const want = botIntent(r, bot)
    expect(want.x).toBeLessThanOrEqual(0)
    expect(Math.abs(want.y)).toBeGreaterThan(0.5)
  })

  it('boosts at the wearer once near enough, and not from across the arena', () => {
    const r = solo()
    r.holder = 'you'
    Object.assign(r.players[0], { x: 0, y: 0 })
    const bot = r.players[1]
    Object.assign(bot, { x: 2, y: 0 })
    expect(botIntent(r, bot).boost).toBe(true)
    Object.assign(bot, { x: 9, y: 0 })
    expect(botIntent(r, bot).boost).toBeFalsy()
  })

  it('steers round a rock in its way rather than into it', () => {
    const r = solo()
    const rock = r.rocks[0]
    const bot = r.players[1]
    r.holder = 'you'
    // The wearer straight beyond the rock from the stand-in.
    const ux = rock.x / Math.hypot(rock.x, rock.y)
    const uy = rock.y / Math.hypot(rock.x, rock.y)
    Object.assign(bot, { x: rock.x - ux * 1.8, y: rock.y - uy * 1.8 })
    Object.assign(r.players[0], { x: rock.x + ux * 3, y: rock.y + uy * 3 })
    const want = botIntent(r, bot)
    const across = Math.abs(want.x * -uy + want.y * ux)
    expect(across).toBeGreaterThan(0.3)
  })

  it('does nothing once the round is over', () => {
    const r = solo()
    r.over = true
    expect(botIntents(r).size).toBe(0)
  })
})

describe('a round alone', () => {
  it('passes the crown about, and a player chasing it can win', () => {
    const r = solo()
    const me = r.players[0]
    for (let i = 0; i < ARENA.duration * 60 + 10 && !r.over; i++) {
      const intents = botIntents(r)
      const holder = r.players.find((p) => p.id === r.holder)
      const target = holder && holder !== me ? holder : null
      let mine: Intent = { x: -me.x, y: -me.y }
      if (target) mine = { x: target.x - me.x, y: target.y - me.y, boost: Math.hypot(target.x - me.x, target.y - me.y) < 3 }
      else if (holder === me) {
        // Run from the nearest stand-in, round the arena.
        const near = r.players.filter((p) => p !== me).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0]
        mine = { x: -(near.y - me.y), y: near.x - me.x }
      }
      intents.set(me.id, mine)
      stepRound(r, intents, 1 / 60)
    }
    expect(r.over).toBe(true)
    const took = r.players.filter((p) => p.takes > 0)
    expect(took.length).toBeGreaterThan(1)
    expect(me.score).toBeGreaterThan(0)
    // A person running with it is caught: nobody keeps it for most of the minute.
    expect(me.score).toBeLessThan(ARENA.duration * 0.7)
    // And it does not ping-pong, which shows as every hold lasting just the grace.
    const changes = r.players.reduce((n, p) => n + p.takes, 0)
    expect(ARENA.duration / changes).toBeGreaterThan(ARENA.grace * 1.15)
  })
})
