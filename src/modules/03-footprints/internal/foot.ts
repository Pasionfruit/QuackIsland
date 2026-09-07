/**
 * The shape of a duck's foot.
 *
 * A print is not a texture. The foot is a signed distance field evaluated per
 * fragment: three toes running out from a heel, joined by a smooth minimum
 * that fills the wedge between them. That fill is the webbing, and it comes
 * out scalloped - curving back towards the heel between the toe tips - which
 * is what a duck's web looks like from above.
 *
 * No texture means no asset to make, no atlas to pack, and nothing to go soft
 * when you stand right over a print.
 *
 * The field lives here in plain arithmetic, and the shader that actually draws
 * it is generated from the same numbers, so the two cannot drift. The point of
 * having it in Node is that the shape can be checked - that there really are
 * three toes with webbing between them, and that it fits in the quad it is
 * drawn on - rather than only looked at.
 *
 * Coordinates are the unit square the print is drawn in: `x` across, `y`
 * forward. The instance matrix scales that to metres and turns it to the
 * heading of the step.
 */

export interface Toe {
  /** Where the toe ends, in unit-square coordinates. */
  tipX: number
  tipY: number
  /** Half-thickness of the toe. */
  radius: number
}

/**
 * The foot itself.
 *
 * The middle toe is the long one and the outer two are not quite mirror images
 * of each other, which is what gives the foot a handedness - a left print and
 * a right print are this shape and its mirror, which the instance matrix does
 * with a negative scale on one axis.
 */
export const DUCK_FOOT = {
  heelX: 0,
  heelY: -0.5,
  /** The heel lands harder than the web, so it gets its own pad. */
  heelPad: 0.15,
  /**
   * Everything behind this is trimmed off.
   *
   * The smooth minimum that draws the webbing dips below both of its inputs -
   * that is what makes it smooth - and behind the heel, where all three toes
   * are about equally far away, it dips enough to inflate a blob out the back
   * of the foot. Left alone the print reaches further backwards than its toes
   * reach forwards, which reads as a paw rather than a foot. This clips the
   * blob and leaves the heel tapered.
   */
  heelCut: -0.6,
  // Short and thick on purpose. Toes long enough to be anatomical make the
  // print read as a bird's foot with some skin between the toes; stubby ones
  // let the web dominate, which is what reads as a duck at a glance.
  toes: [
    { tipX: 0.02, tipY: 0.52, radius: 0.16 },
    { tipX: 0.66, tipY: 0.2, radius: 0.15 },
    { tipX: -0.61, tipY: 0.16, radius: 0.15 },
  ] as readonly Toe[],
  /**
   * How much webbing. This is the smoothing width of the minimum that joins
   * the toes: too little and they are three separate sticks, too much and the
   * foot fills in into a paddle with no toes visible.
   */
  web: 0.4,
} as const

/** Distance to a thick line from a to b. One toe. */
function toeAt(px: number, py: number, ax: number, ay: number, bx: number, by: number, r: number): number {
  const pax = px - ax
  const pay = py - ay
  const bax = bx - ax
  const bay = by - ay
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)))
  return Math.hypot(pax - bax * h, pay - bay * h) - r
}

/** Smooth minimum. Joining two toes with this is what draws the web between them. */
function web(a: number, b: number, k: number): number {
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k))
  return b * (1 - h) + a * h - k * h * (1 - h)
}

/**
 * Signed distance to the foot: negative inside, zero on the outline, positive
 * outside. In unit-square coordinates, `y` forward.
 */
export function duckFootAt(x: number, y: number): number {
  const f = DUCK_FOOT
  let d = Infinity
  for (let i = 0; i < f.toes.length; i++) {
    const t = f.toes[i]
    const toe = toeAt(x, y, f.heelX, f.heelY, t.tipX, t.tipY, t.radius)
    d = i === 0 ? toe : web(d, toe, f.web)
  }
  d = Math.min(d, Math.hypot(x - f.heelX, y - f.heelY) - f.heelPad)
  // Intersect with the half-plane in front of the cut: max is intersection.
  return Math.max(d, f.heelCut - y)
}

/**
 * The same field as GLSL, built from the same numbers.
 *
 * Generated rather than written out for the same reason as the swell: a
 * hand-copied shader is a second source of truth that silently disagrees the
 * first time anyone nudges a toe.
 */
export function duckFootGlsl(): string {
  const f = DUCK_FOOT
  const n = (v: number) => v.toFixed(4)
  const heel = `vec2(${n(f.heelX)}, ${n(f.heelY)})`

  const toes = f.toes
    .map((t, i) => {
      const call = `toe(p, heel, vec2(${n(t.tipX)}, ${n(t.tipY)}), ${n(t.radius)})`
      return i === 0 ? `  float d = ${call};` : `  d = web(d, ${call}, ${n(f.web)});`
    })
    .join('\n')

  return `
// Distance to a thick line from a to b: one toe.
float toe(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// Smooth minimum. Joining the toes with this rather than a plain min is what
// draws the web: it fills the wedge between two toes with a surface that
// curves back towards the heel, which is the scalloped edge a duck has.
float web(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// A duck's foot, in the unit square, pointing down +y. Negative inside.
float duckFoot(vec2 p) {
  vec2 heel = ${heel};
${toes}
  // The heel lands harder than the web does.
  d = min(d, length(p - heel) - ${n(f.heelPad)});
  // Trim the blob the smooth minimum leaves behind the heel.
  return max(d, ${n(f.heelCut)} - p.y);
}
`
}
