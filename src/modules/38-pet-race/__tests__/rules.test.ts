/**
 * The race: choosing, the fish, the countdown, running, the tank, the treats,
 * the line, and where everybody ends up.
 */
import { describe, expect, it } from 'vitest'
import { botDrive, botPet } from '../internal/ai'
import { FINISH_Z, PUDDLE, TRACK, TREAT, courseFor } from '../internal/course'
import { PETS, petById, type PetId } from '../internal/pets'
import {
  RACE,
  allChosen,
  allHome,
  canBoost,
  choose,
  createGame,
  hasTaken,
  leave,
  petOf,
  phase,
  placings,
  progress,
  stepGame,
  tankOf,
  timeLeft,
  type Game,
} from '../internal/rules'

const SEED = 104729

function game(ids: string[] = ['p1', 'p2', 'p3']): Game {
  return createGame(
    SEED,
    ids.map((id, i) => ({ id, mine: i === 0 })),
    1,
  )
}

/** Runs the clock on, a frame at a time, with nobody pressing anything. */
function wait(g: Game, secondsOf: number, dt = 1 / 60) {
  for (let t = 0; t < secondsOf - 1e-9 && !g.over; t += dt) stepGame(g, Math.min(dt, secondsOf - t))
}

function until(g: Game, want: string, limit = 90) {
  for (let t = 0; phase(g) !== want; t += 1 / 60) {
    if (t > limit || g.over) throw new Error(`never got to ${want}: ${phase(g)}`)
    stepGame(g, 1 / 60)
  }
}

/** Everybody chooses, which is what takes the table down. */
function toTheRace(g: Game, pets: PetId[]) {
  pets.forEach((pet, i) => choose(g, i, pet))
  until(g, 'racing')
}

describe('choosing', () => {
  it('starts with the table up, nobody chosen, and ten seconds on it', () => {
    const g = game()
    expect(phase(g)).toBe('choosing')
    expect(g.racers.every((r) => r.pet === null)).toBe(true)
    expect(timeLeft(g)).toBe(RACE.choosing)
    expect(allChosen(g)).toBe(false)
  })

  it('lets you change your mind as often as you like, until the table comes down', () => {
    const g = game()
    expect(choose(g, 0, 'cat')).toBe(true)
    expect(g.racers[0].pet).toBe('cat')
    expect(choose(g, 0, 'rabbit')).toBe(true)
    expect(g.racers[0].pet).toBe('rabbit')
    toTheRace(g, ['rabbit', 'dog', 'dog'])
    expect(choose(g, 0, 'hamster')).toBe(false)
    expect(g.racers[0].pet).toBe('rabbit')
  })

  it('comes down early once everybody has chosen, rather than running the clock down for nobody', () => {
    const g = game()
    wait(g, 1)
    for (const [i] of g.racers.entries()) choose(g, i, 'dog')
    expect(allChosen(g)).toBe(true)
    stepGame(g, 1 / 60)
    expect(phase(g)).toBe('countdown')
    // And well before the ten seconds were up.
    expect(g.elapsed).toBeLessThan(RACE.choosing)
  })

  it('gives the fish to anybody who never chose, and only to them', () => {
    const g = game()
    choose(g, 1, 'hamster')
    wait(g, RACE.choosing + 0.1)
    expect(phase(g)).toBe('countdown')
    expect(petOf(g.racers[0])).toBe('fish')
    expect(petOf(g.racers[1])).toBe('hamster')
    expect(petOf(g.racers[2])).toBe('fish')
  })

  it('puts everybody on the line with a full tank when the table comes down', () => {
    const g = game()
    toTheRace(g, ['cat', 'dog', 'rabbit'])
    for (const [i, racer] of g.racers.entries()) {
      expect(racer.z, `${i}`).toBeGreaterThan(0)
      expect(racer.z, `${i}`).toBeLessThanOrEqual(TRACK.runUp)
      expect(tankOf(racer), `${i}`).toBe(1)
    }
  })
})

describe('the countdown', () => {
  it('is three seconds, and nobody moves through it however hard they press', () => {
    const g = game()
    toTheRace(g, ['dog', 'dog', 'dog'])
    const g2 = game()
    g2.racers.forEach((_, i) => choose(g2, i, 'dog'))
    stepGame(g2, 1 / 60)
    expect(phase(g2)).toBe('countdown')
    const was = g2.racers.map((r) => r.z)
    g2.hands = g2.racers.map(() => ({ x: 0, z: -1, boost: true }))
    wait(g2, RACE.countdown - 0.2)
    expect(phase(g2)).toBe('countdown')
    expect(g2.racers.map((r) => r.z)).toEqual(was)
    wait(g2, 0.4)
    expect(phase(g2)).toBe('racing')
    // The race clock starts at thirty when the countdown ends, not when the table did.
    expect(timeLeft(g2)).toBeGreaterThan(RACE.length - 0.5)
  })
})

