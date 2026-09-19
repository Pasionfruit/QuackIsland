/**
 * The beach, the crabs and the coconut: where the column of crabs is at any
 * moment of a turn, and which crabs a rolled coconut hits.
 *
 * **A column of thirty crabs**, bent - an arc, an S or a hook, whichever the
 * seed deals each turn - marches from left to right across the beach from the
 * moment a turn's aiming begins. **The coconut** rolls in a straight line from
 * where the thrower stood at the angle they chose, from the moment they rolled
 * it. Both move at constant speeds, so whether and when the coconut meets each
 * crab is worked out exactly, crab by crab - no stepping, nothing missed however
 * fast it rolls - and every screen works out the same crabs from the same throw.
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
  /** How near a crab's middle the coconut's middle must come to hit it: both their sizes. */
  reach: 0.9,
  /** How far either side of straight ahead it can be aimed, radians. */
  turn: 1.2,
} as const

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

/** Turn `turn`'s column: its shape and every crab's place in it. The same seed and turn, the same column. */
export function columnFor(seed: number, turn: number): Column {
  const key = `${seed}:${turn}`
  const known = columns.get(key)
  if (known) return known
  const random = createRng(hashSeed(seed, `perfect-game:column:${turn}`))
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

/** How long a throw rolls before it leaves the beach, seconds. */
export function travel(t: Throw): number {
  const h = heading(t.angle)
  const bySea = h.z < -1e-9 ? (BEACH.far - t.z) / (h.z * COCONUT.speed) : Infinity
  const bySide = Math.abs(h.x) > 1e-9 ? ((h.x > 0 ? BEACH.halfX + 2 : -BEACH.halfX - 2) - t.x) / (h.x * COCONUT.speed) : Infinity
  return Math.max(0, Math.min(bySea, bySide))
}

/** Where the coconut is `tau` seconds into the turn, or null before it is rolled. */
export function coconutAt(t: Throw, tau: number): { x: number; z: number } | null {
  if (tau < t.at) return null
  const s = Math.min(tau - t.at, travel(t)) * COCONUT.speed
  const h = heading(t.angle)
  return { x: t.x + h.x * s, z: t.z + h.z * s }
}

/**
 * Every crab a throw hits, and when - seconds into the turn - in the order it
 * hits them. Crab and coconut each move in a straight line at a steady speed,
 * so it is the first moment they come within `COCONUT.reach` of each other,
 * solved exactly, between the roll and the coconut leaving the beach.
 */
export function hits(column: Column, t: Throw): { crab: number; at: number }[] {
  const h = heading(t.angle)
  const vx = h.x * COCONUT.speed - COLUMN.speed
  const vz = h.z * COCONUT.speed
  const end = travel(t)
  const a = vx * vx + vz * vz
  const r2 = COCONUT.reach * COCONUT.reach
  const out: { crab: number; at: number }[] = []
  column.crabs.forEach((c, i) => {
    // The coconut relative to the crab, at the roll, and how that changes: a straight line.
    const px = t.x - (columnX(t.at) + c.x)
    const pz = t.z - c.z
    const b = 2 * (px * vx + pz * vz)
    const k = px * px + pz * pz - r2
    let s: number
    if (k <= 0) s = 0
    else {
      const disc = b * b - 4 * a * k
      if (disc < 0 || a < 1e-12) return
      s = (-b - Math.sqrt(disc)) / (2 * a)
      if (s < 0) return
    }
    if (s <= end) out.push({ crab: i, at: t.at + s })
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
