/**
 * The decisions every other module is built against.
 *
 * These live here rather than in each module because they cannot be
 * renegotiated once anything is frozen: a module that disagreed about which
 * axis is up, or where sea level sits, could not be corrected without
 * unfreezing it. Mirrored from pipeline.json `conventions`.
 */

export const CONVENTIONS = {
  /** All distances everywhere in this project are metres. */
  units: 'meters',
  /** +Y is up, right-handed, -Z is north. */
  upAxis: '+Y',
  /**
   * Sea level is exactly zero, and terrain goes negative below it. Kept at
   * exactly 0 on purpose: water becomes a plane at y=0 and "is this land" is
   * simply height > 0, which removes a whole category of off-by-a-constant
   * bugs between modules that never speak to each other.
   */
  seaLevelY: 0,
  /** One seed for the whole world. Everything random derives from it. */
  worldSeed: 1337,
  frameBudgetMs: 16.6,
} as const

/**
 * The one camera's lens.
 *
 * Exported rather than written inline on the Canvas because `far` is a hard
 * limit other modules have to live inside, and one that fails in a way nobody
 * would guess at: the far plane clips on view-space *depth*, not on distance
 * from the camera. Anything spherical around the camera and larger than `far`
 * is therefore clipped in the middle of the screen and not at the edges, which
 * appears as a circular hole centred on wherever you are looking.
 *
 * That is exactly what happened to the sky dome. It is a number worth being
 * able to test against.
 */
export const CAMERA = {
  fov: 55,
  near: 0.5,
  far: 5000,
  start: [180, 120, 180] as [number, number, number],
} as const

/**
 * Ordering bands for per-frame work.
 *
 * useFrame priority is a hidden global: two modules that never import each
 * other still compete for it. Naming the bands here means a later module can
 * sequence itself after terrain streaming without editing terrain.
 */
export const PRIORITY = {
  input: 0,
  simulation: 10,
  world: 20,
  camera: 30,
  post: 40,
} as const

export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY]
