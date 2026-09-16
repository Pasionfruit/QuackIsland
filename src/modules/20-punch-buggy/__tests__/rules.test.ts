/**
 * The rules of Punch Buggy: the punch, the edge, and the last one standing.
 */
import { describe, expect, it } from 'vitest'
import { PLAYER } from '../../02-player'
import { BOT_OPENING, botIntents } from '../internal/ai'
import {
  RING,
  click,
  createRound,
  fistAt,
  placings,
  spawns,
  stepRound,
  timeLeft,
  type Intent,
  type Round,
} from '../internal/rules'

const SEED = 99
const still = new Map<string, Intent>()

/** Two fighters face to face, `gap` apart edge to edge, a facing b. */
function duel(gap: number): Round {
  const round = createRound(SEED, [{ id: 'a' }, { id: 'b' }])
  const [a, b] = round.fighters
  Object.assign(a, { x: -gap / 2 - RING.body, y: 0, facing: 0 })
  Object.assign(b, { x: gap / 2 + RING.body, y: 0, facing: Math.PI })
  return round
}

const run = (round: Round, seconds: number, intents: Map<string, Intent> = still) => {
  for (let t = 0; t < seconds && !round.over; t += 1 / 60) stepRound(round, intents, 1 / 60)
}

const get = (round: Round, id: string) => round.fighters.find((f) => f.id === id)!

describe('the start', () => {
  it('spreads everybody evenly round a ring on the platform, facing the middle', () => {
    for (let n = 2; n <= 8; n++) {
      const starts = spawns(n)
      for (const s of starts) {
        expect(Math.hypot(s.x, s.y)).toBeCloseTo(RING.radius * RING.spawnRing)
        expect(Math.cos(s.facing) * -s.x + Math.sin(s.facing) * -s.y).toBeGreaterThan(0)
      }
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          expect(Math.hypot(starts[i].x - starts[j].x, starts[i].y - starts[j].y)).toBeGreaterThan(RING.body * 2)
        }
      }
    }
  })

  it('makes a body exactly as big as the island pill', () => {
    expect(RING.body).toBe(PLAYER.radius)
  })

  it('is thirty seconds', () => {
    expect(RING.duration).toBe(30)
    expect(timeLeft(createRound(SEED, [{ id: 'a' }, { id: 'b' }]))).toBe(30)
  })
})