describe('running', () => {
  it('goes where the keys point, and takes a moment to get there', () => {
    const g = game()
    toTheRace(g, ['dog', 'dog', 'dog'])
    const dog = petById('dog')
    g.hands[0] = { x: 0, z: -1, boost: false }
    stepGame(g, 1 / 60)
    // Momentum: one frame in, it is moving but nowhere near flat out.
    expect(Math.hypot(g.racers[0].vx, g.racers[0].vz)).toBeLessThan(dog.speed * 0.5)
    wait(g, 1.5)
    expect(Math.hypot(g.racers[0].vx, g.racers[0].vz)).toBeGreaterThan(dog.speed * 0.9)
    expect(g.racers[0].z).toBeLessThan(0)
    // And it faces where it is going.
    expect(Math.abs(Math.atan2(Math.sin(g.racers[0].facing - Math.PI), Math.cos(g.racers[0].facing - Math.PI)))).toBeLessThan(0.2)
  })

  it('turns a loose animal more slowly than a sharp one', () => {
    // Measured as a share of the animal's own top speed: the rabbit is faster
    // in a line than the cat is, so comparing raw sideways speed would say the
    // rabbit corners better, which is the opposite of the truth.
    const turned = (pet: PetId) => {
      const g = game(['a'])
      toTheRace(g, [pet])
      g.hands[0] = { x: 0, z: -1, boost: false }
      wait(g, 1.5)
      g.hands[0] = { x: 1, z: 0, boost: false }
      wait(g, 0.35)
      return g.racers[0].vx / petById(pet).speed
    }
    // The cat grips at 13, the rabbit at 5.5.
    expect(turned('cat')).toBeGreaterThan(turned('rabbit') + 0.1)
    expect(turned('hamster')).toBeGreaterThan(turned('dog'))
  })

  it('burns the tank while the button is held and fills it again when it is not', () => {
    const g = game(['a'])
    toTheRace(g, ['hamster'])
    const tank = petById('hamster').stamina
    g.hands[0] = { x: 0, z: -1, boost: true }
    wait(g, 2)
    expect(g.racers[0].stamina).toBeCloseTo(tank - 2, 1)
    expect(g.racers[0].boosting).toBe(true)
    g.hands[0] = { x: 0, z: -1, boost: false }
    wait(g, 1)
    expect(g.racers[0].boosting).toBe(false)
    expect(g.racers[0].stamina).toBeCloseTo(tank - 2 + petById('hamster').regen, 1)
  })

  it('goes faster while boosting, and stops boosting when the tank is empty', () => {
    const run = (boost: boolean) => {
      const g = game(['a'])
      toTheRace(g, ['cat'])
      g.hands[0] = { x: 0, z: -1, boost }
      wait(g, 2)
      return progress(g.racers[0])
    }
    expect(run(true)).toBeGreaterThan(run(false))

    const g = game(['a'])
    toTheRace(g, ['cat'])
    g.hands[0] = { x: 0, z: -1, boost: true }
    wait(g, petById('cat').stamina + 0.5)
    expect(g.racers[0].boosting).toBe(false)
    expect(g.racers[0].winded).toBe(true)
    expect(canBoost(g.racers[0])).toBe(false)
  })

  it('will not give the button back until you have got your breath', () => {
    const g = game(['a'])
    toTheRace(g, ['cat'])
    const racer = g.racers[0]
    g.hands[0] = { x: 0, z: -1, boost: true }
    wait(g, petById('cat').stamina + 0.5)
    expect(racer.winded).toBe(true)
    // Holding it down the whole time must not get a boost every other frame.
    const held = racer.stamina
    wait(g, 0.4)
    expect(racer.boosting).toBe(false)
    expect(racer.stamina).toBeGreaterThan(held)
    // Once there is a breath back in it, the button works again.
    wait(g, RACE.breath / petById('cat').regen)
    expect(racer.winded).toBe(false)
    expect(racer.boosting).toBe(true)
  })

  it('is held up by a puddle', () => {
    const course = courseFor(SEED)
    const puddle = course.puddles[0]
    const g = game(['a'])
    toTheRace(g, ['dog'])
    // Put it in the middle of a puddle and let it run straight.
    Object.assign(g.racers[0], { x: puddle.x, z: puddle.z, vx: 0, vz: 0 })
    g.hands[0] = { x: 0, z: -1, boost: false }
    wait(g, 0.4)
    const inPuddle = Math.hypot(g.racers[0].vx, g.racers[0].vz)
    expect(inPuddle).toBeLessThan(petById('dog').speed * (PUDDLE.drag + 0.15))
  })

  it('cannot walk through a hedge', () => {
    const course = courseFor(SEED)
    const hedge = course.hedges.find((h) => h.z < -20)!
    const g = game(['a'])
    toTheRace(g, ['rabbit'])
    Object.assign(g.racers[0], { x: hedge.x, z: hedge.z + 4, vx: 0, vz: 0 })
    g.hands[0] = { x: 0, z: -1, boost: false }
    wait(g, 2)
    // Stopped on the near side of it, not through it.
    expect(g.racers[0].z).toBeGreaterThan(hedge.z)
    expect(Math.hypot(g.racers[0].x - hedge.x, g.racers[0].z - hedge.z)).toBeGreaterThanOrEqual(hedge.r + petById('rabbit').radius - 1e-6)
  })

  it('picks up a treat once, and it is worth a second and a half of tank', () => {
    const course = courseFor(SEED)
    const treat = course.treats[0]
    const g = game(['a'])
    toTheRace(g, ['cat'])
    const racer = g.racers[0]
    racer.stamina = 0
    Object.assign(racer, { x: treat.x, z: treat.z + 3, vx: 0, vz: 0 })
    g.hands[0] = { x: 0, z: -1, boost: false }
    wait(g, 1)
    expect(hasTaken(racer, 0)).toBe(true)
    // The treat and the regrow between them, and never past the top of the tank.
    expect(racer.stamina).toBeGreaterThan(TREAT.gives)
    const had = racer.stamina
    wait(g, 0.5)
    expect(hasTaken(racer, 0)).toBe(true)
    expect(racer.stamina).toBeLessThan(had + TREAT.gives)
    expect(racer.stamina).toBeLessThanOrEqual(petById('cat').stamina)
  })
})

