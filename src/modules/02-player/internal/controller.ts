/**
 * Walking, jumping and falling - as pure arithmetic.
 *
 * No three.js and no React here, so the whole of how the player moves can be
 * tested in Node: that a jump comes back down, that you cannot jump twice, that
 * you never end a frame underground. The component is a thin shell that feeds
 * this input and reads the result.
 *
 * The ground comes in as a function rather than being imported, so a test can
 * hand it flat ground or a wall and get a predictable answer.
 */

export interface PlayerState {
  x: number
  y: number
  z: number
  /** Vertical speed, metres per second. */
  vy: number
  /**
   * Which way the body faces, radians. Follows the camera rather than the
   * direction of travel, so sideways input reads as a side-step.
   */
  facing: number
  grounded: boolean
  /** How fast the body is actually moving across the ground, for animation. */
  speed: number
  /** Floating rather than walking: the sea bed here is too deep to stand on. */
  swimming: boolean
  /**
   * 0 upright, 1 flat on the water. Eased rather than switched, so the body
   * tips into a swim and stands back up instead of snapping between the two.
   */
  lean: number
}

export interface PlayerInput {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  jump: boolean
  /** Hold to run. */
  run: boolean
  /**
   * Where the camera is looking, in radians, such that forward is
   * `(sin(yaw), cos(yaw))`. Movement is relative to this, so the player always
   * walks away from the camera on `forward`.
   */
  cameraYaw: number
}

export const PLAYER = {
  /** Metres per second on flat ground. */
  walkSpeed: 9.5,
  /** Metres per second with run held. */
  runSpeed: 17,
  /** Metres per second in the water. Slower than a walk, as it should be. */
  swimSpeed: 6.5,
  /** Water this deep or deeper is out of your depth, and you swim. */
  swimDepth: 1.35,
  /** How far the body floats below the surface while swimming. */
  floatDepth: 0.55,
  /** How quickly the body tips between standing and swimming, per second. */
  leanRate: 3.4,
  /** Straight up, metres per second. Roughly a 1.6 m hop under this gravity. */
  jumpSpeed: 11,
  gravity: -26,
  /** How quickly the body swings round to face the camera, radians per second. */
  turnRate: 14,
  /** Eye height above the ground, for the camera. */
  eyeHeight: 1.7,
  /** Half the capsule, so the origin sits at the feet. */
  height: 1.8,
  radius: 0.4,
} as const

export const IDLE_INPUT: PlayerInput = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  run: false,
  cameraYaw: 0,
}

export function createPlayer(x: number, z: number, groundAt: (x: number, z: number) => number): PlayerState {
  return {
    x,
    y: groundAt(x, z),
    z,
    vy: 0,
    facing: 0,
    grounded: true,
    speed: 0,
    swimming: false,
    lean: 0,
  }
}

export interface StepOptions {
  /** Keeps the player inside the meshed world. */
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number }
  /**
   * Where the water is. Passed in rather than imported so this file stays pure
   * and so the player still swims with the water module switched off - whether
   * you are in water is a fact about the ground, not about anything rendering.
   */
  seaLevel?: number
}

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * Advances the player by one step.
 *
 * `dt` is clamped, because a tab left in the background comes back with a huge
 * delta and would otherwise teleport the player through the island.
 */
export function stepPlayer(
  state: PlayerState,
  input: PlayerInput,
  dt: number,
  groundAt: (x: number, z: number) => number,
  opts: StepOptions = {},
): PlayerState {
  const step = Math.min(Math.max(dt, 0), 0.1)
  const bounds = opts.bounds
  const seaLevel = opts.seaLevel ?? 0

  // Build the basis explicitly rather than rotating a vector: getting a sign
  // wrong in a rotation is invisible at one camera angle and obviously broken
  // at another, which is exactly the bug this replaces. `cameraYaw` is the
  // direction the camera looks, so forward is where it is pointing.
  const forwardX = Math.sin(input.cameraYaw)
  const forwardZ = Math.cos(input.cameraYaw)
  // Screen-right is cross(forward, up), which for a +Y-up right-handed world
  // works out as (-forwardZ, forwardX). Getting this backwards is easy and
  // silent - it was, for a while - so it is checked against a real camera's
  // own right vector in the tests rather than re-derived by hand.
  const rightX = -forwardZ
  const rightZ = forwardX

  const fwd = (input.forward ? 1 : 0) - (input.back ? 1 : 0)
  const side = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const magnitude = Math.hypot(fwd, side)
  let moveX = 0
  let moveZ = 0
  if (magnitude > 0) {
    // Normalise first, or a diagonal is forty percent faster than a cardinal.
    const f = fwd / magnitude
    const r = side / magnitude
    moveX = forwardX * f + rightX * r
    moveZ = forwardZ * f + rightZ * r
  }

  const pace = state.swimming ? PLAYER.swimSpeed : input.run ? PLAYER.runSpeed : PLAYER.walkSpeed
  state.x += moveX * pace * step
  state.z += moveZ * pace * step
  state.speed = magnitude > 0 ? pace : 0

  if (bounds) {
    state.x = Math.min(Math.max(state.x, bounds.minX), bounds.maxX)
    state.z = Math.min(Math.max(state.z, bounds.minZ), bounds.maxZ)
  }

  // The body faces where the camera looks, not where it is walking. That is
  // what makes A and D read as side-steps: hold A and you slide left while
  // still facing forward, rather than pivoting to face left and walking off.
  // Backing up moon-walks, which is the accepted cost of this model.
  //
  // Only while moving, so looking around while stood still does not spin the
  // body on the spot.
  if (magnitude > 0) {
    const delta = shortestAngle(state.facing, input.cameraYaw)
    const maxTurn = PLAYER.turnRate * step
    state.facing += Math.max(-maxTurn, Math.min(maxTurn, delta))
  }

  const ground = groundAt(state.x, state.z)
  // Out of your depth is a question about the sea bed, not about where the
  // body happens to be this frame - otherwise wading out gets stuck flickering
  // between walking and swimming at the exact depth where it changes.
  const outOfDepth = seaLevel - ground >= PLAYER.swimDepth

  if (outOfDepth) {
    state.swimming = true
    state.grounded = false
    // Float, rather than fall. Easing to the waterline also means walking off
    // a shelf into deep water surfaces you instead of dropping you to the bed.
    const floatLine = seaLevel - PLAYER.floatDepth
    state.vy = 0
    state.y += (floatLine - state.y) * Math.min(1, step * 6)
  } else {
    state.swimming = false

    // Jump only from the ground, and only on the frame the key goes down - the
    // caller is responsible for edge detection, so holding space does not
    // hover. No jumping while out of your depth.
    if (input.jump && state.grounded) {
      state.vy = PLAYER.jumpSpeed
      state.grounded = false
    }

    state.vy += PLAYER.gravity * step
    state.y += state.vy * step

    if (state.y <= ground) {
      // Land. Snapping to the ground every frame is also what carries the
      // player up and down slopes without any slope handling of its own.
      state.y = ground
      state.vy = 0
      state.grounded = true
    } else {
      state.grounded = false
    }
  }

  // Tip into the swim, or stand back up, over about a third of a second.
  const wantLean = state.swimming ? 1 : 0
  const leanStep = PLAYER.leanRate * step
  state.lean += Math.max(-leanStep, Math.min(leanStep, wantLean - state.lean))

  return state
}
