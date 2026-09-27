/**
 * Camera sensitivity belongs with the player rather than a particular camera
 * view: third-person drag, first-person look, and lobby pointer lock should
 * all feel the same to the person who set it.
 */
import { createStore, useStore } from '../../00-core'

export const CAMERA_SENSITIVITY_MIN = 0.2
export const CAMERA_SENSITIVITY_MAX = 3
export const CAMERA_SENSITIVITY_DEFAULT = 1

const KEY = 'localrot.cameraSensitivity'

/** Keeps a stored or UI value within the useful aiming range. */
export function normaliseCameraSensitivity(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(number)) return CAMERA_SENSITIVITY_DEFAULT
  return Math.min(CAMERA_SENSITIVITY_MAX, Math.max(CAMERA_SENSITIVITY_MIN, number))
}

function readStored(): number {
  try {
    return normaliseCameraSensitivity(window.localStorage.getItem(KEY))
  } catch {
    return CAMERA_SENSITIVITY_DEFAULT
  }
}

const sensitivity = createStore(
  typeof window === 'undefined' ? CAMERA_SENSITIVITY_DEFAULT : readStored(),
)

export function getCameraSensitivity(): number {
  return sensitivity.get()
}

export function useCameraSensitivity(): number {
  return useStore(sensitivity)
}

export function setCameraSensitivity(next: number): void {
  const value = normaliseCameraSensitivity(next)
  sensitivity.set(value)
  try {
    window.localStorage.setItem(KEY, String(value))
  } catch {
    // Losing a preference after reload should never stop the player looking.
  }
}
