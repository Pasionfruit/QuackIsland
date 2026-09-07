import { describe, expect, it } from 'vitest'
import { SWELL, SWELL_MAX, swellAt, swellDisplace, swellGlsl, swellNormal, waveSpeed } from '../internal/swell'
import { WATER_HALF, WATER_SEGMENTS } from '../internal/WaterView'

const G = 9.81
/** Wavenumber: radians per metre. */
const k = (wavelength: number) => (Math.PI * 2) / wavelength

describe('the swell', () => {
  it('is an ocean swell, not a pond and not a storm', () => {
    // Crest to trough is twice the amplitude, so this is a sea running about a
    // metre and a half. Below half a metre it stops reading as an ocean at
    // all; much above three and it is weather, not swell.
    expect(SWELL_MAX * 2).toBeGreaterThan(1)
    expect(SWELL_MAX * 2).toBeLessThan(3)
  })

  it('is long, which is what makes it a swell rather than chop', () => {
    // Swell is what is left of a distant storm once the short waves have died
    // out. Anything under about thirty metres is local wind chop.
    for (const w of SWELL) expect(w.wavelength).toBeGreaterThan(30)
    expect(Math.max(...SWELL.map((w) => w.wavelength))).toBeGreaterThan(100)
  })

  it('is nowhere near breaking', () => {
    // A Gerstner wave cusps when k*A reaches 1, and breaks past it. Real swell
    // is very low steepness - that is why it rolls instead of tumbling - and
    // the sum over every wave is what has to stay under 1.
    const total = SWELL.reduce((sum, w) => sum + k(w.wavelength) * w.amplitude, 0)
    expect(total).toBeLessThan(0.2)
    expect(total).toBeGreaterThan(0)
  })

  it('travels at the speed physics says, not a speed someone picked', () => {
    // Deep-water waves are dispersive: c = sqrt(g * lambda / 2pi). Hand-picked
    // speeds get this wrong and the crests slide like a scrolling texture.
    for (const w of SWELL) {
      expect(waveSpeed(w.wavelength)).toBeCloseTo(Math.sqrt((G * w.wavelength) / (Math.PI * 2)), 6)
    }
    // Which means the long swell outruns the short one.
    const sorted = [...SWELL].sort((a, b) => a.wavelength - b.wavelength)
    for (let i = 1; i < sorted.length; i++) {
      expect(waveSpeed(sorted[i].wavelength)).toBeGreaterThan(waveSpeed(sorted[i - 1].wavelength))
    }
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
    expect(swellAt(12, -30, 2.5)).not.toBeCloseTo(swellAt(12, -30, 0), 4)
  })

  it('never settles into a flat sea', () => {
    // Three waves at unrelated speeds, so they cannot all cancel and stay
    // cancelled.
    let lo = Infinity
    let hi = -Infinity
    for (let t = 0; t < 400; t += 0.5) {
      const h = swellAt(-140, 88, t)
      lo = Math.min(lo, h)
      hi = Math.max(hi, h)
    }
    expect(hi - lo).toBeGreaterThan(SWELL_MAX)
  })

  it('is smooth, with no steps in it', () => {
    // A crease in the surface would catch the light as a hard line. The most
    // it can rise over a quarter metre is the total slope, which is tiny.
    const maxSlope = SWELL.reduce((sum, w) => sum + k(w.wavelength) * w.amplitude, 0)
    let worst = 0
    for (let x = -200; x < 200; x += 0.25) {
      worst = Math.max(worst, Math.abs(swellAt(x + 0.25, 17, 9) - swellAt(x, 17, 9)))
    }
    expect(worst).toBeLessThanOrEqual(maxSlope * 0.25)
  })

  it('does not visibly repeat over the width of the sea', () => {
    // Three wavelengths with no common factor, so the pattern should not tile
    // inside the plane. Tiling is what makes a big water plane read as a
    // texture rather than as a sea.
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
      const repeats = probes.every(([x, z], i) => Math.abs(swellAt(x + shift, z, 0) - home[i]) < 1e-3)
      expect(repeats).toBe(false)
    }
  })
})

