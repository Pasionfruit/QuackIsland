import { describe, expect, it } from 'vitest'
import { AUDIO, spatialFor } from '../internal/engine'

const here = { x: 0, z: 0 }
/** Looking down +Z, which is what a heading of zero means everywhere here. */
const north = { x: 0, z: 1 }

describe('hearing another player', () => {
  it('is loudest right next to you', () => {
    expect(spatialFor(here, north, { x: 0, z: 1 }).gain).toBe(1)
    expect(spatialFor(here, north, here).gain).toBe(1)
  })

  it('goes silent past the edge of hearing', () => {
    // A lobby where everyone hears everyone sounds like a stampede.
    expect(spatialFor(here, north, { x: 0, z: AUDIO.hearing + 1 }).gain).toBe(0)
    expect(spatialFor(here, north, { x: 900, z: -900 }).gain).toBe(0)
  })

  it('fades all the way to nothing at the edge, without a step', () => {
    // A sound that is still audible and then abruptly is not draws attention
    // to exactly the thing it is trying to hide.
    const justInside = spatialFor(here, north, { x: 0, z: AUDIO.hearing - 0.01 }).gain
    expect(justInside).toBeGreaterThanOrEqual(0)
    expect(justInside).toBeLessThan(0.01)
  })

  it('gets quieter the further away it is, all the way out', () => {
    let last = Infinity
    for (let d = 0; d <= AUDIO.hearing; d += 0.5) {
      const gain = spatialFor(here, north, { x: 0, z: d }).gain
      expect(gain).toBeLessThanOrEqual(last + 1e-9)
      last = gain
    }
  })

  it('stays at full volume inside arm’s reach', () => {
    expect(spatialFor(here, north, { x: 0, z: AUDIO.intimate }).gain).toBeCloseTo(1, 6)
    expect(spatialFor(here, north, { x: 0, z: AUDIO.intimate * 0.5 }).gain).toBe(1)
  })

  it('never returns a gain outside nothing to full', () => {
    for (let i = 0; i < 500; i++) {
      const source = { x: ((i * 37) % 120) - 60, z: ((i * 53) % 120) - 60 }
      const { gain } = spatialFor(here, north, source)
      expect(gain).toBeGreaterThanOrEqual(0)
      expect(gain).toBeLessThanOrEqual(1)
    }
  })
})

describe('which ear it is in', () => {
  it('puts a duck on your right in your right ear', () => {
    // Screen-right is cross(forward, up), which is (-forward.z, forward.x).
    // This has been derived wrongly in this project before, so it is checked
    // rather than reasoned about: looking down +Z, right is -X.
    expect(spatialFor(here, north, { x: -5, z: 0 }).pan).toBeGreaterThan(0)
    expect(spatialFor(here, north, { x: 5, z: 0 }).pan).toBeLessThan(0)
  })

  it('agrees with the movement basis, at every angle', () => {
    // The same derivation the controller uses. If the two disagreed, walking
    // right would move you towards a sound that came from your left.
    for (const yaw of [0, 0.7, Math.PI / 2, 2.4, Math.PI, 4.1, 5.9]) {
      const forward = { x: Math.sin(yaw), z: Math.cos(yaw) }
      const right = { x: -forward.z, z: forward.x }
      const source = { x: right.x * 6, z: right.z * 6 }
      expect(spatialFor(here, forward, source).pan).toBeCloseTo(1, 6)
      const left = { x: -right.x * 6, z: -right.z * 6 }
      expect(spatialFor(here, forward, left).pan).toBeCloseTo(-1, 6)
    }
  })

  it('puts something straight ahead or straight behind in the middle', () => {
    expect(spatialFor(here, north, { x: 0, z: 8 }).pan).toBeCloseTo(0, 6)
    expect(spatialFor(here, north, { x: 0, z: -8 }).pan).toBeCloseTo(0, 6)
  })

  it('never pans past a full ear', () => {
    for (let i = 0; i < 500; i++) {
      const forward = { x: Math.sin(i), z: Math.cos(i) }
      const source = { x: ((i * 31) % 40) - 20, z: ((i * 17) % 40) - 20 }
      const { pan } = spatialFor(here, forward, source)
      expect(pan).toBeGreaterThanOrEqual(-1)
      expect(pan).toBeLessThanOrEqual(1)
      expect(Number.isFinite(pan)).toBe(true)
    }
  })

  it('does not divide by zero on top of the listener', () => {
    const { pan, gain } = spatialFor(here, north, here)
    expect(pan).toBe(0)
    expect(Number.isFinite(gain)).toBe(true)
  })

  it('copes with a forward that is straight up or nothing at all', () => {
    // `getWorldDirection` looking at your feet leaves almost nothing in the
    // horizontal plane, and the panning still has to produce a number.
    for (const forward of [{ x: 0, z: 0 }, { x: 1e-9, z: 0 }]) {
      const { pan } = spatialFor(here, forward, { x: 4, z: 4 })
      expect(Number.isFinite(pan)).toBe(true)
      expect(Math.abs(pan)).toBeLessThanOrEqual(1)
    }
  })

  it('ignores height, because that is not which ear a thing is in', () => {
    const flat = spatialFor(here, north, { x: 3, z: 3 })
    const high = spatialFor(here, north, { x: 3, z: 3 })
    expect(flat.pan).toBe(high.pan)
  })
})

describe('how far you can hear', () => {
  it('is a few paces, not the whole island', () => {
    expect(AUDIO.hearing).toBeGreaterThan(10)
    expect(AUDIO.hearing).toBeLessThan(60)
    expect(AUDIO.intimate).toBeLessThan(AUDIO.hearing)
  })
})
