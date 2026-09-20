export const TURN_ORDER = {
  minPlayers: 2,
  maxPlayers: 8,
  dieSides: 6,
  maxActionHistory: 128,
} as const

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6
export type TurnOrderPhase = 'idle' | 'rolling' | 'complete' | 'invalid'

export interface TurnOrderPlayer {
  id: string
  name: string
}

export interface TurnOrderRoll {
  playerId: string
  round: number
  value: DieValue
}

export interface TurnOrderSnapshot {
  sessionId: string | null
  room: string | null
  seed: number
  revision: number
  phase: TurnOrderPhase
  players: readonly TurnOrderPlayer[]
  pendingPlayerIds: readonly string[]
  rolls: readonly TurnOrderRoll[]
  turnOrder: readonly string[] | null
  appliedActionIds: readonly string[]
  error: string | null
}

export const EMPTY_TURN_ORDER: TurnOrderSnapshot = {
  sessionId: null,
  room: null,
  seed: 0,
  revision: 0,
  phase: 'idle',
  players: [],
  pendingPlayerIds: [],
  rolls: [],
  turnOrder: null,
  appliedActionIds: [],
  error: null,
}

export function comparePlayerIds(a: string, b: string): number {
  const an = /^p(\d+)$/.exec(a)
  const bn = /^p(\d+)$/.exec(b)
  if (an && bn) return Number(an[1]) - Number(bn[1])
  return a.localeCompare(b)
}

export function createTurnOrder(
  sessionId: string,
  room: string,
  seed: number,
  players: readonly TurnOrderPlayer[],
): TurnOrderSnapshot {
  const unique = new Map<string, TurnOrderPlayer>()
  for (const player of players) {
    if (!unique.has(player.id)) unique.set(player.id, { ...player })
  }
  const roster = [...unique.values()].sort((a, b) => comparePlayerIds(a.id, b.id))
  const valid = roster.length >= TURN_ORDER.minPlayers && roster.length <= TURN_ORDER.maxPlayers

  return {
    sessionId,
    room,
    seed: seed >>> 0,
    revision: 1,
    phase: valid ? 'rolling' : 'invalid',
    players: roster,
    pendingPlayerIds: valid ? roster.map((player) => player.id) : [],
    rolls: [],
    turnOrder: null,
    appliedActionIds: [],
    error: valid ? null : `Volcano Island needs ${TURN_ORDER.minPlayers}-${TURN_ORDER.maxPlayers} players.`,
  }
}

function historyFor(snapshot: TurnOrderSnapshot, playerId: string): readonly DieValue[] {
  return snapshot.rolls
    .filter((roll) => roll.playerId === playerId)
    .sort((a, b) => a.round - b.round)
    .map((roll) => roll.value)
}

function compareHistories(snapshot: TurnOrderSnapshot, a: string, b: string): number {
  const ah = historyFor(snapshot, a)
  const bh = historyFor(snapshot, b)
  const count = Math.max(ah.length, bh.length)
  for (let index = 0; index < count; index++) {
    const difference = (bh[index] ?? 0) - (ah[index] ?? 0)
    if (difference !== 0) return difference
  }
  return comparePlayerIds(a, b)
}

function settle(snapshot: TurnOrderSnapshot): TurnOrderSnapshot {
  const tied = new Map<string, string[]>()
  for (const player of snapshot.players) {
    const key = historyFor(snapshot, player.id).join(':')
    const group = tied.get(key) ?? []
    group.push(player.id)
    tied.set(key, group)
  }

  const pending = [...tied.values()]
    .filter((group) => group.length > 1)
    .flat()
    .sort((a, b) => compareHistories(snapshot, a, b))

  if (pending.length > 0) {
    return { ...snapshot, phase: 'rolling', pendingPlayerIds: pending, turnOrder: null }
  }

  return {
    ...snapshot,
    phase: 'complete',
    pendingPlayerIds: [],
    turnOrder: snapshot.players.map((player) => player.id).sort((a, b) => compareHistories(snapshot, a, b)),
  }
}

export function applyTurnOrderRoll(
  snapshot: TurnOrderSnapshot,
  playerId: string,
  value: DieValue,
  actionId: string,
): TurnOrderSnapshot {
  if (snapshot.phase !== 'rolling') return snapshot
  if (!snapshot.pendingPlayerIds.includes(playerId)) return snapshot
  if (!Number.isInteger(value) || value < 1 || value > TURN_ORDER.dieSides) return snapshot
  if (!actionId || actionId.length > 80 || snapshot.appliedActionIds.includes(actionId)) return snapshot

  const round = historyFor(snapshot, playerId).length + 1
  const pendingPlayerIds = snapshot.pendingPlayerIds.filter((id) => id !== playerId)
  const next: TurnOrderSnapshot = {
    ...snapshot,
    revision: snapshot.revision + 1,
    pendingPlayerIds,
    rolls: [...snapshot.rolls, { playerId, round, value }],
    appliedActionIds: [...snapshot.appliedActionIds, actionId].slice(-TURN_ORDER.maxActionHistory),
  }
  return pendingPlayerIds.length === 0 ? settle(next) : next
}

/**
 * During order selection, a disconnected relay id is removed instead of
 * blocking every remaining player forever. New ids are never admitted after
 * the roster has been locked.
 */
export function reconcileTurnOrderPlayers(
  snapshot: TurnOrderSnapshot,
  connectedPlayerIds: readonly string[],
): TurnOrderSnapshot {
  if (snapshot.phase !== 'rolling') return snapshot
  const connected = new Set(connectedPlayerIds)
  const players = snapshot.players.filter((player) => connected.has(player.id))
  if (players.length === snapshot.players.length) return snapshot

  const kept = new Set(players.map((player) => player.id))
  const next: TurnOrderSnapshot = {
    ...snapshot,
    revision: snapshot.revision + 1,
    players,
    pendingPlayerIds: snapshot.pendingPlayerIds.filter((id) => kept.has(id)),
    rolls: snapshot.rolls.filter((roll) => kept.has(roll.playerId)),
  }

  if (players.length < TURN_ORDER.minPlayers) {
    return {
      ...next,
      phase: 'invalid',
      pendingPlayerIds: [],
      turnOrder: null,
      error: `Volcano Island needs ${TURN_ORDER.minPlayers}-${TURN_ORDER.maxPlayers} players.`,
    }
  }
  return next.pendingPlayerIds.length === 0 ? settle(next) : next
}

export function rollsFor(snapshot: TurnOrderSnapshot, playerId: string): readonly TurnOrderRoll[] {
  return snapshot.rolls
    .filter((roll) => roll.playerId === playerId)
    .sort((a, b) => a.round - b.round)
}

export function canAcknowledgeTurnOrder(snapshot: TurnOrderSnapshot, sessionId: string): boolean {
  return snapshot.phase === 'complete' && snapshot.sessionId === sessionId
}
