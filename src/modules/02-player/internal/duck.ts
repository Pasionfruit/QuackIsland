/**
 * Standing the duck model up in this world's terms.
 *
 * The model is authored in its own conventions and this world has its own, so
 * something has to reconcile them. All of that lives here, as named constants
 * and plain arithmetic, rather than as numbers buried in the view - and none
 * of it is detected at runtime.
 *
 * The one thing deliberately *not* auto-detected is which way is up. Guessing
 * an axis from the bounding box works right up until it does not, and the
 * failure is a duck lying on its back that passes every numeric check. The
 * axes are stated; only the size is measured.
 */

/** The corners of an axis-aligned box, in the model's own space. */
export interface Bounds {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

export const DUCK = {
  /** Resolved through `assetUrl`, so the assets can move to a CDN later. */
  asset: 'cute_duck_avatar_base.glb',

  /**
   * The model is Z-up and faces -Y: it came out of trimesh, which is Z-up, and
   * its beak and eyes sit at negative Y while its tail sits at positive Y.
   *
   * This world is Y-up and a heading of zero points down +Z. Turning by a
   * quarter turn about X takes one to the other: model +Z becomes world +Y,
   * and model -Y becomes world +Z.
   */
  rotationX: -Math.PI / 2,

  /**
   * How far the duck tips forward when swimming, as a fraction of the quarter
   * turn the controller asks for.
   *
   * The controller's `lean` runs 0 to 1 and means "lie flat", which is right
   * for a body that swims horizontally. A duck does not: it floats upright and
   * leans into the paddle. So the mechanism is untouched and this is how far a
   * *duck* interprets it - a nose-down lean of about fifteen degrees under way,
   * and upright the moment it stops. Set to 1 to swim like the capsule did.
   */
  swimTip: 0.18,
} as const

/**
 * The scale and lift that stand the model on the ground at a given height.
 *
 * `bounds` is in model space, so the height of the duck is its **Z** extent -
 * that is the axis `rotationX` brings up. Returns a uniform scale and the lift
 * that puts the lowest point of the model at y = 0, which is where the
 * controller keeps the feet.
 */
export function fitToHeight(bounds: Bounds, targetHeight: number): { scale: number; liftY: number } {
  const modelHeight = bounds.maxZ - bounds.minZ
  if (!(modelHeight > 0) || !(targetHeight > 0)) return { scale: 1, liftY: 0 }
  const scale = targetHeight / modelHeight
  // The model's feet sit a hair below its own origin, so lift by that much.
  return { scale, liftY: -bounds.minZ * scale }
}
