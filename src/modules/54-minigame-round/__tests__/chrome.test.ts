import { describe, expect, it } from 'vitest'
import { suppressedIslandControls } from '../internal/chrome'

describe('Volcano Island minigame chrome', () => {
  it('keeps briefing navigation inside the coordinated round', () => {
    expect(suppressedIslandControls('briefing')).toEqual(new Set(['play', 'back']))
  })

  it('keeps final results on the coordinated reward path', () => {
    expect(suppressedIslandControls('over')).toEqual(new Set(['replay', 'minigame dashboard']))
  })
})
