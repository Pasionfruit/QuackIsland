import { type ReactNode, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useNet, usePeers } from '../../09-net'
import { useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import { minigameById, openMinigame, useMinigameScreen } from '../../15-minigames'
import { useBoardMovement, useBoardMovementVisualSettled } from '../../53-board-movement'
import {
  continueToMinigameRewards,
  markMinigameRoundReady,
  listenForMinigameRound,
  recordFinalMinigame,
  retryMinigameRoundPreload,
  startFinalMinigame,
  startMinigamePractice,
  syncMinigameRoundLifecycle,
  useMinigameRound,
  useMinigameRoundAcknowledged,
  useMinigameRoundReadyPlayers,
} from './state'
import { allConnectedMinigamePlayersReady } from './readiness'
import { suppressedIslandControls, type IslandMinigameScreenPhase } from './chrome'
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

function controlLabel(element: HTMLButtonElement): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function useIslandMinigameChrome(
  active: boolean,
  screenPhase: IslandMinigameScreenPhase | null,
): void {
  useEffect(() => {
    if (!active || screenPhase === null || typeof document === 'undefined') return
    const hidden = new Map<HTMLButtonElement, boolean>()
    const labels = suppressedIslandControls(screenPhase)

    const suppressStandaloneControls = () => {
      for (const button of document.querySelectorAll('button')) {
        if (button.closest('[data-minigame-round-root]') || !labels.has(controlLabel(button))) continue
        if (!hidden.has(button)) hidden.set(button, button.hidden)
        button.hidden = true
      }
    }
    suppressStandaloneControls()
    const observer = new MutationObserver(suppressStandaloneControls)
    observer.observe(document.body, { childList: true, subtree: true })

    const blockStandaloneMenu = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', blockStandaloneMenu, true)

    return () => {
      observer.disconnect()
      window.removeEventListener('keydown', blockStandaloneMenu, true)
      for (const [button, wasHidden] of hidden) button.hidden = wasHidden
    }
  }, [active, screenPhase])
}

export function MinigameRound() {
  const round = useMinigameRound()
  const board = useBoardMovement()
  const party = useParty()
  const mode = useGameMode()
  const net = useNet()
  const peers = usePeers()
  const screen = useMinigameScreen()
  const boardSettled = useBoardMovementVisualSettled()
  const acknowledged = useMinigameRoundAcknowledged(round.sessionId)
  const readyPlayers = useMinigameRoundReadyPlayers()

  useEffect(() => listenForMinigameRound(), [])

  useEffect(() => {
    syncMinigameRoundLifecycle()
  }, [board.phase, board.round, board.sessionId, boardSettled, mode, net.host, net.id, net.room, net.status, party.phase])

  useEffect(() => {
    if (round.phase !== 'briefing' || round.minigameId === '') return
    if (screen.at !== 'game' || screen.run.id !== round.minigameId || screen.run.phase !== 'briefing') {
      openMinigame(round.minigameId)
    }
  }, [round.minigameId, round.phase, round.revision, round.sessionId, screen])

  useEffect(() => {
    if (
      round.phase === 'briefing' &&
      screen.at === 'game' &&
      screen.run.id === round.minigameId &&
      screen.run.phase === 'briefing'
    ) {
      markMinigameRoundReady()
    }
  }, [round.minigameId, round.phase, round.sessionId, screen])

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

  const game = round.minigameId === '' ? null : minigameById(round.minigameId)
  const connectedIds = [net.id, ...peers.map((peer) => peer.id)].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  )
  const everyoneLoaded = allConnectedMinigamePlayersReady(
    round.players.map((player) => player.id),
    connectedIds,
    readyPlayers,
  )
  const practiceReady =
    round.phase === 'practice' &&
    (screen.at !== 'game' || screen.run.id !== round.minigameId || screen.run.phase === 'over')
  const sharedScreenPhase = screen.at === 'game' && screen.run.id === round.minigameId
    ? screen.run.phase === 'briefing'
      ? 'briefing'
      : screen.run.phase === 'over'
        ? 'over'
        : null
    : null
  useIslandMinigameChrome(round.phase !== 'idle' && !acknowledged, sharedScreenPhase)

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
        <div className="minigame-round__result-action">
          {round.continueRequested ? (
            <span className="minigame-round__waiting">Preparing reward dice...</span>
          ) : net.host ? (
            <button type="button" className="minigame-round__continue" onClick={continueToMinigameRewards}>
              <span className="minigame-round__button-icon" aria-hidden="true">C</span>
              <span><strong>Continue</strong><small>Reveal reward dice</small></span>
            </button>
          ) : (
            <span className="minigame-round__waiting">Waiting for the host to continue</span>
          )}
        </div>
      </section>
    )
  } else if (round.phase === 'briefing' || practiceReady) {
    content = (
      <section className="minigame-round minigame-round--controls" aria-label="Volcano Island minigame controls">
        <div className="minigame-round__heading">
          <span className="minigame-round__eyebrow">Volcano Island challenge</span>
          <strong>{game?.title ?? 'Free-for-all minigame'}</strong>
          <span>
            {round.practiceAttempts === 0
              ? 'Read the description and controls before starting.'
              : `${round.practiceAttempts} practice ${round.practiceAttempts === 1 ? 'attempt' : 'attempts'} completed.`}
          </span>
        </div>
        {net.host ? (
          <>
            <div className="minigame-round__buttons">
              <button type="button" className="minigame-round__practice" onClick={startMinigamePractice} disabled={!everyoneLoaded}>
                <span className="minigame-round__button-icon" aria-hidden="true">P</span>
                <span><strong>Practice</strong><small>Results do not count</small></span>
              </button>
              <button type="button" className="minigame-round__final" onClick={startFinalMinigame} disabled={!everyoneLoaded}>
                <span className="minigame-round__button-icon" aria-hidden="true">F</span>
                <span><strong>Start final</strong><small>Lock the official result</small></span>
              </button>
            </div>
            {!everyoneLoaded && (
              <div className="minigame-round__loading">
                <span className="minigame-round__waiting">Loading the minigame for every player...</span>
                <button type="button" className="minigame-round__retry" onClick={retryMinigameRoundPreload}>
                  Retry loading
                </button>
              </div>
            )}
          </>
        ) : (
          <span className="minigame-round__waiting">Waiting for the host</span>
        )}
      </section>
    )
  } else {
    content = (
      <aside className={`minigame-round minigame-round--badge minigame-round--${round.phase}`}>
        <strong>{round.phase === 'practice' ? `Practice ${round.practiceAttempts}` : 'Final attempt'}</strong>
        {round.phase === 'practice' ? <span>Results do not count</span> : null}
      </aside>
    )
  }

  useDomOverlay(content)
  return null
}
