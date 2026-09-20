import {
  BOARD_MOVEMENT,
  validBoardDice,
  type BoardDieKind,
  type BoardDieRoll,
  type BoardMove,
  type BoardMovementPhase,
  type BoardMovementSnapshot,
  type BoardPlayer,
  type BoardPosition,
} from './rules'

export const BOARD_MOVEMENT_WIRE = 'board-movement/v1'

export type BoardMovementMessage =
  | { type: 'sync' }
  | { type: 'roll'; sessionId: string; actionId: string }
  | { type: 'snapshot'; snapshot: BoardMovementSnapshot }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function shortString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function phase(value: unknown): value is BoardMovementPhase {
  return value === 'turn' || value === 'round_complete' || value === 'won' || value === 'invalid'
}

function dieKind(value: unknown): value is BoardDieKind {
  return value === 'base' || value === 'gold' || value === 'silver' || value === 'bronze'
}

function player(value: unknown): BoardPlayer | null {
  if (!record(value) || !shortString(value.id, 32) || typeof value.name !== 'string' || value.name.length > 32) {
    return null
  }
  return { id: value.id, name: value.name }
}

function die(value: unknown): BoardDieRoll | null {
  if (!record(value) || !dieKind(value.kind)) return null
  if ((value.sides !== 2 && value.sides !== 4 && value.sides !== 6) || !integer(value.value, 1, value.sides)) return null
  return { kind: value.kind, sides: value.sides, value: value.value }
}

function position(value: unknown, tileCount: number): BoardPosition | null {
  if (!record(value) || !shortString(value.playerId, 32) || !integer(value.tileIndex, 0, tileCount - 1)) return null
  return { playerId: value.playerId, tileIndex: value.tileIndex }
}

function move(value: unknown, tileCount: number, maxRound: number): BoardMove | null {
  if (!record(value) || !shortString(value.playerId, 32)) return null
  if (!integer(value.round, 1, maxRound) || !integer(value.fromTile, 0, tileCount - 1)) return null
  if (!integer(value.toTile, value.fromTile, tileCount - 1) || !integer(value.total, 1, 12)) return null
  if (!Array.isArray(value.dice) || value.dice.length > BOARD_MOVEMENT.maxDice) return null
  const dice = value.dice.map(die)
  if (dice.some((entry) => entry === null) || !validBoardDice(dice as BoardDieRoll[])) return null
  if ((dice as BoardDieRoll[]).reduce((sum, entry) => sum + entry.value, 0) !== value.total) return null
  return {
    playerId: value.playerId,
    round: value.round,
    fromTile: value.fromTile,
    toTile: value.toTile,
    dice: dice as BoardDieRoll[],
    total: value.total,
  }
}

function uniqueStrings(value: unknown, max: number, maxLength = 80): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null
  const strings: string[] = []
  for (const item of value) {
    if (!shortString(item, maxLength) || strings.includes(item)) return null
    strings.push(item)
  }
  return strings
}

export function decodeBoardMovementSnapshot(value: unknown): BoardMovementSnapshot | null {
  if (!record(value)) return null
  if (!shortString(value.sessionId, 160) || !shortString(value.orderSessionId, 128) || !shortString(value.room, 16)) {
    return null
  }
  if (!integer(value.seed, 0, 0xffffffff) || !integer(value.revision, 1, Number.MAX_SAFE_INTEGER)) return null
  if (!phase(value.phase) || !integer(value.round, 0, 10000) || !integer(value.tileCount, 2, 1000)) return null
  if (!Array.isArray(value.players) || value.players.length > BOARD_MOVEMENT.maxPlayers) return null
  if (!Array.isArray(value.positions) || value.positions.length > BOARD_MOVEMENT.maxPlayers) return null
  if (!Array.isArray(value.moves) || value.moves.length > BOARD_MOVEMENT.maxMoves) return null

  const players = value.players.map(player)
  const positions = value.positions.map((entry) => position(entry, value.tileCount as number))
  const moves = value.moves.map((entry) => move(entry, value.tileCount as number, Math.max(1, value.round as number)))
  if (players.some((entry) => entry === null) || positions.some((entry) => entry === null) || moves.some((entry) => entry === null)) {
    return null
  }

  const roster = players as BoardPlayer[]
  const rosterIds = new Set(roster.map((entry) => entry.id))
  if (rosterIds.size !== roster.length) return null
  const turnOrder = uniqueStrings(value.turnOrder, BOARD_MOVEMENT.maxPlayers, 32)
  const appliedActionIds = uniqueStrings(value.appliedActionIds, BOARD_MOVEMENT.maxActionHistory)
  if (!turnOrder || !appliedActionIds || turnOrder.length !== roster.length) return null
  if (turnOrder.some((id) => !rosterIds.has(id))) return null

  const boardPositions = positions as BoardPosition[]
  if (boardPositions.length !== roster.length || new Set(boardPositions.map((entry) => entry.playerId)).size !== roster.length) {
    return null
  }
  if (boardPositions.some((entry) => !rosterIds.has(entry.playerId))) return null
  if ((moves as BoardMove[]).some((entry) => !rosterIds.has(entry.playerId))) return null

  if (value.activeTurnIndex !== null && !integer(value.activeTurnIndex, 0, Math.max(0, turnOrder.length - 1))) return null
  if (value.winnerId !== null && (!shortString(value.winnerId, 32) || !rosterIds.has(value.winnerId))) return null
  if (value.error !== null && (typeof value.error !== 'string' || value.error.length > 180)) return null

  return {
    sessionId: value.sessionId,
    orderSessionId: value.orderSessionId,
    room: value.room,
    seed: value.seed,
    revision: value.revision,
    phase: value.phase,
    round: value.round,
    tileCount: value.tileCount,
    players: roster,
    turnOrder,
    activeTurnIndex: value.activeTurnIndex as number | null,
    positions: boardPositions,
    moves: moves as BoardMove[],
    winnerId: value.winnerId as string | null,
    appliedActionIds,
    error: value.error as string | null,
  }
}

export function encodeBoardMovementMessage(message: BoardMovementMessage): Record<string, unknown> {
  return { channel: BOARD_MOVEMENT_WIRE, ...message }
}

export function decodeBoardMovementMessage(value: Record<string, unknown>): BoardMovementMessage | null {
  if (value.channel !== BOARD_MOVEMENT_WIRE) return null
  if (value.type === 'sync') return { type: 'sync' }
  if (value.type === 'roll') {
    if (!shortString(value.sessionId, 160) || !shortString(value.actionId, 80)) return null
    return { type: 'roll', sessionId: value.sessionId, actionId: value.actionId }
  }
  if (value.type === 'snapshot') {
    const snapshot = decodeBoardMovementSnapshot(value.snapshot)
    return snapshot ? { type: 'snapshot', snapshot } : null
  }
  return null
}
