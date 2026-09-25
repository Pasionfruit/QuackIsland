import type { TurnOrderSnapshot } from '../../52-turn-order'

export const BOARD_MOVEMENT = {
  minPlayers: 2,
  maxPlayers: 8,
  baseDieSides: 6,
  maxDice: 2,
  maxActionHistory: 256,
  maxMoves: 2048,
  tilesPerSecond: 3,
} as const

export const BOARD_LANDING_EFFECT = {
  maxShift: 12,
  maxIdLength: 48,
  maxLabelLength: 64,
} as const

export type BoardMovementPhase = 'idle' | 'turn' | 'round_complete' | 'won' | 'invalid'
export type BoardDieKind = 'base' | 'gold' | 'silver' | 'bronze'
export type BoardDieSides = 2 | 4 | 6

export interface BoardPlayer {
  id: string
  name: string
}

export interface BoardPosition {
  playerId: string
  tileIndex: number
}

export interface BoardDieSpec {
  kind: BoardDieKind
  sides: BoardDieSides
}

export interface BoardDieRoll extends BoardDieSpec {
  value: number
}

export interface BoardMove {
  playerId: string
  round: number
  fromTile: number
  toTile: number
  dice: readonly BoardDieRoll[]
  total: number
}

export interface BoardLandingContext {
  sessionId: string
  playerId: string
  round: number
  moveNumber: number
  fromTile: number
  landingTile: number
  tileCount: number
}

export interface BoardLandingEffect {
  id: string
  label: string
  moveBy: number
}

export type BoardLandingEffectResolver = (
  context: Readonly<BoardLandingContext>,
  snapshot: Readonly<BoardMovementSnapshot>,
) => BoardLandingEffect | null

export interface BoardMovementSnapshot {
  sessionId: string | null
  orderSessionId: string | null
  room: string | null
  seed: number
  revision: number
  phase: BoardMovementPhase
  round: number
  tileCount: number
  players: readonly BoardPlayer[]
  turnOrder: readonly string[]
  activeTurnIndex: number | null
  positions: readonly BoardPosition[]
  moves: readonly BoardMove[]
  winnerId: string | null
  appliedActionIds: readonly string[]
  error: string | null
}

export const EMPTY_BOARD_MOVEMENT: BoardMovementSnapshot = {
  sessionId: null,
  orderSessionId: null,
  room: null,
  seed: 0,
  revision: 0,
  phase: 'idle',
  round: 0,
  tileCount: 0,
  players: [],
  turnOrder: [],
  activeTurnIndex: null,
  positions: [],
  moves: [],
  winnerId: null,
  appliedActionIds: [],
  error: null,
}

export function createBoardMovement(
  order: TurnOrderSnapshot,
  seed: number,
  tileCount: number,
): BoardMovementSnapshot {
  const orderIds = order.turnOrder ?? []
  const players = orderIds
    .map((id) => order.players.find((player) => player.id === id))
    .filter((player): player is BoardPlayer => Boolean(player))
    .map((player) => ({ id: player.id, name: player.name }))
  const unique = new Set(orderIds)
  const valid =
    order.phase === 'complete' &&
    Boolean(order.sessionId && order.room) &&
    Number.isInteger(tileCount) &&
    tileCount >= 2 &&
    players.length >= BOARD_MOVEMENT.minPlayers &&
    players.length <= BOARD_MOVEMENT.maxPlayers &&
    players.length === orderIds.length &&
    unique.size === orderIds.length

  return {
    sessionId: order.sessionId ? `board:${order.sessionId}` : null,
    orderSessionId: order.sessionId,
    room: order.room,
    seed: seed >>> 0,
    revision: 1,
    phase: valid ? 'turn' : 'invalid',
    round: valid ? 1 : 0,
    tileCount: Number.isInteger(tileCount) && tileCount >= 2 ? tileCount : 0,
    players,
    turnOrder: [...orderIds],
    activeTurnIndex: valid ? 0 : null,
    positions: players.map((player) => ({ playerId: player.id, tileIndex: 0 })),
    moves: [],
    winnerId: null,
    appliedActionIds: [],
    error: valid ? null : 'Board movement needs a completed order for 2-8 players and at least two tiles.',
  }
}

