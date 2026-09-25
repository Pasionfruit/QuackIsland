import type { BoardMovementSnapshot } from '../../53-board-movement'

export const VOLCANO_VICTORY = {
  maxPlayers: 8,
  maxIdLength: 180,
  maxNameLength: 32,
  maxRoomLength: 16,
  maxTileCount: 256,
} as const

export type VolcanoVictoryPhase = 'idle' | 'won'

export interface VolcanoWinner {
  playerId: string
  name: string
  tileIndex: number
}

export interface VolcanoVictorySnapshot {
  sessionId: string
  boardSessionId: string
  room: string
  revision: number
  boardRound: number
  tileCount: number
  rosterSize: number
  phase: VolcanoVictoryPhase
  winner: VolcanoWinner | null
}

export const EMPTY_VOLCANO_VICTORY: VolcanoVictorySnapshot = {
  sessionId: '',
  boardSessionId: '',
  room: '',
  revision: 0,
  boardRound: 0,
  tileCount: 0,
  rosterSize: 0,
  phase: 'idle',
  winner: null,
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

export function volcanoWinner(board: Readonly<BoardMovementSnapshot>): VolcanoWinner | null {
  if (
    board.phase !== 'won' ||
    !board.sessionId ||
    !board.room ||
    !board.winnerId ||
    board.players.length < 1 ||
    board.players.length > VOLCANO_VICTORY.maxPlayers ||
    !Number.isSafeInteger(board.tileCount) ||
    board.tileCount < 2 ||
    board.tileCount > VOLCANO_VICTORY.maxTileCount
  ) return null

  const player = board.players.find((candidate) => candidate.id === board.winnerId)
  const position = board.positions.find((candidate) => candidate.playerId === board.winnerId)
  if (!player || !position || position.tileIndex !== board.tileCount - 1) return null
  return { playerId: player.id, name: player.name, tileIndex: position.tileIndex }
}

export function createVolcanoVictory(
  board: Readonly<BoardMovementSnapshot>,
  visualSettled: boolean,
): VolcanoVictorySnapshot | null {
  const winner = visualSettled ? volcanoWinner(board) : null
  if (!winner || !board.sessionId || !board.room) return null
  return {
    sessionId: `${board.sessionId}:victory`,
    boardSessionId: board.sessionId,
    room: board.room,
    revision: 1,
    boardRound: board.round,
    tileCount: board.tileCount,
    rosterSize: board.players.length,
    phase: 'won',
    winner,
  }
}

export function isVolcanoVictorySnapshot(value: unknown): value is VolcanoVictorySnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Record<string, unknown>
  if (snapshot.phase !== 'won') return false
  if (!boundedString(snapshot.sessionId, VOLCANO_VICTORY.maxIdLength)) return false
  if (!boundedString(snapshot.boardSessionId, VOLCANO_VICTORY.maxIdLength)) return false
  if (snapshot.sessionId !== `${snapshot.boardSessionId}:victory`) return false
  if (!boundedString(snapshot.room, VOLCANO_VICTORY.maxRoomLength)) return false
  if (snapshot.revision !== 1) return false
  if (!Number.isSafeInteger(snapshot.boardRound) || (snapshot.boardRound as number) < 1) return false
  if (
    !Number.isSafeInteger(snapshot.tileCount) ||
    (snapshot.tileCount as number) < 2 ||
    (snapshot.tileCount as number) > VOLCANO_VICTORY.maxTileCount
  ) return false
  if (
    !Number.isSafeInteger(snapshot.rosterSize) ||
    (snapshot.rosterSize as number) < 1 ||
    (snapshot.rosterSize as number) > VOLCANO_VICTORY.maxPlayers
  ) return false
  if (!snapshot.winner || typeof snapshot.winner !== 'object') return false
  const winner = snapshot.winner as Record<string, unknown>
  return (
    boundedString(winner.playerId, VOLCANO_VICTORY.maxIdLength) &&
    boundedString(winner.name, VOLCANO_VICTORY.maxNameLength) &&
    winner.tileIndex === (snapshot.tileCount as number) - 1
  )
}