describe('the fish', () => {
  it('does not move, whatever is pressed, for the whole race', () => {
    const g = game(['a', 'b'])
    toTheRace(g, ['fish', 'dog'])
    const was = { x: g.racers[0].x, z: g.racers[0].z }
    g.hands[0] = { x: 1, z: -1, boost: true }
    wait(g, 6)
    expect(g.racers[0].x).toBe(was.x)
    expect(g.racers[0].z).toBe(was.z)
    expect(g.racers[0].boosting).toBe(false)
    expect(tankOf(g.racers[0])).toBe(0)
    expect(progress(g.racers[0])).toBe(0)
  })

  it('never ends the race by finishing, so a field of fish runs the full thirty seconds', () => {
    const g = game(['a', 'b'])
    toTheRace(g, ['fish', 'fish'])
    wait(g, RACE.length - 1)
    expect(g.over).toBe(false)
    wait(g, 1.5)
    expect(g.over).toBe(true)
    expect(g.racers.every((r) => r.finishedAt === null)).toBe(true)
  })
})

describe('the end', () => {
  it('comes when everybody who can finish has', () => {
    const g = game(['a', 'b'])
    toTheRace(g, ['dog', 'fish'])
    g.hands[0] = { x: 0, z: -1, boost: false }
    Object.assign(g.racers[0], { x: 0, z: FINISH_Z + 2 })
    wait(g, 2)
    expect(g.racers[0].finishedAt).not.toBeNull()
    // The fish cannot finish, so it does not hold the race open.
    expect(g.over).toBe(true)
  })

  it('comes after thirty seconds whatever is still out there', () => {
    const g = game(['a', 'b'])
    toTheRace(g, ['hamster', 'hamster'])
    wait(g, RACE.length + 0.2)
    expect(g.over).toBe(true)
    expect(timeLeft(g)).toBe(0)
  })

  it('stops a finisher dead-ish rather than letting them run on for ever', () => {
    const g = game(['a'])
    toTheRace(g, ['rabbit'])
    Object.assign(g.racers[0], { z: FINISH_Z + 1 })
    g.hands[0] = { x: 0, z: -1, boost: true }
    wait(g, 3)
    expect(g.racers[0].finishedAt).not.toBeNull()
    expect(g.racers[0].z).toBeGreaterThan(FINISH_Z - TRACK.runOff)
    expect(progress(g.racers[0])).toBe(TRACK.length)
  })

  it('places finishers by their time and everybody else by how far they got', () => {
    const g = game(['a', 'b', 'c'])
    toTheRace(g, ['dog', 'dog', 'fish'])
    // a finishes first, b a moment later, c is a fish on the line.
    Object.assign(g.racers[0], { z: FINISH_Z + 0.5 })
    g.hands[0] = { x: 0, z: -1, boost: false }
    wait(g, 0.4)
    Object.assign(g.racers[1], { z: FINISH_Z + 0.5 })
    g.hands[1] = { x: 0, z: -1, boost: false }
    wait(g, 0.6)
    const order = placings(g)
    expect(order.map((entry) => entry.racer.id)).toEqual(['a', 'b', 'c'])
    expect(order.map((entry) => entry.place)).toEqual([1, 2, 3])
    expect(order[0].racer.finishedAt!).toBeLessThan(order[1].racer.finishedAt!)
  })

  it('shares a place between two who cross on the same hundredth', () => {
    const g = game(['a', 'b', 'c'])
    toTheRace(g, ['dog', 'dog', 'dog'])
    for (const i of [0, 1]) {
      Object.assign(g.racers[i], { z: FINISH_Z + 0.2, x: i * 2 })
      g.hands[i] = { x: 0, z: -1, boost: false }
    }
    wait(g, 0.5)
    const order = placings(g)
    expect(order.slice(0, 2).map((e) => e.place)).toEqual([1, 1])
    expect(order[2].place).toBe(3)
  })

  it('counts somebody who left where they stopped, and stops moving them', () => {
    const g = game(['a', 'b'])
    toTheRace(g, ['dog', 'dog'])
    g.hands[1] = { x: 0, z: -1, boost: false }
    wait(g, 1.5)
    const got = progress(g.racers[1])
    expect(got).toBeGreaterThan(1)
    leave(g, 1)
    wait(g, 2)
    expect(progress(g.racers[1])).toBeCloseTo(got, 5)
    expect(g.racers[1].left).toBe(true)
  })
})