describe('the punch', () => {
  it('goes out on a click, stops at full reach, and comes back on the next', () => {
    const round = duel(14)
    const a = get(round, 'a')
    stepRound(round, new Map([['a', { x: 0, y: 0, clicks: 1 }]]), 1 / 60)
    expect(a.punch).toBe('out')
    run(round, 1, new Map([['a', { x: 0, y: 0, clicks: 1 }]]))
    expect(a.punch).toBe('held')
    expect(a.reach).toBe(RING.reach)
    stepRound(round, new Map([['a', { x: 0, y: 0, clicks: 2 }]]), 1 / 60)
    expect(a.punch).toBe('back')
    run(round, 1, new Map([['a', { x: 0, y: 0, clicks: 2 }]]))
    expect(a.punch).toBe('in')
    expect(a.reach).toBe(0)
  })

  it('can be pulled back before it gets all the way out', () => {
    const round = duel(14)
    const a = get(round, 'a')
    stepRound(round, new Map([['a', { x: 0, y: 0, clicks: 1 }]]), 0.05)
    stepRound(round, new Map([['a', { x: 0, y: 0, clicks: 1 }]]), 0.05)
    const reached = a.reach
    expect(reached).toBeLessThan(RING.reach)
    stepRound(round, new Map([['a', { x: 0, y: 0, clicks: 2 }]]), 1 / 120)
    expect(a.punch).toBe('back')
    expect(a.reach).toBeLessThan(reached)
  })

  it('cannot be thrown again until it is home', () => {
    const round = duel(14)
    const a = get(round, 'a')
    a.punch = 'back'
    a.reach = 3
    click(round, a)
    expect(a.punch).toBe('back')
  })

  it('takes a click count, so a repeated message never doubles a click', () => {
    const round = duel(14)
    const a = get(round, 'a')
    const once = new Map([['a', { x: 0, y: 0, clicks: 1 }]])
    for (let i = 0; i < 40; i++) stepRound(round, once, 1 / 60)
    expect(a.clicks).toBe(1)
    // Out and still out - said forty times, it was one click.
    expect(a.punch).toBe('held')
  })

  it('knocks out whoever it reaches on the way out, and stops there', () => {
    const round = duel(3)
    const [a, b] = round.fighters
    run(round, 0.5, new Map([['a', { x: 0, y: 0, clicks: 1 }]]))
    expect(b.alive).toBe(false)
    expect(b.how).toBe('punched')
    expect(b.by).toBe('a')
    expect(a.punch).toBe('held')
    expect(a.reach).toBeLessThan(RING.reach)
    expect(round.over).toBe(true)
  })

  it('misses somebody who is not in front of it', () => {
    const round = duel(3)
    const b = get(round, 'b')
    b.y = RING.body * 2 + RING.fist + 0.3
    run(round, 0.5, new Map([['a', { x: 0, y: 0, clicks: 1 }]]))
    expect(b.alive).toBe(true)
  })

  it('does not reach past its length', () => {
    const round = duel(RING.reach + 1)
    run(round, 1, new Map([['a', { x: 0, y: 0, clicks: 1 }]]))
    expect(get(round, 'b').alive).toBe(true)
  })

  it('does not knock anybody out once it is held out - it shoves instead', () => {
    const round = duel(14)
    const [a, b] = round.fighters
    run(round, 1, new Map([['a', { x: 0, y: 0, clicks: 1 }]]))
    expect(a.punch).toBe('held')
    // b walks into the side of a's arm.
    const arm = fistAt(a)
    Object.assign(b, { x: arm.x - 2, y: 1.5 })
    run(round, 0.6, new Map([['a', { x: 0, y: 0, clicks: 1 }], ['b', { x: 0, y: -1, clicks: 0 }]]))
    expect(b.alive).toBe(true)
    expect(b.y).toBeGreaterThanOrEqual(RING.arm + RING.body - 0.01)
    expect(b.shovedBy).toBe('a')
  })

  it('never knocks out its own thrower', () => {
    const round = duel(14)
    run(round, 1, new Map([['a', { x: 0, y: 0, clicks: 1 }]]))
    expect(get(round, 'a').alive).toBe(true)
  })

  it('locks the facing while the arm is out, and slows you down', () => {
    const round = duel(14)
    const a = get(round, 'a')
    run(round, 0.2, new Map([['a', { x: 0, y: 0, clicks: 1 }]]))
    const x = a.x
    stepRound(round, new Map([['a', { x: 0, y: 1, clicks: 1 }]]), 0.05)
    expect(a.facing).toBe(0)
    expect(a.y).toBeCloseTo(RING.speed * RING.armedPace * 0.05, 5)
    expect(a.x).toBe(x)
  })

  it('reaches somebody even from a step long enough to pass through them', () => {
    const round = duel(2)
    stepRound(round, new Map([['a', { x: 0, y: 0, clicks: 1 }]]), 0.05)
    stepRound(round, new Map([['a', { x: 0, y: 0, clicks: 1 }]]), 0.05)
    expect(get(round, 'b').alive).toBe(false)
  })
})

describe('the edge', () => {
  it('drops anybody who walks off it', () => {
    const round = duel(14)
    const a = get(round, 'a')
    a.x = -RING.radius + 0.5
    run(round, 1, new Map([['a', { x: -1, y: 0, clicks: 0 }]]))
    expect(a.alive).toBe(false)
    expect(a.how).toBe('fell')
    expect(a.by).toBeNull()
  })

  it('says who shoved somebody off, if it was just now', () => {
    const round = createRound(SEED, ['a', 'b', 'c'].map((id) => ({ id })))
    const [a, b, c] = round.fighters
    // a's arm is out along +x, right to the edge; b is against it and walks off.
    Object.assign(a, { x: 4, y: 0, facing: 0, punch: 'held', reach: RING.reach })
    Object.assign(b, { x: 9, y: 0.5 })
    Object.assign(c, { x: -6, y: -6 })
    const intents = new Map([['b', { x: 1, y: 0, clicks: 0 }]])
    run(round, 1, intents)
    expect(b.alive).toBe(false)
    expect(b.how).toBe('fell')
    expect(b.by).toBe('a')
  })

  it('does not blame a shove from long ago', () => {
    const round = duel(14)
    const b = get(round, 'b')
    b.shovedBy = 'a'
    b.shovedAt = -5
    b.x = RING.radius + 1
    stepRound(round, still, 1 / 60)
    expect(b.by).toBeNull()
  })
})