export function activeBoardPlayer(snapshot: BoardMovementSnapshot): string | null {
  if (snapshot.phase !== 'turn' || snapshot.activeTurnIndex === null) return null
  return snapshot.turnOrder[snapshot.activeTurnIndex] ?? null
}

export function boardPosition(snapshot: BoardMovementSnapshot, playerId: string): number | null {
  return snapshot.positions.find((position) => position.playerId === playerId)?.tileIndex ?? null
}

export function boardLandingContext(snapshot: Readonly<BoardMovementSnapshot>): BoardLandingContext | null {
  if (
    !snapshot.sessionId ||
    (snapshot.phase !== 'turn' && snapshot.phase !== 'round_complete') ||
    snapshot.moves.length < 1
  ) return null
  const move = snapshot.moves[snapshot.moves.length - 1]
  if (move.round !== snapshot.round) return null
  const position = boardPosition(snapshot, move.playerId)
  if (position !== move.toTile) return null
  return {
    sessionId: snapshot.sessionId,
    playerId: move.playerId,
    round: move.round,
    moveNumber: snapshot.moves.length,
    fromTile: move.fromTile,
    landingTile: move.toTile,
    tileCount: snapshot.tileCount,
  }
}

export function validBoardLandingEffect(effect: unknown): effect is BoardLandingEffect {
  if (!effect || typeof effect !== 'object') return false
  const candidate = effect as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    candidate.id.length <= BOARD_LANDING_EFFECT.maxIdLength &&
    typeof candidate.label === 'string' &&
    candidate.label.length > 0 &&
    candidate.label.length <= BOARD_LANDING_EFFECT.maxLabelLength &&
    Number.isInteger(candidate.moveBy) &&
    (candidate.moveBy as number) !== 0 &&
    Math.abs(candidate.moveBy as number) <= BOARD_LANDING_EFFECT.maxShift
  )
}

export function applyBoardLandingEffect(
  snapshot: BoardMovementSnapshot,
  effect: BoardLandingEffect | null,
  actionId: string,
): BoardMovementSnapshot {
  const context = boardLandingContext(snapshot)
  if (!context || !validBoardLandingEffect(effect)) return snapshot
  if (!actionId || actionId.length > 80 || snapshot.appliedActionIds.includes(actionId)) return snapshot
  const destination = Math.max(0, Math.min(snapshot.tileCount - 1, context.landingTile + effect.moveBy))
  if (destination === context.landingTile) return snapshot
  const positions = snapshot.positions.map((position) =>
    position.playerId === context.playerId ? { ...position, tileIndex: destination } : position,
  )
  const won = destination === snapshot.tileCount - 1
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    phase: won ? 'won' : snapshot.phase,
    activeTurnIndex: won ? null : snapshot.activeTurnIndex,
    positions,
    winnerId: won ? context.playerId : snapshot.winnerId,
    appliedActionIds: [...snapshot.appliedActionIds, actionId].slice(-BOARD_MOVEMENT.maxActionHistory),
  }
}

export function validBoardDice(dice: readonly BoardDieRoll[]): boolean {
  if (dice.length < 1 || dice.length > BOARD_MOVEMENT.maxDice) return false
  if (dice[0].kind !== 'base' || dice[0].sides !== BOARD_MOVEMENT.baseDieSides) return false
  const bonusKinds = new Set<BoardDieKind>()
  for (const die of dice) {
    if (!Number.isInteger(die.value) || die.value < 1 || die.value > die.sides) return false
    if (die.sides !== 2 && die.sides !== 4 && die.sides !== 6) return false
    if (die.kind !== 'base') {
      if (bonusKinds.has(die.kind)) return false
      bonusKinds.add(die.kind)
    }
  }
  return dice.filter((die) => die.kind === 'base').length === 1
}

