import { describe, expect, it } from 'vitest'
import {
  SEA_LEVEL,
  TERRAIN,
  WORLD_HALF,
  heightAt,
  heightAtBatch,
  isLand,
  normalComponents,
  sampleAt,
  slopeAt,
  surfaceAt,
  worldBounds,
} from '../internal/island'

/**
 * The ground, pinned.
 *
 * This is the most important test in the module and probably in the project.
 * Every tree, rock, building and footstep in every later module is placed
 * against heightAt. If a refactor here moves the ground even slightly, all of
 * it silently floats or sinks - and nothing else would catch it, because
 * everything downstream would still agree with the new, wrong ground.
 *
 * Regenerate these ONLY when the island is deliberately being reshaped, and
 * expect to re-gate every module that depends on this one when you do.
 */
const GOLDEN: [number, number, number][] = [
  [-316.8, 98.31, -22.000000],
  [-123.67, 83.94, 11.429854],
  [314.19, 113.71, -22.000000],
  [109.69, -207.38, -14.427623],
  [242.78, 131.33, -21.029146],
  [207.53, 151.7, -19.370237],
  [-102.81, 186.21, -8.578256],
  [-195.02, 50.61, -2.893962],
  [-168.69, -184.41, -15.884502],
  [182.21, 235.26, -21.844841],
  [217.95, -246.26, -22.000000],
  [-18.76, 146.57, 8.753582],
  [-84.89, -139.82, 3.726768],
  [-83.47, 265.3, -21.812189],
  [234.92, -51.15, -18.084003],
  [-45.2, 202.57, -5.133370],
  [-207.36, -216.49, -21.997008],
  [-115.4, -77.95, 8.425878],
  [2.85, 299.68, -22.000000],
  [-20.57, 160.62, 8.548766],
  [-174.05, -40.54, -0.646762],
  [236.61, 202.08, -22.000000],
  [-121.73, 22.68, 16.774519],
  [219.59, 126.86, -18.616487],
  [-246.43, 56.55, -16.567047],
  [-258.43, 120.98, -21.121768],
  [-63.62, 126.5, 2.660402],
  [-155.78, -74.59, 0.424741],
  [-63.12, -51.83, 21.221329],
  [281.38, -44.02, -21.935471],
  [-302.36, -157.22, -22.000000],
  [-232.59, 105.73, -19.012083],
  [-313.32, -135.43, -22.000000],
  [-139.03, -52.08, 7.508922],
  [-178.67, 192.17, -18.283581],
  [-13.07, 24.23, 22.677558],
  [220.53, 71.8, -15.481850],
  [126.33, -303.62, -22.000000],
  [34.26, -32.52, 24.235075],
  [6.88, 103.7, 16.171405],
  [-131.89, -7.58, 11.561074],
  [287.8, -189.1, -22.000000],
  [12.15, 257.41, -19.628067],
  [69.41, -307.81, -22.000000],
  [88.59, 94.36, 6.638963],
  [-63.99, 193.04, -3.875391],
  [117.58, -137.7, -2.863287],
  [185.47, 313.89, -22.000000],
  [-4.54, -196.23, -7.914608],
  [43.69, 109.61, 10.865707],]

describe('the height contract', () => {
  it('matches the golden heights exactly', () => {
    for (const [x, z, want] of GOLDEN) {
      expect(heightAt(x, z)).toBeCloseTo(want, 5)
    }
  })

  it('is deterministic across repeated calls', () => {
    for (const [x, z] of GOLDEN) expect(heightAt(x, z)).toBe(heightAt(x, z))
  })

  it('is finite everywhere, including nonsense input', () => {
    const wild = [0, 1e6, -1e6, 1e9, -1e9, 1e-9, Number.MAX_SAFE_INTEGER]
    for (const x of wild) {
      for (const z of wild) {
        const h = heightAt(x, z)
        expect(Number.isFinite(h)).toBe(true)
      }
    }
    // Garbage in should be absorbed, not propagated as NaN into a mesh.
    expect(Number.isFinite(heightAt(NaN, 0))).toBe(true)
    expect(Number.isFinite(heightAt(0, Infinity))).toBe(true)
  })

  it('puts land in the middle and water beyond the island', () => {
    expect(heightAt(0, 0)).toBeGreaterThan(SEA_LEVEL)
    const far = TERRAIN.islandRadius * 1.6
    for (const [x, z] of [[far, 0], [-far, 0], [0, far], [0, -far]]) {
      expect(heightAt(x, z)).toBeLessThan(SEA_LEVEL)
    }
  })

  it('bottoms out at the ocean floor far from the island', () => {
    expect(heightAt(9000, 9000)).toBeCloseTo(TERRAIN.oceanFloorY, 5)
  })

  it('is continuous - no cliffs between adjacent samples', () => {
    // A discontinuity here is invisible in a screenshot and very visible once
    // you walk over it, so it is worth catching on a dense grid.
    const step = 0.5
    let worst = 0
    for (let x = -WORLD_HALF; x < WORLD_HALF; x += 7.5) {
      for (let z = -WORLD_HALF; z < WORLD_HALF; z += 7.5) {
        worst = Math.max(worst, Math.abs(heightAt(x + step, z) - heightAt(x, z)))
        worst = Math.max(worst, Math.abs(heightAt(x, z + step) - heightAt(x, z)))
      }
    }
    expect(worst).toBeLessThan(2)
  })

  it('agrees with isLand', () => {
    for (const [x, z, h] of GOLDEN) expect(isLand(x, z)).toBe(h > 0)
  })
})

