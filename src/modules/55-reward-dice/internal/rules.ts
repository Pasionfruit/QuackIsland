import type { BoardDieSpec, BoardMovementSnapshot } from '../../53-board-movement'
import type { MinigameRoundSnapshot } from '../../54-minigame-round'

export const REWARD_DICE = {
  minPlayers: 2,
  maxPlayers: 8,
  maxActions: 32,
  maxIdLength: 180,
  maxNameLength: 32,
  maxErrorLength: 180,
} as const

export type RewardDicePhase = 'idle' | 'reveal' | 'returned' | 'invalid'
export type RewardBonusKind = 'gold' | 'silver' | 'bronze'

export interface RewardAssignment {
  playerId: string
  name: string
  rank: number
  bonus: BoardDieSpec | null
}

export interface RewardDiceSnapshot {
  sessionId: string
  minigameSessionId: string
  boardSessionId: string
  room: string
  revision: number
  sourceBoardRound: number
  targetBoardRound: number
  phase: RewardDicePhase
  assignments: readonly RewardAssignment[]
  appliedActionIds: readonly string[]
  error: string
}

export const EMPTY_REWARD_DICE: RewardDiceSnapshot = {
  sessionId: '',
  minigameSessionId: '',
  boardSessionId: '',
  room: '',
  revision: 0,
  sourceBoardRound: 0,
  targetBoardRound: 0,
  phase: 'idle',
  assignments: [],
  appliedActionIds: [],
  error: '',
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

export function bonusForRank(rank: number): BoardDieSpec | null {
  if (rank === 1) return { kind: 'gold', sides: 6 }
  if (rank === 2) return { kind: 'silver', sides: 4 }
  if (rank === 3) return { kind: 'bronze', sides: 2 }
  return null
}

export function createRewardDice(minigame: MinigameRoundSnapshot): RewardDiceSnapshot {
  const base: RewardDiceSnapshot = {
    ...EMPTY_REWARD_DICE,
    sessionId: `${minigame.sessionId}:rewards`,
    minigameSessionId: minigame.sessionId,
    boardSessionId: minigame.boardSessionId,
    room: minigame.room,
    revision: 1,
    sourceBoardRound: minigame.boardRound,
    targetBoardRound: minigame.boardRound + 1,
    assignments: minigame.placements.map((placement) => ({
      playerId: placement.playerId,
      name: placement.name,
      rank: placement.rank,
      bonus: bonusForRank(placement.rank),
    })),
  }
  const valid =
    minigame.phase === 'complete' &&
    minigame.continueRequested &&
    base.assignments.length >= REWARD_DICE.minPlayers &&
    base.assignments.length <= REWARD_DICE.maxPlayers &&
    new Set(base.assignments.map((assignment) => assignment.playerId)).size === base.assignments.length
  return valid
    ? { ...base, phase: 'reveal' }
    : { ...base, phase: 'invalid', assignments: [], error: 'Completed synchronized placements are required.' }
}

export function returnRewardDice(snapshot: RewardDiceSnapshot, actionId: string): RewardDiceSnapshot {
  if (snapshot.phase !== 'reveal') return snapshot
  if (!boundedString(actionId, REWARD_DICE.maxIdLength) || snapshot.appliedActionIds.includes(actionId)) return snapshot
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    phase: 'returned',
    appliedActionIds: [...snapshot.appliedActionIds, actionId].slice(-REWARD_DICE.maxActions),
  }
}

export function rewardDiceForPlayer(
  snapshot: RewardDiceSnapshot,
  playerId: string,
  board: Readonly<BoardMovementSnapshot>,
): readonly BoardDieSpec[] {
  const base: BoardDieSpec = { kind: 'base', sides: 6 }
  if (
    (snapshot.phase !== 'reveal' && snapshot.phase !== 'returned') ||
    board.sessionId !== snapshot.boardSessionId ||
    board.round !== snapshot.targetBoardRound
  ) return [base]
  const bonus = snapshot.assignments.find((assignment) => assignment.playerId === playerId)?.bonus
  return bonus ? [base, { ...bonus }] : [base]
}

function validBonus(rank: number, value: unknown): value is BoardDieSpec | null {
  const expected = bonusForRank(rank)
  if (expected === null) return value === null
  if (!value || typeof value !== 'object') return false
  const bonus = value as Record<string, unknown>
  return bonus.kind === expected.kind && bonus.sides === expected.sides
}

export function isRewardDiceSnapshot(value: unknown): value is RewardDiceSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Record<string, unknown>
  const phases: readonly RewardDicePhase[] = ['idle', 'reveal', 'returned', 'invalid']
  if (!phases.includes(snapshot.phase as RewardDicePhase) || snapshot.phase === 'idle') return false
  if (!boundedString(snapshot.sessionId, REWARD_DICE.maxIdLength)) return false
  if (!boundedString(snapshot.minigameSessionId, REWARD_DICE.maxIdLength)) return false
  if (!boundedString(snapshot.boardSessionId, REWARD_DICE.maxIdLength)) return false
  if (!boundedString(snapshot.room, 16)) return false
  if (!Number.isSafeInteger(snapshot.revision) || (snapshot.revision as number) < 1) return false
  if (!Number.isSafeInteger(snapshot.sourceBoardRound) || (snapshot.sourceBoardRound as number) < 1) return false
  if (snapshot.targetBoardRound !== (snapshot.sourceBoardRound as number) + 1) return false
  if (!Array.isArray(snapshot.assignments) || snapshot.assignments.length > REWARD_DICE.maxPlayers) return false
  if (!Array.isArray(snapshot.appliedActionIds) || snapshot.appliedActionIds.length > REWARD_DICE.maxActions) return false
  if (!(snapshot.appliedActionIds as unknown[]).every((id) => boundedString(id, REWARD_DICE.maxIdLength))) return false
  if (typeof snapshot.error !== 'string' || snapshot.error.length > REWARD_DICE.maxErrorLength) return false

  const phase = snapshot.phase as RewardDicePhase
  if (phase === 'invalid') return snapshot.assignments.length === 0 && snapshot.error.length > 0
  if (snapshot.error !== '' || snapshot.assignments.length < REWARD_DICE.minPlayers) return false
  const seen = new Set<string>()
  for (const value of snapshot.assignments as unknown[]) {
    if (!value || typeof value !== 'object') return false
    const assignment = value as Record<string, unknown>
    if (!boundedString(assignment.playerId, REWARD_DICE.maxIdLength) || seen.has(assignment.playerId)) return false
    if (!boundedString(assignment.name, REWARD_DICE.maxNameLength)) return false
    if (!Number.isSafeInteger(assignment.rank) || (assignment.rank as number) < 0 || (assignment.rank as number) > REWARD_DICE.maxPlayers) return false
    if (!validBonus(assignment.rank as number, assignment.bonus)) return false
    seen.add(assignment.playerId)
  }
  return true
}
