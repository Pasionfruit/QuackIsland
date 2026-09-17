/**
 * The course, laid out from the seed.
 *
 * A fenced run two hundred metres long down **-Z**, twenty-six wide, the start
 * line at `z = 0` and the finish at `z = -length`. Every browser lays the same
 * one, because every browser draws it and the host decides a race on it.
 *
 * Three things are on it, and each one is there to make a different pet's
 * numbers matter:
 *
 * - **Hedges** you cannot go through. They are laid in **bands**, and every
 *   band has a **gate** in it - a gap the hedges are kept out of - so the
 *   course can always be run. Aiming at a gate at full tilt is what separates
 *   an animal that turns sharply from one that does not.
 * - **Puddles** drag you to a bit over half speed while you are in one. Some of
 *   them sit right in a gate, so the tidy line is not always the quick one.
 * - **Treats** give stamina back. They are put **away from the gate on
 *   purpose**, so picking one up costs you ground. A cat with a three-second
 *   tank has to go and get them; a hamster can ignore them.
 *
 * Pure: no clock, no three.js.
 */
import { createRng, hashSeed } from '../../00-core'

export const TRACK = {
  /** Metres from the start line to the finish. */
  length: 180,
  /** Fence to fence. */
  width: 26,
  /** Clear ground behind the line, where everybody starts. */
  runUp: 10,
  /** Clear ground past the finish, to stop on. */
  runOff: 14,
} as const

export const BAND = {
  /** Metres between one band of hedges and the next. */
  spacing: 9.5,
  /** The first band is this far down the course - nobody is ambushed off the line. */
  first: 20,
  /** No hedges within this of the finish. */
  last: 12,
  /** Half the width of the gap kept clear in every band. */
  gate: 2.7,
  /** How far along the band a hedge may wander, so a band is not a drawn line. */
  wobble: 2.4,
  /**
   * How far a gate may move from the one before it.
   *
   * A random gate every band makes a course that zig-zags fence to fence, which
   * is not harder so much as arbitrary - and it punishes a loose animal for the
   * seed rather than for the driving. A walk gives a course that flows.
   */
  drift: 5.5,
} as const

export const HEDGE = { min: 1.05, max: 1.95 } as const
export const PUDDLE = { min: 2.2, max: 4, chance: 0.55, drag: 0.55 } as const
/**
 * How many seconds of stamina a treat gives back, how near you have to be, and
 * how often a band has one.
 *
 * `max` is a hard ceiling, not a target: which treats a racer has picked up
 * travels as one bit each in a single number, so a course with more than
 * thirty-one of them could not be sent. Eighteen bands at three in four is
 * about thirteen, so the ceiling is never reached - it is there so that
 * changing `BAND.spacing` one day cannot quietly break the wire.
 */
export const TREAT = { gives: 1.5, reach: 1.15, perBand: 0.75, max: 31 } as const

export interface Hedge {
  x: number
  z: number
  r: number
}

export interface Puddle {
  x: number
  z: number
  r: number
}

export interface Treat {
  x: number
  z: number
}

/** One row of hedges, and the gap left in it. */
export interface Band {
  z: number
  /** The middle of the gap. */
  gate: number
}

export interface Course {
  seed: number
  hedges: Hedge[]
  puddles: Puddle[]
  treats: Treat[]
  bands: Band[]
}

const half = TRACK.width / 2

/** Where the finish line is, in z. Negative: the course runs towards -Z. */
export const FINISH_Z = -TRACK.length

/** Where racer `i` of `count` stands on the line, spread across the track. */
export function startAt(count: number, i: number): { x: number; z: number } {
  const lanes = Math.max(1, count)
  const span = Math.min(TRACK.width - 4, lanes * 2.6)
  const x = lanes === 1 ? 0 : -span / 2 + (span * i) / (lanes - 1)
  // Staggered a little, so eight bodies on one line are all visible.
  return { x, z: 1.2 + (i % 2) * 1.4 }
}