export function applyBoardRoll(
  snapshot: BoardMovementSnapshot,
  playerId: string,
  dice: readonly BoardDieRoll[],
  actionId: string,
): BoardMovementSnapshot {
  if (snapshot.phase !== 'turn' || activeBoardPlayer(snapshot) !== playerId) return snapshot
  const activeTurnIndex = snapshot.activeTurnIndex
  if (activeTurnIndex === null) return snapshot
  if (!validBoardDice(dice)) return snapshot
  if (!actionId || actionId.length > 80 || snapshot.appliedActionIds.includes(actionId)) return snapshot

  const fromTile = boardPosition(snapshot, playerId)
  if (fromTile === null) return snapshot
  const total = dice.reduce((sum, die) => sum + die.value, 0)
  const toTile = Math.min(snapshot.tileCount - 1, fromTile + total)
  const positions = snapshot.positions.map((position) =>
    position.playerId === playerId ? { ...position, tileIndex: toTile } : position,
  )
  const moves = [
    ...snapshot.moves,
    { playerId, round: snapshot.round, fromTile, toTile, dice: dice.map((die) => ({ ...die })), total },
  ].slice(-BOARD_MOVEMENT.maxMoves)
  const appliedActionIds = [...snapshot.appliedActionIds, actionId].slice(-BOARD_MOVEMENT.maxActionHistory)
  const won = toTile === snapshot.tileCount - 1
  const lastTurn = activeTurnIndex === snapshot.turnOrder.length - 1

  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    phase: won ? 'won' : lastTurn ? 'round_complete' : 'turn',
    activeTurnIndex: won || lastTurn ? null : activeTurnIndex + 1,
    positions,
    moves,
    winnerId: won ? playerId : null,
    appliedActionIds,
  }
}

export function beginNextBoardRound(
  snapshot: BoardMovementSnapshot,
  actionId: string,
): BoardMovementSnapshot {
  if (snapshot.phase !== 'round_complete') return snapshot
  if (!actionId || actionId.length > 80 || snapshot.appliedActionIds.includes(actionId)) return snapshot
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    phase: 'turn',
    round: snapshot.round + 1,
    activeTurnIndex: 0,
    appliedActionIds: [...snapshot.appliedActionIds, actionId].slice(-BOARD_MOVEMENT.maxActionHistory),
  }
}

export function reconcileBoardPlayers(
  snapshot: BoardMovementSnapshot,
  connectedPlayerIds: readonly string[],
): BoardMovementSnapshot {
  if (snapshot.phase !== 'turn') return snapshot
  const connected = new Set(connectedPlayerIds)
  const players = snapshot.players.filter((player) => connected.has(player.id))
  if (players.length === snapshot.players.length) return snapshot

  const kept = new Set(players.map((player) => player.id))
  const turnOrder = snapshot.turnOrder.filter((id) => kept.has(id))
  const positions = snapshot.positions.filter((position) => kept.has(position.playerId))
  const moves = snapshot.moves.filter((move) => kept.has(move.playerId))
  if (players.length < BOARD_MOVEMENT.minPlayers) {
    return {
      ...snapshot,
      revision: snapshot.revision + 1,
      phase: 'invalid',
      players,
      turnOrder,
      positions,
      moves,
      activeTurnIndex: null,
      error: `Volcano Island needs ${BOARD_MOVEMENT.minPlayers}-${BOARD_MOVEMENT.maxPlayers} connected players.`,
    }
  }

  const moved = new Set(moves.filter((move) => move.round === snapshot.round).map((move) => move.playerId))
  const activeTurnIndex = turnOrder.findIndex((id) => !moved.has(id))
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    phase: activeTurnIndex < 0 ? 'round_complete' : 'turn',
    players,
    turnOrder,
    positions,
    moves,
    activeTurnIndex: activeTurnIndex < 0 ? null : activeTurnIndex,
  }
}

export function canAcknowledgeBoardRound(
  snapshot: BoardMovementSnapshot,
  sessionId: string,
  round: number,
): boolean {
  return snapshot.phase === 'round_complete' && snapshot.sessionId === sessionId && snapshot.round === round
}
