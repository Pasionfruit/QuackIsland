import { describe, expect, it } from 'vitest'
import { waitingRound } from '../internal/setup'

describe('the joining placeholder', () => {
  it('waits for the host without treating its empty roster as a finished round', () => {
    const round = waitingRound()
    expect(round.players).toEqual([])
    expect(round.over).toBe(false)
    expect(round.winner).toBeNull()
  })
})
