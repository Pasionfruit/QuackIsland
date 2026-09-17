/**
 * The stand-ins.
 *
 * Each one takes a pet from the seed - never the fish, because racing alone
 * against four fish is not a race - and then runs the course the way the course
 * asks to be run: aim at the gate in the next band of hedges, go through it,
 * aim at the one after. When its tank is low it will go out of its way for a
 * treat, and when the tank is full it spends it.
 *
 * **They are deliberately a little sloppy.** Each aims a bit off the middle of
 * the gate and holds its boost to its own idea of how much tank is worth
 * keeping, both from the seed, so eight of them do not run one line in single
 * file and a person can beat them.
 *
 * Only ever runs on the host, through the same hands as everybody else.
 */
import { createRng, hashSeed } from '../../00-core'
import { BAND, TRACK, courseFor, lineAt } from './course'
import { PETS, petById } from './pets'
import { choose, hasTaken, isIn, petOf, tankOf, type Game, type Racer } from './rules'

export const BOT = {
  /** How far off the middle of a gate a stand-in may aim, as a share of the gap. */
  sloppy: 0.55,
  /** Tank fractions above which a stand-in will spend boost, least and most. */
  spends: [0.25, 0.7] as readonly [number, number],
  /** Below this much tank it will leave its line for a treat. */
  hungry: 0.45,
  /**
   * An animal that regrows faster than this never goes out of its way for a
   * treat: by the time it got there it would be full anyway. It is what stops
   * the rabbit - which refills its little tank in under a second and a half -
   * spending the whole race crossing the course for biscuits it does not need.
   */
  greedyUnder: 1,
  /** How far ahead it will go looking for one, and how far off the line it will go for it. */
  smell: 16,
  detour: 7,
  /** How long it will chase one treat before deciding it is not worth it. */
  giveUp: 2.5,
  /** How long it must fail to make ground before it decides it is stuck, and how long it backs off for. */
  stuckAfter: 0.6,
  stuckMoved: 0.8,
  escapeFor: 0.7,
  /** How near a hedge has to be, ahead, before it leans away from it. */
  wary: 7,
  /**
   * How far ahead down the course it aims.
   *
   * It follows the course's own line at this distance rather than steering at
   * the next gate, because steering at a gate means arriving at it sideways:
   * an animal that has only started moving across when the hedge is in front of
   * it spends the whole race bouncing off one. Aiming at where the line will be
   * in nine metres is what makes a stand-in look like it is driving.
   */
  lookahead: 9,
} as const

interface Mind {
  /** Which way it leans off the gate's middle, -1 to 1. */
  lean: number
  spends: number
  random: () => number
  /** Where it was and when, so it can notice it is wedged against a hedge. */
  lastZ: number
  lastAt: number
  /** While this is in the future it is backing out sideways rather than driving. */
  escapeUntil: number
  escapeDir: number
  /** The treat it is going for, when it gives up on it, and the ones it has given up on. */
  chase: number
  chaseUntil: number
  gaveUp: Set<number>
  /**
   * The clock it last saw.
   *
   * Everything else in here is a moment in `game.elapsed`, so a mind carried
   * over into a later race - same id, same seed, a fresh clock - would be
   * holding timers from the future and would sit there escaping a hedge that no
   * longer exists. A clock that has gone backwards means a new race.
   */
  at: number
}

const minds = new Map<string, Mind>()

function mindFor(game: Game, id: string): Mind {
  const key = `${game.id}:${game.seed}:${id}`
  let mind = minds.get(key)
  if (mind && game.elapsed < mind.at) mind = undefined
  if (!mind) {
    const random = createRng(hashSeed(game.seed, `pet-race:bot:${id}`))
    mind = {
      lean: (random() * 2 - 1) * BOT.sloppy,
      spends: BOT.spends[0] + random() * (BOT.spends[1] - BOT.spends[0]),
      random,
      lastZ: Number.NaN,
      lastAt: 0,
      escapeUntil: -1,
      escapeDir: 1,
      chase: -1,
      chaseUntil: 0,
      gaveUp: new Set<number>(),
      at: game.elapsed,
    }
    minds.set(key, mind)
    if (minds.size > 64) minds.delete(minds.keys().next().value!)
  }
  mind.at = game.elapsed
  return mind
}

/** The pet a stand-in takes: one of the four that actually run, from the seed. */
export function botPet(seed: number, id: string): (typeof PETS)[number]['id'] {
  const runners = PETS.filter((pet) => pet.speed > 0)
  const random = createRng(hashSeed(seed, `pet-race:bot-pet:${id}`))
  return runners[Math.floor(random() * runners.length)].id
}

