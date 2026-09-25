import { createRng, createStore, hashSeed, useStore } from '../../00-core'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { BOARD, getParty } from '../../10-party'
import { getGameMode } from '../../13-modes'
import {
  acknowledgeTurnOrder,
  comparePlayerIds,
  getTurnOrder,
} from '../../52-turn-order'
import { decodeBoardMovementMessage, encodeBoardMovementMessage } from './protocol'
import { boardTravelDurationMs } from './motion'
import {
  EMPTY_BOARD_MOVEMENT,
  activeBoardPlayer,
  applyBoardLandingEffect,
  applyBoardRoll,
  beginNextBoardRound,
  boardLandingContext,
  canAcknowledgeBoardRound,
  createBoardMovement,
  reconcileBoardPlayers,
  type BoardDieRoll,
  type BoardDieSpec,
  type BoardLandingEffectResolver,
  type BoardMovementSnapshot,
} from './rules'

export type BoardDiceProvider = (
  playerId: string,
  snapshot: Readonly<BoardMovementSnapshot>,
) => readonly BoardDieSpec[]

const store = createStore<BoardMovementSnapshot>(EMPTY_BOARD_MOVEMENT)
const handoffStore = createStore<{ sessionId: string | null; round: number; acknowledged: boolean }>({
  sessionId: null,
  round: 0,
  acknowledged: false,
})
const visualStore = createStore<{ sessionId: string | null; revision: number; settled: boolean }>({
  sessionId: null,
  revision: 0,
  settled: true,
})
let visualTimer: ReturnType<typeof setTimeout> | null = null
let actionSerial = 0
let diceProvider: BoardDiceProvider = () => [{ kind: 'base', sides: 6 }]
let landingEffectResolver: BoardLandingEffectResolver = () => null
let evaluatedLandingKey = ''

export function getBoardMovement(): BoardMovementSnapshot {
  return store.get()
}

export function useBoardMovement(): BoardMovementSnapshot {
  return useStore(store)
}

export function isBoardMovementVisualSettled(snapshot = store.get()): boolean {
  const visual = visualStore.get()
  return snapshot.phase === 'idle' || Boolean(
    snapshot.sessionId &&
      visual.sessionId === snapshot.sessionId &&
      visual.revision === snapshot.revision &&
      visual.settled,
  )
}

export function useBoardMovementVisualSettled(): boolean {
  const snapshot = useBoardMovement()
  const visual = useStore(visualStore)
  return snapshot.phase === 'idle' || Boolean(
    snapshot.sessionId &&
      visual.sessionId === snapshot.sessionId &&
      visual.revision === snapshot.revision &&
      visual.settled,
  )
}

export function setBoardDiceProvider(provider: BoardDiceProvider | null): void {
  diceProvider = provider ?? (() => [{ kind: 'base', sides: 6 }])
}

export function setBoardLandingEffectResolver(resolver: BoardLandingEffectResolver | null): void {
  landingEffectResolver = resolver ?? (() => null)
  evaluatedLandingKey = ''
}

export function isBoardRoundAcknowledged(
  sessionId = store.get().sessionId,
  round = store.get().round,
): boolean {
  const handoff = handoffStore.get()
  return Boolean(
    sessionId && handoff.sessionId === sessionId && handoff.round === round && handoff.acknowledged,
  )
}

export function useBoardRoundAcknowledged(): boolean {
  const snapshot = useBoardMovement()
  const handoff = useStore(handoffStore)
  return Boolean(
    snapshot.sessionId &&
      handoff.sessionId === snapshot.sessionId &&
      handoff.round === snapshot.round &&
      handoff.acknowledged,
  )
}

export function acknowledgeBoardRound(sessionId: string, round: number): boolean {
  const current = store.get()
  if (!canAcknowledgeBoardRound(current, sessionId, round)) return false
  if (!isBoardRoundAcknowledged(sessionId, round)) {
    handoffStore.set({ sessionId, round, acknowledged: true })
  }
  return true
}

