/**
 * The beach, the crabs and the coconut: where the column of crabs is at any
 * moment of a turn, and which crabs a rolled coconut hits.
 *
 * **A column of thirty crabs**, bent - an arc, an S or a hook, whichever the
 * seed deals - marches from left to right across the beach from the moment a
 * turn's aiming begins. **It is the same column every turn of a game**: one seed,
 * one column, so everybody throws at the same crabs.
 *
 * **The coconut** rolls from where the thrower stood at the angle they chose,
 * from the moment they rolled it, **bouncing off a wall down each side of the
 * beach** until it reaches the sea. Between bounces it goes in a straight line at
 * a steady speed, and so do the crabs, so whether and when it meets each crab is
 * worked out exactly, leg by leg and crab by crab - no stepping, nothing missed
 * however fast it rolls - and every screen works out the same crabs from the same
 * throw.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

export const BEACH = {
  /** Half the beach's width, east to west. */
  halfX: 16,
  /** Where the far edge is - the sea - and where the throwers stand, north is -Z. */
  far: -30,
  near: 5,
} as const

/** Where a thrower may stand: a box behind the line. */
export const BOX = { x0: -11, x1: 11, z0: 1.5, z1: 4 } as const

export const COLUMN = {
  crabs: 30,
  /** The column's near and far ends, north of the line. */
  near: -4,
  far: -26,
  /** How far off straight it bends, least and most, metres. */
  bend: [1.2, 3.4] as readonly [number, number],
  /** Where its middle starts, off the left edge, and how fast it marches right, metres a second. */
  start: -15,
  speed: 2.2,
} as const

export const COCONUT = {
  /** Metres a second. */
  speed: 13,
  /** How big it is: what the scene draws, and how close to a wall its middle can get. */
  radius: 0.45,
  /** The longest a throw rolls, seconds. A throw within the aim's range always reaches the sea well inside it. */
  longest: 12,
  /** How near a crab's middle the coconut's middle must come to hit it: both their sizes. */
  reach: 0.9,
  /** How far either side of straight ahead it can be aimed, radians. */
  turn: 1.2,
} as const

/**
 * Where the coconut's middle bounces: the walls stand at the edge of the beach,
 * `BEACH.halfX` out from the middle line, and the coconut's middle stops one
 * coconut's radius short of them.
 */
export const WALL = BEACH.halfX - COCONUT.radius

export type Shape = 'arc' | 'ess' | 'hook'
const SHAPES: readonly Shape[] = ['arc', 'ess', 'hook']

export interface Column {
  shape: Shape
  /** The crabs' places in the column, relative to its middle line: east of it, and how far north. */
  crabs: { x: number; z: number }[]
}

const columns = new Map<string, Column>()

/** How far east of its middle line the column is, `u` of the way from its near end to its far end. */
export function bendAt(shape: Shape, u: number, size: number): number {
  if (shape === 'arc') return size * Math.sin(Math.PI * u)
  if (shape === 'ess') return size * Math.sin(Math.PI * 2 * u)
  // A hook: straight for most of it, curling hard at the far end.
  return size * ((2 * u - 1) ** 2 * 1.4 - 0.7)
}

/**
 * The game's column: its shape and every crab's place in it. **One for the whole
 * game** - the same seed, the same column, whichever turn it is and whoever is
 * throwing - so everybody faces the same crabs.
 */
export function columnFor(seed: number): Column {
  const key = `${seed}`
  const known = columns.get(key)
  if (known) return known
  const random = createRng(hashSeed(seed, 'perfect-game:column'))
  const shape = SHAPES[Math.floor(random() * SHAPES.length)]
  const size = (COLUMN.bend[0] + random() * (COLUMN.bend[1] - COLUMN.bend[0])) * (random() < 0.5 ? -1 : 1)
  const crabs = Array.from({ length: COLUMN.crabs }, (_, i) => {
    const u = i / (COLUMN.crabs - 1)
    return { x: bendAt(shape, u, size), z: COLUMN.near + (COLUMN.far - COLUMN.near) * u }
  })
  const column = { shape, crabs }
  columns.set(key, column)
  if (columns.size > 32) columns.delete(columns.keys().next().value!)
  return column
}

/** Where the column's middle line is, `tau` seconds into a turn's aiming. */
export function columnX(tau: number): number {
  return COLUMN.start + COLUMN.speed * tau
}

/** Where crab `i` is, `tau` seconds into the turn. */
export function crabAt(column: Column, i: number, tau: number): { x: number; z: number } {
  return { x: columnX(tau) + column.crabs[i].x, z: column.crabs[i].z }
}

/** The way a throw at `angle` goes: 0 straight at the sea, positive to the west. */
export function heading(angle: number): { x: number; z: number } {
  return { x: -Math.sin(angle), z: -Math.cos(angle) }
}

export interface Throw {
  /** Where the thrower stood. */
  x: number
  z: number
  angle: number
  /** When it was rolled, seconds into the turn's aiming. */
  at: number
}