describe('the stand-ins, and with them the course itself', () => {
  const RUNNERS = PETS.filter((pet) => pet.speed > 0).map((pet) => pet.id)
  const SEEDS = Array.from({ length: 16 }, (_, i) => (i + 1) * 104729)

  /** A whole race, driven by the stand-ins, one pet each. */
  function raced(seed: number): Game {
    const g = createGame(
      seed,
        RUNNERS.map((_pet, i) => ({ id: `p${i}`, bot: true })),
      seed,
    )
    RUNNERS.forEach((pet, i) => choose(g, i, pet))
    for (let t = 0; t < 60 && !g.over; t += 1 / 60) {
      botDrive(g)
      stepGame(g, 1 / 60)
      // A race is over once three are home; this one runs on for the whole field.
      if (g.over && !allHome(g) && g.elapsed - g.phaseAt < RACE.length) g.over = false
    }
    return g
  }

  const races = SEEDS.map((seed) => raced(seed))

  it('gets every animal home on every course, which is what says the course can be run', () => {
    // The strongest thing there is to say about a generated course: something
    // that only knows the gates and the hedges in front of it finishes on it.
    for (const g of races) {
      for (const racer of g.racers) {
        expect(racer.finishedAt, `${g.seed} ${racer.pet}`).not.toBeNull()
        expect(racer.finishedAt!, `${g.seed} ${racer.pet}`).toBeLessThanOrEqual(RACE.length)
      }
    }
  })

  it('finishes them within a few seconds of each other, whichever animal they took', () => {
    // The balance claim, measured rather than asserted by eye. The same driver
    // on four animals over sixteen courses: the means have to be close, or one
    // of the five cards is the right answer and the table is a formality.
    const means = RUNNERS.map((pet) => {
      const times = races.map((g) => g.racers.find((r) => r.pet === pet)!.finishedAt!)
      return { pet, mean: times.reduce((s, v) => s + v, 0) / times.length }
    })
    for (const { pet, mean } of means) {
      expect(mean, `${pet} mean`).toBeGreaterThan(15)
      expect(mean, `${pet} mean`).toBeLessThan(RACE.length - 5)
    }
    const spread = Math.max(...means.map((m) => m.mean)) - Math.min(...means.map((m) => m.mean))
    expect(spread, `spread ${means.map((m) => `${m.pet} ${m.mean.toFixed(1)}`).join(' ')}`).toBeLessThan(3)
  })

  it('plays the same race the same way twice', () => {
    const once = raced(777_003).racers.map((r) => [r.pet, r.finishedAt, r.taken])
    const twice = raced(777_003).racers.map((r) => [r.pet, r.finishedAt, r.taken])
    expect(once).toEqual(twice)
  })

  it('never takes the fish, because racing four fish is not a race', () => {
    for (const seed of SEEDS) {
      for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
        expect(RUNNERS, `${seed} ${id}`).toContain(botPet(seed, id))
      }
    }
    // And they do take more than one kind between them.
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => botPet(SEED, id))).size).toBeGreaterThan(1)
  })
})
