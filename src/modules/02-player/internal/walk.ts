/** Cosmetic gait driven by resolved ground travel, independent of the camera. */
export interface WalkState { phase: number; amount: number }
export interface WalkPose {
  leftStride: number; rightStride: number; leftLift: number; rightLift: number
  roll: number; rise: number
}
export const createWalkState = (): WalkState => ({ phase: 0, amount: 0 })

export function advanceWalk(state: WalkState, distance: number, delta: number, grounded: boolean): void {
  if (!Number.isFinite(delta) || delta <= 0) return
  const dt = Math.min(delta, .05)
  const moving = grounded && Number.isFinite(distance) && distance > .00001
  state.amount += ((moving ? 1 : 0) - state.amount) * (1 - Math.exp(-14 * dt))
  if (moving) {
    // At a sprint the feet move faster, with a cap that keeps the steps readable.
    state.phase = (state.phase + Math.min(distance / 3.6, dt * 3.8) * Math.PI * 2) % (Math.PI * 2)
  }
  if (state.amount < .0001) { state.amount = 0; state.phase = 0 }
}

export function walkPose({ phase, amount }: WalkState): WalkPose {
  const swing = Math.sin(phase), lift = Math.cos(phase)
  const roll = -lift * .065 * amount
  return {
    leftStride: swing * amount, rightStride: -swing * amount,
    leftLift: Math.max(0, lift) ** 2 * amount,
    rightLift: Math.max(0, -lift) ** 2 * amount,
    roll,
    // Lift just enough for the outer toes to clear the ground during the waddle.
    rise: .45 * Math.abs(Math.sin(roll)) + (1 - Math.cos(phase * 2)) * .018 * amount,
  }
}
