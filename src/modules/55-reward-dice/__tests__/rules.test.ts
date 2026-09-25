import { describe, expect, it } from 'vitest'
import type { BoardMovementSnapshot } from '../../53-board-movement'
import type { MinigameRoundSnapshot } from '../../54-minigame-round'
import {
  bonusForRank,
  createRewardDice,
  isRewardDiceSnapshot,
  returnRewardDice,
  rewardDiceForPlayer,
} from '../internal/rules'

function minigame(ranks = [1, 2, 3, 4]): MinigameRoundSnapshot {
  const players = ranks.map((rank, index) => ({ id: `p${index + 1}`, name: `Player ${index + 1}`, rank }))
  return {
    sessionId: 'board:order:minigame:3',
    boardSessionId: 'board:order',
    room: 'ROOM',
    seed: 1337,
    revision: 5,
    boardRound: 3,
    phase: 'complete',
    minigameId: 'zombie-tag',
    players: players.map(({ id, name }) => ({ id, name })),
    practiceAttempts: 1,
    continueRequested: true,
    placements: players.map(({ id, name, rank }) => ({ playerId: id, name, rank })),
    appliedActionIds: ['final', 'continue'],
    error: '',
  }
}

function board(round: number): BoardMovementSnapshot {
  return {
    sessionId: 'board:order',
    orderSessionId: 'order',
    room: 'ROOM',
    seed: 1337,
    revision: 8,
    phase: 'turn',
    round,
    tileCount: 120,
    players: [],
    turnOrder: [],
    activeTurnIndex: 0,
    positions: [],
    moves: [],
    winnerId: null,
    appliedActionIds: [],
    error: null,
  }
}

describe('reward dice rules', () => {
  it('maps podium ranks to one additional typed die', () => {
    expect(bonusForRank(1)).toEqual({ kind: 'gold', sides: 6 })
    expect(bonusForRank(2)).toEqual({ kind: 'silver', sides: 4 })
    expect(bonusForRank(3)).toEqual({ kind: 'bronze', sides: 2 })
    expect(bonusForRank(4)).toBeNull()
    expect(bonusForRank(0)).toBeNull()

    const reward = createRewardDice(minigame())
    expect(reward.phase).toBe('reveal')
    expect(reward.targetBoardRound).toBe(4)
    expect(reward.assignments.map((assignment) => assignment.bonus?.kind ?? 'base')).toEqual([
      'gold', 'silver', 'bronze', 'base',
    ])
    expect(isRewardDiceSnapshot(reward)).toBe(true)
  })

  it('gives tied podium players the same bonus and all-tied players no bonus', () => {
    const tied = createRewardDice(minigame([1, 1, 3]))
    expect(tied.assignments.map((assignment) => assignment.bonus?.kind ?? 'base')).toEqual([
      'gold', 'gold', 'bronze',
    ])
    const allTied = createRewardDice(minigame([0, 0, 0]))
    expect(allTied.assignments.every((assignment) => assignment.bonus === null)).toBe(true)
  })

  it('applies bonuses only to the immediately following board round', () => {
    const reward = createRewardDice(minigame())
    expect(rewardDiceForPlayer(reward, 'p1', board(3))).toEqual([{ kind: 'base', sides: 6 }])
    expect(rewardDiceForPlayer(reward, 'p1', board(4))).toEqual([
      { kind: 'base', sides: 6 },
      { kind: 'gold', sides: 6 },
    ])
    expect(rewardDiceForPlayer(reward, 'p4', board(4))).toEqual([{ kind: 'base', sides: 6 }])
    expect(rewardDiceForPlayer(reward, 'p1', board(5))).toEqual([{ kind: 'base', sides: 6 }])
  })

  it('returns to the board exactly once', () => {
    const reward = createRewardDice(minigame())
    const returned = returnRewardDice(reward, 'return-1')
    expect(returned).toMatchObject({ phase: 'returned', revision: reward.revision + 1 })
    expect(returnRewardDice(returned, 'return-2')).toBe(returned)
    expect(returnRewardDice(reward, '')).toBe(reward)
  })

  it('supports the full eight-player roster', () => {
    const reward = createRewardDice(minigame([1, 2, 3, 4, 5, 6, 7, 8]))
    expect(reward.assignments).toHaveLength(8)
    expect(isRewardDiceSnapshot(reward)).toBe(true)
  })

  it('rejects rewards before the host continues', () => {
    const reward = createRewardDice({ ...minigame(), continueRequested: false })
    expect(reward.phase).toBe('invalid')
    expect(isRewardDiceSnapshot(reward)).toBe(true)
  })
})
