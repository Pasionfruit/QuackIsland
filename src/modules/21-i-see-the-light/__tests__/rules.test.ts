/**
 * The light, the circle, and the race.
 */
import { describe, expect, it } from 'vitest'
import { BOT_SLIP, botSelf } from '../internal/ai'
import {
  FRESH,
  LIGHT,
  checkPointer,
  circleAt,
  countdownAt,
  createRace,
  greenBefore,
  insideCircle,
  lightAt,
  placings,
  pressSpace,
  report,
  schedule,
  stepRace,
  type Race,
  type Self,
} from '../internal/rules'

const SEED = 4242

/** A moment a little way into the nth phase of a colour. */
function momentIn(colour: 'green' | 'red', n = 0, into = 1): number {
  const phase = schedule(SEED).filter((p) => p.colour === colour)[n]
  return phase.start + into
}

function run(race: Race, seconds: number, dt = 1 / 30) {
  for (let t = 0; t < seconds && !race.over; t += dt) stepRace(race, dt)
}

describe('the light', () => {
  it('starts green, alternates, and every green and red is as long as it should be', () => {
    const phases = schedule(SEED)
    expect(phases[0]).toMatchObject({ colour: 'green', start: 0 })
    phases.forEach((p, i) => {
      expect(p.colour).toBe(i % 2 === 0 ? 'green' : 'red')
      if (i > 0) expect(p.start).toBeCloseTo(phases[i - 1].end)
      const [low, high] = p.colour === 'green' ? LIGHT.green : LIGHT.red
      expect(p.end - p.start).toBeGreaterThanOrEqual(low)
      expect(p.end - p.start).toBeLessThanOrEqual(high)
    })
    expect(phases[phases.length - 1].end).toBeGreaterThan(LIGHT.timeLimit)
    expect(phases.filter((p) => p.colour === 'red').map((p) => p.red)).toEqual(
      phases.filter((p) => p.colour === 'red').map((_, i) => i),
    )
  })

  it('is the same pattern for the same seed, and a different one for another', () => {
    expect(schedule(SEED)).toEqual(schedule(SEED))
    expect(schedule(SEED + 1)[0].end).not.toBeCloseTo(schedule(SEED)[0].end, 5)
  })

  it('says which colour it is at any moment, and for how long', () => {
    const red = schedule(SEED)[1]
    expect(lightAt(SEED, red.start - 0.01).colour).toBe('green')
    const at = lightAt(SEED, red.start + 0.5)
    expect(at.colour).toBe('red')
    expect(at.since).toBeCloseTo(0.5)
    expect(lightAt(SEED, -3).colour).toBe('green')
  })

  it('counts down 3, 2, 1 over the end of every green, and not otherwise', () => {
    const phases = schedule(SEED)
    for (const green of phases.filter((p) => p.colour === 'green').slice(0, 12)) {
      expect(green.end - green.start).toBeGreaterThanOrEqual(LIGHT.countdown)
      expect(countdownAt(SEED, green.end - 3.5)).toBeNull()
      expect(countdownAt(SEED, green.end - 2.5)).toBe(3)
      expect(countdownAt(SEED, green.end - 1.5)).toBe(2)
      expect(countdownAt(SEED, green.end - 0.5)).toBe(1)
      expect(countdownAt(SEED, green.end - 0.001)).toBe(1)
      expect(countdownAt(SEED, green.end + 0.2)).toBeNull()
    }
  })

  it('counts the green so far', () => {
    const [green, red, green2] = schedule(SEED)
    expect(greenBefore(SEED, 1)).toBeCloseTo(1)
    expect(greenBefore(SEED, red.start + 1)).toBeCloseTo(green.end)
    expect(greenBefore(SEED, green2.start + 0.5)).toBeCloseTo(green.end + 0.5)
  })
})

