/**
 * The rules of Sprint Triathlon, as arithmetic.
 *
 * Three legs, back to back, and a race time at the end of them. Swim: every
 * left click is a stroke. Bike: every press of space is a turn of the pedals.
 * Run: type the sentence on the screen - every right key is a stride, and a
 * wrong one trips you up for a moment. Fastest time over all three wins.
 *
 * Everything here is pure. A player's own screen counts their own clicks,
 * presses and keys (`Self`), and whoever runs the race takes that account, holds
 * it to what a fast pair of hands could honestly have done, and times each leg
 * and the finish on its own clock.
 */
import { createRng, hashSeed } from '../../00-core'

export const COURSE = {
  /** Strokes to swim the first leg. */
  strokes: 60,
  /** Pedal presses to ride the second. */
  pedals: 80,
  /**
   * Seconds of wait before anybody can go. None: the minigame screen's shared three-two-one runs before the game is
   * let go, so a count of its own would be a second one.
   */
  start: 0,
  /** However the race is going, it is over after this long from the gun. */
  timeLimit: 150,
  /** How long a wrong key trips you up: keys pressed meanwhile do nothing. */
  stumble: 0.4,
  /** The fastest anybody can honestly click or press, a second, for checking what a browser claims. */
  maxPressRate: 16,
  /** The fastest anybody can honestly type, characters a second. */
  maxTypeRate: 15,
} as const

/** The run's sentences. The first is the one the game was planned with. */
export const SENTENCES = [
  'Duck walked up to a lemonade stand, and he said to the man running the stand, hey! Got any grapes?',
  'The quick brown fox jumps over the lazy dog, then naps in the sun until the farmer comes home.',
  'Six slippery snails slid slowly seaward, leaving silver trails across the sand at sunset.',
  'Pack my box with five dozen liquor jugs, and send it to the island before the tide comes in.',
] as const

/** The sentence a race is run on. */
export function sentenceFor(seed: number): string {
  const random = createRng(hashSeed(seed, 'sprint-triathlon:sentence'))
  return SENTENCES[Math.floor(random() * SENTENCES.length)]
}

export type Leg = 'swim' | 'bike' | 'run' | 'done'

/**
 * One player's own account of their race, as their own screen counts it:
 * strokes, pedal presses, characters typed right, and mistakes.
 */
export interface Self {
  strokes: number
  pedals: number
  typed: number
  mistakes: number
  /** Until when, on the race clock, keys do nothing after a mistake. */
  stumbling: number
}

export const FRESH: Self = Object.freeze({ strokes: 0, pedals: 0, typed: 0, mistakes: 0, stumbling: 0 })

/** Which leg an account is on. */
export function legOf(self: Pick<Self, 'strokes' | 'pedals' | 'typed'>, sentence: string): Leg {
  if (self.strokes < COURSE.strokes) return 'swim'
  if (self.pedals < COURSE.pedals) return 'bike'
  if (self.typed < sentence.length) return 'run'
  return 'done'
}

/** How far through the whole course, 0 to 1: each leg a third. */
export function progressOf(self: Pick<Self, 'strokes' | 'pedals' | 'typed'>, sentence: string): number {
  const swim = Math.min(1, self.strokes / COURSE.strokes)
  const bike = Math.min(1, self.pedals / COURSE.pedals)
  const run = Math.min(1, self.typed / Math.max(1, sentence.length))
  return (swim + bike + run) / 3
}

/** A left click: a stroke, while swimming, once the gun has gone. */
export function click(self: Self, sentence: string, time: number): Self {
  if (time < COURSE.start || legOf(self, sentence) !== 'swim') return self
  return { ...self, strokes: self.strokes + 1 }
}

/** A press of space: a pedal, while biking, once the gun has gone. (On the run, space is a character - see `type`.) */
export function pedal(self: Self, sentence: string, time: number): Self {
  if (time < COURSE.start || legOf(self, sentence) !== 'bike') return self
  return { ...self, pedals: self.pedals + 1 }
}

/**
 * A key typed on the run. The right next character is a stride; anything else
 * is a mistake, and trips you up for a moment. Keys while tripped do nothing.
 */
export function type(self: Self, sentence: string, key: string, time: number): Self {
  if (time < COURSE.start || legOf(self, sentence) !== 'run' || key.length !== 1) return self
  if (time < self.stumbling) return self
  if (key === sentence[self.typed]) return { ...self, typed: self.typed + 1 }
  return { ...self, mistakes: self.mistakes + 1, stumbling: time + COURSE.stumble }
}