function trackVisualMovement(current: BoardMovementSnapshot, snapshot: BoardMovementSnapshot): void {
  if (visualTimer !== null) {
    clearTimeout(visualTimer)
    visualTimer = null
  }
  const visual = visualStore.get()
  const oldPositions = new Map(current.positions.map((position) => [position.playerId, position.tileIndex]))
  const travel = current.sessionId === snapshot.sessionId
    ? snapshot.positions.reduce((largest, position) => {
      const previous = oldPositions.get(position.playerId)
      return previous === undefined ? largest : Math.max(largest, Math.abs(position.tileIndex - previous))
    }, 0)
    : 0
  if (travel === 0) {
    if (visual.sessionId !== snapshot.sessionId || visual.revision !== snapshot.revision || !visual.settled) {
      visualStore.set({ sessionId: snapshot.sessionId, revision: snapshot.revision, settled: true })
    }
    return
  }

  const sessionId = snapshot.sessionId
  const revision = snapshot.revision
  visualStore.set({ sessionId, revision, settled: false })
  visualTimer = setTimeout(() => {
    visualTimer = null
    const latest = store.get()
    if (latest.sessionId !== sessionId || latest.revision !== revision) return
    visualStore.set({ sessionId, revision, settled: true })
    resolveHostLandingEffect(latest)
  }, boardTravelDurationMs(0, travel))
}

function resolveHostLandingEffect(snapshot: BoardMovementSnapshot): void {
  const net = getNet()
  if (!net.host || !isBoardMovementVisualSettled(snapshot)) return
  const context = boardLandingContext(snapshot)
  if (!context) return
  const landingKey = `${context.sessionId}:${context.round}:${context.moveNumber}`
  if (evaluatedLandingKey === landingKey) return
  evaluatedLandingKey = landingKey
  let effect = null
  try {
    effect = landingEffectResolver(context, snapshot)
  } catch {
    return
  }
  const next = applyBoardLandingEffect(snapshot, effect, `effect:${newActionId(context.playerId)}`.slice(0, 80))
  if (next === snapshot) return
  adoptSnapshot(next)
  announce(next)
}

function adoptSnapshot(snapshot: BoardMovementSnapshot): void {
  const current = store.get()
  trackVisualMovement(current, snapshot)
  if (current.sessionId !== snapshot.sessionId || current.round !== snapshot.round) {
    handoffStore.set({ sessionId: snapshot.sessionId, round: snapshot.round, acknowledged: false })
  }
  store.set(snapshot)
}

export function resetBoardMovement(): void {
  if (visualTimer !== null) {
    clearTimeout(visualTimer)
    visualTimer = null
  }
  if (store.get().phase !== 'idle') store.set(EMPTY_BOARD_MOVEMENT)
  const visual = visualStore.get()
  if (visual.sessionId !== null || visual.revision !== 0 || !visual.settled) {
    visualStore.set({ sessionId: null, revision: 0, settled: true })
  }
  const handoff = handoffStore.get()
  if (handoff.sessionId !== null || handoff.round !== 0 || handoff.acknowledged) {
    handoffStore.set({ sessionId: null, round: 0, acknowledged: false })
  }
  evaluatedLandingKey = ''
}

function active(): boolean {
  return getGameMode() === 'island' && getParty().phase === 'playing' && getTurnOrder().phase === 'complete'
}

function connectedPlayerIds(): string[] {
  const net = getNet()
  if (net.status !== 'joined' || !net.id) return []
  return [net.id, ...getPeers().map((peer) => peer.id)].sort(comparePlayerIds)
}

function makeSession(): BoardMovementSnapshot | null {
  const net = getNet()
  const order = getTurnOrder()
  if (!net.host || !net.room || !net.id || order.phase !== 'complete' || !order.sessionId) return null
  const seed = hashSeed(order.seed, `board-movement:${order.sessionId}`)
  const created = createBoardMovement(order, seed, BOARD.tiles)
  const snapshot = reconcileBoardPlayers(created, connectedPlayerIds())
  adoptSnapshot(snapshot)
  if (snapshot.phase !== 'invalid') acknowledgeTurnOrder(order.sessionId)
  return snapshot
}

function ensureHostSession(): BoardMovementSnapshot | null {
  const net = getNet()
  const order = getTurnOrder()
  if (!active() || !net.host || !net.room || !order.sessionId) return null
  const current = store.get()
  if (current.phase === 'idle' || current.orderSessionId !== order.sessionId || current.room !== net.room) {
    return makeSession()
  }

  const reconciled = reconcileBoardPlayers(current, connectedPlayerIds())
  if (reconciled !== current) adoptSnapshot(reconciled)
  acknowledgeTurnOrder(order.sessionId)
  return reconciled
}

