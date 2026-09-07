/**
 * The shape of the sea.
 *
 * Calm on purpose: a couple of long, low swells crossing each other, not
 * waves. The whole surface moves through about a hand's width, so the sea
 * reads as breathing rather than churning.
 *
 * These constants are the single source of truth. The GPU does the real work,
 * but its shader is generated from this same table rather than hand-copied, so
 * the two cannot drift apart - and the properties that matter (that it stays
 * subtle, that it never stops moving, that it is smooth) are checked here in
 * Node against the numbers the shader will actually use.
 */

export interface SwellWave {
  /** Height in metres, peak to middle. */
  amplitude: number
  /** Distance between crests, in metres. */
  wavelength: number
  /** Direction of travel. Normalised on use. */
  dirX: number
  dirZ: number
  /** Metres per second the crests move. */
  speed: number
}

/**
 * Three crossing swells at slightly odd angles and wavelengths, so the surface
 * never visibly repeats. Total amplitude is deliberately under fifteen
 * centimetres.
 */
export const SWELL: readonly SwellWave[] = [
  { amplitude: 0.075, wavelength: 74, dirX: 1, dirZ: 0.28, speed: 3.1 },
  { amplitude: 0.045, wavelength: 47, dirX: -0.42, dirZ: 1, speed: 2.4 },
  { amplitude: 0.022, wavelength: 23, dirX: 0.68, dirZ: -0.75, speed: 1.7 },
]

/** The most the surface can ever rise or fall. Sanity, and the thing that keeps it calm. */
export const SWELL_MAX = SWELL.reduce((sum, w) => sum + w.amplitude, 0)

function normalised(w: SwellWave): { kx: number; kz: number; k: number } {
  const len = Math.hypot(w.dirX, w.dirZ) || 1
  const k = (Math.PI * 2) / w.wavelength
  return { kx: (w.dirX / len) * k, kz: (w.dirZ / len) * k, k }
}

/** Surface height above sea level at a point, in metres. */
export function swellAt(x: number, z: number, time: number): number {
  let h = 0
  for (const w of SWELL) {
    const { kx, kz, k } = normalised(w)
    h += Math.sin(x * kx + z * kz - time * w.speed * k) * w.amplitude
  }
  return h
}

/**
 * The surface slope, worked out from the derivative rather than by sampling
 * neighbours. The lighting is almost entirely what sells a calm sea, so this
 * needs to be exact rather than approximate.
 */
export function swellNormal(x: number, z: number, time: number): [number, number, number] {
  let dx = 0
  let dz = 0
  for (const w of SWELL) {
    const { kx, kz, k } = normalised(w)
    const c = Math.cos(x * kx + z * kz - time * w.speed * k) * w.amplitude
    dx += c * kx
    dz += c * kz
  }
  const len = Math.hypot(-dx, 1, -dz)
  return [-dx / len, 1 / len, -dz / len]
}

/**
 * The same maths as GLSL, built from the same table.
 *
 * Generated rather than written out, because a hand-copied shader is a second
 * source of truth that silently disagrees the first time anyone tunes a
 * number here.
 */
export function swellGlsl(): string {
  const terms = SWELL.map((w) => {
    const len = Math.hypot(w.dirX, w.dirZ) || 1
    const k = (Math.PI * 2) / w.wavelength
    const kx = ((w.dirX / len) * k).toFixed(6)
    const kz = ((w.dirZ / len) * k).toFixed(6)
    const wt = (w.speed * k).toFixed(6)
    return { kx, kz, wt, amp: w.amplitude.toFixed(4) }
  })

  const height = terms
    .map((t) => `  h += sin(p.x * ${t.kx} + p.y * ${t.kz} - t * ${t.wt}) * ${t.amp};`)
    .join('\n')

  const slope = terms
    .map(
      (t) =>
        `  c = cos(p.x * ${t.kx} + p.y * ${t.kz} - t * ${t.wt}) * ${t.amp};\n` +
        `  d += vec2(c * ${t.kx}, c * ${t.kz});`,
    )
    .join('\n')

  return `
float swellHeight(vec2 p, float t) {
  float h = 0.0;
${height}
  return h;
}

vec3 swellNormal(vec2 p, float t) {
  vec2 d = vec2(0.0);
  float c;
${slope}
  return normalize(vec3(-d.x, 1.0, -d.y));
}
`
}
