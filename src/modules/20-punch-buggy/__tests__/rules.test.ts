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
  radiusAt,
  spawns,
  stepRound,
  timeLeft,
  type Intent,
  type Round,
} from '../internal/rules'

const SEED = 99
const still = new Map<string, Intent>()

/**
 * Two fighters `gap` apart edge to edge, a facing b - and b with its back to a
 * unless `bFacing` says otherwise, so a punch from a is not blocked.
 */
function duel(gap: number, bFacing = 0): Round {
  const round = createRound(SEED, [{ id: 'a' }, { id: 'b' }])
  const [a, b] = round.fighters
  Object.assign(a, { x: -gap / 2 - RING.body, y: 0, facing: 0 })
  Object.assign(b, { x: gap / 2 + RING.body, y: 0, facing: bFacing })
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

  it('cannot be pulled back until it has been out half a second, and a click too soon waits', () => {
    const round = duel(14)
    const a = get(round, 'a')
    stepRound(round, new Map([['a', { x: 0, y: 0, clicks: 1 }]]), 0.05)
    const early = new Map([['a', { x: 0, y: 0, clicks: 2 }]])
    run(round, RING.commit - 0.15, early)
    expect(a.punch).toBe('held')
    expect(a.clicks).toBe(1)
    run(round, 0.2, early)
    expect(a.clicks).toBe(2)
    expect(['back', 'in']).toContain(a.punch)
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

  it('knocks out whoever it reaches in the back on the way out, and stops there', () => {
    const round = duel(3)
    const [a, b] = round.fighters
    run(round, 0.5, new Map([['a', { x: 0, y: 0, clicks: 1 }]]))
    expect(b.alive).toBe(false)
    expect(b.how).toBe('punched')
    expect(b.by).toBe('a')
    expect(a.punch).toBe('held')
    expect(a.reach).toBeLessThan(RING.reach)
    expect(round.decidedAt).not.toBeNull()
  })

  it('knocks out whoever it reaches in the side', () => {
    const round = duel(3, Math.PI / 2)
    run(round, 0.5, new Map([['a', { x: 0, y: 0, clicks: 1 }]]))
    expect(get(round, 'b').alive).toBe(false)
  })

  it('knocks out whoever it reaches in the side, even with their own arm out', () => {
    // Side-on, arms out at every angle from straight up to just off the front,
    // at a steady frame rate and at the slowest step the rules take.
    for (const dt of [1 / 60, 1 / 30, 0.05]) {
      for (const facing of [Math.PI / 2, (Math.PI * 5) / 8, Math.PI - RING.guard - 0.05, -Math.PI / 2, -(Math.PI - RING.guard - 0.05)]) {
        const round = duel(3, facing)
        const b = get(round, 'b')
        Object.assign(b, { punch: 'held', reach: RING.reach, thrownAt: -5 })
        const intents = new Map([['a', { x: 0, y: 0, clicks: 1 }]])
        for (let t = 0; t < 0.5 && !round.over; t += dt) stepRound(round, intents, dt)
        expect({ dt, facing, alive: b.alive, how: b.how }).toEqual({ dt, facing, alive: false, how: 'punched' })
      }
    }
  })

  it('is blocked by somebody facing it, and shoves them instead', () => {
    const round = duel(3, Math.PI)
    const [a, b] = round.fighters
    const x = b.x
    run(round, 0.5, new Map([['a', { x: 0, y: 0, clicks: 1 }]]))
    expect(b.alive).toBe(true)
    expect(b.x).toBeGreaterThan(x + 1)
    expect(b.shovedBy).toBe('a')
    expect(a.punch).toBe('held')
    expect(a.reach).toBeLessThan(RING.reach)
  })

  it('is blocked by an arm held out across its path', () => {
    const round = createRound(SEED, ['a', 'b', 'c'].map((id) => ({ id })))
    const [a, b, c] = round.fighters
    Object.assign(a, { x: -4, y: 0, facing: 0 })
    // b is side-on to a, but its arm is out across a's line.
    Object.assign(b, { x: 0, y: -3, facing: Math.PI / 2, punch: 'held', reach: 4, thrownAt: -5 })
    Object.assign(c, { x: 0, y: 8, facing: 0 })
    run(round, 0.5, new Map([['a', { x: 0, y: 0, clicks: 1 }]]))
    expect(b.alive).toBe(true)
    expect(a.punch).toBe('held')
    expect(a.reach).toBeLessThan(RING.reach)
  })

  it('goes where it is aimed, not where you walk', () => {
    const round = duel(14)
    const a = get(round, 'a')
    stepRound(round, new Map([['a', { x: 1, y: 0, clicks: 0, aim: Math.PI / 2 }]]), 1 / 60)
    expect(a.facing).toBeCloseTo(Math.PI / 2)
    stepRound(round, new Map([['a', { x: 1, y: 0, clicks: 1, aim: Math.PI / 2 }]]), 1 / 60)
    const fist = fistAt(a)
    expect(fist.y).toBeGreaterThan(a.y)
    expect(fist.x).toBeCloseTo(a.x)
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

  it('stands you still and locks your aim while the arm is out, and slows you while it comes back', () => {
    const round = duel(14)
    const a = get(round, 'a')
    run(round, 0.2, new Map([['a', { x: 0, y: 0, clicks: 1 }]]))
    const x = a.x
    run(round, 1, new Map([['a', { x: 0, y: 1, clicks: 1, aim: 2 }]]))
    expect(a.punch).toBe('held')
    expect(a.facing).toBe(0)
    expect([a.x, a.y]).toEqual([x, 0])
    stepRound(round, new Map([['a', { x: 0, y: 1, clicks: 2, aim: 2 }]]), 0.05)
    expect(a.punch).toBe('back')
    expect(a.facing).toBe(0)
    expect(a.y).toBeCloseTo(RING.speed * RING.armedPace * 0.05, 5)
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

describe('the shrinking platform', () => {
  it('is whole for ten seconds, then closes in to its smallest at the end', () => {
    expect(radiusAt(0)).toBe(RING.radius)
    expect(radiusAt(RING.shrinkFrom)).toBe(RING.radius)
    expect(radiusAt(20)).toBeLessThan(RING.radius)
    expect(radiusAt(20)).toBeGreaterThan(RING.radiusAtEnd)
    expect(radiusAt(RING.duration)).toBeCloseTo(RING.radiusAtEnd)
  })

  it('drops somebody standing still once the edge passes them', () => {
    const round = duel(14)
    const a = get(round, 'a')
    Object.assign(a, { x: -8, y: 0 })
    Object.assign(get(round, 'b'), { x: 0, y: 0 })
    run(round, RING.shrinkFrom)
    expect(a.alive).toBe(true)
    run(round, 10)
    expect(a.alive).toBe(false)
    expect(a.how).toBe('fell')
    expect(a.by).toBeNull()
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
  it('comes when one is left standing - once the last one out has had time to fly', () => {
    const round = duel(3)
    while (round.decidedAt === null) stepRound(round, new Map([['a', { x: 0, y: 0, clicks: 1 }]]), 1 / 60)
    const decided = round.decidedAt
    expect(get(round, 'b').alive).toBe(false)
    expect(round.over).toBe(false)
    const a = get(round, 'a')
    const where = [a.x, a.y]
    run(round, RING.outro - 0.1, new Map([['a', { x: 1, y: 0, clicks: 1 }]]))
    // Nobody moves while it plays out; the clock does.
    expect(round.over).toBe(false)
    expect([a.x, a.y]).toEqual(where)
    expect(round.elapsed).toBeGreaterThan(decided + RING.outro - 0.2)
    run(round, 0.2)
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
    // Near the middle, where the shrinking edge never reaches.
    Object.assign(get(round, 'a'), { x: -1.5, y: 0 })
    Object.assign(get(round, 'b'), { x: 1.5, y: 0 })
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
