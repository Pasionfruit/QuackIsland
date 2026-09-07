/**
 * Deterministic 2D value noise and fbm.
 *
 * Pure arithmetic, no three.js, no imports with side effects - this file is the
 * reason the whole heightfield can be unit tested in Node without a GPU, and
 * the reason chunk seams line up: two chunks sharing an edge call the same
 * function with the same numbers and get bit-identical results.
 */

/** Hash a lattice point to [0, 1). Integer in, deterministic out. */
function hash2(ix: number, iy: number, seed: number): number {
  let h = seed ^ Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** Quintic smoothstep: first and second derivatives vanish at the ends, so fbm has no visible lattice creases. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

export function valueNoise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = fade(x - x0)
  const fy = fade(y - y0)

  const n00 = hash2(x0, y0, seed)
  const n10 = hash2(x0 + 1, y0, seed)
  const n01 = hash2(x0, y0 + 1, seed)
  const n11 = hash2(x0 + 1, y0 + 1, seed)

  const a = n00 + (n10 - n00) * fx
  const b = n01 + (n11 - n01) * fx
  return a + (b - a) * fy
}

export interface FbmOptions {
  octaves?: number
  lacunarity?: number
  gain?: number
}

/** Layered value noise, normalised to roughly [0, 1]. */
export function fbm2(x: number, y: number, seed: number, opts: FbmOptions = {}): number {
  const octaves = opts.octaves ?? 5
  const lacunarity = opts.lacunarity ?? 2.03
  const gain = opts.gain ?? 0.5

  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(x * freq, y * freq, seed + i * 8191) * amp
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}

/** Ridged variant: sharp crests, for dune spines rather than rolling blobs. */
export function ridged2(x: number, y: number, seed: number, octaves = 4): number {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2(x * freq, y * freq, seed + i * 7717) * 2 - 1)
    sum += n * n * amp
    norm += amp
    amp *= 0.5
    freq *= 2.07
  }
  return sum / norm
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
