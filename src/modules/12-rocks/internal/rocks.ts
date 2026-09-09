/**
 * Where the rocks go, and how big.
 *
 * Pure, and taking the ground as a function, so the whole scatter runs in Node
 * against the real island. That matters more here than it did for the shore:
 * a shell is fifteen centimetres and sits wherever you put it, while a
 * five-metre boulder on a slope will hang in the air on one side and bury its
 * top on the other unless something works out where it actually rests.
 *
 * That something is `settleHeight`, and it is the interesting part of this
 * file.
 */

export type RockSize = 'small' | 'medium' | 'boulder'

export interface RockClass {
  size: RockSize
  /** Radius in metres at scale 1. */
  radius: number
  /** How many to try to place. */
  count: number
  /** How rough the silhouette is, 0 smooth to 1 jagged. */
  jag: number
  /** Detail level for the geometry. Bigger rocks are seen closer. */
  detail: number
}

export const ROCKS = {
  /**
   * The size classes.
   *
   * Many small, few large, which is what a real rock field looks like and what
   * stops the island reading as a chessboard of identical boulders. The counts
   * fall off roughly with the cube of the size, which is what you get when the
   * same amount of rock is broken into different pieces.
   */
  classes: [
    { size: 'small', radius: 0.45, count: 340, jag: 0.34, detail: 0 },
    { size: 'medium', radius: 1.35, count: 90, jag: 0.3, detail: 1 },
    { size: 'boulder', radius: 3.6, count: 22, jag: 0.26, detail: 2 },
  ] as readonly RockClass[],

  /**
   * The band rocks appear in, as heights above the datum.
   *
   * Starts below the water because rocks standing in the shallows are half of
   * what makes a coast look like a coast, and ends short of the very top so
   * the dune peaks stay clean.
   */
  fromHeight: -2.2,
  toHeight: 30,

  /** Nothing sits on ground steeper than this, in radians. It would slide. */
  maxSlope: 0.75,

  /**
   * How far from the middle of the island to leave alone.
   *
   * The player starts at the origin, and arriving inside a boulder is a poor
   * introduction.
   */
  clearRadius: 14,

  /**
   * How far apart two rocks must be, as a multiple of the larger one's radius.
   *
   * Measured in radii rather than metres because two boulders a metre apart is
   * a very different picture from two pebbles a metre apart.
   */
  spacing: 1.9,

  /** How far a rock is bedded into the ground, as a fraction of its radius. */
  sink: 0.28,

  /** How many points around the footprint are sampled to find where it rests. */
  probes: 8,

  attemptsPerRock: 50,
} as const

/**
 * The colours rocks come in.
 *
 * Greys and browns with a little iron in them. Deliberately narrower than the
 * shore pebbles: a pebble on the strand line has been carried there from
 * somewhere else, and a boulder is the island showing through.
 */
export const ROCK_COLOURS: readonly string[] = [
  '#7c766c',
  '#6a655d',
  '#8b8378',
  '#5b5750',
  '#94897a',
  '#6e6257',
  '#a09689',
]

export interface Rock {
  size: RockSize
  x: number
  z: number
  /** Where the bottom of the rock sits. */
  y: number
  /** Radius in metres, after scaling. */
  radius: number
  /** Non-uniform, so no two are the same shape. */
  scaleX: number
  scaleY: number
  scaleZ: number
  /** Full three-axis tumble: a rock has no up. */
  turnX: number
  turnY: number
  turnZ: number
  tint: number
}

export interface Ground {
  heightAt(x: number, z: number): number
  slopeAt(x: number, z: number): number
}

export interface ScatterOptions {
  reach: number
  /** 0..1, from a seeded generator. Never `Math.random`. */
  random: () => number
}

/**
 * Where a rock of a given size actually rests.
 *
 * Sampling the ground at the middle and putting the rock there is what you do
 * for a pebble, and it is wrong for anything bigger: on a slope the middle is
 * higher than the downhill edge, so the rock floats on one side. This samples
 * a ring around the footprint as well and takes the **lowest** point, so the
 * lowest edge is the one that touches and nothing is left hanging in the air.
 *
 * The cost is that a rock on a slope beds further into the hill on the uphill
 * side, which is what a rock on a slope does.
 */
export function settleHeight(
  x: number,
  z: number,
  radius: number,
  groundAt: (x: number, z: number) => number,
  probes: number = ROCKS.probes,
): number {
  let lowest = groundAt(x, z)
  for (let i = 0; i < probes; i++) {
    const angle = (i / probes) * Math.PI * 2
    const height = groundAt(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius)
    if (height < lowest) lowest = height
  }
  return lowest
}

/** Scatters one size class. Rejection sampling, same as the shore. */
export function scatterClass(
  rockClass: RockClass,
  ground: Ground,
  options: ScatterOptions,
  placed: Rock[] = [],
): Rock[] {
  const { reach, random } = options
  const out: Rock[] = []
  const attempts = rockClass.count * ROCKS.attemptsPerRock

  for (let i = 0; i < attempts && out.length < rockClass.count; i++) {
    const x = (random() * 2 - 1) * reach
    const z = (random() * 2 - 1) * reach

    // Vary the size within the class, so even one class is not one size.
    const scale = 0.65 + random() * 0.7
    const radius = rockClass.radius * scale

    if (Math.hypot(x, z) < ROCKS.clearRadius + radius) continue

    const centre = ground.heightAt(x, z)
    if (centre < ROCKS.fromHeight || centre > ROCKS.toHeight) continue
    if (ground.slopeAt(x, z) > ROCKS.maxSlope) continue
    if (tooClose(placed, out, x, z, radius)) continue

    out.push({
      size: rockClass.size,
      x,
      z,
      y: settleHeight(x, z, radius, ground.heightAt) - radius * ROCKS.sink,
      radius,
      // Non-uniform, but never so flat that it reads as a disc.
      scaleX: radius * (0.82 + random() * 0.36),
      scaleY: radius * (0.66 + random() * 0.44),
      scaleZ: radius * (0.82 + random() * 0.36),
      turnX: random() * Math.PI * 2,
      turnY: random() * Math.PI * 2,
      turnZ: random() * Math.PI * 2,
      tint: Math.floor(random() * ROCK_COLOURS.length) % ROCK_COLOURS.length,
    })
  }

  return out
}

/**
 * Every rock on the island.
 *
 * Largest first, so the boulders get the pick of the ground and the small ones
 * fill in around them. The other way round leaves boulders unable to find
 * anywhere to go, and a boulder that could not be placed is far more missed
 * than a pebble that could not be.
 */
export function scatterRocks(ground: Ground, options: ScatterOptions): Rock[] {
  const all: Rock[] = []
  const bySize = [...ROCKS.classes].sort((a, b) => b.radius - a.radius)
  for (const rockClass of bySize) {
    all.push(...scatterClass(rockClass, ground, options, all))
  }
  return all
}

/**
 * Whether a rock would be touching another one.
 *
 * In radii rather than metres: two boulders a metre apart is a very different
 * picture from two pebbles a metre apart.
 */
function tooClose(
  placed: readonly Rock[],
  pending: readonly Rock[],
  x: number,
  z: number,
  radius: number,
): boolean {
  for (const list of [placed, pending]) {
    for (const rock of list) {
      const gap = Math.max(radius, rock.radius) * ROCKS.spacing
      const dx = rock.x - x
      const dz = rock.z - z
      if (dx * dx + dz * dz < gap * gap) return true
    }
  }
  return false
}
