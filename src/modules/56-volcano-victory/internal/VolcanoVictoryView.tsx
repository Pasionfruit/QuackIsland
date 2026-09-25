import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { useNet } from '../../09-net'
import { useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import {
  useBoardMovement,
  useBoardMovementVisualSettled,
} from '../../53-board-movement'
import {
  listenForVolcanoVictory,
  syncVolcanoVictoryLifecycle,
  useVolcanoVictory,
} from './state'
import './volcano-victory.css'

function VolcanoVictoryOverlay(): React.JSX.Element | null {
  const victory = useVolcanoVictory()
  const board = useBoardMovement()
  const settled = useBoardMovementVisualSettled()
  const net = useNet()
  const party = useParty()
  const mode = useGameMode()

  useEffect(() => listenForVolcanoVictory(), [])
  useEffect(() => {
    syncVolcanoVictoryLifecycle()
  }, [
    board.phase,
    board.revision,
    board.round,
    board.sessionId,
    mode,
    net.host,
    net.id,
    net.room,
    net.status,
    party.phase,
    settled,
  ])

  if (victory.phase !== 'won' || !victory.winner) return null
  const mine = victory.winner.playerId === net.id
  return (
    <div className="volcano-victory-shell" role="dialog" aria-label="Volcano Island winner">
      <section className="volcano-victory-panel">
        <span className="volcano-victory-kicker">Summit reached</span>
        <div className="volcano-victory-crown" aria-hidden="true">♛</div>
        <h1>{mine ? 'You conquered the volcano!' : `${victory.winner.name} conquered the volcano!`}</h1>
        <p>
          {mine ? 'You are' : `${victory.winner.name} is`} the Volcano Island champion after
          {' '}{victory.boardRound === 1 ? '1 round' : `${victory.boardRound} rounds`}.
        </p>
        <div className="volcano-victory-result">
          <strong>{victory.winner.name}</strong>
          <span>Tile {victory.winner.tileIndex + 1} · {victory.rosterSize} players</span>
        </div>
        <small>The Volcano Island match is over.</small>
      </section>
    </div>
  )
}

export function VolcanoVictory(): null {
  useEffect(() => {
    const mount = document.createElement('div')
    mount.dataset.volcanoVictoryRoot = 'true'
    document.body.append(mount)
    const root = createRoot(mount)
    root.render(<VolcanoVictoryOverlay />)
    return () => {
      root.unmount()
      mount.remove()
    }
  }, [])
  return null
}
