import { type ReactNode, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useNet } from '../../09-net'
import { useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import { minigameById, openMinigame, useMinigameScreen } from '../../15-minigames'
import { useBoardMovement } from '../../53-board-movement'
import {
  listenForMinigameRound,
  recordFinalMinigame,
  startFinalMinigame,
  startMinigamePractice,
  syncMinigameRoundLifecycle,
  useMinigameRound,
  useMinigameRoundAcknowledged,
} from './state'
import './minigame-round.css'

function rankLabel(rank: number): string {
  if (rank === 0) return 'No podium'
  if (rank === 1) return '1st'
  if (rank === 2) return '2nd'
  if (rank === 3) return '3rd'
  return `${rank}th`
}

function useDomOverlay(content: ReactNode): void {
  const rootRef = useRef<Root | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const mount = document.createElement('div')
    mount.dataset.minigameRoundRoot = ''
    document.body.appendChild(mount)
    const root = createRoot(mount)
    rootRef.current = root

    return () => {
      rootRef.current = null
      root.unmount()
      mount.remove()
    }
  }, [])

  useEffect(() => {
    rootRef.current?.render(content)
  }, [content])
}

export function MinigameRound() {
  const round = useMinigameRound()
  const board = useBoardMovement()
  const party = useParty()
  const mode = useGameMode()
  const net = useNet()
  const screen = useMinigameScreen()
  const acknowledged = useMinigameRoundAcknowledged(round.sessionId)

  useEffect(() => listenForMinigameRound(), [])

  useEffect(() => {
    syncMinigameRoundLifecycle()
  }, [board.phase, board.round, board.sessionId, mode, net.host, net.id, net.room, net.status, party.phase])

  useEffect(() => {
    if (!net.host || round.phase !== 'briefing' || round.minigameId === '') return
    if (screen.at !== 'game' || screen.run.id !== round.minigameId || screen.run.phase !== 'briefing') {
      openMinigame(round.minigameId)
    }
  }, [net.host, round.minigameId, round.phase, round.sessionId, screen])

  useEffect(() => {
    if (
      net.host &&
      round.phase === 'final' &&
      screen.at === 'game' &&
      screen.run.id === round.minigameId &&
      screen.run.phase === 'over' &&
      screen.run.standings !== null
    ) {
      recordFinalMinigame(screen.run.standings)
    }
  }, [net.host, round.minigameId, round.phase, screen])

  useEffect(() => {
    if (round.phase !== 'final') return
    const lockFinal = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', lockFinal, true)
    return () => window.removeEventListener('keydown', lockFinal, true)
  }, [round.phase])

  const game = round.minigameId === '' ? null : minigameById(round.minigameId)
  const practiceReady =
    round.phase === 'practice' &&
    (screen.at !== 'game' || screen.run.id !== round.minigameId || screen.run.phase === 'over')

  let content: ReactNode = null
  if (round.phase === 'idle' || acknowledged) {
    content = null
  } else if (round.phase === 'invalid') {
    content = (
      <section className="minigame-round minigame-round--error" role="alert">
        <strong>Minigame round unavailable</strong>
        <span>{round.error}</span>
      </section>
    )
  } else if (round.phase === 'complete') {
    content = (
      <section className="minigame-round minigame-round--results" aria-label="Final minigame placements">
        <div>
          <strong>Final result</strong>
          <span>Reward dice are next</span>
        </div>
        <ol>
          {round.placements.map((placement) => (
            <li key={placement.playerId}>
              <b>{rankLabel(placement.rank)}</b> {placement.name}
            </li>
          ))}
        </ol>
      </section>
    )
  } else if (round.phase === 'briefing' || practiceReady) {
    content = (
      <section className="minigame-round minigame-round--controls" aria-label="Volcano Island minigame controls">
        <div>
          <strong>{game?.title ?? 'Free-for-all minigame'}</strong>
          <span>
            {round.practiceAttempts === 0
              ? 'Read the description and controls before starting.'
              : `${round.practiceAttempts} practice ${round.practiceAttempts === 1 ? 'attempt' : 'attempts'} completed.`}
          </span>
        </div>
        {net.host ? (
          <div className="minigame-round__buttons">
            <button type="button" onClick={startMinigamePractice}>Practice</button>
            <button type="button" className="minigame-round__final" onClick={startFinalMinigame}>
              Start final
            </button>
          </div>
        ) : (
          <span className="minigame-round__waiting">Waiting for the host</span>
        )}
      </section>
    )
  } else {
    content = (
      <aside className={`minigame-round minigame-round--badge minigame-round--${round.phase}`}>
        <strong>{round.phase === 'practice' ? `Practice ${round.practiceAttempts}` : 'Final attempt'}</strong>
        <span>{round.phase === 'practice' ? 'Results do not count' : 'This result determines placement'}</span>
      </aside>
    )
  }

  useDomOverlay(content)
  return null
}
