/**
 * The crown, the points, the steal, the wall and the end.
 */
import { describe, expect, it } from 'vitest'
import { PLAYER } from '../../02-player'
import { ARENA, canTake, createRound, holderOf, placings, points, spawns, stepRound, timeLeft, type Intent, type Round } from '../internal/rules'

const FRAME = 1 / 60
const still = new Map<string, Intent>()

function round(n = 3): Round {
  return createRound(1, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })), 1)
}

function run(r: Round, seconds: number, intents: ReadonlyMap<string, Intent> = still) {
  for (let i = 0; i < Math.round(seconds / FRAME); i++) stepRound(r, intents, FRAME)
}

const at = (r: Round, id: string) => r.players.find((p) => p.id === id)!

describe('the start', () => {
  it('puts everybody round a ring well away from the crown, facing it, with nothing scored', () => {
    const r = round(8)
    expect(r.holder).toBeNull()
    for (const p of r.players) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(ARENA.radius * ARENA.spawnRing)
      expect(Math.cos(p.facing) * -p.x + Math.sin(p.facing) * -p.y).toBeGreaterThan(0)
      expect([p.score, p.takes, p.dazed]).toEqual([0, 0, 0])
    }
    expect(spawns(1)).toHaveLength(1)
  })

  it('makes a body the island pill’s own size', () => {
    expect(ARENA.body).toBe(PLAYER.radius)
  })
})

describe('the crown in the middle', () => {
  it('goes to the first body that walks into it', () => {
    const r = round()
    run(r, 4, new Map([['p2', { x: -at(r, 'p2').x, y: -at(r, 'p2').y }]]))
    expect(r.holder).toBe('p2')
    expect(at(r, 'p2').takes).toBe(1)
  })

  it('is not picked up from a step away', () => {
    const r = round(1)
    Object.assign(r.players[0], { x: ARENA.crown + ARENA.body + 0.2, y: 0 })
    run(r, 0.5)
    expect(r.holder).toBeNull()
  })

  it('goes to whoever is nearer when two reach it on one frame', () => {
    const r = round(2)
    Object.assign(at(r, 'p1'), { x: 0.9, y: 0 })
    Object.assign(at(r, 'p2'), { x: -0.5, y: 0 })
    stepRound(r, still, FRAME)
    expect(r.holder).toBe('p2')
  })

  it('scores nobody while nobody has it', () => {
    const r = round()
    run(r, 5)
    expect(r.players.every((p) => p.score === 0)).toBe(true)
  })
})

describe('wearing it', () => {
  it('scores a point a second, and only for the wearer', () => {
    const r = round()
    Object.assign(at(r, 'p1'), { x: 0, y: 0 })
    stepRound(r, still, FRAME)
    run(r, 10)
    expect(at(r, 'p1').score).toBeCloseTo(10 * ARENA.rate, 1)
    expect(points(at(r, 'p1').score)).toBe(10)
    expect(at(r, 'p2').score).toBe(0)
  })

  it('slows you down, so a chaser can catch up', () => {
    const r = round(2)
    Object.assign(at(r, 'p1'), { x: 0, y: 0 })
    Object.assign(at(r, 'p2'), { x: 0, y: -8 })
    stepRound(r, still, FRAME)
    const before = at(r, 'p1').x
    const chaserBefore = at(r, 'p2').x
    run(r, 0.5, new Map([['p1', { x: 1, y: 0 }], ['p2', { x: 1, y: 0 }]]))
    expect(at(r, 'p1').x - before).toBeLessThan(at(r, 'p2').x - chaserBefore)
  })

  it('does not hand out points for a frame that took a long time', () => {
    const r = round()
    Object.assign(at(r, 'p1'), { x: 0, y: 0 })
    stepRound(r, still, FRAME)
    stepRound(r, still, 30)
    expect(at(r, 'p1').score).toBeLessThan(0.1)
  })
})