export interface Racer {
  id: string
  mine: boolean
  bot: boolean
  strokes: number
  pedals: number
  typed: number
  mistakes: number
  /** When, on the race clock from the gun, each leg was finished - null until it is. */
  swimAt: number | null
  bikeAt: number | null
  finishAt: number | null
  place: number | null
  /** Left the lobby before the finish. */
  left: boolean
}

export interface Race {
  /** Which sentence, and the stand-ins' pace. Not a secret. */
  seed: number
  id: number
  /** Seconds since the race was dealt; the gun goes at `COURSE.start`. */
  elapsed: number
  over: boolean
  racers: Racer[]
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

export function createRace(seed: number, entrants: readonly Entrant[], id = 1): Race {
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    racers: entrants.map((e) => ({
      id: e.id,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
      strokes: 0,
      pedals: 0,
      typed: 0,
      mistakes: 0,
      swimAt: null,
      bikeAt: null,
      finishAt: null,
      place: null,
      left: false,
    })),
  }
}

/** Seconds since the gun, never less than none. */
export function raceClock(race: Race): number {
  return Math.max(0, race.elapsed - COURSE.start)
}

/** A racer's race time so far, or their finish time. */
export function timeOf(race: Race, racer: Racer): number {
  return racer.finishAt ?? raceClock(race)
}

/**
 * A player's own account of their race, taken by whoever runs it.
 *
 * Only ever forward. Each count is held to what fast hands could have done since
 * that leg began: strokes since the gun, pedals since the swim was finished,
 * characters since the bike was. A browser that claims the finish a second in is
 * not believed.
 */
export function report(race: Race, id: string, self: Self): void {
  const racer = race.racers.find((r) => r.id === id)
  if (!racer || race.over || racer.finishAt !== null || racer.left) return
  const sentence = sentenceFor(race.seed)
  const now = raceClock(race) + 0.25
  const honest = (rate: number, since: number | null) => (since === null ? 0 : Math.ceil(Math.max(0, now - since) * rate) + 1)
  // Leg by leg, timing each as it is finished, so one report can finish a leg
  // and count the start of the next.
  racer.strokes = Math.max(racer.strokes, Math.min(self.strokes, COURSE.strokes, honest(COURSE.maxPressRate, 0)))
  split(race, racer)
  if (racer.swimAt !== null) racer.pedals = Math.max(racer.pedals, Math.min(self.pedals, COURSE.pedals, honest(COURSE.maxPressRate, racer.swimAt)))
  split(race, racer)
  if (racer.bikeAt !== null) racer.typed = Math.max(racer.typed, Math.min(self.typed, sentence.length, honest(COURSE.maxTypeRate, racer.bikeAt)))
  racer.mistakes = Math.max(racer.mistakes, self.mistakes)
  split(race, racer)
}

/** Times a leg the moment its count is complete. */
function split(race: Race, racer: Racer): void {
  const sentence = sentenceFor(race.seed)
  const now = raceClock(race)
  if (racer.swimAt === null && racer.strokes >= COURSE.strokes) racer.swimAt = now
  if (racer.swimAt !== null && racer.bikeAt === null && racer.pedals >= COURSE.pedals) racer.bikeAt = now
  if (racer.bikeAt !== null && racer.finishAt === null && racer.typed >= sentence.length) {
    racer.finishAt = now
    racer.place = race.racers.filter((r) => r.place !== null).length + 1
  }
}

/** A racer who has left the lobby: out of the race, and not waited for. */
export function leave(race: Race, id: string): void {
  const racer = race.racers.find((r) => r.id === id)
  if (racer && racer.finishAt === null) racer.left = true
}

/** One step: the clock, and the end - when everybody has finished or left, or at the time limit. */
export function stepRace(race: Race, dt: number): Race {
  if (race.over) return race
  race.elapsed = Math.min(COURSE.start + COURSE.timeLimit, race.elapsed + Math.min(Math.max(dt, 0), 0.25))
  for (const racer of race.racers) split(race, racer)
  if (race.racers.every((r) => r.finishAt !== null || r.left) || raceClock(race) >= COURSE.timeLimit) race.over = true
  return race
}

/**
 * Everybody, best first, with their place: finishers by time, then anybody still
 * out on the course by how far they got, then anybody who left.
 */
export function placings(race: Race): { racer: Racer; index: number; place: number }[] {
  const sentence = sentenceFor(race.seed)
  const score = (r: Racer) => (r.finishAt !== null ? 10 - r.finishAt / 1000 : r.left ? -1 + progressOf(r, sentence) : progressOf(r, sentence))
  const ranked = race.racers.map((racer, index) => ({ racer, index })).sort((a, b) => score(b.racer) - score(a.racer))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => score(other.racer) > score(entry.racer)).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#f2b33d', '#4fb35a', '#9c4bb0', '#f08a3c', '#35bdbd', '#ef7fb4'] as const
