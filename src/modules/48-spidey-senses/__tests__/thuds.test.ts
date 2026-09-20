/**
 * What the spider does and what you can do about it: it comes out on the second,
 * third or fourth thud, before anybody can get to the trapdoor; and everybody it takes
 * gets the jump scare, second place included.
 */
import { describe, expect, it } from 'vitest'
import { botSteer } from '../internal/ai'
import { CELLAR, TIMING, rattle, scheduleFor, when } from '../internal/nest'
import { SCARE, scaredNow } from '../internal/NestScreen'
import { BODY, createGame, distance, isStanding, placings, steer, stepGame, stop, type Game, type Player } from '../internal/rules'

describe('the thuds', () => {
  it('are the second, third or fourth before the spider comes out - one to three false alarms and then the spring - in every round of every game', () => {
    const thuds = new Set<number>()
    for (let seed = 1; seed <= 300; seed++) {
      for (const r of scheduleFor(seed)) {
        // Every thud but the last is a twitch; the last is the spring.
        const count = r.twitches.length + 1
        thuds.add(count)
        expect(count).toBeGreaterThanOrEqual(TIMING.thuds[0])
        expect(count).toBeLessThanOrEqual(TIMING.thuds[1])
        expect(r.twitches.length).toBeGreaterThanOrEqual(1)
        expect(r.twitches.length).toBeLessThanOrEqual(3)
      }
    }
    // All three come up, and none other.
    expect([...thuds].sort()).toEqual([2, 3, 4])
  })

  it('come in order, with room between them and after the start, and the last false alarm is a good moment before the spring', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const r of scheduleFor(seed)) {
        const times = [...r.twitches, r.springs]
        expect(times[0]).toBeGreaterThanOrEqual(r.creep + TIMING.lead - 1e-9)
        for (let k = 1; k < times.length; k++) expect(times[k] - times[k - 1], `${seed}:${r.round}`).toBeGreaterThanOrEqual(TIMING.apart - 1e-9)
        for (const at of r.twitches) expect(at).toBeLessThan(r.springs - 1.2)
      }
    }
  })

  it('are what the lid does: a small rattle for each false alarm and a hard one that does not stop for the spring', () => {
    const r = scheduleFor(7)[0]
    for (const at of r.twitches) {
      expect(rattle(7, at + 0.01)).toBeGreaterThan(0)
      expect(rattle(7, at + 0.01)).toBeLessThan(0.5)
    }
    expect(rattle(7, r.springs + 0.01)).toBe(1)
  })

  it('fit the shortest spring there is: five seconds in still has room for three false alarms', () => {
    // The tightest case: the most thuds and the least time.
    expect(TIMING.lead + 3 * TIMING.apart).toBeLessThanOrEqual(TIMING.spring[0])
  })

  it('are the same on every screen: worked out from the seed, and the same each time', () => {
    expect(scheduleFor(11).map((r) => r.twitches)).toEqual(scheduleFor(11).map((r) => r.twitches))
    expect(when(11, scheduleFor(11)[2].springs + 0.1).round.round).toBe(3)
  })
})

describe('the trapdoor', () => {
  it('has the spider out before anybody can get to it: the quickest creeper is still short of the trapdoor when the latest spring, its window and its grace are over', () => {
    const quickest = (CELLAR.far - CELLAR.near) / BODY.speed
    // The longest a round can leave anybody creeping: the latest spring, the longest window (round one) and the grace.
    const latest = TIMING.spring[1] + TIMING.window[0] + TIMING.grace
    expect(latest).toBeLessThan(quickest)
    for (let seed = 1; seed <= 300; seed++) {
      for (const r of scheduleFor(seed)) {
        expect(r.springs - r.creep).toBeLessThanOrEqual(TIMING.spring[1] + 1e-9)
        expect(r.judged - r.creep, `${seed}:${r.round}`).toBeLessThan(quickest)
      }
    }
  })

  it('is never reached in play: walking straight at it from the moment the creep starts, the round is judged first', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = createGame(seed, [{ id: 'a', mine: true }, { id: 'b' }], 3)
      const r = scheduleFor(g.seed)[0]
      while (when(g.seed, g.elapsed).phase !== 'creep') stepGame(g, 0.05)
      // Straight in, never stopping, until the spider comes out.
      while (g.elapsed < r.judged) {
        steer(g, 0, 1, 0)
        stepGame(g, 1 / 30)
        expect(distance(g.players[0]), `${seed}`).toBeGreaterThan(CELLAR.near + 1e-6)
      }
    }
  })
})