/** How long a throw rolls before it reaches the sea, seconds. Bouncing off the walls costs nothing: only the way to the sea counts. */
export function travel(t: Throw): number {
  const h = heading(t.angle)
  const bySea = h.z < -1e-9 ? (BEACH.far - t.z) / (h.z * COCONUT.speed) : COCONUT.longest
  return Math.max(0, Math.min(bySea, COCONUT.longest))
}

/** Reflects a distance out along the east-west line back into the beach, `-WALL` to `WALL`: unfolded, the coconut goes straight; folded, it bounces. */
export function foldX(u: number): number {
  const period = 4 * WALL
  const m = (((u + WALL) % period) + period) % period
  return m < 2 * WALL ? m - WALL : 3 * WALL - m
}

/** Where a throw is once it has rolled `s` metres, bounces and all. */
export function pathAt(t: Throw, s: number): { x: number; z: number } {
  const h = heading(t.angle)
  return { x: foldX(t.x + h.x * s), z: t.z + h.z * s }
}

/**
 * Which way it is going after `s` metres: the throw's heading, with the east-west
 * half turned round once for every wall it has bounced off.
 */
export function headingAt(t: Throw, s: number): { x: number; z: number } {
  const h = heading(t.angle)
  const m = (((t.x + h.x * s + WALL) % (4 * WALL)) + 4 * WALL) % (4 * WALL)
  // The unfolded line runs one way; on the folded stretches it runs the other.
  return { x: m < 2 * WALL ? h.x : -h.x, z: h.z }
}

/** Where the coconut is `tau` seconds into the turn, or null before it is rolled. */
export function coconutAt(t: Throw, tau: number): { x: number; z: number } | null {
  if (tau < t.at) return null
  return pathAt(t, Math.min(tau - t.at, travel(t)) * COCONUT.speed)
}

/** One straight run of a throw's path: from where it starts, `s0` to `s1` metres along, going `dx`, `dz`. */
export interface Leg {
  s0: number
  s1: number
  x: number
  z: number
  dx: number
  dz: number
}

/** A throw's path as straight legs: from the roll to the first wall, wall to wall, and the last to the sea. */
export function legsOf(t: Throw): Leg[] {
  const h = heading(t.angle)
  const total = travel(t) * COCONUT.speed
  const legs: Leg[] = []
  let s = 0
  let x = t.x
  let dx = h.x
  for (let guard = 0; s < total - 1e-9 && guard < 200; guard++) {
    let next = total
    if (Math.abs(dx) > 1e-9) {
      const wall = dx > 0 ? WALL : -WALL
      next = Math.min(total, s + Math.max(0, (wall - x) / dx))
    }
    legs.push({ s0: s, s1: next, x, z: t.z + h.z * s, dx, dz: h.z })
    x += dx * (next - s)
    s = next
    dx = -dx
  }
  // A throw that goes nowhere still has a place: one leg of no length.
  if (legs.length === 0) legs.push({ s0: 0, s1: 0, x: t.x, z: t.z, dx: h.x, dz: h.z })
  return legs
}

/**
 * Every crab a throw hits, and when - seconds into the turn - in the order it
 * hits them. Leg by leg, coconut and crab each move in a straight line at a
 * steady speed, so it is the first moment they come within `COCONUT.reach` of
 * each other, solved exactly, between the roll and the coconut reaching the sea.
 * A crab is hit once, by the first leg that meets it.
 */
export function hits(column: Column, t: Throw): { crab: number; at: number }[] {
  const legs = legsOf(t)
  const r2 = COCONUT.reach * COCONUT.reach
  const out: { crab: number; at: number }[] = []
  column.crabs.forEach((c, i) => {
    for (const leg of legs) {
      const start = leg.s0 / COCONUT.speed
      const length = (leg.s1 - leg.s0) / COCONUT.speed
      const vx = leg.dx * COCONUT.speed - COLUMN.speed
      const vz = leg.dz * COCONUT.speed
      const a = vx * vx + vz * vz
      // The coconut relative to the crab, at the start of the leg, and how that changes: a straight line.
      const px = leg.x - (columnX(t.at + start) + c.x)
      const pz = leg.z - c.z
      const b = 2 * (px * vx + pz * vz)
      const k = px * px + pz * pz - r2
      let s: number
      if (k <= 0) s = 0
      else {
        const disc = b * b - 4 * a * k
        if (disc < 0 || a < 1e-12) continue
        s = (-b - Math.sqrt(disc)) / (2 * a)
        if (s < 0) continue
      }
      if (s <= length + 1e-9) {
        out.push({ crab: i, at: t.at + start + s })
        return
      }
    }
  })
  return out.sort((p, q) => p.at - q.at || p.crab - q.crab)
}

/** A throw's point in the launch box, and its angle in range. */
export function clampThrow(x: number, z: number, angle: number): { x: number; z: number; angle: number } {
  return {
    x: Math.max(BOX.x0, Math.min(BOX.x1, x)),
    z: Math.max(BOX.z0, Math.min(BOX.z1, z)),
    angle: Math.max(-COCONUT.turn, Math.min(COCONUT.turn, angle)),
  }
}