function announce(snapshot = store.get()): void {
  if (snapshot.phase === 'idle') return
  sendToRoom(encodeBoardMovementMessage({ type: 'snapshot', snapshot }))
}

function validSpecs(specs: readonly BoardDieSpec[]): readonly BoardDieSpec[] {
  if (specs.length < 1 || specs.length > 2) return [{ kind: 'base', sides: 6 }]
  if (specs[0].kind !== 'base' || specs[0].sides !== 6) return [{ kind: 'base', sides: 6 }]
  if (specs.length === 1) return [{ kind: 'base', sides: 6 }]
  const bonus = specs[1]
  const expected = bonus.kind === 'gold' ? 6 : bonus.kind === 'silver' ? 4 : bonus.kind === 'bronze' ? 2 : 0
  if (bonus.sides !== expected) return [{ kind: 'base', sides: 6 }]
  return [{ kind: 'base', sides: 6 }, { ...bonus }]
}

function nextDice(snapshot: BoardMovementSnapshot, specs: readonly BoardDieSpec[]): BoardDieRoll[] {
  const rng = createRng(snapshot.seed)
  const consumed = snapshot.moves.reduce((count, move) => count + move.dice.length, 0)
  for (let index = 0; index < consumed; index++) rng()
  return specs.map((spec) => ({ ...spec, value: Math.floor(rng() * spec.sides) + 1 }))
}

function acceptRoll(playerId: string, sessionId: string, actionId: string): void {
  const current = ensureHostSession()
  if (
    !current ||
    current.sessionId !== sessionId ||
    activeBoardPlayer(current) !== playerId ||
    !isBoardMovementVisualSettled(current)
  ) return
  const specs = validSpecs(diceProvider(playerId, current))
  const next = applyBoardRoll(current, playerId, nextDice(current, specs), actionId)
  if (next === current) return
  adoptSnapshot(next)
  announce(next)
}

function hostPeerId(): string | null {
  const net = getNet()
  if (!net.id) return null
  return [net.id, ...getPeers().map((peer) => peer.id)].sort(comparePlayerIds)[0] ?? null
}

function newActionId(playerId: string): string {
  actionSerial++
  return globalThis.crypto?.randomUUID?.() ?? `${playerId}:${Date.now().toString(36)}:${actionSerial.toString(36)}`
}

export function requestBoardRoll(): void {
  if (!active()) return
  const net = getNet()
  const current = store.get()
  if (net.status !== 'joined' || !net.id || !current.sessionId || !isBoardMovementVisualSettled(current)) return
  const actionId = newActionId(net.id)
  if (net.host) acceptRoll(net.id, current.sessionId, actionId)
  else sendToRoom(encodeBoardMovementMessage({ type: 'roll', sessionId: current.sessionId, actionId }))
}

/** Called by the future minigame/reward coordinator on the host. */
export function resumeBoardMovement(sessionId: string, round: number): boolean {
  const net = getNet()
  const current = store.get()
  if (!net.host || current.sessionId !== sessionId || current.round !== round) return false
  const next = beginNextBoardRound(current, newActionId(net.id ?? 'host'))
  if (next === current) return false
  adoptSnapshot(next)
  announce(next)
  return true
}

export function syncBoardMovementLifecycle(): void {
  const net = getNet()
  if (!active()) {
    resetBoardMovement()
    return
  }
  if (net.status !== 'joined' || !net.id || !net.room) return

  if (net.host) {
    const before = store.get()
    const snapshot = ensureHostSession()
    if (snapshot && snapshot !== before) announce(snapshot)
    return
  }
  sendToRoom(encodeBoardMovementMessage({ type: 'sync' }))
}

export function listenForBoardMovement(): () => void {
  return subscribeRoom((from, payload) => {
    const message = decodeBoardMovementMessage(payload)
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
    const order = getTurnOrder()
    if (message.snapshot.orderSessionId !== order.sessionId || message.snapshot.room !== getNet().room) return
    const current = store.get()
    if (current.sessionId === message.snapshot.sessionId && current.revision >= message.snapshot.revision) return
    adoptSnapshot(message.snapshot)
    if (order.sessionId) acknowledgeTurnOrder(order.sessionId)
  })
}
