import { createStore, useStore } from '../../00-core'
import { getNet, getPeers, isHost, sendToRoom, subscribeRoom } from '../../09-net'
import { getParty } from '../../10-party'
import { getGameMode } from '../../13-modes'
import {
  getBoardMovement,
  isBoardMovementVisualSettled,
} from '../../53-board-movement'
import { decodeVolcanoVictoryMessage, encodeVolcanoVictoryMessage } from './protocol'
import {
  EMPTY_VOLCANO_VICTORY,
  createVolcanoVictory,
  type VolcanoVictorySnapshot,
} from './rules'

const store = createStore<VolcanoVictorySnapshot>(EMPTY_VOLCANO_VICTORY)
let stopListening: (() => void) | null = null
let requestedSession = ''

export function getVolcanoVictory(): VolcanoVictorySnapshot {
  return store.get()
}

export function useVolcanoVictory(): VolcanoVictorySnapshot {
  return useStore(store)
}

function announce(snapshot = store.get()): void {
  if (snapshot.phase !== 'won') return
  sendToRoom(encodeVolcanoVictoryMessage({ kind: 'snapshot', snapshot }))
}

function hostPeerId(): string | null {
  const net = getNet()
  if (!net.id) return null
  const ids = [net.id, ...getPeers().map((peer) => peer.id)]
  return ids.find((id) => isHost(id, ids)) ?? null
}

function sourceMatches(snapshot: VolcanoVictorySnapshot): boolean {
  const board = getBoardMovement()
  return (
    board.sessionId === snapshot.boardSessionId &&
    board.room === snapshot.room &&
    board.round === snapshot.boardRound &&
    board.phase === 'won' &&
    board.winnerId === snapshot.winner?.playerId &&
    board.tileCount === snapshot.tileCount &&
    board.players.length === snapshot.rosterSize &&
    isBoardMovementVisualSettled()
  )
}

function adopt(snapshot: VolcanoVictorySnapshot): boolean {
  const net = getNet()
  if (net.room !== snapshot.room || !sourceMatches(snapshot)) return false
  if (!getBoardMovement().players.some((player) => player.id === net.id)) return false
  const current = store.get()
  if (current.sessionId === snapshot.sessionId && current.revision >= snapshot.revision) return false
  store.set(snapshot)
  return true
}

export function listenForVolcanoVictory(): () => void {
  if (stopListening) return stopListening
  stopListening = subscribeRoom((senderId, payload) => {
    const message = decodeVolcanoVictoryMessage(payload)
    if (!message) return
    const net = getNet()
    if (message.kind === 'snapshot') {
      if (senderId === hostPeerId()) adopt(message.snapshot)
      return
    }
    const current = store.get()
    if (
      net.host &&
      current.phase === 'won' &&
      current.sessionId === message.sessionId &&
      current.boardSessionId === message.boardSessionId
    ) announce(current)
  })
  return () => {
    stopListening?.()
    stopListening = null
  }
}

export function requestVolcanoVictorySync(sessionId: string, boardSessionId: string): void {
  sendToRoom(encodeVolcanoVictoryMessage({ kind: 'sync', sessionId, boardSessionId }))
}

function activeIslandParty(): boolean {
  const net = getNet()
  return (
    net.status === 'joined' &&
    Boolean(net.id && net.room) &&
    getParty().phase === 'playing' &&
    getGameMode() === 'island'
  )
}

export function syncVolcanoVictoryLifecycle(): void {
  if (!activeIslandParty()) {
    resetVolcanoVictory()
    return
  }
  const board = getBoardMovement()
  if (board.phase !== 'won' || !board.sessionId || !isBoardMovementVisualSettled()) {
    if (store.get().phase === 'won' && store.get().boardSessionId !== board.sessionId) resetVolcanoVictory()
    return
  }

  const sessionId = `${board.sessionId}:victory`
  if (store.get().sessionId === sessionId) return
  const net = getNet()
  if (net.host) {
    const created = createVolcanoVictory(board, true)
    if (!created) return
    store.set(created)
    announce(created)
    requestedSession = ''
  } else if (requestedSession !== sessionId) {
    requestedSession = sessionId
    requestVolcanoVictorySync(sessionId, board.sessionId)
  }
}

export function resetVolcanoVictory(): void {
  if (store.get().phase !== 'idle') store.set(EMPTY_VOLCANO_VICTORY)
  requestedSession = ''
}
