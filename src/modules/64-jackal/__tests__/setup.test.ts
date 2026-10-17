import { describe, expect, it } from 'vitest'
import { oneVsAllProblems } from '../../68-minigame-kit'
import { sniperOf } from '../internal/rules'
import { gameRoster, newRound, nextSeed, waitingRound } from '../internal/setup'

describe('the joining placeholder', () => {
  it('waits for the host without treating its empty roster as a finished round', () => {
    const round = waitingRound()
    expect(round.players).toEqual([])
    expect(round.over).toBe(false)
    expect(round.winner).toBeNull()
  })
})

describe('the one-vs-all base case', () => {
  it('is dealt the way every one-vs-all game is', () => {
    const kit = { newRound, waitingRound, nextSeed, roster: gameRoster }
    expect(oneVsAllProblems(kit, sniperOf, (round) => round.players)).toEqual([])
  })
})