describe('bodies', () => {
  it('are solid', () => {
    const round = duel(14)
    const [a, b] = round.fighters
    Object.assign(b, { x: a.x + 0.1, y: 0 })
    stepRound(round, still, 1 / 60)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(RING.body * 2, 5)
  })

  it('walk the same speed on a diagonal as straight', () => {
    const r1 = duel(14)
    const r2 = duel(14)
    stepRound(r1, new Map([['a', { x: 1, y: 0, clicks: 0 }]]), 0.05)
    stepRound(r2, new Map([['a', { x: 1, y: 1, clicks: 0 }]]), 0.05)
    const moved = (r: Round) => Math.hypot(get(r, 'a').x - get(duel(14), 'a').x, get(r, 'a').y)
    expect(moved(r1)).toBeCloseTo(moved(r2), 6)
  })
})

describe('the end', () => {
  it('comes when one is left standing', () => {
    const round = duel(3)
    run(round, 1, new Map([['a', { x: 0, y: 0, clicks: 1 }]]))
    expect(round.over).toBe(true)
    expect(placings(round).map((p) => [p.fighter.id, p.place])).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })

  it('comes at thirty seconds, with everybody still standing sharing first', () => {
    const round = createRound(SEED, ['a', 'b', 'c'].map((id) => ({ id })))
    get(round, 'c').alive = false
    get(round, 'c').outAt = 3
    run(round, 31)
    expect(round.over).toBe(true)
    expect(round.elapsed).toBe(RING.duration)
    expect(placings(round).map((p) => [p.fighter.id, p.place])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
    ])
  })

  it('ranks the rest by how long they lasted, sharing a place if they went together', () => {
    const round = createRound(SEED, ['w', 'x', 'y', 'z'].map((id) => ({ id })))
    const at = (id: string, t: number) => Object.assign(get(round, id), { alive: false, outAt: t })
    at('x', 10)
    at('y', 10)
    at('z', 4)
    expect(placings(round).map((p) => [p.fighter.id, p.place])).toEqual([
      ['w', 1],
      ['x', 2],
      ['y', 2],
      ['z', 4],
    ])
  })

  it('clamps a huge frame, so a fist never skips through anybody', () => {
    const round = duel(2)
    stepRound(round, new Map([['a', { x: 0, y: 0, clicks: 1 }]]), 5)
    expect(round.elapsed).toBeLessThanOrEqual(0.05)
  })
})

describe('the stand-ins', () => {
  it('fight: over four rounds, most end with somebody knocked out', () => {
    let outs = 0
    let punched = 0
    for (let seed = 1; seed <= 4; seed++) {
      const round = createRound(seed, Array.from({ length: 4 }, (_, i) => ({ id: `bot${i}`, bot: true })))
      for (let t = 0; t < 31 && !round.over; t += 1 / 30) stepRound(round, botIntents(round), 1 / 30)
      expect(round.over).toBe(true)
      outs += round.fighters.filter((f) => !f.alive).length
      punched += round.fighters.filter((f) => f.how === 'punched').length
    }
    expect(outs).toBeGreaterThan(4)
    expect(punched).toBeGreaterThan(0)
  })

  it('throw nothing in the opening seconds of a round', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const round = createRound(seed, Array.from({ length: 8 }, (_, i) => ({ id: `bot${i}`, bot: true })))
      while (round.elapsed < BOT_OPENING && !round.over) {
        stepRound(round, botIntents(round), 1 / 30)
        expect(round.fighters.every((f) => f.clicks === 0)).toBe(true)
      }
    }
  })

  it('start further from their neighbours than a punch reaches, four to a platform', () => {
    const [a, b] = spawns(4)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(RING.reach + RING.body * 2 + RING.fist)
  })

  it('never drive a person', () => {
    const round = createRound(SEED, [{ id: 'me', mine: true }, { id: 'bot', bot: true }])
    expect([...botIntents(round).keys()]).toEqual(['bot'])
  })

  it('mostly stay on the platform on their own', () => {
    let fell = 0
    for (let seed = 1; seed <= 6; seed++) {
      const round = createRound(seed, [{ id: 'lonely', bot: true }, { id: 'far', bot: false }])
      const far = get(round, 'far')
      Object.assign(far, { x: 0, y: 0 })
      for (let t = 0; t < 20 && !round.over; t += 1 / 30) stepRound(round, botIntents(round), 1 / 30)
      if (get(round, 'lonely').how === 'fell') fell += 1
    }
    expect(fell).toBe(0)
  })
})
