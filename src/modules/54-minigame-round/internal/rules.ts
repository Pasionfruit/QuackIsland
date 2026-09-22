import { createRng, hashSeed } from '../../00-core'
import {
  isMinigameId,
  minigameById,
  minigamesOfKind,
  rankStandings,
  type MinigameId,
  type Standing,
} from '../../15-minigames'
import type { BoardMovementSnapshot } from '../../53-board-movement'

export const MINIGAME_ROUND = {
  minPlayers: 2,
  maxPlayers: 8,
  maxPractices: 99,
  maxActions: 64,
  maxIdLength: 96,
  maxNameLength: 32,
  maxErrorLength: 180,
} as const

export type MinigameRoundPhase =
  | 'idle'
  | 'briefing'
  | 'practice'
  | 'final'
  | 'complete'
  | 'invalid'

export interface MinigameRoundPlayer {
  id: string
  name: string
}

export interface MinigamePlacement {
  playerId: string
  name: string
  /** Zero means the whole field tied, so nobody earned a podium reward. */
  rank: number
}

export interface MinigameRoundSnapshot {
  sessionId: string
  boardSessionId: string
  room: string
  seed: number
  revision: number
  boardRound: number
  phase: MinigameRoundPhase
  minigameId: MinigameId | ''
  players: readonly MinigameRoundPlayer[]
  practiceAttempts: number
  placements: readonly MinigamePlacement[]
  appliedActionIds: readonly string[]
  error: string
}

