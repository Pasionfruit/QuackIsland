import type { PartyPhase } from '../../10-party'
import type { ModeId } from '../../13-modes'
import type { VolcanoVictorySnapshot } from '../../56-volcano-victory'

export type VolcanoPostgameReason = 'inactive' | 'host_ready' | 'waiting_for_host'

export interface VolcanoPostgameDecision {
  visible: boolean
  canReturnToLobby: boolean
  reason: VolcanoPostgameReason
  victorySessionId: string
}

export function volcanoPostgameDecision(
  victory: Readonly<VolcanoVictorySnapshot>,
  partyPhase: PartyPhase,
  mode: ModeId,
  host: boolean,
): VolcanoPostgameDecision {
  const active = (
    victory.phase === 'won' &&
    victory.winner !== null &&
    victory.sessionId.length > 0 &&
    partyPhase === 'playing' &&
    mode === 'island'
  )
  if (!active) {
    return { visible: false, canReturnToLobby: false, reason: 'inactive', victorySessionId: '' }
  }
  return host
    ? { visible: true, canReturnToLobby: true, reason: 'host_ready', victorySessionId: victory.sessionId }
    : { visible: true, canReturnToLobby: false, reason: 'waiting_for_host', victorySessionId: victory.sessionId }
}