/** Every stand-in chooses, the moment the table goes up. */
export function botChoose(game: Game): void {
  if (game.phase !== 'choosing') return
  game.racers.forEach((racer, i) => {
    if (racer.bot && racer.pet === null) choose(game, i, botPet(game.seed, racer.id))
  })
}

/** Where a stand-in is trying to get to next: the gate in the band ahead, or a treat it needs. */
function target(game: Game, racer: Racer, mind: Mind): { x: number; z: number } {
  const course = courseFor(game.seed)
  const finish = { x: racer.x * 0.4, z: -TRACK.length - 4 }

  // Only an animal whose tank is slow to come back is worth the detour.
  if (petById(petOf(racer)).regen < BOT.greedyUnder && tankOf(racer) < BOT.hungry) {
    // Stick with the one it is already going for, until it has it or has had enough.
    if (mind.chase >= 0 && !hasTaken(racer, mind.chase) && game.elapsed < mind.chaseUntil) return course.treats[mind.chase]
    if (mind.chase >= 0 && !hasTaken(racer, mind.chase) && game.elapsed >= mind.chaseUntil) mind.gaveUp.add(mind.chase)
    mind.chase = -1

    let best = -1
    let bestD: number = BOT.smell
    for (const [i, treat] of course.treats.entries()) {
      if (hasTaken(racer, i) || mind.gaveUp.has(i) || treat.z > racer.z) continue
      // Not one that would mean crossing the course for it.
      if (Math.abs(treat.x - lineAt(course, treat.z)) > BOT.detour) continue
      const d = Math.hypot(treat.x - racer.x, treat.z - racer.z)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    if (best >= 0) {
      mind.chase = best
      mind.chaseUntil = game.elapsed + BOT.giveUp
      return course.treats[best]
    }
  }

  const ahead = racer.z - BOT.lookahead
  if (ahead < -TRACK.length) return finish
  return { x: lineAt(course, ahead) + mind.lean * BAND.gate, z: ahead }
}

/** A nudge away from any hedge it is about to run into. */
function swerve(game: Game, racer: Racer): { x: number; z: number } {
  const course = courseFor(game.seed)
  const radius = petById(petOf(racer)).radius
  let x = 0
  for (const hedge of course.hedges) {
    const ahead = racer.z - hedge.z
    if (ahead < 0 || ahead > BOT.wary) continue
    const across = hedge.x - racer.x
    const clear = hedge.r + radius + 0.5
    if (Math.abs(across) > clear) continue
    // Push sideways, hardest when it is dead ahead and close.
    const urgency = (1 - ahead / BOT.wary) * (1 - Math.abs(across) / clear)
    x -= Math.sign(across || 1) * urgency * 1.6
  }
  return { x, z: 0 }
}

/** Sets every stand-in's hands for this frame. Host only. */
export function botDrive(game: Game): void {
  if (game.over || game.phase !== 'racing') return
  game.racers.forEach((racer, i) => {
    if (!racer.bot) return
    const pet = petById(petOf(racer))
    if (!isIn(racer) || pet.speed <= 0 || racer.finishedAt !== null) {
      game.hands[i] = { x: 0, z: 0, boost: false }
      return
    }
    const mind = mindFor(game, racer.id)

    // Wedged against a hedge: an animal that keeps pushing into one never gets
    // off it, because the push-out and the hands cancel. Back off sideways.
    if (Number.isNaN(mind.lastZ)) {
      mind.lastZ = racer.z
      mind.lastAt = game.elapsed
    }
    if (game.elapsed - mind.lastAt > BOT.stuckAfter) {
      if (mind.lastZ - racer.z < BOT.stuckMoved) {
        mind.escapeUntil = game.elapsed + BOT.escapeFor
        mind.escapeDir = racer.x > 0 ? -1 : 1
      }
      mind.lastZ = racer.z
      mind.lastAt = game.elapsed
    }
    if (game.elapsed < mind.escapeUntil) {
      // Sideways and still forwards: sliding along a hedge gets you round it,
      // and backing up only takes you further from the line.
      game.hands[i] = { x: mind.escapeDir, z: -0.3, boost: false }
      mind.lastZ = racer.z
      mind.lastAt = game.elapsed
      return
    }

    const to = target(game, racer, mind)
    const away = swerve(game, racer)
    const dx = to.x - racer.x + away.x * 4
    const dz = to.z - racer.z
    const length = Math.hypot(dx, dz) || 1
    game.hands[i] = { x: dx / length, z: dz / length, boost: tankOf(racer) > mind.spends }
  })
}
