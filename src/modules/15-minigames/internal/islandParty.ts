/** Island-session restrictions apply only after a party has actually started. */
export function isVolcanoIslandParty(partyPhase: string, mode: string): boolean {
  return partyPhase === 'playing' && mode === 'island'
}
