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
  /** Which way the body faces, radians. */
  facing: number
  grounded: boolean
  /** How fast the body is actually moving across the ground, for animation. */
  speed: number
}

export interface PlayerInput {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  jump: boolean
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
  /** Straight up, metres per second. Roughly a 1.6 m hop under this gravity. */
  jumpSpeed: 11,
  gravity: -26,
  /** How quickly the body turns to face where it is going, radians per second. */
  turnRate: 12,
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
  cameraYaw: 0,
}

export function createPlayer(x: number, z: number, groundAt: (x: number, z: number) => number): PlayerState {
  return { x, y: groundAt(x, z), z, vy: 0, facing: 0, grounded: true, speed: 0 }
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
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number },
): PlayerState {
  const step = Math.min(Math.max(dt, 0), 0.1)

  // Build the basis explicitly rather than rotating a vector: getting a sign
  // wrong in a rotation is invisible at one camera angle and obviously broken
  // at another, which is exactly the bug this replaces. `cameraYaw` is the
  // direction the camera looks, so forward is where it is pointing.
  const forwardX = Math.sin(input.cameraYaw)
  const forwardZ = Math.cos(input.cameraYaw)
  const rightX = forwardZ
  const rightZ = -forwardX

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

  state.x += moveX * PLAYER.walkSpeed * step
  state.z += moveZ * PLAYER.walkSpeed * step
  state.speed = magnitude > 0 ? PLAYER.walkSpeed : 0

  if (bounds) {
    state.x = Math.min(Math.max(state.x, bounds.minX), bounds.maxX)
    state.z = Math.min(Math.max(state.z, bounds.minZ), bounds.maxZ)
  }

  // Turn toward the direction of travel rather than snapping to it.
  if (magnitude > 0) {
    const want = Math.atan2(moveX, moveZ)
    const delta = shortestAngle(state.facing, want)
    const maxTurn = PLAYER.turnRate * step
    state.facing += Math.max(-maxTurn, Math.min(maxTurn, delta))
  }

  // Jump only from the ground, and only on the frame the key goes down - the
  // caller is responsible for edge detection, so holding space does not hover.
  if (input.jump && state.grounded) {
    state.vy = PLAYER.jumpSpeed
    state.grounded = false
  }

  state.vy += PLAYER.gravity * step
  state.y += state.vy * step

  const ground = groundAt(state.x, state.z)
  if (state.y <= ground) {
    // Land. Snapping to the ground every frame is also what carries the player
    // up and down slopes without any slope handling of its own.
    state.y = ground
    state.vy = 0
    state.grounded = true
  } else {
    state.grounded = false
  }

  return state
}
