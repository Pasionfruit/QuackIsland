/**
 * Ocean swell.
 *
 * Three long Gerstner waves crossing at slight angles. Swell is not chop: it
 * is what is left of a distant storm after the short waves have died out, so
 * it is long, low, and very smooth. The longest wave here is over a hundred
 * metres from crest to crest and about eighty centimetres tall.
 *
 * Two things make it read as an ocean rather than as a wobbling sheet:
 *
 * - **The speeds are not chosen, they are derived.** Deep-water waves are
 *   dispersive - `c = sqrt(g * lambda / 2pi)` - so a long swell outruns a short
 *   one. Picking speeds by hand gets this wrong and the crests move like a
 *   scrolling texture.
 * - **The waves are Gerstner, not sine.** Water at the surface travels in
 *   circles, not up and down, so each point is displaced sideways as well as
 *   vertically. The orbits here are exactly circular - radius equal to the
 *   amplitude - which is the true trochoidal wave rather than a stylised one.
 *   That makes the surface close to a sine at this steepness, and it should
 *   be: a swell with visibly sharp crests is a swell about to break.
 *
 * These constants are the single source of truth. The GPU does the real work,
 * but its shader is generated from this same table rather than hand-copied, so
 * the two cannot drift apart.
 */

/** Gravity, m/s^2. Sets how fast a wave of a given length travels. */
const G = 9.81

export interface SwellWave {
  /** Height in metres, middle to crest. */
  amplitude: number
  /** Distance between crests, in metres. */
  wavelength: number
  /** Direction of travel. Normalised on use. */
  dirX: number
  dirZ: number
}

/**
 * Three crossing swells at unrelated lengths and angles, so the surface never
 * visibly repeats within sight of the island.
 */
export const SWELL: readonly SwellWave[] = [
  { amplitude: 0.46, wavelength: 150, dirX: 1, dirZ: 0.24 },
  { amplitude: 0.26, wavelength: 98, dirX: 0.72, dirZ: 0.69 },
  { amplitude: 0.15, wavelength: 70, dirX: -0.38, dirZ: 1 },
]

/** The most the surface can ever rise above the mean. Crest to trough is twice this. */
export const SWELL_MAX = SWELL.reduce((sum, w) => sum + w.amplitude, 0)

/** How fast a deep-water wave of this length travels, metres per second. */
export function waveSpeed(wavelength: number): number {
  return Math.sqrt((G * wavelength) / (Math.PI * 2))
}

interface Term {
  /** Wave vector: direction times wavenumber. */
  kx: number
  kz: number
  /** Wavenumber, radians per metre. */
  k: number
  /** Angular frequency, radians per second. */
  omega: number
  amplitude: number
  dirX: number
  dirZ: number
}

/** The table, resolved into the numbers both the CPU and the shader use. */
function terms(): Term[] {
  return SWELL.map((w) => {
    const len = Math.hypot(w.dirX, w.dirZ) || 1
    const dirX = w.dirX / len
    const dirZ = w.dirZ / len
    const k = (Math.PI * 2) / w.wavelength
    return {
      kx: dirX * k,
      kz: dirZ * k,
      k,
      omega: waveSpeed(w.wavelength) * k,
      amplitude: w.amplitude,
      dirX,
      dirZ,
    }
  })
}

const TERMS = terms()

/**
 * Surface height above sea level at a point, in metres.
 *
 * Gerstner waves are parametric: this is the height of the water whose *rest*
 * position is `(x, z)`, and that water has been pulled a little sideways. The
 * difference is under four centimetres at this steepness - see the test - so
 * for asking where the surface is, this is the answer.
 */
export function swellAt(x: number, z: number, time: number): number {
  let h = 0
  for (const t of TERMS) {
    h += Math.sin(x * t.kx + z * t.kz - time * t.omega) * t.amplitude
  }
  return h
}

/**
 * Where the water at rest position `(x, z)` actually is: sideways as well as
 * up. This is what the vertex shader does, and what makes the motion circular
 * rather than a bob.
 */
export function swellDisplace(x: number, z: number, time: number): [number, number, number] {
  let dx = 0
  let dy = 0
  let dz = 0
  for (const t of TERMS) {
    const phase = x * t.kx + z * t.kz - time * t.omega
    const c = Math.cos(phase)
    dx += t.dirX * t.amplitude * c
    dz += t.dirZ * t.amplitude * c
    dy += Math.sin(phase) * t.amplitude
  }
  return [x + dx, dy, z + dz]
}

/**
 * The surface normal at the displaced point, worked out analytically rather
 * than by sampling neighbours.
 *
 * The lighting is almost entirely what sells a sea, so this needs to be exact.
 * The `y` term carries the steepness, which is what tilts the face of a crest
 * more than a sine wave would.
 */
export function swellNormal(x: number, z: number, time: number): [number, number, number] {
  let nx = 0
  let ny = 1
  let nz = 0
  for (const t of TERMS) {
    const phase = x * t.kx + z * t.kz - time * t.omega
    const wa = t.k * t.amplitude
    nx -= t.dirX * wa * Math.cos(phase)
    nz -= t.dirZ * wa * Math.cos(phase)
    ny -= t.k * t.amplitude * Math.sin(phase)
  }
  const len = Math.hypot(nx, ny, nz)
  return [nx / len, ny / len, nz / len]
}

/**
 * The same maths as GLSL, built from the same table.
 *
 * Generated rather than written out, because a hand-copied shader is a second
 * source of truth that silently disagrees the first time anyone tunes a number
 * here. `swellDisplace` returns the offset from the rest position, so the
 * vertex shader can damp it towards the shore before applying it.
 */
export function swellGlsl(): string {
  const f = (n: number) => n.toFixed(6)

  const displace = TERMS.map(
    (t) =>
      `  ph = p.x * ${f(t.kx)} + p.y * ${f(t.kz)} - t * ${f(t.omega)};\n` +
      `  c = cos(ph);\n` +
      `  d += vec3(${f(t.dirX * t.amplitude)} * c, sin(ph) * ${f(t.amplitude)}, ${f(t.dirZ * t.amplitude)} * c);`,
  ).join('\n')

  const normal = TERMS.map(
    (t) =>
      `  ph = p.x * ${f(t.kx)} + p.y * ${f(t.kz)} - t * ${f(t.omega)};\n` +
      `  c = cos(ph);\n` +
      `  n -= vec3(${f(t.dirX * t.k * t.amplitude)} * c, ${f(t.k * t.amplitude)} * sin(ph), ${f(t.dirZ * t.k * t.amplitude)} * c);`,
  ).join('\n')

  return `
vec3 swellDisplace(vec2 p, float t) {
  vec3 d = vec3(0.0);
  float ph;
  float c;
${displace}
  return d;
}

vec3 swellNormal(vec2 p, float t) {
  vec3 n = vec3(0.0, 1.0, 0.0);
  float ph;
  float c;
${normal}
  return normalize(n);
}
`
}
