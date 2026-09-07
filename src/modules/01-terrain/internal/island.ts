/**
 * The island itself: one pure function from (x, z) to a height in metres.
 *
 * Everything else in this module is downstream of this file, and so is a good
 * deal of the rest of the project - trees will sit on it, water will meet it,
 * a character will walk on it, physics will sample it. It imports nothing but
 * arithmetic so it can be tested exhaustively in Node.
 *
 * Sea level is exactly y = 0 and the terrain goes negative below it, so
 * "is this land" is simply height > 0.
 */
import { fbm2, lerp, ridged2, smoothstep } from './noise'

export interface TerrainConfig {
  readonly seed: number
  /** Metres from the middle to where land reliably gives out. */
  readonly islandRadius: number
  /** Metres above sea level at the highest dune. */
  readonly maxHeight: number
  /** Metres below sea level far from shore. */
  readonly oceanFloorY: number
  /** Metres either side of y=0 that get flattened into a beach. */
  readonly beachWidth: number
  /** Metres across one terrain chunk. */
  readonly chunkSize: number
  /** Chunks per side of the square world. */
  readonly chunksPerSide: number
  /** Quad resolution at each level of detail, coarsening outward. */
  readonly lodSegments: readonly number[]
  /** Distance in metres at which each level gives way to the next. */
  readonly lodDistances: readonly number[]
}

export const TERRAIN: TerrainConfig = {
  seed: 1337,
  islandRadius: 262,
  maxHeight: 38,
  oceanFloorY: -22,
  beachWidth: 7,
  chunkSize: 96,
  chunksPerSide: 6,
  lodSegments: [64, 32, 16],
  lodDistances: [150, 330],
}

export const SEA_LEVEL = 0 as const

export const WORLD_HALF = (TERRAIN.chunkSize * TERRAIN.chunksPerSide) / 2

export type Surface = 'oceanFloor' | 'wetSand' | 'sand' | 'dune' | 'rock'

export interface TerrainSample {
  height: number
  normalX: number
  normalY: number
  normalZ: number
  /** Radians from horizontal. 0 is flat. */
  slope: number
  surface: Surface
}

const WARP_SEED = TERRAIN.seed + 101
const SHAPE_SEED = TERRAIN.seed + 202
const DETAIL_SEED = TERRAIN.seed + 303
const DUNE_SEED = TERRAIN.seed + 404

/**
 * Height in metres at a world position.
 *
 * Pure, deterministic, and defined for every finite input - callers will pass
 * garbage eventually, and returning the ocean floor is far kinder than a NaN
 * that silently poisons a mesh a hundred lines later.
 */
export function heightAt(x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return TERRAIN.oceanFloorY

  // Warp the sampling position so the coastline is irregular rather than a
  // noisy circle. This is most of what makes it read as an island.
  //
  // The frequency matters more than it looks: too low and the warp stops
  // wiggling the coast and starts translating the whole island off the middle
  // of the world, because across the map it is barely more than one smooth
  // gradient. High enough to turn over several times, low amplitude.
  const wx = x + (fbm2(x * 0.0125, z * 0.0125, WARP_SEED, { octaves: 3 }) - 0.5) * 62
  const wz = z + (fbm2(x * 0.0125 + 31.7, z * 0.0125 - 17.3, WARP_SEED, { octaves: 3 }) - 0.5) * 62

  const r = Math.sqrt(wx * wx + wz * wz) / TERRAIN.islandRadius

  // 1 well inside, 0 well outside. The land mask.
  const shaped = smoothstep(1.12, 0.18, r)

  const detail = fbm2(wx * 0.0058, wz * 0.0058, SHAPE_SEED, { octaves: 5 })
  const fine = fbm2(wx * 0.021, wz * 0.021, DETAIL_SEED, { octaves: 3 })

  // Dune spines, only where there is meaningful land under them.
  const dune = ridged2(wx * 0.009, wz * 0.009, DUNE_SEED, 3) * shaped * shaped

  const land = TERRAIN.maxHeight * (0.26 + 0.56 * detail + 0.1 * fine + 0.34 * dune)
  let h = lerp(TERRAIN.oceanFloorY, land, shaped)

  // Flatten the band either side of the waterline into a beach. Without this
  // the shore is wherever the slope happens to cross zero, which reads as a
  // cliff meeting water rather than sand running into it. Blended smoothly so
  // the derivative stays continuous and the normals do not crease.
  const t = smoothstep(0, TERRAIN.beachWidth, Math.abs(h))
  h *= lerp(0.38, 1, t)

  return h
}

/** Bulk query with no allocation. Vegetation placement will call this tens of thousands of times. */
export function heightAtBatch(xs: Float32Array, zs: Float32Array, out: Float32Array): void {
  const n = Math.min(xs.length, zs.length, out.length)
  for (let i = 0; i < n; i++) out[i] = heightAt(xs[i], zs[i])
}

/** Spacing for the central difference used by the normal. Small enough for detail, large enough to avoid float noise. */
const EPS = 0.35

/**
 * Surface normal, derived analytically from heightAt rather than from mesh
 * triangles. Mesh-derived normals differ between levels of detail and leave a
 * visible lighting seam where two levels meet; this does not, and it also lets
 * later modules align a tree trunk to exactly the slope the renderer drew.
 */
export function normalComponents(x: number, z: number, out: [number, number, number]): [number, number, number] {
  const hL = heightAt(x - EPS, z)
  const hR = heightAt(x + EPS, z)
  const hD = heightAt(x, z - EPS)
  const hU = heightAt(x, z + EPS)
  const nx = hL - hR
  const nz = hD - hU
  const ny = 2 * EPS
  const inv = 1 / Math.hypot(nx, ny, nz)
  out[0] = nx * inv
  out[1] = ny * inv
  out[2] = nz * inv
  return out
}

const scratch: [number, number, number] = [0, 1, 0]

/** Radians from horizontal. */
export function slopeAt(x: number, z: number): number {
  const n = normalComponents(x, z, scratch)
  return Math.acos(Math.min(1, Math.max(-1, n[1])))
}

/** What the ground is here, so placement rules in later modules read from one source of truth. */
export function surfaceAt(x: number, z: number): Surface {
  const h = heightAt(x, z)
  if (h <= 0) return 'oceanFloor'
  const slope = slopeAt(x, z)
  if (slope > 0.7) return 'rock'
  if (h < TERRAIN.beachWidth * 0.55) return 'wetSand'
  if (h > TERRAIN.maxHeight * 0.6) return 'dune'
  return 'sand'
}

export function isLand(x: number, z: number): boolean {
  return heightAt(x, z) > SEA_LEVEL
}

export function sampleAt(x: number, z: number, out?: TerrainSample): TerrainSample {
  const target = out ?? {
    height: 0,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    slope: 0,
    surface: 'sand' as Surface,
  }
  const n = normalComponents(x, z, scratch)
  target.height = heightAt(x, z)
  target.normalX = n[0]
  target.normalY = n[1]
  target.normalZ = n[2]
  target.slope = Math.acos(Math.min(1, Math.max(-1, n[1])))
  target.surface = surfaceAt(x, z)
  return target
}

export function worldBounds(): {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  radius: number
} {
  return {
    minX: -WORLD_HALF,
    maxX: WORLD_HALF,
    minZ: -WORLD_HALF,
    maxZ: WORLD_HALF,
    radius: TERRAIN.islandRadius,
  }
}
