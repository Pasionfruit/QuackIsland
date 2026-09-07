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
   * Which way the body faces, radians. Follows the direction of travel, so the
   * duck always points where it is going.
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
  /**
   * How far the feet will reach down to stay on the ground, in metres.
   *
   * Walking downhill, the ground falls away faster than gravity pulls you into
   * it: running down the island's steepest slope drops the ground about 30 cm
   * in a frame, while gravity moves you 4 mm. Without this the body spends the
   * whole descent a few centimetres airborne - which reads fine, but means it
   * is not grounded, so it leaves no footprints going downhill. That is the bug
   * this exists to fix.
   */
  groundSnap: 0.45,
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
  /**
   * Where the surface of the water actually is, this instant, at a point. Used
   * to ride the swell; defaults to a flat `seaLevel`.
   *
   * Whether you are *in* water is decided from the ground and `seaLevel`, and
   * deliberately not from this - so a missing or flat surface never changes
   * whether the player swims, only how they sit while swimming.
   */
  surfaceAt?: (x: number, z: number) => number
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
  // Whether the feet were down at the start of the frame, which is what tells
  // walking off a lip apart from jumping off it.
  const wasGrounded = state.grounded
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
    // Ride the swell rather than sitting at a flat mean level: on an ocean
    // that heaves the better part of a metre, a body held at the mean would
    // submerge and surface as the crests went past.
    const surface = opts.surfaceAt ? opts.surfaceAt(state.x, state.z) : seaLevel
    const floatLine = surface - PLAYER.floatDepth
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
    } else if (wasGrounded && state.vy <= 0 && state.y - ground <= PLAYER.groundSnap) {
      // Walking off a lip, not jumping off it. Reach down and stay on the
      // ground rather than falling the last few centimetres, which is what
      // going downhill looks like every single frame.
      //
      // Only from a standing start: after a jump `grounded` is already false,
      // so this cannot reach down and cut the jump short.
      state.y = ground
      state.vy = 0
      state.grounded = true
    } else {
      state.grounded = false
    }
  }

  // Which way the body points: where it is going, on land and in the water
  // alike.
  //
  // Movement itself stays camera-relative - forward is still away from the
  // camera and D is still screen-right - but the body turns to follow it, so
  // pressing A turns and walks left rather than side-stepping left while still
  // facing forwards. A creature with a beak has to point where it is going;
  // the earlier model, where the body faced the camera, was built for a
  // featureless capsule and left the duck walking sideways and backwards.
  //
  // Only while moving, so looking around while stood still or treading water
  // does not spin the body on the spot.
  if (magnitude > 0) {
    const target = Math.atan2(moveX, moveZ)
    const delta = shortestAngle(state.facing, target)
    const maxTurn = PLAYER.turnRate * step
    state.facing += Math.max(-maxTurn, Math.min(maxTurn, delta))
  }

  // Tip into the swim, or stand back up, over about a third of a second.
  //
  // Only while actually swimming somewhere. Floating still in deep water is
  // treading water, and you tread water upright - so letting go of the keys
  // stands the body back up without leaving the sea.
  const wantLean = state.swimming && magnitude > 0 ? 1 : 0
  const leanStep = PLAYER.leanRate * step
  state.lean += Math.max(-leanStep, Math.min(leanStep, wantLean - state.lean))

  return state
}
