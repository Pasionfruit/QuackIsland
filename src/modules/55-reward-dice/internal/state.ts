import { createStore, useStore } from '../../00-core'
import { getNet, getPeers, isHost, sendToRoom, subscribeRoom } from '../../09-net'
import { getParty } from '../../10-party'
import { getGameMode } from '../../13-modes'
import { closeMinigames } from '../../15-minigames'
import {
  getBoardMovement,
  resumeBoardMovement,
  setBoardDiceProvider,
} from '../../53-board-movement'
import {
  acknowledgeMinigameRound,
  getMinigameRound,
} from '../../54-minigame-round'
import { decodeRewardDiceMessage, encodeRewardDiceMessage } from './protocol'
import {
  EMPTY_REWARD_DICE,
  createRewardDice,
  returnRewardDice,
  rewardDiceForPlayer,
  type RewardDiceSnapshot,
} from './rules'

const store = createStore<RewardDiceSnapshot>(EMPTY_REWARD_DICE)
let stopListening: (() => void) | null = null
let requestedSession = ''
let actionSequence = 0

export function getRewardDice(): RewardDiceSnapshot {
  return store.get()
}

export function useRewardDice(): RewardDiceSnapshot {
  return useStore(store)
}

function installDiceProvider(snapshot: RewardDiceSnapshot): void {
  if (snapshot.phase === 'reveal' || snapshot.phase === 'returned') {
    setBoardDiceProvider((playerId, board) => rewardDiceForPlayer(snapshot, playerId, board))
  } else {
    setBoardDiceProvider(null)
  }
}

function accept(snapshot: RewardDiceSnapshot): void {
  store.set(snapshot)
  installDiceProvider(snapshot)
  if (snapshot.phase === 'reveal' || snapshot.phase === 'returned') {
    acknowledgeMinigameRound(snapshot.minigameSessionId)
    closeMinigames()
  }
}

function announce(snapshot = store.get()): void {
  if (snapshot.phase === 'idle') return
  sendToRoom(encodeRewardDiceMessage({ kind: 'snapshot', snapshot }))
}

function localAction(label: string): string {
  actionSequence++
  return `${getNet().id}:${label}:${actionSequence}`.slice(0, 180)
}

function hostPeerId(): string | null {
  const net = getNet()
  if (!net.id) return null
  const ids = [net.id, ...getPeers().map((peer) => peer.id)]
  return ids.find((id) => isHost(id, ids)) ?? null
}

function boardMatches(snapshot: RewardDiceSnapshot): boolean {
  const board = getBoardMovement()
  if (board.sessionId !== snapshot.boardSessionId) return false
  return board.round === snapshot.sourceBoardRound || board.round === snapshot.targetBoardRound
}

function sourceMatches(snapshot: RewardDiceSnapshot): boolean {
  if (!boardMatches(snapshot)) return false
  if (snapshot.phase === 'returned' && getBoardMovement().round === snapshot.targetBoardRound) return true
  const minigame = getMinigameRound()
  return (
    minigame.sessionId === snapshot.minigameSessionId &&
    minigame.phase === 'complete' &&
    minigame.continueRequested &&
    minigame.boardSessionId === snapshot.boardSessionId &&
    minigame.boardRound === snapshot.sourceBoardRound
  )
}

function adopt(snapshot: RewardDiceSnapshot): boolean {
  const net = getNet()
  if (!sourceMatches(snapshot) || net.room !== snapshot.room) return false
  if (!snapshot.assignments.some((assignment) => assignment.playerId === net.id)) return false
  const current = store.get()
  if (current.sessionId === snapshot.sessionId && current.revision >= snapshot.revision) return false
  accept(snapshot)
  return true
}

export function listenForRewardDice(): () => void {
  if (stopListening) return stopListening
  stopListening = subscribeRoom((senderId, payload) => {
    const message = decodeRewardDiceMessage(payload)
    if (!message) return
    const net = getNet()
    if (message.kind === 'snapshot') {
      if (senderId === hostPeerId()) adopt(message.snapshot)
      return
    }
    const current = store.get()
    if (
      net.host &&
      current.phase !== 'idle' &&
      current.sessionId === message.sessionId &&
      current.minigameSessionId === message.minigameSessionId
    ) announce(current)
  })
  return () => {
    stopListening?.()
    stopListening = null
  }
}

export function requestRewardDiceSync(sessionId: string, minigameSessionId: string): void {
  sendToRoom(encodeRewardDiceMessage({ kind: 'sync', sessionId, minigameSessionId }))
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

function shouldPreserveReturned(snapshot: RewardDiceSnapshot): boolean {
  if (snapshot.phase !== 'returned') return false
  const board = getBoardMovement()
  return board.sessionId === snapshot.boardSessionId && board.round === snapshot.targetBoardRound
}

export function syncRewardDiceLifecycle(): void {
  if (!activeIslandParty()) {
    resetRewardDice()
    return
  }
  const net = getNet()
  const minigame = getMinigameRound()
  const ready = minigame.phase === 'complete' && minigame.continueRequested
  if (!ready) {
    if (!shouldPreserveReturned(store.get()) && store.get().phase !== 'idle') resetRewardDice()
    return
  }

  const sessionId = `${minigame.sessionId}:rewards`
  const current = store.get()
  if (current.sessionId === sessionId) {
    installDiceProvider(current)
    return
  }
  if (net.host) {
    const created = createRewardDice(minigame)
    accept(created)
    announce(created)
    requestedSession = ''
  } else if (requestedSession !== sessionId) {
    requestedSession = sessionId
    requestRewardDiceSync(sessionId, minigame.sessionId)
  }
}

export function returnRewardsToBoard(): boolean {
  const net = getNet()
  const current = store.get()
  if (!net.host || current.phase !== 'reveal') return false
  const next = returnRewardDice(current, localAction('return'))
  if (next === current) return false
  installDiceProvider(current)
  if (!resumeBoardMovement(current.boardSessionId, current.sourceBoardRound)) return false
  accept(next)
  announce(next)
  return true
}

export function resetRewardDice(): void {
  if (store.get().phase !== 'idle') store.set(EMPTY_REWARD_DICE)
  setBoardDiceProvider(null)
  requestedSession = ''
  actionSequence = 0
}
