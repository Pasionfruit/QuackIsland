import {
  TURN_ORDER,
  type DieValue,
  type TurnOrderPhase,
  type TurnOrderPlayer,
  type TurnOrderRoll,
  type TurnOrderSnapshot,
} from './rules'

export const TURN_ORDER_WIRE = 'turn-order/v1'

export type TurnOrderMessage =
  | { type: 'sync' }
  | { type: 'roll'; sessionId: string; actionId: string }
  | { type: 'snapshot'; snapshot: TurnOrderSnapshot }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function shortString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function phase(value: unknown): value is TurnOrderPhase {
  return value === 'idle' || value === 'rolling' || value === 'complete' || value === 'invalid'
}

function player(value: unknown): TurnOrderPlayer | null {
  if (!record(value) || !shortString(value.id, 32) || typeof value.name !== 'string' || value.name.length > 32) {
    return null
  }
  return { id: value.id, name: value.name }
}

function roll(value: unknown): TurnOrderRoll | null {
  if (!record(value) || !shortString(value.playerId, 32)) return null
  if (!integer(value.round, 1, 32) || !integer(value.value, 1, TURN_ORDER.dieSides)) return null
  return { playerId: value.playerId, round: value.round, value: value.value as DieValue }
}

function uniqueStrings(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null
  const strings: string[] = []
  for (const item of value) {
    if (!shortString(item, 80) || strings.includes(item)) return null
    strings.push(item)
  }
  return strings
}

export function decodeTurnOrderSnapshot(value: unknown): TurnOrderSnapshot | null {
  if (!record(value)) return null
  if (!shortString(value.sessionId, 128) || !shortString(value.room, 16)) return null
  if (!integer(value.seed, 0, 0xffffffff) || !integer(value.revision, 1, Number.MAX_SAFE_INTEGER)) return null
  if (!phase(value.phase) || value.phase === 'idle') return null
  if (!Array.isArray(value.players) || value.players.length > 16) return null
  if (!Array.isArray(value.rolls) || value.rolls.length > 256) return null

  const players = value.players.map(player)
  const rolls = value.rolls.map(roll)
  if (players.some((entry) => entry === null) || rolls.some((entry) => entry === null)) return null

  const roster = players as TurnOrderPlayer[]
  const rosterIds = new Set(roster.map((entry) => entry.id))
  if (rosterIds.size !== roster.length) return null

  const pendingPlayerIds = uniqueStrings(value.pendingPlayerIds, TURN_ORDER.maxPlayers)
  const appliedActionIds = uniqueStrings(value.appliedActionIds, TURN_ORDER.maxActionHistory)
  if (!pendingPlayerIds || !appliedActionIds || pendingPlayerIds.some((id) => !rosterIds.has(id))) return null

  let turnOrder: string[] | null = null
  if (value.turnOrder !== null) {
    turnOrder = uniqueStrings(value.turnOrder, TURN_ORDER.maxPlayers)
    if (!turnOrder || turnOrder.some((id) => !rosterIds.has(id))) return null
  }
  if (value.error !== null && (typeof value.error !== 'string' || value.error.length > 160)) return null

  return {
    sessionId: value.sessionId,
    room: value.room,
    seed: value.seed,
    revision: value.revision,
    phase: value.phase,
    players: roster,
    pendingPlayerIds,
    rolls: rolls as TurnOrderRoll[],
    turnOrder,
    appliedActionIds,
    error: value.error as string | null,
  }
}

export function encodeTurnOrderMessage(message: TurnOrderMessage): Record<string, unknown> {
  return { channel: TURN_ORDER_WIRE, ...message }
}

export function decodeTurnOrderMessage(value: Record<string, unknown>): TurnOrderMessage | null {
  if (value.channel !== TURN_ORDER_WIRE) return null
  if (value.type === 'sync') return { type: 'sync' }
  if (value.type === 'roll') {
    if (!shortString(value.sessionId, 128) || !shortString(value.actionId, 80)) return null
    return { type: 'roll', sessionId: value.sessionId, actionId: value.actionId }
  }
  if (value.type === 'snapshot') {
    const snapshot = decodeTurnOrderSnapshot(value.snapshot)
    return snapshot ? { type: 'snapshot', snapshot } : null
  }
  return null
}
