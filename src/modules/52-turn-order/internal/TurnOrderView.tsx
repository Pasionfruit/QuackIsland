import { useEffect, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { getNet, useNet, usePeers } from '../../09-net'
import { useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import { rollsFor } from './rules'
import {
  listenForTurnOrder,
  requestTurnOrderRoll,
  syncTurnOrderLifecycle,
  useTurnOrder,
} from './state'
import './turn-order.css'

const BLOCKED_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/** Scene-safe bridge: the scene is rendered by three.js, while this module's
 * interface belongs to the DOM. A separate root keeps the two reconcilers from
 * trying to render each other's elements. */
export function TurnOrder(): null {
  useEffect(() => {
    const mount = document.createElement('div')
    mount.dataset.turnOrderRoot = 'true'
    document.body.append(mount)
    const root = createRoot(mount)
    root.render(<TurnOrderOverlay />)
    return () => {
      root.unmount()
      mount.remove()
    }
  }, [])
  return null
}

function TurnOrderOverlay(): React.JSX.Element | null {
  const mode = useGameMode()
  const party = useParty()
  const net = useNet()
  const peers = usePeers()
  const snapshot = useTurnOrder()
  const peerKey = useMemo(() => peers.map((peer) => peer.id).sort().join(','), [peers])
  const showing = mode === 'island' && party.phase === 'playing'

  useEffect(() => listenForTurnOrder(), [])

  useEffect(() => {
    syncTurnOrderLifecycle()
  }, [mode, party.phase, net.status, net.room, net.id, net.host, peerKey])

  useEffect(() => {
    if (!showing) return
    const blockWorldInput = (event: KeyboardEvent) => {
      if (!BLOCKED_KEYS.has(event.code)) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', blockWorldInput, true)
    window.addEventListener('keyup', blockWorldInput, true)
    return () => {
      window.removeEventListener('keydown', blockWorldInput, true)
      window.removeEventListener('keyup', blockWorldInput, true)
    }
  }, [showing])

  if (!showing) return null

  const me = getNet().id
  const localPlayer = snapshot.players.find((player) => player.id === me)
  const mayRoll = Boolean(me && snapshot.phase === 'rolling' && snapshot.pendingPlayerIds.includes(me))
  const waiting = snapshot.pendingPlayerIds
    .filter((id) => id !== me)
    .map((id) => snapshot.players.find((player) => player.id === id)?.name ?? id)

  return (
    <div className="turn-order-screen" role="dialog" aria-modal="true" aria-labelledby="turn-order-title">
      <section className="turn-order-card">
        <p className="turn-order-kicker">Volcano Island</p>
        <h1 id="turn-order-title">Roll for turn order</h1>
        <p className="turn-order-lead">
          Highest roll goes first. Players tied on their complete roll history roll again.
        </p>

        {snapshot.phase === 'idle' && <p className="turn-order-status">Synchronizing with the host…</p>}

        {snapshot.phase === 'invalid' && (
          <div className="turn-order-error" role="alert">
            <strong>Party cannot start</strong>
            <span>{snapshot.error}</span>
          </div>
        )}

        {snapshot.phase !== 'idle' && !localPlayer && (
          <div className="turn-order-error" role="alert">
            <strong>This party is already locked</strong>
            <span>Return to the lobby and join before the host starts the next game.</span>
          </div>
        )}

        {snapshot.players.length > 0 && (
          <ol className="turn-order-roster" aria-label="Party rolls">
            {snapshot.players.map((player) => {
              const playerRolls = rollsFor(snapshot, player.id)
              const position = snapshot.turnOrder?.indexOf(player.id) ?? -1
              const isPending = snapshot.pendingPlayerIds.includes(player.id)
              return (
                <li key={player.id} className={player.id === me ? 'is-me' : undefined}>
                  <span className="turn-order-place">{position >= 0 ? position + 1 : '—'}</span>
                  <span className="turn-order-name">
                    {player.name || player.id}
                    {player.id === me && <small>you</small>}
                  </span>
                  <span className="turn-order-dice">
                    {playerRolls.map((roll) => (
                      <span className="turn-order-die" key={`${player.id}:${roll.round}`} aria-label={`Rolled ${roll.value}`}>
                        {roll.value}
                      </span>
                    ))}
                    {isPending && <span className="turn-order-pending">ready to roll</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        )}

        {snapshot.phase === 'rolling' && localPlayer && (
          <div className="turn-order-actions">
            <button type="button" disabled={!mayRoll} onClick={requestTurnOrderRoll}>
              {mayRoll ? (rollsFor(snapshot, me ?? '').length ? 'Roll tie-breaker' : 'Roll d6') : 'Roll submitted'}
            </button>
            <p>
              {mayRoll
                ? 'Your roll is generated by the host and shared with everyone.'
                : waiting.length
                  ? `Waiting for ${waiting.join(', ')}.`
                  : 'The host is resolving the order…'}
            </p>
          </div>
        )}

        {snapshot.phase === 'complete' && (
          <div className="turn-order-complete" role="status">
            <strong>Turn order locked</strong>
            <span>Board movement will begin when the next module is added.</span>
          </div>
        )}

        <footer>
          {net.host ? 'You are the host authority.' : 'The host validates every roll.'}
          {' · '}
          Revision {snapshot.revision}
        </footer>
      </section>
    </div>
  )
}
