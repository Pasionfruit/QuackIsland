import { describe, expect, it } from 'vitest'
import { SWELL, SWELL_MAX, swellAt, swellGlsl, swellNormal } from '../internal/swell'

describe('the swell', () => {
  it('stays calm', () => {
    // The brief was subtle swells, not waves. Fifteen centimetres of total
    // travel is the line: past that the sea starts to churn.
    expect(SWELL_MAX).toBeLessThan(0.15)
    for (const w of SWELL) expect(w.amplitude).toBeLessThan(0.1)
  })

  it('is long and low rather than choppy', () => {
    // Steepness is amplitude over wavelength. A calm sea is a very small
    // number here; anything approaching 1/20 reads as a swell you could surf.
    for (const w of SWELL) expect(w.amplitude / w.wavelength).toBeLessThan(0.005)
  })

  it('never leaves its own bounds, anywhere, at any time', () => {
    for (let i = 0; i < 4000; i++) {
      const x = ((i * 37.13) % 1800) - 900
      const z = ((i * 71.77) % 1800) - 900
      const t = (i * 0.317) % 600
      const h = swellAt(x, z, t)
      expect(Number.isFinite(h)).toBe(true)
      expect(Math.abs(h)).toBeLessThanOrEqual(SWELL_MAX + 1e-9)
    }
  })

  it('actually moves', () => {
    const still = swellAt(12, -30, 0)
    expect(swellAt(12, -30, 2.5)).not.toBeCloseTo(still, 4)
  })

  it('never settles into a flat sea', () => {
    // Three waves at unrelated speeds, so they cannot all cancel and stay
    // cancelled. Over a long run the surface at a point keeps moving.
    let lo = Infinity
    let hi = -Infinity
    for (let t = 0; t < 400; t += 0.5) {
      const h = swellAt(-140, 88, t)
      lo = Math.min(lo, h)
      hi = Math.max(hi, h)
    }
    expect(hi - lo).toBeGreaterThan(SWELL_MAX * 0.5)
  })

  it('is smooth, with no steps in it', () => {
    // A crease in the surface would catch the light as a hard line.
    let worst = 0
    for (let x = -200; x < 200; x += 0.25) {
      worst = Math.max(worst, Math.abs(swellAt(x + 0.25, 17, 9) - swellAt(x, 17, 9)))
    }
    // A quarter metre step across the shortest wave here cannot lift the
    // surface by more than a couple of centimetres.
    expect(worst).toBeLessThan(0.02)
  })

  it('does not visibly repeat over the width of the sea', () => {
    // Three wavelengths with no common factor, so the pattern should not tile
    // inside the 1800 m the plane covers. Tiling is what makes a big water
    // plane read as a texture rather than as a sea.
    const probes = [
      [0, 0],
      [11, 6],
      [-23, 41],
      [58, -17],
      [7, -66],
    ]
    const home = probes.map(([x, z]) => swellAt(x, z, 0))
    for (let shift = 1; shift <= 900; shift++) {
      // A repeat means every probe matches at once, not just one of them.
      const repeats = probes.every(
        ([x, z], i) => Math.abs(swellAt(x + shift, z, 0) - home[i]) < 1e-3,
      )
      expect(repeats).toBe(false)
    }
  })
})

describe('the surface normal', () => {
  it('is a unit vector pointing up out of the water', () => {
    for (let i = 0; i < 500; i++) {
      const n = swellNormal(i * 13.7, i * -9.1, i * 0.23)
      expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 6)
      // A calm sea never overhangs, so up is always the dominant component.
      expect(n[1]).toBeGreaterThan(0.99)
    }
  })

  it('matches the slope of the height it came from', () => {
    // The normal is analytic; if it drifts from the displaced surface the
    // lighting stops agreeing with the shape and the sea looks like foil.
    const t = 4.2
    const e = 0.01
    for (const [x, z] of [
      [0, 0],
      [37, -12],
      [-210, 88],
      [640, 500],
    ]) {
      const dx = (swellAt(x + e, z, t) - swellAt(x - e, z, t)) / (2 * e)
      const dz = (swellAt(x, z + e, t) - swellAt(x, z - e, t)) / (2 * e)
      const len = Math.hypot(-dx, 1, -dz)
      const n = swellNormal(x, z, t)
      expect(n[0]).toBeCloseTo(-dx / len, 4)
      expect(n[1]).toBeCloseTo(1 / len, 4)
      expect(n[2]).toBeCloseTo(-dz / len, 4)
    }
  })

  it('is not flat, or there would be nothing to catch the light', () => {
    let tilted = 0
    for (let i = 0; i < 400; i++) {
      const n = swellNormal(i * 3.3, i * 7.9, 1.5)
      if (Math.hypot(n[0], n[2]) > 1e-3) tilted++
    }
    expect(tilted).toBeGreaterThan(380)
  })
})

describe('the generated shader', () => {
  it('declares both functions the material injects', () => {
    const glsl = swellGlsl()
    expect(glsl).toContain('float swellHeight(vec2 p, float t)')
    expect(glsl).toContain('vec3 swellNormal(vec2 p, float t)')
  })

  it('carries one term per wave, so nothing is silently dropped', () => {
    const glsl = swellGlsl()
    expect(glsl.match(/sin\(/g) ?? []).toHaveLength(SWELL.length)
    expect(glsl.match(/cos\(/g) ?? []).toHaveLength(SWELL.length)
  })

  it('is generated from the table rather than hand-copied', () => {
    // The point of generating it: tuning an amplitude here has to show up in
    // the shader, or the CPU and GPU quietly disagree about where the sea is.
    for (const w of SWELL) expect(swellGlsl()).toContain(w.amplitude.toFixed(4))
  })

  it('writes every float in a form GLSL will accept', () => {
    // `1` is an int in GLSL and will not multiply a float. Every literal the
    // generator emits must carry a decimal point.
    const glsl = swellGlsl()
    // Numbers only - a digit inside an identifier like `vec2` is a type name.
    const literals = glsl.match(/(?<![A-Za-z0-9_.])\d+(?:\.\d+)?/g) ?? []
    expect(literals.length).toBeGreaterThan(SWELL.length * 3)
    for (const n of literals) expect(n).toContain('.')
  })
})