export function layCourse(seed: number): Course {
  const random = createRng(hashSeed(seed, 'pet-race:course'))
  const hedges: Hedge[] = []
  const puddles: Puddle[] = []
  const treats: Treat[] = []
  const bands: Band[] = []

  // The gate never touches a fence: a gap you cannot get into is not a gap.
  const reach = half - BAND.gate - 1.6
  let gate = (random() * 2 - 1) * reach
  for (let z = -BAND.first; z > FINISH_Z + BAND.last; z -= BAND.spacing) {
    // A walk rather than a fresh draw: one gate is near the last one, so the
    // course reads as a line to follow instead of as a row of coin flips.
    gate = Math.max(-reach, Math.min(reach, gate + (random() * 2 - 1) * BAND.drift))
    bands.push({ z, gate })

    // Hedges laid across the band, stepping over the gate.
    let x = -half + 0.6
    while (x < half - 0.6) {
      const r = HEDGE.min + random() * (HEDGE.max - HEDGE.min)
      const clearsGate = Math.abs(x - gate) > BAND.gate + r
      if (clearsGate) hedges.push({ x, z: z + (random() * 2 - 1) * BAND.wobble, r })
      x += r * 2 + 0.5 + random() * 1.4
    }

    if (random() < PUDDLE.chance) {
      const r = PUDDLE.min + random() * (PUDDLE.max - PUDDLE.min)
      // Half of them sit in the gate, which is the point of them.
      const inGate = random() < 0.5
      const px = inGate ? gate + (random() * 2 - 1) * BAND.gate * 0.5 : (random() * 2 - 1) * (half - r)
      puddles.push({ x: px, z: z - BAND.spacing * 0.45 + (random() * 2 - 1) * 1.5, r })
    }

    if (random() < TREAT.perBand && treats.length < TREAT.max) {
      // Away from the gate: a treat you can take without leaving your line is not a choice.
      const side = gate > 0 ? -1 : 1
      const tx = gate + side * (BAND.gate + 2.5 + random() * (half - BAND.gate - 4))
      const tz = z - BAND.spacing * (0.25 + random() * 0.5)
      if (Math.abs(tx) < half - 1 && !hedges.some((h) => Math.hypot(h.x - tx, h.z - tz) < h.r + 1.2)) treats.push({ x: tx, z: tz })
    }
  }

  // A last sweep for treats a later band's hedge has since grown over: a band
  // only ever checked the hedges that existed when it was laid, and a treat
  // inside a bush is a treat nobody can have.
  const reachable = treats.filter((treat) => !hedges.some((hedge) => Math.hypot(hedge.x - treat.x, hedge.z - treat.z) < hedge.r + 0.9))

  return { seed, hedges, puddles, treats: reachable, bands }
}

const courses = new Map<number, Course>()

/** The same seed's course, laid once. */
export function courseFor(seed: number): Course {
  let course = courses.get(seed)
  if (!course) {
    course = layCourse(seed)
    if (courses.size > 8) courses.clear()
    courses.set(seed, course)
  }
  return course
}

/** How much of full speed you get where you are standing: one, or slower in a puddle. */
export function dragAt(course: Course, x: number, z: number): number {
  for (const puddle of course.puddles) {
    if (Math.hypot(puddle.x - x, puddle.z - z) < puddle.r) return PUDDLE.drag
  }
  return 1
}

/**
 * Pushes a body out of any hedge it is standing in, and back inside the fences.
 * Returns where it ends up, and whether anything moved it.
 */
export function clearOf(course: Course, x: number, z: number, radius: number): { x: number; z: number; hit: boolean } {
  let hit = false
  let px = x
  let pz = z
  // Two passes: a body wedged between two hedges has to be pushed out of both.
  for (let pass = 0; pass < 2; pass++) {
    for (const hedge of course.hedges) {
      const dx = px - hedge.x
      const dz = pz - hedge.z
      const d = Math.hypot(dx, dz)
      const min = hedge.r + radius
      if (d >= min) continue
      hit = true
      if (d < 1e-6) {
        px = hedge.x + min
      } else {
        px = hedge.x + (dx / d) * min
        pz = hedge.z + (dz / d) * min
      }
    }
  }
  const edge = half - radius
  if (px < -edge) {
    px = -edge
    hit = true
  }
  if (px > edge) {
    px = edge
    hit = true
  }
  // Nobody starts before the run-up or stops past the run-off.
  const back = TRACK.runUp
  const front = FINISH_Z - TRACK.runOff + radius
  if (pz > back) pz = back
  if (pz < front) pz = front
  return { x: px, z: pz, hit }
}

/**
 * The line the course suggests, at a given point down it: gate to gate, straight
 * in between, and straight on past the last band to the finish.
 *
 * It is the course's own answer to "where should I be", and it is here rather
 * than in the stand-ins because it is a fact about the course. A stand-in
 * follows it at a fixed distance ahead; a person is welcome to ignore it.
 */
export function lineAt(course: Course, z: number): number {
  const bands = course.bands
  if (bands.length === 0) return 0
  if (z >= bands[0].z) return bands[0].gate
  const last = bands[bands.length - 1]
  if (z <= last.z) return last.gate
  for (let i = 0; i < bands.length - 1; i++) {
    const a = bands[i]
    const b = bands[i + 1]
    if (z <= a.z && z >= b.z) return a.gate + ((b.gate - a.gate) * (a.z - z)) / (a.z - b.z)
  }
  return last.gate
}

/** How far down the course a body has got, in metres: 0 on the line, `TRACK.length` at the finish. */
export function progressOf(z: number): number {
  return Math.max(0, Math.min(TRACK.length, -z))
}
