import { useEffect, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { PRIORITY, useGameFrame } from '../../00-core'
import { movePlayerTo } from '../../02-player'
import { getNet, useNet, usePeers } from '../../09-net'
import { getParty, useParty } from '../../10-party'
import { getGameMode, useGameMode } from '../../13-modes'
import { getTurnOrder, useTurnOrder } from '../../52-turn-order'
import { boardPointAt } from './position'
import { activeBoardPlayer, boardPosition, BOARD_MOVEMENT } from './rules'
import {
  getBoardMovement,
  listenForBoardMovement,
  requestBoardRoll,
  syncBoardMovementLifecycle,
  useBoardMovement,
  useBoardRoundAcknowledged,
} from './state'
import './board-movement.css'

const BLOCKED_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

interface AnimationState {
  sessionId: string | null
  playerId: string | null
  position: number
}

export function BoardMovement(): null {
  const animation = useRef<AnimationState>({ sessionId: null, playerId: null, position: 0 })

  useGameFrame((_frame, delta) => {
    if (getGameMode() !== 'island' || getParty().phase !== 'playing' || getTurnOrder().phase !== 'complete') {
      animation.current = { sessionId: null, playerId: null, position: 0 }
      return
    }
    const snapshot = getBoardMovement()
    const playerId = getNet().id
    if (!playerId || !snapshot.sessionId || snapshot.phase === 'idle') return
    const target = boardPosition(snapshot, playerId)
    if (target === null) return

    if (animation.current.sessionId !== snapshot.sessionId || animation.current.playerId !== playerId) {
      animation.current = { sessionId: snapshot.sessionId, playerId, position: target }
    }
    if (animation.current.position > target) animation.current.position = target
    if (animation.current.position < target) {
      animation.current.position = Math.min(target, animation.current.position + delta * BOARD_MOVEMENT.tilesPerSecond)
    }
    const point = boardPointAt(animation.current.position)
    movePlayerTo(point.x, point.y, point.z)
  }, PRIORITY.world)

  useEffect(() => {
    const mount = document.createElement('div')
    mount.dataset.boardMovementRoot = 'true'
    document.body.append(mount)
    const root = createRoot(mount)
    root.render(<BoardMovementOverlay />)
    return () => {
      root.unmount()
      mount.remove()
    }
  }, [])
  return null
}

function BoardMovementOverlay(): React.JSX.Element | null {
  const mode = useGameMode()
  const party = useParty()
  const order = useTurnOrder()
  const net = useNet()
  const peers = usePeers()
  const snapshot = useBoardMovement()
  const acknowledged = useBoardRoundAcknowledged()
  const peerKey = useMemo(() => peers.map((peer) => peer.id).sort().join(','), [peers])
  const active = mode === 'island' && party.phase === 'playing' && order.phase === 'complete'
  const showing = active && snapshot.phase !== 'idle' && !acknowledged

  useEffect(() => listenForBoardMovement(), [])

  useEffect(() => {
    syncBoardMovementLifecycle()
  }, [mode, party.phase, order.phase, order.sessionId, net.status, net.room, net.id, net.host, peerKey])

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

  const me = net.id
  const activeId = activeBoardPlayer(snapshot)
  const activeName = snapshot.players.find((player) => player.id === activeId)?.name ?? activeId
  const mayRoll = Boolean(me && snapshot.phase === 'turn' && activeId === me)
  const lastMove = snapshot.moves[snapshot.moves.length - 1]
  const winner = snapshot.players.find((player) => player.id === snapshot.winnerId)
  const localPlayer = snapshot.players.find((player) => player.id === me)

  return (
    <div className="board-movement-shell" role="dialog" aria-label="Volcano board movement">
      <section className="board-movement-panel">
        <header>
          <div>
            <p>Volcano Island · Round {snapshot.round}</p>
            <h2>
              {snapshot.phase === 'won'
                ? `${winner?.name ?? 'A player'} reached the summit!`
                : snapshot.phase === 'round_complete'
                  ? 'Board round complete'
                  : snapshot.phase === 'invalid'
                    ? 'Party interrupted'
                    : `${activeName ?? 'Player'} rolls next`}
            </h2>
          </div>
          <span className="board-movement-revision">rev {snapshot.revision}</span>
        </header>

        {snapshot.phase === 'invalid' && <p className="board-movement-error">{snapshot.error}</p>}

        {!localPlayer && snapshot.phase !== 'invalid' && (
          <p className="board-movement-error">This board was already locked before you joined.</p>
        )}

        <ol className="board-movement-positions" aria-label="Board positions">
          {snapshot.turnOrder.map((playerId, index) => {
            const player = snapshot.players.find((entry) => entry.id === playerId)
            const tile = boardPosition(snapshot, playerId) ?? 0
            return (
              <li key={playerId} className={playerId === activeId ? 'is-active' : undefined}>
                <span>{index + 1}</span>
                <strong>{player?.name ?? playerId}{playerId === me ? ' · you' : ''}</strong>
                <span>Tile {tile + 1} / {snapshot.tileCount}</span>
                <progress max={snapshot.tileCount - 1} value={tile} aria-label={`${player?.name ?? playerId} board progress`} />
              </li>
            )
          })}
        </ol>

        {lastMove && (
          <div className="board-movement-last" aria-live="polite">
            <span>{snapshot.players.find((player) => player.id === lastMove.playerId)?.name ?? lastMove.playerId}</span>
            <div>
              {lastMove.dice.map((die, index) => (
                <b key={`${lastMove.round}:${lastMove.playerId}:${index}`} data-kind={die.kind}>{die.value}</b>
              ))}
            </div>
            <span>moved {lastMove.total}</span>
          </div>
        )}

        {snapshot.phase === 'turn' && localPlayer && (
          <div className="board-movement-actions">
            <button type="button" disabled={!mayRoll} onClick={requestBoardRoll}>
              {mayRoll ? 'Roll d6' : `Waiting for ${activeName ?? 'player'}`}
            </button>
            <small>The host generates and validates every die.</small>
          </div>
        )}

        {snapshot.phase === 'round_complete' && (
          <p className="board-movement-message">
            Everyone has moved. The random minigame transition is the next module.
          </p>
        )}

        {snapshot.phase === 'won' && (
          <p className="board-movement-message">
            The game stops immediately at tile {snapshot.tileCount}; no further turns are accepted.
          </p>
        )}
      </section>
    </div>
  )
}