describe('the circle', () => {
  it('appears in the middle and holds still while you get to it, then wanders', () => {
    expect(circleAt(SEED, 0, 0)).toMatchObject({ x: 0.5, y: 0.5 })
    expect(circleAt(SEED, 0, LIGHT.pointerGrace)).toMatchObject({ x: 0.5, y: 0.5 })
    const later = circleAt(SEED, 0, LIGHT.pointerGrace + 2.5)
    expect(Math.hypot(later.x - 0.5, later.y - 0.5)).toBeGreaterThan(0.02)
  })

  it('never leaves the view, and never jumps', () => {
    for (let red = 0; red < 30; red++) {
      let before = circleAt(SEED, red, 0)
      for (let since = 0; since < LIGHT.red[1]; since += 1 / 60) {
        const c = circleAt(SEED, red, since)
        expect(c.x - c.radius).toBeGreaterThan(0)
        expect(c.x + c.radius).toBeLessThan(1)
        expect(c.y - c.radius).toBeGreaterThan(0)
        expect(c.y + c.radius).toBeLessThan(1)
        // Followable: never more than a hair of the view in a sixtieth of a second.
        expect(Math.hypot(c.x - before.x, c.y - before.y)).toBeLessThan(0.01)
        before = c
      }
    }
  })

  it('shrinks a little every red, down to a floor', () => {
    expect(circleAt(SEED, 1, 0).radius).toBeLessThan(circleAt(SEED, 0, 0).radius)
    expect(circleAt(SEED, 40, 0).radius).toBe(LIGHT.circleMin)
  })

  it('swells and shrinks as it wanders, by the same amount either way', () => {
    const base = circleAt(SEED, 0, 0).radius
    let biggest = base
    let smallest = base
    let before = base
    for (let since = 0; since < LIGHT.red[1]; since += 1 / 60) {
      const r = circleAt(SEED, 0, since).radius
      biggest = Math.max(biggest, r)
      smallest = Math.min(smallest, r)
      // Nothing that could be described as a pop: it breathes.
      expect(Math.abs(r - before)).toBeLessThan(base * 0.02)
      before = r
    }
    // Both ways, and never further than the breath allows.
    expect(biggest).toBeGreaterThan(base * 1.1)
    expect(smallest).toBeLessThan(base * 0.9)
    expect(biggest).toBeLessThanOrEqual(base * (1 + LIGHT.breath) + 1e-9)
    expect(smallest).toBeGreaterThanOrEqual(base * (1 - LIGHT.breath) - 1e-9)
  })

  it('is exactly its own size while it holds still, and breathes its own way each red', () => {
    for (const red of [0, 1, 5]) {
      const base = Math.max(LIGHT.circleMin, LIGHT.circle - red * LIGHT.circleShrink)
      expect(circleAt(SEED, red, 0).radius).toBeCloseTo(base, 12)
      expect(circleAt(SEED, red, LIGHT.pointerGrace).radius).toBeCloseTo(base, 12)
    }
    // A moment into two different reds is two different sizes - the breath is
    // not one rhythm everybody learns.
    const at = LIGHT.pointerGrace + 2.5
    expect(circleAt(SEED, 0, at).radius).not.toBeCloseTo(circleAt(SEED, 1, at).radius, 4)
    // And the same red is the same size on every screen that asks.
    expect(circleAt(SEED, 0, at).radius).toBe(circleAt(SEED, 0, at).radius)
  })

  it('has a pointer inside it or not, in pixels, on a view of any shape', () => {
    const circle = { x: 0.5, y: 0.5, radius: 0.1 }
    expect(insideCircle({ x: 400, y: 300 }, circle, 800, 600)).toBe(true)
    expect(insideCircle({ x: 455, y: 300 }, circle, 800, 600)).toBe(true)
    expect(insideCircle({ x: 465, y: 300 }, circle, 800, 600)).toBe(false)
    expect(insideCircle(null, circle, 800, 600)).toBe(false)
  })
})