describe('the jump scare', () => {
  it('is for everybody the spider takes: too slow and the chicken alike', () => {
    for (const how of ['eaten', 'chicken'] as const) {
      const p = { how, outAt: 10 }
      expect(scaredNow({ elapsed: 10 }, p), how).toBe(true)
      expect(scaredNow({ elapsed: 10 + SCARE - 0.01 }, p), how).toBe(true)
    }
  })

  it('starts as it takes them and is over when its shriek is, and is never for somebody it did not take', () => {
    const p = { how: 'chicken' as const, outAt: 10 }
    expect(scaredNow({ elapsed: 9.99 }, p)).toBe(false)
    expect(scaredNow({ elapsed: 10 + SCARE + 0.01 }, p)).toBe(false)
    expect(scaredNow({ elapsed: 10.5 }, { how: null, outAt: null })).toBe(false)
    expect(scaredNow({ elapsed: 10.5 }, { how: 'eaten', outAt: null })).toBe(false)
  })

  it('reaches second place: in games played to the end, everybody who was ever taken - the runner-up in the last round included - was scared', () => {
    let runnersUp = 0
    let chickens = 0
    for (let seed = 1; seed <= 12; seed++) {
      const g: Game = createGame(seed * 17, Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, bot: true })), seed)
      const scared = new Set<string>()
      for (let i = 0; i < 30 * 60 * 5 && !g.over; i++) {
        botSteer(g)
        stepGame(g, 1 / 30)
        for (const p of g.players) if (scaredNow(g, p as Pick<Player, 'how' | 'outAt'>)) scared.add(p.id)
      }
      expect(g.over).toBe(true)
      for (const p of g.players) {
        if (p.out === null) continue
        // Taken, and scared, however it was done.
        expect(scared.has(p.id), `${seed}:${p.id}:${p.how}`).toBe(true)
        if (p.how === 'chicken') chickens += 1
      }
      // ...and never anybody it did not take.
      for (const id of scared) expect(g.players.find((p) => p.id === id)!.out).not.toBeNull()
      // Second place is somebody who was taken in the last round, and was scared.
      const second = placings(g).find((e) => e.place === 2)
      if (second && second.player.out !== null) {
        runnersUp += 1
        expect(scared.has(second.player.id)).toBe(true)
      }
      expect(g.players.filter(isStanding).length).toBeLessThanOrEqual(1)
    }
    expect(runnersUp).toBeGreaterThan(5)
    expect(chickens).toBeGreaterThan(0)
  }, 60000)

  it('fits inside the reveal, so the results come after it', () => {
    expect(SCARE).toBeLessThan(TIMING.reveal)
  })
})

describe('a stopped player', () => {
  it('stays put, whatever the keys say', () => {
    const g = createGame(5, [{ id: 'a', mine: true }, { id: 'b' }], 1)
    while (when(g.seed, g.elapsed).phase !== 'creep') stepGame(g, 0.25)
    stepGame(g, 0.5)
    expect(stop(g, 0)).toBe(true)
    const at = { x: g.players[0].x, z: g.players[0].z }
    steer(g, 0, 1, 1)
    stepGame(g, 1)
    expect(g.players[0]).toMatchObject(at)
  })
})
