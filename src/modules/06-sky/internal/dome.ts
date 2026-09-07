/**
 * The sky's shape, as arithmetic.
 *
 * The dome itself is one shader, so most of what it does cannot be tested in
 * Node. What can be is here: how big the dome has to be, how the cloud layer is
 * projected, and how cover turns into coverage on screen. Those are the parts
 * with a right answer, and one of them was wrong - see `cloudUv`.
 */

export const SKY = {
  /**
   * Radius of the dome, in metres.
   *
   * It has to sit outside everything that is drawn and inside the camera's far
   * plane, and it must not be fogged - it *is* the distance.
   */
  radius: 6000,
  /**
   * How far a view direction is spread across the cloud layer. Bigger makes
   * the clouds smaller.
   */
  cloudScale: 1.35,
  /**
   * How close to the horizon the projection is allowed to get before it is
   * held still. Only ever reached in the last couple of degrees, where the
   * cloud has already gone to haze.
   */
  cloudFloor: 0.035,
  /** Metres a cloud travels per second. A sky that does not move is a ceiling. */
  cloudDrift: 5.5,
  /**
   * Below this much of the sky, cloud blends into the horizon haze. Not a fade
   * to *nothing* - see below.
   */
  hazeTo: 0.42,
  /** How much thicker cloud gets looking towards the horizon. */
  edgeBoost: 0.22,
  /** Over what part of the sky that thickening happens. */
  edgeRange: 0.55,
  /** How wide the sun's disc is, as a dot-product exponent. Bigger is smaller. */
  sunSharpness: 1400,
  /** And its glow, which is what actually reads as a bright day. */
  glowSharpness: 9,
} as const

/**
 * Whether the dome is big enough to sit outside the world but inside the view.
 *
 * A dome inside the fog gets fogged into a flat wall of fog colour; a dome past
 * the far plane is clipped away and the sky is whatever the clear colour
 * happens to be. Both look like the sky module is broken.
 */
export function domeFits(radius: number, fogFar: number, cameraFar: number): boolean {
  return radius > fogFar && radius < cameraFar
}

/**
 * Where a view direction lands on the cloud layer.
 *
 * Clouds are a flat layer seen in perspective, not a texture pasted on the
 * dome: that is what makes them converge towards the horizon instead of
 * hanging overhead like a fisheye. Straight up is the origin.
 *
 * The projection runs away to infinity at the horizon, which has to be dealt
 * with somehow. The first attempt simply stopped drawing cloud below about
 * seventeen degrees, which left **a ring of clear sky all the way round the
 * player** — very visible, and the thing this replaces.
 *
 * Instead the distance is compressed logarithmically. It never stops growing,
 * so the noise never smears into stripes, but it grows slowly enough that the
 * layer keeps its detail all the way down. Near the middle the compression is
 * imperceptible: `log(1 + r) / r` goes to 1 as r goes to 0.
 */
export function cloudUv(dirX: number, dirY: number, dirZ: number): [number, number] {
  const y = Math.max(dirY, SKY.cloudFloor)
  const px = dirX / y
  const pz = dirZ / y
  const r = Math.hypot(px, pz)
  const squash = Math.log(1 + r) / Math.max(r, 1e-4)
  return [px * squash * SKY.cloudScale, pz * squash * SKY.cloudScale]
}

/**
 * How much of the sky a given cover ends up covering, at a given elevation.
 *
 * Returns the threshold the cloud noise is compared against, so a *lower*
 * number is more cloud. Cover 0 must be a clear sky and cover 1 solid.
 *
 * Cloud thickens towards the horizon because a flat layer seen edge-on really
 * does pack together - you are looking through more of it.
 */
export function cloudThreshold(cover: number, dirY = 1): number {
  const c = Math.min(1, Math.max(0, cover))
  const edge = 1 - smoothstep(0, SKY.edgeRange, dirY)
  const thickened = Math.min(1, c + edge * SKY.edgeBoost)
  // Never quite reaches 0 or 1 at the ends, so "clear" has no stray wisps and
  // "solid" has no stray holes.
  return 1.05 - thickened * 1.1
}

/**
 * How far cloud has merged into the horizon haze, 0 overhead to 1 at the
 * horizon.
 *
 * Cloud near the horizon goes *hazy*, not absent. Fading it out instead is
 * what put a ring of clear sky round the player.
 */
export function hazeAt(dirY: number): number {
  return 1 - smoothstep(0, SKY.hazeTo, dirY)
}

/** Keeps cloud off the last sliver below the horizon line, and nothing more. */
export function horizonClip(dirY: number): number {
  return smoothstep(-0.01, 0.045, dirY)
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
