/**
 * When a sound should fire.
 *
 * Pure: it takes the body's state each frame and returns the cues to play. No
 * audio, no browser, no timers - so "does a footstep fire once per step" is a
 * question with an answer that can be checked in Node, rather than something
 * you find out by listening for a while.
 *
 * The hard part of footstep audio is not playing a sound; it is not playing
 * three. Every rule here exists because some state change fires twice
 * otherwise: landing while already grounded, stepping while airborne, a stroke
 * on the frame you leave the water.
 */

export type CueName = 'step' | 'jump' | 'land' | 'stroke'

/** What the cue engine needs to know. A subset of the player's state. */
export interface Walker {
  x: number
  z: number
  y: number
  vy: number
  grounded: boolean
  swimming: boolean
  /** Metres per second across the ground. */
  speed: number
}

export const CUES = {
  /** Metres between footsteps at walking pace. */
  stride: 1.25,
  /** The pace that stride is measured at; faster lengthens it. */
  strideSpeed: 9.5,
  /** The most a stride can stretch, as a multiplier. */
  strideMax: 1.75,
  /** Seconds between swim strokes. */
  strokeEvery: 1.15,
  /**
   * How hard you have to land before it is a landing rather than a step down.
   * Walking downhill the body is caught by the ground reach every frame, and
   * without this every one of those would be a thud.
   */
  landSpeed: 3.5,
  /** Below this, you are not moving enough to be taking steps. */
  movingSpeed: 0.4,
} as const

export interface CueState {
  /** Distance walked since the last footstep. */
  sinceStep: number
  /** Seconds since the last swim stroke. */
  sinceStroke: number
  lastX: number
  lastZ: number
  wasGrounded: boolean
  wasSwimming: boolean
  /** Downward speed on the last airborne frame, for judging the landing. */
  fallSpeed: number
  started: boolean
}

export function createCueState(): CueState {
  return {
    sinceStep: 0,
    sinceStroke: 0,
    lastX: 0,
    lastZ: 0,
    wasGrounded: true,
    wasSwimming: false,
    fallSpeed: 0,
    started: false,
  }
}

/** How far apart footsteps are at a given pace. Running lengthens the stride. */
export function strideFor(speed: number): number {
  if (!Number.isFinite(speed) || speed <= CUES.strideSpeed) return CUES.stride
  const stretch = Math.min(CUES.strideMax, speed / CUES.strideSpeed)
  return CUES.stride * stretch
}

/**
 * Advances the cue state by one frame and returns what should play.
 *
 * Returns an array because a frame can genuinely produce two - landing and
 * immediately taking a step - and swallowing one would be worse than both.
 */
export function stepCues(state: CueState, walker: Walker | null, dt: number): CueName[] {
  const out: CueName[] = []

  if (!walker) {
    // The player module can be switched off. Pick up cleanly rather than
    // treating the gap as one enormous stride when it comes back.
    state.started = false
    return out
  }

  const step = Math.min(Math.max(dt, 0), 0.1)

  if (!state.started) {
    state.started = true
    state.lastX = walker.x
    state.lastZ = walker.z
    state.wasGrounded = walker.grounded
    state.wasSwimming = walker.swimming
    state.sinceStep = 0
    state.sinceStroke = 0
    state.fallSpeed = 0
    return out
  }

  const moved = Math.hypot(walker.x - state.lastX, walker.z - state.lastZ)
  state.lastX = walker.x
  state.lastZ = walker.z

  if (walker.swimming) {
    // Strokes are timed rather than spaced: you keep paddling on the spot.
    state.sinceStroke += step
    if (walker.speed > CUES.movingSpeed && state.sinceStroke >= CUES.strokeEvery) {
      state.sinceStroke = 0
      out.push('stroke')
    }
    // Leaving the water should not owe a footstep for the distance swum.
    state.sinceStep = 0
  } else {
    state.sinceStroke = 0

    if (walker.grounded) {
      if (!state.wasGrounded) {
        // Only a real fall is a landing. Being caught by the ground reach on
        // the way downhill happens every frame and is not a thud.
        if (state.fallSpeed <= -CUES.landSpeed) out.push('land')
        // However you arrived, you are standing now, so the next step is a
        // full stride away.
        state.sinceStep = 0
      } else if (walker.speed > CUES.movingSpeed) {
        state.sinceStep += moved
        const stride = strideFor(walker.speed)
        if (state.sinceStep >= stride) {
          // Carry the remainder, or spacing drifts with the frame rate.
          state.sinceStep = Math.min(state.sinceStep - stride, stride)
          out.push('step')
        }
      }
    } else {
      // Airborne: no steps, and remember how fast we are coming down.
      state.fallSpeed = walker.vy
      if (state.wasGrounded && walker.vy > 0) out.push('jump')
      state.sinceStep = 0
    }
  }

  if (walker.grounded || walker.swimming) state.fallSpeed = 0

  state.wasGrounded = walker.grounded
  state.wasSwimming = walker.swimming
  return out
}