describe('space', () => {
  it('is a step on green', () => {
    let self: Self = FRESH
    for (let i = 0; i < 5; i++) self = pressSpace(SEED, momentIn('green'), self)
    expect(self).toEqual({ steps: 5, out: null })
  })

  it('is out on red - but not in the moment the light changes', () => {
    const red = schedule(SEED)[1]
    const early = pressSpace(SEED, red.start + LIGHT.pressGrace / 2, { steps: 9, out: null })
    expect(early).toEqual({ steps: 9, out: null })
    const late = pressSpace(SEED, red.start + LIGHT.pressGrace + 0.05, { steps: 9, out: null })
    expect(late.steps).toBe(9)
    expect(late.out?.why).toBe('space')
  })

  it('does nothing for somebody out or over the line', () => {
    const out: Self = { steps: 3, out: { why: 'pointer', at: 1 } }
    expect(pressSpace(SEED, 1, out)).toBe(out)
    const done: Self = { steps: LIGHT.steps, out: null }
    expect(pressSpace(SEED, 1, done)).toBe(done)
  })
})

describe('the pointer', () => {
  const W = 1000
  const H = 600
  const middle = { x: W / 2, y: H / 2 }

  it('does not matter on green', () => {
    expect(checkPointer(SEED, momentIn('green'), null, W, H, FRESH)).toBe(FRESH)
  })

  it('has until the circle starts moving to get inside it', () => {
    const red = schedule(SEED)[1]
    expect(checkPointer(SEED, red.start + LIGHT.pointerGrace - 0.05, { x: 0, y: 0 }, W, H, FRESH)).toBe(FRESH)
    const out = checkPointer(SEED, red.start + LIGHT.pointerGrace + 0.05, { x: 0, y: 0 }, W, H, FRESH)
    expect(out.out?.why).toBe('pointer')
  })

  it('is out off the view altogether', () => {
    const red = schedule(SEED)[1]
    expect(checkPointer(SEED, red.start + 1.5, null, W, H, FRESH).out?.why).toBe('pointer')
  })

  it('is safe all the way through a red for somebody who follows the circle', () => {
    for (const red of schedule(SEED).filter((p) => p.colour === 'red').slice(0, 10)) {
      let self: Self = { steps: 20, out: null }
      for (let t = red.start; t < red.end; t += 1 / 60) {
        const c = circleAt(SEED, red.red, t - red.start)
        self = checkPointer(SEED, t, { x: c.x * W, y: c.y * H }, W, H, self)
      }
      expect(self.out).toBeNull()
    }
    expect(middle.x).toBe(500)
  })

  it('is out for somebody who holds still in the middle while it wanders off', () => {
    const reds = schedule(SEED).filter((p) => p.colour === 'red').slice(0, 10)
    const caught = reds.filter((red) => {
      let self: Self = FRESH
      for (let t = red.start; t < red.end; t += 1 / 60) self = checkPointer(SEED, t, middle, W, H, self)
      return self.out !== null
    })
    expect(caught.length).toBeGreaterThanOrEqual(7)
  })
})