export const EMPTY_MINIGAME_ROUND: MinigameRoundSnapshot = {
  sessionId: '',
  boardSessionId: '',
  room: '',
  seed: 0,
  revision: 0,
  boardRound: 0,
  phase: 'idle',
  minigameId: '',
  players: [],
  practiceAttempts: 0,
  placements: [],
  appliedActionIds: [],
  error: '',
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function uniquePlayers(players: readonly MinigameRoundPlayer[]): boolean {
  return (
    players.length >= MINIGAME_ROUND.minPlayers &&
    players.length <= MINIGAME_ROUND.maxPlayers &&
    new Set(players.map((player) => player.id)).size === players.length &&
    players.every(
      (player) =>
        boundedString(player.id, MINIGAME_ROUND.maxIdLength) &&
        boundedString(player.name, MINIGAME_ROUND.maxNameLength),
    )
  )
}

export function eligibleFreeForAll(available: readonly MinigameId[]): MinigameId[] {
  const built = new Set(available)
  return minigamesOfKind('free-for-all')
    .filter((game) => !game.reserved && built.has(game.id))
    .map((game) => game.id)
}

export function createMinigameRound(
  board: BoardMovementSnapshot,
  available: readonly MinigameId[],
): MinigameRoundSnapshot {
  const boardSessionId = board.sessionId ?? 'invalid'
  const sessionId = `${boardSessionId}:minigame:${board.round}`
  const seed = hashSeed(board.seed, sessionId)
  const base = {
    ...EMPTY_MINIGAME_ROUND,
    sessionId,
    boardSessionId,
    room: board.room ?? 'offline',
    seed,
    revision: 1,
    boardRound: board.round,
    players: board.players.map(({ id, name }) => ({ id, name })),
  }

  if (board.phase !== 'round_complete' || !uniquePlayers(base.players)) {
    return { ...base, phase: 'invalid', error: 'A completed board round with two to eight players is required.' }
  }

  const choices = eligibleFreeForAll(available)
  if (choices.length === 0) {
    return { ...base, phase: 'invalid', error: 'No built free-for-all minigame is available.' }
  }

  const rng = createRng(seed)
  const minigameId = choices[Math.floor(rng() * choices.length)]
  return { ...base, phase: 'briefing', minigameId }
}

function validActionId(actionId: string): boolean {
  return boundedString(actionId, MINIGAME_ROUND.maxIdLength)
}

function withAction(
  snapshot: MinigameRoundSnapshot,
  actionId: string,
): readonly string[] {
  return [...snapshot.appliedActionIds, actionId].slice(-MINIGAME_ROUND.maxActions)
}

export function beginMinigameAttempt(
  snapshot: MinigameRoundSnapshot,
  kind: 'practice' | 'final',
  actionId: string,
): MinigameRoundSnapshot {
  if (!validActionId(actionId) || snapshot.appliedActionIds.includes(actionId)) return snapshot
  if (snapshot.phase !== 'briefing' && snapshot.phase !== 'practice') return snapshot
  if (kind === 'practice' && snapshot.practiceAttempts >= MINIGAME_ROUND.maxPractices) return snapshot

  return {
    ...snapshot,
    phase: kind,
    revision: snapshot.revision + 1,
    practiceAttempts: snapshot.practiceAttempts + (kind === 'practice' ? 1 : 0),
    placements: [],
    appliedActionIds: withAction(snapshot, actionId),
    error: '',
  }
}

function placementsFor(
  players: readonly MinigameRoundPlayer[],
  standings: readonly Standing[],
): MinigamePlacement[] | null {
  if (standings.length === 0) return null
  const roster = new Map(players.map((player) => [player.id, player]))
  const seen = new Set<string>()
  for (const standing of standings) {
    if (!roster.has(standing.id) || seen.has(standing.id) || !Number.isFinite(standing.place)) return null
    seen.add(standing.id)
  }

  const result = rankStandings(standings)
  const byId = new Map(result.placed.map((placed) => [placed.id, placed.rank]))
  const worstRank = Math.min(players.length, Math.max(0, ...byId.values()) + 1)
  return players.map((player) => ({
    playerId: player.id,
    name: player.name,
    rank: result.allTied ? 0 : (byId.get(player.id) ?? worstRank),
  }))
}

export function finishFinalMinigame(
  snapshot: MinigameRoundSnapshot,
  standings: readonly Standing[],
  actionId: string,
): MinigameRoundSnapshot {
  if (snapshot.phase !== 'final') return snapshot
  if (!validActionId(actionId) || snapshot.appliedActionIds.includes(actionId)) return snapshot
  const placements = placementsFor(snapshot.players, standings)
  if (!placements) return snapshot
  return {
    ...snapshot,
    phase: 'complete',
    revision: snapshot.revision + 1,
    placements,
    appliedActionIds: withAction(snapshot, actionId),
    error: '',
  }
}

export function canAcknowledgeMinigameRound(
  snapshot: MinigameRoundSnapshot,
  sessionId: string,
): boolean {
  return snapshot.phase === 'complete' && snapshot.sessionId === sessionId
}

export function isMinigameRoundSnapshot(value: unknown): value is MinigameRoundSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Record<string, unknown>
  const phases: readonly MinigameRoundPhase[] = ['idle', 'briefing', 'practice', 'final', 'complete', 'invalid']
  if (!phases.includes(snapshot.phase as MinigameRoundPhase)) return false
  if (!boundedString(snapshot.sessionId, MINIGAME_ROUND.maxIdLength)) return false
  if (!boundedString(snapshot.boardSessionId, MINIGAME_ROUND.maxIdLength)) return false
  if (!boundedString(snapshot.room, 16)) return false
  if (!Number.isSafeInteger(snapshot.seed) || (snapshot.seed as number) < 0) return false
  if (!Number.isSafeInteger(snapshot.revision) || (snapshot.revision as number) < 1) return false
  if (!Number.isSafeInteger(snapshot.boardRound) || (snapshot.boardRound as number) < 1) return false
  if (!Number.isSafeInteger(snapshot.practiceAttempts) || (snapshot.practiceAttempts as number) < 0 || (snapshot.practiceAttempts as number) > MINIGAME_ROUND.maxPractices) return false
  if (!Array.isArray(snapshot.players) || !uniquePlayers(snapshot.players as MinigameRoundPlayer[])) return false
  if (!Array.isArray(snapshot.placements) || snapshot.placements.length > MINIGAME_ROUND.maxPlayers) return false
  if (!Array.isArray(snapshot.appliedActionIds) || snapshot.appliedActionIds.length > MINIGAME_ROUND.maxActions) return false
  if (!(snapshot.appliedActionIds as unknown[]).every((id) => boundedString(id, MINIGAME_ROUND.maxIdLength))) return false
  if (typeof snapshot.error !== 'string' || snapshot.error.length > MINIGAME_ROUND.maxErrorLength) return false

  const phase = snapshot.phase as MinigameRoundPhase
  if (phase === 'invalid') {
    if (snapshot.minigameId !== '' || !snapshot.error) return false
  } else if (!isMinigameId(snapshot.minigameId)) return false
  else {
    const game = minigameById(snapshot.minigameId)
    if (game.kind !== 'free-for-all' || game.reserved) return false
  }

  const players = snapshot.players as MinigameRoundPlayer[]
  const roster = new Set(players.map((player) => player.id))
  const placements = snapshot.placements as unknown[]
  if (phase === 'complete' && placements.length !== players.length) return false
  if (phase !== 'complete' && placements.length !== 0) return false
  const placementIds = new Set<string>()
  for (const value of placements) {
    if (!value || typeof value !== 'object') return false
    const placement = value as Record<string, unknown>
    if (!boundedString(placement.playerId, MINIGAME_ROUND.maxIdLength) || !roster.has(placement.playerId)) return false
    if (!boundedString(placement.name, MINIGAME_ROUND.maxNameLength)) return false
    if (!Number.isSafeInteger(placement.rank) || (placement.rank as number) < 0 || (placement.rank as number) > players.length) return false
    if (placementIds.has(placement.playerId)) return false
    placementIds.add(placement.playerId)
  }
  return true
}
