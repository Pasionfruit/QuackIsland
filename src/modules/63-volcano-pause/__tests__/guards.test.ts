import { describe, expect, it } from 'vitest'
import { isVolcanoBoardParty, shouldBlockKey } from '../internal/guards'

describe('Volcano pause guards', () => {
  it('owns Escape only during the board portion of a Volcano Island party', () => {
    expect(isVolcanoBoardParty('playing', 'island', 'closed')).toBe(true)
    expect(isVolcanoBoardParty('gathering', 'island', 'closed')).toBe(false)
    expect(isVolcanoBoardParty('playing', 'garden', 'closed')).toBe(false)
    expect(isVolcanoBoardParty('playing', 'island', 'dashboard')).toBe(false)
  })

  it('absorbs Escape always and movement only while paused', () => {
    expect(shouldBlockKey(false, 'Escape')).toBe(true)
    expect(shouldBlockKey(false, 'KeyW')).toBe(false)
    expect(shouldBlockKey(true, 'KeyW')).toBe(true)
    expect(shouldBlockKey(true, 'KeyQ')).toBe(false)
  })
})
