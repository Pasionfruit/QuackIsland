/**
 * The rules of Messy Maze, as arithmetic.
 *
 * No three.js, no React, no clock of its own. `stepRace` takes a race, which
 * way everybody is trying to go, and how long since last time, and gives back
 * the race a moment later. Spinning, rebinding, finishing and placing are all
 * decided in here, and all of it can be tested by calling a function.
 *
 * **The rules take directions, not keys.** Whoever is driving a racer - a
 * keyboard read through that racer's binding, another browser, or the
 * steering in `ai.ts` - hands in a direction, and these rules cannot tell
 * which. The binding lives on the racer so that the one place that turns
 * letters into directions always reads the current one.
 */
import { START_BINDING, rebind } from './bindings'
import {
  MAZE,
  cellAt,
  cellCentre,
  mazeFor,
  settle,
  stepsFrom,
  stepsTo,
  type Cell,
  type Point,
} from './maze'

export const RACE = {
  /**
   * Spins you must have had before the middle counts. Each platform spins each
   * racer only once, so this many spins is this many different platforms.
   */
  platformsNeeded: 2,
  /**
   * How long a spin holds you, in seconds.
   *
   * Long enough to see it happen and read the new letters off the HUD; short
   * enough that it is the letters slowing you down afterwards, not the spin.
   */
  spinTime: 0.45,
  /**
   * How long everybody else gets once somebody is in, in seconds.
   *
   * Without it one racer who has wandered off, or walked away from the
   * keyboard, keeps a whole lobby waiting on a finished race.
   */
  lastCall: 30,
  /** However the race is going, it is over after this long. */
  timeLimit: 240,
  /**
   * How much slower a stand-in racer runs than a person.
   *
   * They never take a wrong turn, and they would win every race if they ran at
   * full pace. This and `botDaze` are what they pay instead of being confused.
   */
  botPace: 0.8,
  /** How long a stand-in stands still after a spin, reading its new keys. */
  botDaze: 1.1,
} as const

export interface Racer {
  id: string
  x: number
  y: number
  /** Which way it last moved, in radians. For turning the body to face it. */
  facing: number
  /** Up, left, down, right: four letters. `WASD` until the first spin. */
  binding: string
  /**
   * How many spins so far. Seeds the next binding, and tells a screen to
   * flash. Always the number of platforms touched: none spins anybody twice.
   */
  spins: number
  /** Which platforms have been stood on, as bits by platform id. */
  touched: number
  /** The platform it is standing on now, or -1. */
  on: number
  /** Seconds left of spinning. Nobody moves while they spin. */
  spin: number
  /** Seconds a stand-in spends reading its new keys. Always 0 for a person. */
  daze: number
  /** When it reached the middle, or `null` while it is still racing. */
  finishedAt: number | null
  /** Its finishing place, from 1, or `null` while it is still racing. */
  place: number | null
  /** True for the racer this browser is driving. */
  mine: boolean
  /** True for a stand-in, driven by `ai.ts` rather than by anybody. */
  bot: boolean
}

