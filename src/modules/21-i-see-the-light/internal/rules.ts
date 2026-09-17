/**
 * The rules of I See The Light, as arithmetic.
 *
 * Red light, green light. On green, every press of space is a step towards the
 * finish. On red, nobody moves, a circle appears over the view and wanders, and
 * the pointer has to stay inside it until the light goes green. Press space on
 * red, or let the pointer slip out of the circle, and you are out. First to the
 * line wins.
 *
 * Everything here is pure, and most of it is a function of a seed and a time:
 * the pattern of greens and reds, where the circle is. So every browser shows
 * the same light and the same circle at the same moment without being told,
 * and each player's own screen can judge their own presses and pointer.
 */
import { createRng, hashSeed } from '../../00-core'

export const LIGHT = {
  /** Presses of space from the start to the line. */
  steps: 70,
  /** However the race is going, it is over after this long. */
  timeLimit: 120,
  /** How long a green lasts, least and most. Never less than the countdown. */
  green: [3, 6] as readonly [number, number],
  /** How many seconds before a red the countdown starts: 3, 2, 1. */
  countdown: 3,
  /** How long a red lasts, least and most. */
  red: [3, 5] as readonly [number, number],

  /**
   * How long after the light goes red a press of space is ignored rather than
   * punished. A reaction time: a press that left your finger as the light
   * changed is not a press on red.
   */
  pressGrace: 0.25,
  /**
   * How long after the light goes red before a pointer outside the circle
   * counts. The circle appears in the middle of the view; this is the time to
   * get into it. It holds still until then.
   */
  pointerGrace: 0.8,

  /**
   * How big the circle is, as a share of the shorter side of the view - at
   * first, and at its smallest. It shrinks a little with every red.
   */
  circle: 0.11,
  circleMin: 0.065,
  circleShrink: 0.01,
  /** How far the circle wanders from the middle, as a share of each side. */
  wander: { x: 0.28, y: 0.24 },
  /** How fast it wanders, least and most, radians a second. */
  pace: [0.6, 1.15] as readonly [number, number],

  /** The fastest anybody can honestly press, a second, for checking what a browser claims. */
  maxPressRate: 16,
} as const

export type Colour = 'green' | 'red'

export interface Phase {
  colour: Colour
  start: number
  end: number
  /** For a red, which red it is from 0. Every red has its own circle. -1 for a green. */
  red: number
}

const between = (random: () => number, [low, high]: readonly [number, number]) => low + random() * (high - low)

/** The whole race's lights, green first, alternating, past the time limit. */
export function schedule(seed: number): Phase[] {
  const random = createRng(hashSeed(seed, 'i-see-the-light:lights'))
  const out: Phase[] = []
  let at = 0
  let reds = 0
  while (at < LIGHT.timeLimit + 10) {
    const green = between(random, LIGHT.green)
    out.push({ colour: 'green', start: at, end: at + green, red: -1 })
    at += green
    const red = between(random, LIGHT.red)
    out.push({ colour: 'red', start: at, end: at + red, red: reds++ })
    at += red
  }
  return out
}

const schedules = new Map<number, Phase[]>()
/** The same seed's schedule, worked out once. */
export function scheduleFor(seed: number): Phase[] {
  let phases = schedules.get(seed)
  if (!phases) {
    phases = schedule(seed)
    if (schedules.size > 16) schedules.clear()
    schedules.set(seed, phases)
  }
  return phases
}

/** The light at a moment, and how long it has been that colour. */
export function lightAt(seed: number, time: number): Phase & { since: number } {
  const phases = scheduleFor(seed)
  const t = Math.max(0, time)
  const phase = phases.find((p) => t >= p.start && t < p.end) ?? phases[phases.length - 1]
  return { ...phase, since: t - phase.start }
}

/**
 * The warning before a red: 3, 2, 1 over the last three seconds of a green, and
 * null the rest of the time. A green is never shorter than the countdown, so
 * every red gets the whole of it.
 */
export function countdownAt(seed: number, time: number): number | null {
  const light = lightAt(seed, time)
  if (light.colour !== 'green') return null
  const left = light.end - Math.max(0, time)
  return left > LIGHT.countdown ? null : Math.max(1, Math.ceil(left))
}

/** How much green there has been up to a moment. What a claimed step count is checked against. */
export function greenBefore(seed: number, time: number): number {
  let total = 0
  for (const p of scheduleFor(seed)) {
    if (p.start >= time) break
    if (p.colour === 'green') total += Math.min(time, p.end) - p.start
  }
  return total
}

export interface Circle {
  /** Its middle, as shares of the view's width and height. */
  x: number
  y: number
  /** Its radius, as a share of the view's shorter side. */
  radius: number
}

/**
 * Where the circle is, for a red and how long that red has been on.
 *
 * In the middle and still for the pointer grace, then easing out into a
 * wandering loop - two sines at different speeds, so it never quite repeats
 * and cannot be learned. Each red has its own loop, and a smaller circle.
 */
export function circleAt(seed: number, red: number, since: number): Circle {
  const random = createRng(hashSeed(seed, `i-see-the-light:circle:${red}`))
  const rateX = between(random, LIGHT.pace) * (random() < 0.5 ? -1 : 1)
  const rateY = between(random, LIGHT.pace) * (random() < 0.5 ? -1 : 1)
  const phaseX = random() * Math.PI * 2
  const phaseY = random() * Math.PI * 2
  const moving = Math.max(0, since - LIGHT.pointerGrace)
  // Eased out of the middle over a second, so it does not jump from still.
  const ramp = Math.min(1, moving)
  const s = moving
  return {
    x: 0.5 + (Math.sin(rateX * s + phaseX) - Math.sin(phaseX)) * LIGHT.wander.x * ramp * 0.5,
    y: 0.5 + (Math.sin(rateY * s + phaseY) - Math.sin(phaseY)) * LIGHT.wander.y * ramp * 0.5,
    radius: Math.max(LIGHT.circleMin, LIGHT.circle - red * LIGHT.circleShrink),
  }
}

