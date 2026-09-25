import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { useNet } from '../../09-net'
import { useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import { useVolcanoVictory } from '../../56-volcano-victory'
import { volcanoPostgameDecision } from './rules'
import { resetVolcanoPostgame, returnVolcanoToLobby } from './state'
import './volcano-postgame.css'

function VolcanoPostgameOverlay(): React.JSX.Element | null {
  const victory = useVolcanoVictory()
  const party = useParty()
  const mode = useGameMode()
  const net = useNet()
  const decision = volcanoPostgameDecision(victory, party.phase, mode, net.host)

  useEffect(() => {
    if (!decision.visible && party.phase === 'playing') resetVolcanoPostgame()
  }, [decision.visible, party.phase, victory.sessionId])

  if (!decision.visible) return null
  return (
    <div className="volcano-postgame-shell" aria-live="polite">
      <div className="volcano-postgame-control">
        {decision.canReturnToLobby ? (
          <button type="button" onClick={returnVolcanoToLobby}>Return to lobby</button>
        ) : (
          <span>Waiting for the host to return everyone to the lobby</span>
        )}
      </div>
    </div>
  )
}

export function VolcanoPostgame(): null {
  useEffect(() => {
    const mount = document.createElement('div')
    mount.dataset.volcanoPostgameRoot = 'true'
    document.body.append(mount)
    const root = createRoot(mount)
    root.render(<VolcanoPostgameOverlay />)
    return () => {
      root.unmount()
      mount.remove()
    }
  }, [])
  return null
}