describe('a bump', () => {
  function crowned(): Round {
    const r = round(3)
    Object.assign(at(r, 'p1'), { x: 0, y: 0 })
    Object.assign(at(r, 'p2'), { x: 5, y: 0 })
    Object.assign(at(r, 'p3'), { x: -5, y: 5 })
    stepRound(r, still, FRAME)
    run(r, ARENA.grace + 0.1)
    return r
  }

  it('takes the crown off whoever is wearing it', () => {
    const r = crowned()
    run(r, 1.5, new Map([['p2', { x: -1, y: 0 }]]))
    expect(r.holder).toBe('p2')
    expect(at(r, 'p2').takes).toBe(1)
    expect(at(r, 'p1').takes).toBe(1)
  })

  it('knocks the two apart', () => {
    const r = crowned()
    const walk = new Map([['p2', { x: -1, y: 0 }]])
    while (r.holder === 'p1') stepRound(r, walk, FRAME)
    expect(Math.hypot(at(r, 'p1').x - at(r, 'p2').x, at(r, 'p1').y - at(r, 'p2').y)).toBeGreaterThan(ARENA.bump - 0.3)
  })

  it('cannot take it straight back: the crown stays put for the grace', () => {
    const r = crowned()
    run(r, 1.5, new Map([['p2', { x: -1, y: 0 }]]))
    const taken = r.heldSince
    expect(canTake(r)).toBe(false)
    // p1 walks straight back into p2 and keeps pushing.
    const back = new Map([['p1', { x: 1, y: 0 }]])
    while (r.elapsed - taken < ARENA.grace - 0.05) {
      stepRound(r, back, FRAME)
      expect(r.holder).toBe('p2')
    }
    run(r, 1, back)
    expect(r.holder).toBe('p1')
  })

  it('dazes whoever lost it: they cannot walk for a moment, then they can', () => {
    const r = crowned()
    while (r.holder === 'p1') stepRound(r, new Map([['p2', { x: -1, y: 0 }]]), FRAME)
    const loser = at(r, 'p1')
    expect(loser.dazed).toBeCloseTo(ARENA.daze, 5)
    expect(at(r, 'p2').dazed).toBe(0)
    const from = { x: loser.x, y: loser.y }
    const away = new Map([['p1', { x: 0, y: 1 }]])
    run(r, ARENA.daze - 0.1, away)
    expect(loser.y).toBeCloseTo(from.y, 5)
    run(r, 0.5, away)
    expect(loser.dazed).toBe(0)
    expect(loser.y).toBeGreaterThan(from.y + 1)
  })

  it('knocks back and staggers everybody crowding the new wearer, who cannot take it while staggered', () => {
    const r = crowned()
    Object.assign(at(r, 'p3'), { x: 1.4, y: 0.6 })
    while (r.holder === 'p1') stepRound(r, new Map([['p2', { x: -1, y: 0 }]]), FRAME)
    const wearer = at(r, 'p2')
    const bystander = at(r, 'p3')
    expect(Math.hypot(bystander.x - wearer.x, bystander.y - wearer.y)).toBeGreaterThan(ARENA.bump - 0.3)
    expect(bystander.dazed).toBeCloseTo(ARENA.stagger, 5)
    expect(at(r, 'p1').dazed).toBeCloseTo(ARENA.daze, 5)
    // Past the grace but still dazed, touching the wearer takes nothing.
    r.heldSince -= ARENA.grace
    Object.assign(at(r, 'p1'), { x: wearer.x + ARENA.body * 2, y: wearer.y })
    stepRound(r, still, FRAME)
    expect(r.holder).toBe('p2')
  })

  it('between two people without the crown does nothing but push', () => {
    const r = crowned()
    Object.assign(at(r, 'p3'), { x: 4, y: 3 })
    run(r, 1, new Map([['p3', { x: 0.2, y: -1 }]]))
    expect(r.holder).toBe('p1')
  })

  it('never leaves two bodies overlapping', () => {
    const r = round(8)
    for (let i = 0; i < 600; i++) {
      stepRound(r, new Map(r.players.map((p) => [p.id, { x: -p.x, y: -p.y }])), FRAME)
    }
    for (const a of r.players) for (const b of r.players) {
      if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(ARENA.body * 2 - 0.2)
    }
    expect(holderOf(r)).not.toBeNull()
  })
})

describe('the wall', () => {
  it('keeps everybody in the arena however hard they push', () => {
    const r = round(4)
    run(r, 5, new Map(r.players.map((p) => [p.id, { x: p.x * 10, y: p.y * 10 }])))
    for (const p of r.players) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(ARENA.radius - ARENA.body + 1e-9)
  })
})

describe('the end', () => {
  it('comes at exactly one minute', () => {
    const r = round()
    run(r, ARENA.duration - 1)
    expect(r.over).toBe(false)
    expect(timeLeft(r)).toBeCloseTo(1, 1)
    run(r, 2)
    expect(r.over).toBe(true)
    expect(r.elapsed).toBe(ARENA.duration)
    expect(timeLeft(r)).toBe(0)
  })

  it('scores nothing past the whistle', () => {
    const r = round()
    Object.assign(at(r, 'p1'), { x: 0, y: 0 })
    run(r, ARENA.duration + 5)
    expect(at(r, 'p1').score).toBeCloseTo(ARENA.duration - FRAME, 1)
    const final = at(r, 'p1').score
    stepRound(r, still, 1)
    expect(at(r, 'p1').score).toBe(final)
  })

  it('ranks by points, and level scores share a place', () => {
    const r = round(4)
    r.players[0].score = 12.3
    r.players[1].score = 30.001
    r.players[2].score = 12.3
    r.players[3].score = 0
    expect(placings(r).map((e) => [e.player.id, e.place])).toEqual([
      ['p2', 1],
      ['p1', 2],
      ['p3', 2],
      ['p4', 4],
    ])
  })

  it('shares first when everybody scored nothing', () => {
    const r = round(3)
    expect(placings(r).every((e) => e.place === 1)).toBe(true)
  })
})
