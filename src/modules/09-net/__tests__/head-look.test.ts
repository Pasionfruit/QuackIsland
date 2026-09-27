import { describe, expect, it } from 'vitest'
import { createTrack, record, sampleTrack } from '../internal/interpolate'
import { decodeMessage, encodeState, type DuckState } from '../internal/protocol'

const state = (headYaw: number, headPitch: number, fall = 0.7): DuckState => ({
  x: 1,
  y: 2,
  z: 3,
  facing: 0,
  lean: 0,
  swimming: false,
  speed: 0,
  headYaw,
  headPitch,
  fall,
  emote: 'mog',
})

describe('networked head look', () => {
  it('keeps the look heading and nod on the wire', () => {
    const decoded = decodeMessage(encodeState('duck', state(0.75, -0.4)))
    expect(decoded?.state.headYaw).toBeCloseTo(0.75, 3)
    expect(decoded?.state.headPitch).toBeCloseTo(-0.4, 3)
    expect(decoded?.state.fall).toBeCloseTo(0.7, 3)
    expect(decoded?.state.emote).toBe('mog')
  })

  it('interpolates a head turn through the short side of north', () => {
    const track = createTrack('duck')
    record(track, 1, state(Math.PI - 0.1, -0.4, 0))
    record(track, 2, state(-Math.PI + 0.1, 0.4, 1))
    const look = sampleTrack(track, 1.62, 0.12)
    expect(Math.abs(look?.headYaw ?? 0)).toBeGreaterThan(3)
    expect(look?.headPitch).toBeCloseTo(0, 3)
    expect(look?.fall).toBeCloseTo(0.5, 3)
  })
})