describe('bulk queries', () => {
  it('matches the single-point version', () => {
    const n = 256
    const xs = new Float32Array(n)
    const zs = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      xs[i] = (i * 3.7) % WORLD_HALF
      zs[i] = (i * -5.3) % WORLD_HALF
    }
    const out = new Float32Array(n)
    heightAtBatch(xs, zs, out)
    for (let i = 0; i < n; i++) expect(out[i]).toBeCloseTo(heightAt(xs[i], zs[i]), 4)
  })

  it('handles a hundred thousand points without falling over', () => {
    // Vegetation will do this every placement pass. A tripwire for anyone who
    // later makes this allocate per call.
    const n = 100_000
    const xs = new Float32Array(n)
    const zs = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      xs[i] = ((i * 37) % 1000) - 500
      zs[i] = ((i * 53) % 1000) - 500
    }
    const out = new Float32Array(n)
    const started = Date.now()
    heightAtBatch(xs, zs, out)
    expect(Date.now() - started).toBeLessThan(3000)
    expect(out.every((v) => Number.isFinite(v))).toBe(true)
  })
})

describe('normals and slope', () => {
  it('returns unit normals pointing upward', () => {
    const out: [number, number, number] = [0, 0, 0]
    for (const [x, z] of GOLDEN) {
      normalComponents(x, z, out)
      expect(Math.hypot(out[0], out[1], out[2])).toBeCloseTo(1, 4)
      expect(out[1]).toBeGreaterThan(0)
    }
  })

  it('reports flat ground far out to sea', () => {
    expect(slopeAt(5000, 5000)).toBeCloseTo(0, 3)
  })

  it('reports a steeper slope on the island than on the seabed', () => {
    let steepest = 0
    for (let x = -150; x <= 150; x += 9) {
      for (let z = -150; z <= 150; z += 9) steepest = Math.max(steepest, slopeAt(x, z))
    }
    expect(steepest).toBeGreaterThan(slopeAt(5000, 5000))
  })
})

describe('surfaces', () => {
  it('calls everything below the waterline ocean floor', () => {
    expect(surfaceAt(5000, 5000)).toBe('oceanFloor')
  })

  it('produces sand somewhere on the island', () => {
    const seen = new Set<string>()
    for (let x = -260; x <= 260; x += 5) {
      for (let z = -260; z <= 260; z += 5) seen.add(surfaceAt(x, z))
    }
    expect(seen.has('sand')).toBe(true)
    expect(seen.has('wetSand')).toBe(true)
    expect(seen.has('oceanFloor')).toBe(true)
  })

  it('never reports a land surface below sea level', () => {
    for (let x = -WORLD_HALF; x <= WORLD_HALF; x += 11) {
      for (let z = -WORLD_HALF; z <= WORLD_HALF; z += 11) {
        if (heightAt(x, z) <= 0) expect(surfaceAt(x, z)).toBe('oceanFloor')
      }
    }
  })
})

describe('sampleAt', () => {
  it('agrees with the individual queries', () => {
    for (const [x, z] of GOLDEN.slice(0, 12)) {
      const s = sampleAt(x, z)
      expect(s.height).toBeCloseTo(heightAt(x, z), 6)
      expect(s.slope).toBeCloseTo(slopeAt(x, z), 6)
      expect(s.surface).toBe(surfaceAt(x, z))
    }
  })

  it('fills a caller-supplied object rather than allocating', () => {
    const reused = sampleAt(0, 0)
    const again = sampleAt(10, 10, reused)
    expect(again).toBe(reused)
  })
})

describe('world bounds', () => {
  it('describes the square the chunks actually cover', () => {
    const b = worldBounds()
    expect(b.maxX - b.minX).toBeCloseTo(TERRAIN.chunkSize * TERRAIN.chunksPerSide, 6)
    expect(b.minX).toBe(-WORLD_HALF)
    expect(b.radius).toBe(TERRAIN.islandRadius)
  })

  it('keeps the island inside its own world', () => {
    // The shoreline must not run off the edge of the meshed area, or the
    // island would be sliced flat by the boundary.
    for (let a = -WORLD_HALF; a <= WORLD_HALF; a += 4) {
      expect(heightAt(a, -WORLD_HALF)).toBeLessThan(0)
      expect(heightAt(a, WORLD_HALF)).toBeLessThan(0)
      expect(heightAt(-WORLD_HALF, a)).toBeLessThan(0)
      expect(heightAt(WORLD_HALF, a)).toBeLessThan(0)
    }
  })
})
