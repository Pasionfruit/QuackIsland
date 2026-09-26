import { createStore, useStore } from '../../00-core'
import {
  getNet,
  getPeers,
  isHost,
  sendToRoom,
  subscribeRoom,
} from '../../09-net'
import { getParty } from '../../10-party'
import { getGameMode } from '../../13-modes'
import {
  builtMinigames,
  getMinigameScreen,
  openMinigame,
  playMinigame,
  type Standing,
} from '../../15-minigames'
import {
  acknowledgeBoardRound,
  getBoardMovement,
  isBoardMovementVisualSettled,
} from '../../53-board-movement'
import { decodeMinigameRoundMessage, encodeMinigameRoundMessage } from './protocol'
import {
  allConnectedMinigamePlayersReady,
  decodeMinigameRoundReady,
  encodeMinigameRoundReady,
} from './readiness'
import {
  EMPTY_MINIGAME_ROUND,
  beginMinigameAttempt,
  canAcknowledgeMinigameRound,
  createMinigameRound,
  finishFinalMinigame,
  requestRewardHandoff,
  type MinigameRoundSnapshot,
} from './rules'

const store = createStore<MinigameRoundSnapshot>(EMPTY_MINIGAME_ROUND)
const acknowledged = createStore('')
const readyPlayers = createStore<readonly string[]>([])
let stopListening: (() => void) | null = null
let requestedSession = ''
let actionSequence = 0
let pendingSnapshot: MinigameRoundSnapshot | null = null
let announcedReadyKey = ''

export function getMinigameRound(): MinigameRoundSnapshot {
  return store.get()
}

export function useMinigameRound(): MinigameRoundSnapshot {
  return useStore(store)
}

export function useMinigameRoundReadyPlayers(): readonly string[] {
  return useStore(readyPlayers)
}

export function isMinigameRoundAcknowledged(sessionId: string): boolean {
  return acknowledged.get() === sessionId
}

export function useMinigameRoundAcknowledged(sessionId: string): boolean {
  return useStore(acknowledged) === sessionId
}

export function acknowledgeMinigameRound(sessionId: string): boolean {
  const snapshot = store.get()
  if (!canAcknowledgeMinigameRound(snapshot, sessionId)) return false
  acknowledged.set(sessionId)
  return true
}

function localAction(label: string): string {
  actionSequence++
  return `${getNet().id}:${label}:${actionSequence}`.slice(0, 96)
}

function announce(snapshot: MinigameRoundSnapshot): void {
  sendToRoom({ ...encodeMinigameRoundMessage({ kind: 'snapshot', snapshot }) })
}

function accept(snapshot: MinigameRoundSnapshot): void {
  const previous = store.get()
  if (previous.sessionId !== snapshot.sessionId) {
    acknowledged.set('')
    readyPlayers.set([])
    announcedReadyKey = ''
  }
  store.set(snapshot)
  if (pendingSnapshot?.sessionId === snapshot.sessionId && pendingSnapshot.revision <= snapshot.revision) {
    pendingSnapshot = null
  }
  acknowledgeBoardRound(snapshot.boardSessionId, snapshot.boardRound)
}

function preloadRoundGame(snapshot: MinigameRoundSnapshot): void {
  if (snapshot.minigameId === '' || snapshot.phase === 'idle' || snapshot.phase === 'invalid' || snapshot.phase === 'complete') return
  const screen = getMinigameScreen()
  const needsBriefing =
    screen.at !== 'game' ||
    screen.run.id !== snapshot.minigameId ||
    screen.run.phase === 'over'
  if (needsBriefing) openMinigame(snapshot.minigameId)
}

function boardSessionMatches(snapshot: MinigameRoundSnapshot): boolean {
  const board = getBoardMovement()
  return (
    board.sessionId === snapshot.boardSessionId &&
    board.room === snapshot.room &&
    board.round === snapshot.boardRound
  )
}

function boardMatches(snapshot: MinigameRoundSnapshot): boolean {
  const board = getBoardMovement()
  return boardSessionMatches(snapshot) && board.phase === 'round_complete' && isBoardMovementVisualSettled(board)
}

function rememberPending(snapshot: MinigameRoundSnapshot): void {
  if (
    pendingSnapshot === null ||
    pendingSnapshot.sessionId !== snapshot.sessionId ||
    snapshot.revision > pendingSnapshot.revision
  ) {
    pendingSnapshot = snapshot
  }
}

function adopt(snapshot: MinigameRoundSnapshot): boolean {
  const net = getNet()
  if (net.room !== snapshot.room || !snapshot.players.some((player) => player.id === net.id)) return false
  if (!boardSessionMatches(snapshot)) return false
  if (!boardMatches(snapshot)) {
    rememberPending(snapshot)
    return false
  }
  const current = store.get()
  if (current.sessionId === snapshot.sessionId && snapshot.revision <= current.revision) return false
  accept(snapshot)
  preloadRoundGame(snapshot)
  return true
}

function senderIsHost(senderId: string): boolean {
  const net = getNet()
  const ids = [net.id, ...getPeers().map((peer) => peer.id)].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  )
  return isHost(senderId, ids)
}