describe('the race', () => {
  const four = () => createRace(SEED, [{ id: 'a', mine: true }, { id: 'b' }, { id: 'c' }, { id: 'd' }], 9)

  it('places people at the line in the order they get there', () => {
    const race = four()
    run(race, 30)
    report(race, 'c', { steps: LIGHT.steps, out: null })
    stepRace(race, 0.1)
    report(race, 'a', { steps: LIGHT.steps, out: null })
    stepRace(race, 0.1)
    expect(race.racers.find((r) => r.id === 'c')!.place).toBe(1)
    expect(race.racers.find((r) => r.id === 'a')!.place).toBe(2)
    expect(race.over).toBe(false)
  })

  it('takes steps only forward, out only for good, and nothing once somebody is done', () => {
    const race = four()
    run(race, 20)
    report(race, 'b', { steps: 30, out: null })
    report(race, 'b', { steps: 12, out: null })
    expect(race.racers[1].steps).toBe(30)
    report(race, 'b', { steps: 31, out: { why: 'space', at: 20 } })
    report(race, 'b', { steps: 50, out: null })
    expect(race.racers[1]).toMatchObject({ steps: 31, out: { why: 'space' } })
  })

  it('does not believe somebody who claims more steps than there has been green for', () => {
    const race = four()
    stepRace(race, 0.2)
    report(race, 'a', { steps: LIGHT.steps, out: null })
    stepRace(race, 0.01)
    expect(race.racers[0].place).toBeNull()
    expect(race.racers[0].steps).toBeLessThan(15)
  })

  it('ends when nobody is left racing, or at the time limit', () => {
    const race = four()
    run(race, 20)
    report(race, 'a', { steps: LIGHT.steps, out: null })
    for (const id of ['b', 'c']) report(race, id, { steps: 10, out: { why: 'pointer', at: 19 } })
    stepRace(race, 0.1)
    expect(race.over).toBe(false)
    report(race, 'd', { steps: 4, out: { why: 'space', at: 20 } })
    stepRace(race, 0.1)
    expect(race.over).toBe(true)

    const slow = four()
    run(slow, LIGHT.timeLimit + 5, 0.25)
    expect(slow.over).toBe(true)
    expect(slow.elapsed).toBe(LIGHT.timeLimit)
  })

  it('ranks the line first, then anybody still going, then the out, by how far they got', () => {
    const race = createRace(SEED, ['win', 'going', 'outFar', 'outNear', 'second', 'tied'].map((id) => ({ id })), 1)
    run(race, 40)
    report(race, 'win', { steps: LIGHT.steps, out: null })
    stepRace(race, 0.1)
    report(race, 'second', { steps: LIGHT.steps, out: null })
    report(race, 'going', { steps: 20, out: null })
    report(race, 'tied', { steps: 50, out: { why: 'space', at: 30 } })
    report(race, 'outFar', { steps: 50, out: { why: 'pointer', at: 31 } })
    report(race, 'outNear', { steps: 5, out: { why: 'space', at: 3 } })
    stepRace(race, 0.1)
    const order = placings(race)
    expect(order.map((e) => [e.racer.id, e.place])).toEqual([
      ['win', 1],
      ['second', 2],
      ['going', 3],
      ['outFar', 4],
      ['tied', 4],
      ['outNear', 6],
    ])
  })
})

describe('the stand-ins', () => {
  it('go forward only on green, never past the line, and are out for good once they slip', () => {
    const race = createRace(SEED, [{ id: 'me' }, ...['x', 'y', 'z'].map((id) => ({ id, bot: true }))], 1)
    let before = new Map<string, number>()
    for (let t = 0; t < 60; t += 1 / 20) {
      stepRace(race, 1 / 20)
      const light = lightAt(SEED, race.elapsed)
      for (const bot of race.racers.filter((r) => r.bot)) {
        const self = botSelf(race, bot)
        expect(self.steps).toBeLessThanOrEqual(LIGHT.steps)
        if (light.colour === 'red' && light.since > 0.1 && !self.out) expect(self.steps).toBe(before.get(bot.id) ?? 0)
        before.set(bot.id, self.steps)
        report(race, bot.id, self)
      }
      before = new Map(before)
    }
    expect(BOT_SLIP).toBeLessThan(0.5)
  })

  it('finish a race, some of the time, in about the time a person would', () => {
    let finished = 0
    let slipped = 0
    for (let seed = 1; seed <= 40; seed++) {
      const race = createRace(seed, [{ id: 'bot', bot: true }], 1)
      run(race, 0.01)
      while (!race.over) {
        report(race, 'bot', botSelf(race, race.racers[0]))
        stepRace(race, 0.1)
      }
      const bot = race.racers[0]
      if (bot.place === 1) {
        finished += 1
        expect(bot.finishedAt).toBeGreaterThan(12)
        expect(bot.finishedAt).toBeLessThan(40)
      }
      if (bot.out) slipped += 1
    }
    expect(finished).toBeGreaterThan(15)
    expect(slipped).toBeGreaterThan(2)
  })
})