export interface Pointer {
  /** Where the pointer is on the view, in pixels from its top left. */
  x: number
  y: number
}

/** Whether a pointer is inside a circle, on a view of a given size. */
export function insideCircle(pointer: Pointer | null, circle: Circle, width: number, height: number): boolean {
  if (!pointer) return false
  const radius = circle.radius * Math.min(width, height)
  return Math.hypot(pointer.x - circle.x * width, pointer.y - circle.y * height) <= radius
}

/** Why somebody is out: space on red, the pointer out of the circle, or they left the lobby. */
export type Why = 'space' | 'pointer' | 'left'
export const WHYS: readonly Why[] = ['space', 'pointer', 'left']

/**
 * One player's own race, as their own screen sees it: how many steps, and
 * whether they are out. Judged on that screen - see `pressSpace` and
 * `checkPointer` - and reported to whoever runs the race.
 */
export interface Self {
  steps: number
  out: { why: Why; at: number } | null
}

export const FRESH: Self = Object.freeze({ steps: 0, out: null })

/**
 * A press of space, at a moment. Green: a step. Red, after the reaction grace:
 * out. Red within it, or already out, or already over the line: nothing.
 */
export function pressSpace(seed: number, time: number, self: Self): Self {
  if (self.out || self.steps >= LIGHT.steps) return self
  const light = lightAt(seed, time)
  if (light.colour === 'green') return { ...self, steps: self.steps + 1 }
  if (light.since < LIGHT.pressGrace) return self
  return { ...self, out: { why: 'space', at: time } }
}

/**
 * The pointer, at a moment. On red, once the pointer grace is over, a pointer
 * outside the circle - or off the view altogether - is out.
 */
export function checkPointer(seed: number, time: number, pointer: Pointer | null, width: number, height: number, self: Self): Self {
  if (self.out || self.steps >= LIGHT.steps) return self
  const light = lightAt(seed, time)
  if (light.colour !== 'red' || light.since < LIGHT.pointerGrace) return self
  if (insideCircle(pointer, circleAt(seed, light.red, light.since), width, height)) return self
  return { ...self, out: { why: 'pointer', at: time } }
}

export interface Racer {
  id: string
  steps: number
  out: { why: Why; at: number } | null
  /** When they crossed the line, in race seconds, and in what place. */
  finishedAt: number | null
  place: number | null
  mine: boolean
  bot: boolean
}

export interface Race {
  /** The lights and the circles. Not a secret: knowing when the light changes does not press space for you. */
  seed: number
  id: number
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
    over: false,
    racers: entrants.map((e) => ({
      id: e.id,
      steps: 0,
      out: null,
      finishedAt: null,
      place: null,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
    })),
  }
}

/** Whether somebody is still racing: not out, not over the line. */
export function racing(r: Racer): boolean {
  return !r.out && r.finishedAt === null
}

/**
 * A player's own account of their race, taken by whoever runs it.
 *
 * Only ever forward: steps never go back, and out is for good. Steps are held
 * to what somebody could honestly have pressed in the green so far, so a
 * browser claiming the line a second in is not believed.
 */
export function report(race: Race, id: string, self: Self): void {
  const racer = race.racers.find((r) => r.id === id)
  if (!racer || race.over || !racing(racer)) return
  const honest = Math.ceil(greenBefore(race.seed, race.elapsed + 0.25) * LIGHT.maxPressRate) + 1
  racer.steps = Math.max(racer.steps, Math.min(self.steps, LIGHT.steps, honest))
  if (self.out) racer.out = { ...self.out }
}

/**
 * One step of the race: the clock, anybody who has reached the line - placed
 * in the order they get there - and the end, when nobody is left racing or the
 * time is up.
 */
export function stepRace(race: Race, dt: number): Race {
  if (race.over) return race
  race.elapsed = Math.min(LIGHT.timeLimit, race.elapsed + Math.min(Math.max(dt, 0), 0.25))
  for (const racer of race.racers) {
    if (!racing(racer) || racer.steps < LIGHT.steps) continue
    racer.finishedAt = race.elapsed
    racer.place = race.racers.filter((r) => r.place !== null).length + 1
  }
  if (race.racers.every((r) => !racing(r)) || race.elapsed >= LIGHT.timeLimit) race.over = true
  return race
}

/**
 * Everybody, best first, with their place.
 *
 * Over the line first, in the order they got there. Then anybody still racing
 * when it ended, by how far they got. Then everybody who was out, by how far
 * they got. Level on steps shares a place.
 */
export function placings(race: Race): { racer: Racer; index: number; place: number }[] {
  const score = (r: Racer) =>
    r.place !== null ? 1e6 - r.place : r.out ? r.steps : LIGHT.steps + 1 + r.steps
  const ranked = race.racers.map((racer, index) => ({ racer, index })).sort((a, b) => score(b.racer) - score(a.racer))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => score(other.racer) > score(entry.racer)).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#f2b33d', '#4fb35a', '#9c4bb0', '#f08a3c', '#35bdbd', '#ef7fb4'] as const
