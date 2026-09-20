import { CONVENTIONS, createRng, createStore, hashSeed, useStore } from '../../00-core'
import {
  cleanName,
  getMyName,
  getNet,
  getPeers,
  sendToRoom,
  subscribeRoom,
} from '../../09-net'
import { getParty } from '../../10-party'
import { getGameMode } from '../../13-modes'
import { decodeTurnOrderMessage, encodeTurnOrderMessage } from './protocol'
import {
  EMPTY_TURN_ORDER,
  applyTurnOrderRoll,
  comparePlayerIds,
  createTurnOrder,
  reconcileTurnOrderPlayers,
  type DieValue,
  type TurnOrderPlayer,
  type TurnOrderSnapshot,
} from './rules'

const store = createStore<TurnOrderSnapshot>(EMPTY_TURN_ORDER)
let sessionSerial = 0
let actionSerial = 0

export function getTurnOrder(): TurnOrderSnapshot {
  return store.get()
}

export function useTurnOrder(): TurnOrderSnapshot {
  return useStore(store)
}

export function resetTurnOrder(): void {
  if (store.get().phase !== 'idle') store.set(EMPTY_TURN_ORDER)
}

function active(): boolean {
  return getGameMode() === 'island' && getParty().phase === 'playing'
}

function connectedPlayers(): TurnOrderPlayer[] {
  const net = getNet()
  if (net.status !== 'joined' || !net.id) return []
  const players: TurnOrderPlayer[] = [
    { id: net.id, name: cleanName(getMyName()) },
    ...getPeers().map((peer) => ({ id: peer.id, name: cleanName(peer.name) })),
  ]
  const unique = new Map(players.map((player) => [player.id, player]))
  return [...unique.values()].sort((a, b) => comparePlayerIds(a.id, b.id))
}

function makeSession(): TurnOrderSnapshot | null {
  const net = getNet()
  if (net.status !== 'joined' || !net.room || !net.id || !net.host) return null
  sessionSerial++
  const sessionId = `${net.room}:${Date.now().toString(36)}:${sessionSerial.toString(36)}`
  const seed = hashSeed(CONVENTIONS.worldSeed, `turn-order:${sessionId}`)
  const snapshot = createTurnOrder(sessionId, net.room, seed, connectedPlayers())
  store.set(snapshot)
  return snapshot
}

function ensureHostSession(): TurnOrderSnapshot | null {
  const net = getNet()
  if (!active() || !net.host || !net.room) return null
  const current = store.get()
  if (current.phase === 'idle' || current.room !== net.room) return makeSession()

  const reconciled = reconcileTurnOrderPlayers(
    current,
    connectedPlayers().map((player) => player.id),
  )
  if (reconciled !== current) store.set(reconciled)
  return reconciled
}

function announce(snapshot = store.get()): void {
  if (snapshot.phase === 'idle') return
  sendToRoom(encodeTurnOrderMessage({ type: 'snapshot', snapshot }))
}

function nextDie(snapshot: TurnOrderSnapshot): DieValue {
  const rng = createRng(snapshot.seed)
  for (let index = 0; index < snapshot.rolls.length; index++) rng()
  return (Math.floor(rng() * 6) + 1) as DieValue
}

function acceptRoll(playerId: string, sessionId: string, actionId: string): void {
  const current = ensureHostSession()
  if (!current || current.sessionId !== sessionId) return
  const next = applyTurnOrderRoll(current, playerId, nextDie(current), actionId)
  if (next === current) return
  store.set(next)
  announce(next)
}

function hostPeerId(): string | null {
  const net = getNet()
  if (!net.id) return null
  const ids = [net.id, ...getPeers().map((peer) => peer.id)].sort(comparePlayerIds)
  return ids[0] ?? null
}

function newActionId(playerId: string): string {
  actionSerial++
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ?? `${playerId}:${Date.now().toString(36)}:${actionSerial.toString(36)}`
}

export function requestTurnOrderRoll(): void {
  if (!active()) return
  const net = getNet()
  const current = store.get()
  if (net.status !== 'joined' || !net.id || !current.sessionId) return
  const actionId = newActionId(net.id)
  if (net.host) acceptRoll(net.id, current.sessionId, actionId)
  else sendToRoom(encodeTurnOrderMessage({ type: 'roll', sessionId: current.sessionId, actionId }))
}

export function syncTurnOrderLifecycle(): void {
  const net = getNet()
  if (!active()) {
    resetTurnOrder()
    return
  }
  if (net.status !== 'joined' || !net.id || !net.room) return

  if (net.host) {
    const before = store.get()
    const snapshot = ensureHostSession()
    if (snapshot && snapshot !== before) announce(snapshot)
    return
  }
  sendToRoom(encodeTurnOrderMessage({ type: 'sync' }))
}

export function listenForTurnOrder(): () => void {
  return subscribeRoom((from, payload) => {
    const message = decodeTurnOrderMessage(payload)
    if (!message || !active()) return
    const net = getNet()

    if (message.type === 'sync') {
      if (!net.host) return
      const snapshot = ensureHostSession()
      if (snapshot) announce(snapshot)
      return
    }

    if (message.type === 'roll') {
      if (net.host) acceptRoll(from, message.sessionId, message.actionId)
      return
    }

    if (from !== hostPeerId()) return
    const current = store.get()
    if (current.sessionId === message.snapshot.sessionId && current.revision >= message.snapshot.revision) return
    store.set(message.snapshot)
  })
}
