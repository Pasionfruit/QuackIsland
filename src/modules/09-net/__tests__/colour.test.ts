import { describe, expect, it } from 'vitest'
import { decodeMessage, encodeState, type DuckState } from '../internal/protocol'

const still: DuckState = { x: 1, y: 2, z: 3, facing: 0, lean: 0, swimming: false, speed: 0 }

describe('a duck’s colour on the wire', () => {
  it('arrives as it was sent', () => {
    expect(decodeMessage(encodeState('ann', still, '#3f7fd6'))?.colour).toBe('#3f7fd6')
  })

  it('is left off when there is none, and reads back as the default', () => {
    const raw = encodeState('ann', still)
    expect(raw).not.toContain('"c"')
    expect(decodeMessage(raw)?.colour).toBeNull()
  })

  it('is never anything but a plain hex colour', () => {
    const hostile = JSON.stringify({ t: 'duck', name: 'x', c: 'url(javascript:1)', s: still })
    expect(decodeMessage(hostile)?.colour).toBeNull()
  })
})