export interface Race {
  /** What the maze is built from. The only thing about the maze on the wire. */
  seed: number
  racers: Racer[]
  /** Seconds since the race began. */
  elapsed: number
  over: boolean
  /** When the first racer reached the middle, which starts the last call. */
  firstIn: number | null
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

/**
 * A race at its start: everybody in a corner, facing in, on WASD.
 *
 * Corners are dealt round in order, so two people are in opposite corners -
 * never side by side - and a fifth person shares with the first. Racers do not
 * collide with each other, so sharing a corner costs nothing.
 */
export function createRace(seed: number, entrants: readonly Entrant[]): Race {
  const maze = mazeFor(seed)
  // Opposite corners first, then the other two.
  const order = [0, 2, 1, 3]
  const racers = entrants.map((entrant, i): Racer => {
    const at = cellCentre(maze.corners[order[i % 4]])
    return {
      id: entrant.id,
      x: at.x,
      y: at.y,
      facing: Math.atan2(-at.y, -at.x),
      binding: START_BINDING,
      spins: 0,
      touched: 0,
      on: -1,
      spin: 0,
      daze: 0,
      finishedAt: null,
      place: null,
      mine: entrant.mine ?? false,
      bot: entrant.bot ?? false,
    }
  })
  return { seed, racers, elapsed: 0, over: false, firstIn: null }
}

/** How many platforms a racer has stood on. */
export function platformsTouched(racer: Racer): number {
  let count = 0
  for (let bits = racer.touched; bits > 0; bits >>= 1) count += bits & 1
  return count
}

/** Whether the middle will take this racer yet. */
export function goalOpen(racer: Racer): boolean {
  return platformsTouched(racer) >= RACE.platformsNeeded
}

/** Everybody still out in the maze. */
export function stillRacing(race: Race): Racer[] {
  return race.racers.filter((r) => r.finishedAt === null)
}

/** The middle cell, which is the finish. */
export const GOAL: Cell = { x: (MAZE.size - 1) / 2, y: (MAZE.size - 1) / 2 }

const tick = (value: number, step: number) => {
  const next = Math.max(0, value - step)
  return next < 1e-6 ? 0 : next
}

/**
 * One step of the race.
 *
 * Mutates and returns the same race - it runs every frame, and a fresh object
 * graph per frame is garbage for nothing. `dt` is clamped, so a tab that comes
 * back from the background does not carry somebody through a wall.
 *
 * For each racer, in order: count down the spin, move, land on a platform if
 * there is one underfoot, and finish if this is the middle and it will have
 * you. Then decide whether the race is over.
 */
export function stepRace(race: Race, directions: Map<string, Point>, dt: number): Race {
  if (race.over) return race
  const step = Math.min(Math.max(dt, 0), 0.05)
  race.elapsed += step
  const maze = mazeFor(race.seed)

  for (const racer of race.racers) {
    if (racer.finishedAt !== null) continue
    racer.spin = tick(racer.spin, step)
    racer.daze = tick(racer.daze, step)

    const want = directions.get(racer.id)
    const length = want ? Math.hypot(want.x, want.y) : 0
    if (want && length > 0 && racer.spin === 0 && racer.daze === 0) {
      // Normalised, or a diagonal is forty percent faster than a straight line.
      const pace = MAZE.speed * (racer.bot ? RACE.botPace : 1) * step
      const where = settle(maze, {
        x: racer.x + (want.x / length) * pace,
        y: racer.y + (want.y / length) * pace,
      })
      racer.x = where.x
      racer.y = where.y
      racer.facing = Math.atan2(want.y, want.x)
    }

    land(race, racer)
    arrive(race, racer)
  }

  const everybodyIn = race.racers.length > 0 && stillRacing(race).length === 0
  const lastCallOver = race.firstIn !== null && race.elapsed - race.firstIn >= RACE.lastCall
  if (everybodyIn || lastCallOver || race.elapsed >= RACE.timeLimit) race.over = true
  return race
}

/**
 * Standing on a platform: spin, and take a new set of letters.
 *
 * **Each platform spins each racer once.** After that it is spent for them -
 * still there, still turning for everybody else, but it does nothing to you
 * and cannot be stood on twice to make up the two the middle wants. So getting
 * in means being spun by two *different* platforms: yours, or anybody else's.
 */
export function spinnerActive(racer: Racer, platform: number): boolean {
  return (racer.touched & (1 << platform)) === 0
}

function land(race: Race, racer: Racer): void {
  const maze = mazeFor(race.seed)
  const under = maze.platforms.find(
    (p) => Math.hypot(p.at.x - racer.x, p.at.y - racer.y) <= MAZE.platformRadius,
  )
  const id = under ? under.id : -1
  if (id !== -1 && spinnerActive(racer, id)) {
    racer.spins += 1
    racer.binding = rebind(race.seed, racer.id, racer.spins, racer.binding)
    racer.touched |= 1 << id
    racer.spin = RACE.spinTime
    racer.daze = racer.bot ? RACE.botDaze : 0
  }
  racer.on = id
}

/** Reaching the middle, if it will have you. Placed in the order people get there. */
function arrive(race: Race, racer: Racer): void {
  if (!goalOpen(racer)) return
  if (Math.hypot(racer.x, racer.y) > MAZE.goalRadius) return
  racer.finishedAt = race.elapsed
  racer.place = race.racers.filter((r) => r.place !== null).length + 1
  if (race.firstIn === null) race.firstIn = race.elapsed
}

/**
 * Everybody, in finishing order.
 *
 * The ones who got in first, by place. Anybody still out when the race ended
 * comes after all of them - ranked by how many platforms they had, then by how
 * far they still had to walk - because "nearly made it" is worth something,
 * but never as much as making it.
 */
export function placings(race: Race): Racer[] {
  const maze = mazeFor(race.seed)
  const toGoal = stepsTo(maze, [GOAL])
  const finished = race.racers
    .filter((r) => r.place !== null)
    .sort((a, b) => (a.place ?? 0) - (b.place ?? 0))
  const out = race.racers
    .filter((r) => r.place === null)
    .sort(
      (a, b) =>
        platformsTouched(b) - platformsTouched(a) ||
        stepsFrom(toGoal, cellAt(a)) - stepsFrom(toGoal, cellAt(b)),
    )
  return [...finished, ...out]
}
