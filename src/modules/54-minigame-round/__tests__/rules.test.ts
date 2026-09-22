import { describe, expect, it } from 'vitest'
import type { MinigameId, Standing } from '../../15-minigames'
import type { BoardMovementSnapshot } from '../../53-board-movement'
import {
  beginMinigameAttempt,
  canAcknowledgeMinigameRound,
  createMinigameRound,
  eligibleFreeForAll,
  finishFinalMinigame,
  isMinigameRoundSnapshot,
  requestRewardHandoff,
} from '../internal/rules'

function board(playerCount = 2): BoardMovementSnapshot {
  const players = Array.from({ length: playerCount }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
  }))
  return {
    sessionId: 'board-session',
    orderSessionId: 'order-session',
    room: 'ABCD',
    seed: 1337,
    revision: 8,
    phase: 'round_complete',
    round: 1,
    tileCount: 120,
    players,
    turnOrder: players.map((player) => player.id),
    activeTurnIndex: players.length,
    positions: players.map((player) => ({ playerId: player.id, tileIndex: 4 })),
    moves: [],
    winnerId: '',
    appliedActionIds: [],
    error: '',
  }
}

function standing(id: string, place: number): Standing {
  return { id, place, name: id, colour: '#fff', mine: id === 'p1' }
}

const games = ['zombie-tag', 'messy-maze', 'reserved-41'] as MinigameId[]

describe('minigame round rules', () => {
  it('selects deterministically from built free-for-all games only', () => {
    expect(eligibleFreeForAll(games)).toEqual(['messy-maze', 'zombie-tag'])
    const first = createMinigameRound(board(), games)
    const second = createMinigameRound(board(), [...games].reverse())
    expect(first.phase).toBe('briefing')
    expect(first.minigameId).toBe(second.minigameId)
    expect(first.players).toHaveLength(2)
    expect(isMinigameRoundSnapshot(first)).toBe(true)
  })

  it('supports a locked eight-player roster', () => {
    const created = createMinigameRound(board(8), games)
    expect(created.players).toHaveLength(8)
    expect(created.sessionId).toBe('board-session:minigame:1')
  })

  it('allows repeated practice before one irreversible final attempt', () => {
    const created = createMinigameRound(board(), games)
    const practiceOne = beginMinigameAttempt(created, 'practice', 'practice-1')
    const practiceTwo = beginMinigameAttempt(practiceOne, 'practice', 'practice-2')
    const final = beginMinigameAttempt(practiceTwo, 'final', 'final-1')
    expect(practiceTwo.practiceAttempts).toBe(2)
    expect(final.phase).toBe('final')
    expect(beginMinigameAttempt(final, 'practice', 'too-late')).toBe(final)
    expect(beginMinigameAttempt(final, 'final', 'another-final')).toBe(final)
  })

  it('publishes host-ranked final placements exactly once', () => {
    const created = createMinigameRound(board(), games)
    const final = beginMinigameAttempt(created, 'final', 'final')
    const complete = finishFinalMinigame(final, [standing('p2', 1), standing('p1', 2)], 'finish')
    expect(complete.phase).toBe('complete')
    expect(complete.placements).toEqual([
      { playerId: 'p1', name: 'Player 1', rank: 2 },
      { playerId: 'p2', name: 'Player 2', rank: 1 },
    ])
    expect(finishFinalMinigame(complete, [standing('p1', 1), standing('p2', 2)], 'again')).toBe(complete)
    expect(canAcknowledgeMinigameRound(complete, complete.sessionId)).toBe(true)
    expect(canAcknowledgeMinigameRound(complete, 'stale')).toBe(false)
  })

  it('records one explicit host handoff after final placements', () => {
    const created = createMinigameRound(board(), games)
    const final = beginMinigameAttempt(created, 'final', 'final')
    const complete = finishFinalMinigame(final, [standing('p1', 1), standing('p2', 2)], 'finish')
    const continued = requestRewardHandoff(complete, 'continue')
    expect(continued).toMatchObject({
      phase: 'complete',
      continueRequested: true,
      revision: complete.revision + 1,
    })
    expect(requestRewardHandoff(continued, 'continue-again')).toBe(continued)
    expect(requestRewardHandoff(final, 'too-early')).toBe(final)
    expect(isMinigameRoundSnapshot(continued)).toBe(true)
  })

  it('gives no podium rank when everybody ties', () => {
    const created = createMinigameRound(board(), games)
    const final = beginMinigameAttempt(created, 'final', 'final')
    const complete = finishFinalMinigame(final, [standing('p1', 1), standing('p2', 1)], 'finish')
    expect(complete.placements.map((placement) => placement.rank)).toEqual([0, 0])
  })

  it('places a disconnected or omitted player after the submitted field', () => {
    const created = createMinigameRound(board(3), games)
    const final = beginMinigameAttempt(created, 'final', 'final')
    const complete = finishFinalMinigame(final, [standing('p2', 1), standing('p1', 2)], 'finish')
    expect(complete.placements.find((placement) => placement.playerId === 'p3')?.rank).toBe(3)
  })

  it('rejects an unfinished board and an empty playable catalogue', () => {
    expect(createMinigameRound({ ...board(), phase: 'turn' }, games).phase).toBe('invalid')
    expect(createMinigameRound(board(), []).error).toMatch(/No built/)
  })
})