export function listenForMinigameRound(): () => void {
  if (stopListening) return stopListening
  stopListening = subscribeRoom((senderId, payload) => {
    const ready = decodeMinigameRoundReady(payload)
    if (ready) {
      const current = store.get()
      if (
        getNet().host &&
        current.phase === 'briefing' &&
        current.sessionId === ready.sessionId &&
        current.boardRound === ready.boardRound &&
        current.players.some((player) => player.id === senderId)
      ) {
        const next = new Set(readyPlayers.get())
        next.add(senderId)
        readyPlayers.set([...next])
      }
      return
    }
    const message = decodeMinigameRoundMessage(payload)
    if (!message) return
    if (message.kind === 'snapshot') {
      if (senderIsHost(senderId)) adopt(message.snapshot)
      return
    }
    const current = store.get()
    if (
      getNet().host &&
      current.phase !== 'idle' &&
      current.sessionId === message.sessionId &&
      current.boardRound === message.boardRound
    ) {
      announce(current)
    }
  })
  return () => {
    stopListening?.()
    stopListening = null
  }
}

export function markMinigameRoundReady(): boolean {
  const current = store.get()
  const net = getNet()
  if (
    current.phase !== 'briefing' ||
    !net.id ||
    !current.players.some((player) => player.id === net.id)
  ) return false

  if (net.host) {
    const next = new Set(readyPlayers.get())
    if (next.has(net.id)) return true
    next.add(net.id)
    readyPlayers.set([...next])
    return true
  }

  const readyKey = `${current.sessionId}:${current.revision}`
  if (announcedReadyKey === readyKey) return true
  announcedReadyKey = readyKey
  sendToRoom({ ...encodeMinigameRoundReady(current.sessionId, current.boardRound) })
  return true
}

/**
 * Re-announces the unchanged briefing when an acknowledgement was missed.
 * A new revision makes every client re-check its mounted briefing and send its
 * small ready message again; it never starts the game or changes the selection.
 */
export function retryMinigameRoundPreload(): boolean {
  if (!getNet().host) return false
  const current = store.get()
  if (current.phase !== 'briefing') return false
  const next = { ...current, revision: current.revision + 1 }
  accept(next)
  announce(next)
  return true
}

export function isMinigameRoundReadyToStart(): boolean {
  const current = store.get()
  const net = getNet()
  const connected = [net.id, ...getPeers().map((peer) => peer.id)].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  )
  return allConnectedMinigamePlayersReady(
    current.players.map((player) => player.id),
    connected,
    readyPlayers.get(),
  )
}

export function requestMinigameRoundSync(sessionId: string, boardRound: number): void {
  sendToRoom({ ...encodeMinigameRoundMessage({ kind: 'sync', sessionId, boardRound }) })
}

export function syncMinigameRoundLifecycle(): void {
  const net = getNet()
  const party = getParty()
  const board = getBoardMovement()
  const boardSessionId = board.sessionId
  const boardRoom = board.room
  const active =
    net.status === 'joined' &&
    party.phase === 'playing' &&
    getGameMode() === 'island' &&
    board.phase === 'round_complete' &&
    isBoardMovementVisualSettled(board) &&
    boardSessionId !== null &&
    boardRoom !== null

  if (!active) {
    if (store.get().phase !== 'idle') resetMinigameRound()
    return
  }

  if (boardSessionId === null || boardRoom === null) return
  const sessionId = `${boardSessionId}:minigame:${board.round}`
  if (pendingSnapshot?.sessionId === sessionId && adopt(pendingSnapshot)) {
    requestedSession = ''
    return
  }
  const current = store.get()
  if (current.sessionId === sessionId) {
    acknowledgeBoardRound(boardSessionId, board.round)
    return
  }

  acknowledged.set('')
  if (net.host) {
    const created = createMinigameRound(board, builtMinigames())
    accept(created)
    announce(created)
    requestedSession = ''
  } else if (requestedSession !== sessionId) {
    requestedSession = sessionId
    requestMinigameRoundSync(sessionId, board.round)
  }
}

function startAttempt(kind: 'practice' | 'final'): boolean {
  if (!getNet().host) return false
  const current = store.get()
  // Readiness protects the usual launch path, but a retry can repair a missed
  // acknowledgement without changing this authoritative start operation.
  if (current.phase === 'briefing' && !isMinigameRoundReadyToStart()) return false
  const next = beginMinigameAttempt(current, kind, localAction(kind))
  if (next === current || next.minigameId === '') return false
  accept(next)
  announce(next)

  const screen = getMinigameScreen()
  if (screen.at !== 'game' || screen.run.id !== next.minigameId || screen.run.phase !== 'briefing') {
    openMinigame(next.minigameId)
  }
  playMinigame()
  return true
}

export function startMinigamePractice(): boolean {
  return startAttempt('practice')
}

export function startFinalMinigame(): boolean {
  return startAttempt('final')
}

export function recordFinalMinigame(standings: readonly Standing[]): boolean {
  if (!getNet().host) return false
  const current = store.get()
  const next = finishFinalMinigame(current, standings, localAction('finish'))
  if (next === current) return false
  accept(next)
  announce(next)
  return true
}

export function continueToMinigameRewards(): boolean {
  if (!getNet().host) return false
  const current = store.get()
  const next = requestRewardHandoff(current, localAction('continue'))
  if (next === current) return false
  accept(next)
  announce(next)
  return true
}

export function resetMinigameRound(): void {
  store.set(EMPTY_MINIGAME_ROUND)
  acknowledged.set('')
  requestedSession = ''
  actionSequence = 0
  pendingSnapshot = null
  readyPlayers.set([])
  announcedReadyKey = ''
}
