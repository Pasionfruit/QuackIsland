import { getNet } from '../../09-net'
import { endGame, getParty } from '../../10-party'
import { getGameMode } from '../../13-modes'
import { getVolcanoVictory } from '../../56-volcano-victory'
import { volcanoPostgameDecision } from './rules'

let returnedSessionId = ''

export function returnVolcanoToLobby(): boolean {
  const victory = getVolcanoVictory()
  const decision = volcanoPostgameDecision(
    victory,
    getParty().phase,
    getGameMode(),
    getNet().host,
  )
  if (!decision.canReturnToLobby || returnedSessionId === decision.victorySessionId) return false
  returnedSessionId = decision.victorySessionId
  endGame()
  return true
}

export function resetVolcanoPostgame(): void {
  returnedSessionId = ''
}
