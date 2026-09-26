export const CONTROL_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/** The board owns Escape only while the Volcano Island board is visible. */
export function isVolcanoBoardParty(partyPhase: string, mode: string, minigameAt: string): boolean {
  return partyPhase === 'playing' && mode === 'island' && minigameAt === 'closed'
}

/** A visible pause card absorbs movement keys as well as Escape. */
export function shouldBlockKey(paused: boolean, code: string): boolean {
  return code === 'Escape' || (paused && CONTROL_CODES.has(code))
}
