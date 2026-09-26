export type IslandMinigameScreenPhase = 'briefing' | 'over'
export type IslandChromePhase = IslandMinigameScreenPhase | 'board'

/** Standalone controls that would let an Island round leave its coordinator. */
export function suppressedIslandControls(phase: IslandChromePhase): ReadonlySet<string> {
  if (phase === 'board') {
    return new Set(['settings', 'music', 'player', 'party', 'party code'])
  }
  return phase === 'briefing'
    ? new Set(['play', 'back'])
    : new Set(['replay', 'minigame dashboard'])
}
