/** A jump starts the flap; walking off an edge alone does not. */
export interface FlapState { active: boolean; amount: number; phase: number }
export interface FlightInput { jumped: boolean; grounded: boolean; swimming: boolean; stunned: boolean }
export const createFlapState = (): FlapState => ({ active: false, amount: 0, phase: 0 })

export function advanceFlap(state: FlapState, delta: number, input: FlightInput): void {
  if (!Number.isFinite(delta) || delta <= 0) return
  const dt = Math.min(delta, .05)
  if (input.jumped) state.active = true
  if (input.grounded || input.swimming || input.stunned) state.active = false
  state.amount += ((state.active ? 1 : 0) - state.amount) * (1 - Math.exp(-18 * dt))
  state.phase = (state.phase + dt * Math.PI * 2 * 4) % (Math.PI * 2)
  if (state.amount < .0001) { state.amount = 0; state.phase = 0 }
}

export function flapPose(state: FlapState): { spread: number; raised: number } {
  const lift = .5 + Math.sin(state.phase) * .5
  return { spread: state.amount * (1 - lift), raised: state.amount * lift }
}
