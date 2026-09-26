export type IslandMinigameScreenPhase = 'briefing' | 'over'

/** Standalone controls that would let an Island round leave its coordinator. */
export function suppressedIslandControls(phase: IslandMinigameScreenPhase): ReadonlySet<string> {
  return phase === 'briefing'
    ? new Set(['play', 'back'])
    : new Set(['replay', 'minigame dashboard'])
}
