/**
 * Where the shells and pebbles go.
 *
 * Pure: it takes the ground as two functions and returns a list of placements,
 * so the whole scatter can be run and checked in Node without a canvas. That
 * matters more here than usual, because "is anything floating in the sea or
 * buried in a cliff" is a question with an exact answer, and looking at a beach
 * is a bad way to find the one shell that is.
 *
 * Everything derives from the world seed. Nothing here calls `Math.random`, so
 * the same beach comes back on every load and a bug found once can be found
 * again.
 */

export type ShoreKind = 'pebble' | 'clam' | 'cone'

export interface Placement {
  kind: ShoreKind
  x: number
  z: number
  /** Ground height where it sits, so the view does not have to sample again. */
  y: number
  /** Turn about Y, radians. */
  turn: number
  /** How big, as a multiplier on the kind's own size. */
  scale: number
  /** Which colour from the kind's palette. */
  tint: number
  /** How far it is pressed into the sand, 0 sitting on top to 1 half buried. */
  sink: number
}

export const SHORE = {
  /**
   * The band things wash up in, as heights above the datum.
   *
   * It starts below sea level because the tide goes out that far and leaves
   * the bed dry, and it ends just above the highest water. Above that is dry
   * beach that the sea never reaches, and nothing washes up there.
   */
  fromHeight: -0.9,
  toHeight: 2.6,
  /** Nothing sits on a slope steeper than this, in radians. Things roll off. */
  maxSlope: 0.5,
  /** How many of each to try to place. */
  pebbles: 520,
  clams: 190,
  cones: 130,
  /** How many candidate points to try before giving up on a stubborn beach. */
  attemptsPerItem: 60,
  /** Nothing may sit closer than this to something else, in metres. */
  spacing: 0.55,
} as const

/**
 * Colours, per kind.
 *
 * Pebbles get the wide spread - that is the point of them. The shells stay
 * close to bone and shell-pink, because a bright green shell reads as a bug
 * rather than as variety.
 */
export const PALETTES: Record<ShoreKind, readonly string[]> = {
  pebble: [
    '#8d8577', // grey
    '#6f6a63', // dark grey
    '#b9ac95', // pale sand
    '#7d5f4b', // brown
    '#a8503f', // rust
    '#4f5a5e', // slate
    '#9aa39a', // green-grey
    '#c2b280', // buff
    '#5c4033', // dark brown
    '#d9d2c5', // near white
  ],
  clam: ['#f3e6d8', '#e8cfc0', '#f0dcc6', '#dcbfae', '#fbf1e6'],
  cone: ['#f6ead9', '#e6cbaa', '#d9b892', '#f2ded0'],
}

export interface Ground {
  heightAt(x: number, z: number): number
  slopeAt(x: number, z: number): number
}

export interface ScatterOptions {
  /** Half the size of the square searched, in metres. Should cover the island. */
  reach: number
  /** 0..1, from a seeded generator. Never `Math.random`. */
  random: () => number
}

/**
 * Scatters one kind along the shore.
 *
 * Rejection sampling: pick a point, keep it if the ground there is in the band
 * and gentle enough. The alternative - walking the coastline analytically -
 * would need the terrain to hand out a contour, which it has no reason to.
 *
 * Density rises towards the waterline, which is where things actually wash up.
 */
export function scatterKind(
  kind: ShoreKind,
  count: number,
  ground: Ground,
  options: ScatterOptions,
): Placement[] {
  const { reach, random } = options
  const out: Placement[] = []
  const palette = PALETTES[kind]
  const attempts = count * SHORE.attemptsPerItem

  for (let i = 0; i < attempts && out.length < count; i++) {
    const x = (random() * 2 - 1) * reach
    const z = (random() * 2 - 1) * reach
    const y = ground.heightAt(x, z)
    if (y < SHORE.fromHeight || y > SHORE.toHeight) continue
    if (ground.slopeAt(x, z) > SHORE.maxSlope) continue

    // More of everything near the water. `random` is consumed either way, so
    // rejecting here does not change how many numbers each attempt uses.
    const nearness = 1 - (y - SHORE.fromHeight) / (SHORE.toHeight - SHORE.fromHeight)
    if (random() > 0.25 + nearness * 0.75) continue

    if (tooClose(out, x, z)) continue

    out.push({
      kind,
      x,
      z,
      y,
      turn: random() * Math.PI * 2,
      scale: 0.7 + random() * 0.6,
      tint: Math.floor(random() * palette.length) % palette.length,
      sink: 0.15 + random() * 0.5,
    })
  }

  return out
}

/** Everything on the shore, in one list. */
export function scatterShore(ground: Ground, options: ScatterOptions): Placement[] {
  return [
    ...scatterKind('pebble', SHORE.pebbles, ground, options),
    ...scatterKind('clam', SHORE.clams, ground, options),
    ...scatterKind('cone', SHORE.cones, ground, options),
  ]
}

/**
 * Keeps things from landing on top of each other.
 *
 * Linear, because the counts are in the hundreds and this runs once. A grid
 * would be faster and would be the wrong trade at this size.
 */
function tooClose(placed: Placement[], x: number, z: number): boolean {
  const limit = SHORE.spacing * SHORE.spacing
  for (const p of placed) {
    const dx = p.x - x
    const dz = p.z - z
    if (dx * dx + dz * dz < limit) return true
  }
  return false
}
