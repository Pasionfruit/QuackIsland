/**
 * When the island's music stops: a party game, or a minigame being played.
 */
import { describe, expect, it } from 'vitest'
import { freshRun } from '../../modules/15-minigames'
import { musicStopped } from '../music'

const game = (phase: 'briefing' | 'counting' | 'playing' | 'over', paused = false) => ({
  at: 'game' as const,
  run: { ...freshRun('duck-hunt'), phase, paused },
})

describe('the music', () => {
  it('plays on the island with nothing going on', () => {
    expect(musicStopped('off', { at: 'closed' })).toBe(false)
  })

  it('stops for a party game, as it always has', () => {
    expect(musicStopped('playing', { at: 'closed' })).toBe(true)
  })

  it('keeps playing while browsing the minigames or reading a briefing', () => {
    expect(musicStopped('off', { at: 'dashboard' })).toBe(false)
    expect(musicStopped('gathering', game('briefing'))).toBe(false)
  })

  it('stops from the countdown of a minigame through to its end, paused or not', () => {
    for (const phase of ['counting', 'playing', 'over'] as const) {
      expect(musicStopped('off', game(phase)), phase).toBe(true)
      expect(musicStopped('gathering', game(phase, true)), phase).toBe(true)
    }
  })
})