describe('the water going round rather than up and down', () => {
  it('moves each point sideways as well as vertically', () => {
    // This is the whole difference between a Gerstner wave and a sine. Without
    // it the surface heaves in place instead of rolling.
    let worst = 0
    for (let i = 0; i < 200; i++) {
      const [x, , z] = swellDisplace(i * 7.3, i * -3.1, i * 0.41)
      worst = Math.max(worst, Math.hypot(x - i * 7.3, z - i * -3.1))
    }
    expect(worst).toBeGreaterThan(0.3)
  })

  it('carries each point round a circle, which is what deep water does', () => {
    // Horizontal travel over a period should match vertical travel: the orbit
    // is a circle of the wave's own amplitude, not a flattened ellipse.
    const w = SWELL[0]
    const period = w.wavelength / waveSpeed(w.wavelength)
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i <= 400; i++) {
      const t = (i / 400) * period
      const [x, y] = swellDisplace(0, 0, t)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    // Within the wobble the other two waves add.
    expect((maxX - minX) / (maxY - minY)).toBeGreaterThan(0.6)
    expect((maxX - minX) / (maxY - minY)).toBeLessThan(1.4)
  })

  it('stays a single-valued surface, never folding over itself', () => {
    // Past k*A = 1 a Gerstner wave curls through itself and the mesh knots.
    // Walking along the wave, the displaced points must keep their order.
    const dir = SWELL[0]
    const len = Math.hypot(dir.dirX, dir.dirZ)
    let previous = -Infinity
    for (let s = -300; s <= 300; s += 0.5) {
      const [x, , z] = swellDisplace((dir.dirX / len) * s, (dir.dirZ / len) * s, 3)
      const along = (x * dir.dirX + z * dir.dirZ) / len
      expect(along).toBeGreaterThan(previous)
      previous = along
    }
  })

  it('stays close enough to sample by rest position', () => {
    // `swellAt` answers for the water whose *rest* place is (x, z), and that
    // water has been pulled sideways. Anything asking where the surface is at
    // a world position lives with that error, so it has to stay small.
    let worst = 0
    for (let i = 0; i < 500; i++) {
      const x = i * 11.7
      const z = i * -5.3
      const [dx, , dz] = swellDisplace(x, z, i * 0.29)
      worst = Math.max(worst, Math.hypot(dx - x, dz - z))
    }
    // Under a metre of sideways slip, on a swell over seventy metres long.
    expect(worst).toBeLessThan(1)
    expect(worst).toBeLessThan(Math.min(...SWELL.map((w) => w.wavelength)) / 20)
  })
})

describe('the surface normal', () => {
  it('is a unit vector pointing up out of the water', () => {
    for (let i = 0; i < 500; i++) {
      const n = swellNormal(i * 13.7, i * -9.1, i * 0.23)
      expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 6)
      // A swell never overhangs, so up stays the dominant component.
      expect(n[1]).toBeGreaterThan(0.99)
    }
  })

  it('is the true normal of the surface the vertex shader builds', () => {
    // Not the gradient of the height - the surface moves sideways too, so the
    // normal has to be taken across the displaced surface or the lighting
    // stops describing the shape and the sea looks like foil.
    const e = 0.05
    for (const [x, z, t] of [
      [0, 0, 0],
      [37, -12, 4.2],
      [-210, 88, 17],
      [640, 500, 60],
      [13, 7, 101],
    ] as const) {
      const pu = swellDisplace(x + e, z, t)
      const mu = swellDisplace(x - e, z, t)
      const pv = swellDisplace(x, z + e, t)
      const mv = swellDisplace(x, z - e, t)
      const tu = [pu[0] - mu[0], pu[1] - mu[1], pu[2] - mu[2]]
      const tv = [pv[0] - mv[0], pv[1] - mv[1], pv[2] - mv[2]]
      // cross(tv, tu) comes out +Y on flat water.
      const c = [
        tv[1] * tu[2] - tv[2] * tu[1],
        tv[2] * tu[0] - tv[0] * tu[2],
        tv[0] * tu[1] - tv[1] * tu[0],
      ]
      const len = Math.hypot(c[0], c[1], c[2])
      const n = swellNormal(x, z, t)
      for (let i = 0; i < 3; i++) expect(Math.abs(c[i] / len - n[i])).toBeLessThan(2e-3)
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

describe('the grid the swell is drawn on', () => {
  it('is fine enough to carry the shortest wave in the table', () => {
    // The normals are per fragment, so the grid only has to carry the shape -
    // but it does have to carry it. Under about eight vertices per wavelength
    // the crests alias into moving facets. This is the check that stops
    // someone adding a short wave and quietly wrecking the sea.
    const quad = (WATER_HALF * 2) / WATER_SEGMENTS
    const shortest = Math.min(...SWELL.map((w) => w.wavelength))
    expect(shortest / quad).toBeGreaterThanOrEqual(8)
  })
})

describe('the generated shader', () => {
  it('declares both functions the material calls', () => {
    const glsl = swellGlsl()
    expect(glsl).toContain('vec3 swellDisplace(vec2 p, float t)')
    expect(glsl).toContain('vec3 swellNormal(vec2 p, float t)')
  })

  it('carries one term per wave in each function, so none is dropped', () => {
    const glsl = swellGlsl()
    // One sine and one cosine per wave, in each of the two functions.
    expect(glsl.match(/sin\(/g) ?? []).toHaveLength(SWELL.length * 2)
    expect(glsl.match(/cos\(/g) ?? []).toHaveLength(SWELL.length * 2)
  })

  it('is generated from the table rather than hand-copied', () => {
    // The point of generating it: tuning an amplitude here has to show up in
    // the shader, or the CPU and GPU quietly disagree about where the sea is.
    for (const w of SWELL) expect(swellGlsl()).toContain(w.amplitude.toFixed(6))
  })

  it('writes every float in a form GLSL will accept', () => {
    // `1` is an int in GLSL and will not multiply a float. Every literal the
    // generator emits must carry a decimal point - a digit inside an
    // identifier like `vec2` is a type name, not a literal.
    const glsl = swellGlsl()
    const literals = glsl.match(/(?<![A-Za-z0-9_.])\d+(?:\.\d+)?/g) ?? []
    expect(literals.length).toBeGreaterThan(SWELL.length * 3)
    for (const n of literals) expect(n).toContain('.')
  })
})
