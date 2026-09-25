import type { PartyPhase } from '../../10-party'
import type { ModeId } from '../../13-modes'

/** Landmarks are race furniture, so they disappear outside an active Volcano game. */
export function volcanoLandmarksVisible(mode: ModeId, phase: PartyPhase): boolean {
  return mode === 'island' && phase === 'playing'
}

