/**
 * The sky's shape, as arithmetic.
 *
 * The dome itself is one shader, so most of what it does cannot be tested in
 * Node. What can be is here: how big the dome has to be, how the cloud plane
 * is projected, and how cloud cover turns into coverage on screen. Those are
 * the parts with a right answer.
 */

export const SKY = {
  /**
   * Radius of the dome, in metres.
   *
   * It has to sit outside everything that is drawn and inside the camera's far
   * plane, and it must not be fogged - it *is* the distance.
   */
  radius: 6000,
  /** How high the cloud layer is projected, in metres. */
  cloudHeight: 900,
  /** Metres a cloud travels per second. A sky that does not move is a ceiling. */
  cloudDrift: 5.5,
  /**
   * Below this much of the sky, clouds fade out rather than meeting the
   * horizon in a hard line.
   */
  horizonFade: 0.06,
  /** How wide the sun's disc is, as a dot-product exponent. Bigger is smaller. */
  sunSharpness: 1400,
  /** And its glow, which is what actually reads as a bright day. */
  glowSharpness: 9,
} as const

/**
 * Whether the dome is big enough to sit outside the world but inside the view.
 *
 * A dome inside the fog gets fogged into a flat wall of fog colour; a dome
 * past the far plane is clipped away and the sky is whatever the clear colour
 * happens to be. Both look like the sky module is broken.
 */
export function domeFits(radius: number, fogFar: number, cameraFar: number): boolean {
  return radius > fogFar && radius < cameraFar
}

/**
 * Where a view direction lands on the cloud layer.
 *
 * Clouds are a flat plane seen in perspective, not a texture pasted on the
 * dome: that is what makes them converge towards the horizon instead of
 * hanging in a fisheye. Straight up is the origin; near the horizon the
 * projection runs away to infinity, which is why it is only valid above
 * `horizonFade` and fades out below it.
 */
export function cloudUv(dirX: number, dirY: number, dirZ: number, height: number): [number, number] {
  const y = Math.max(1e-4, dirY)
  return [(dirX / y) * (height / 1000), (dirZ / y) * (height / 1000)]
}

/**
 * How much of the sky a given cover ends up covering.
 *
 * The noise it thresholds is roughly 0..1, so cover is the *height* of the
 * threshold rather than the area covered - cover 0 must be a clear sky and
 * cover 1 must be solid, and the curve between them should feel linear.
 */
export function cloudThreshold(cover: number): number {
  const c = Math.min(1, Math.max(0, cover))
  // Never quite reaches 0 or 1 at the ends, so "clear" has no stray wisps and
  // "solid" has no stray holes.
  return 1.05 - c * 1.1
}

/** Fades the clouds out as the view drops towards the horizon. */
export function horizonFalloff(dirY: number, fade: number = SKY.horizonFade): number {
  if (dirY <= 0) return 0
  return Math.min(1, Math.max(0, (dirY - fade) / (fade * 4)))
}
