import { describe, expect, it } from 'vitest'
import { CUES, createCueState, stepCues, strideFor, type Walker } from '../internal/cues'
import { AUDIO, SOUNDS, clampVolume, pitchFor } from '../internal/engine'

const FRAME = 1 / 60

const walking = (over: Partial<Walker> = {}): Walker => ({
  x: 0,
  z: 0,
  y: 0,
  vy: 0,
  grounded: true,
  swimming: false,
  speed: 9.5,
  ...over,
})

/** Walks in a straight line and collects everything that fired. */
function walk(metres: number, over: Partial<Walker> = {}, frames = 240) {
  const state = createCueState()
  const fired: string[] = []
  const perFrame = metres / frames
  stepCues(state, walking(over), FRAME)
  for (let i = 1; i <= frames; i++) {
    fired.push(...stepCues(state, walking({ ...over, z: -i * perFrame }), FRAME))
  }
  return fired
}

describe('footsteps', () => {
  it('fires nothing on the first frame it sees you', () => {
    // The first frame has no previous position, so any distance it measured
    // would be from wherever the state happened to be initialised.
    const state = createCueState()
    expect(stepCues(state, walking({ x: 900, z: -900 }), FRAME)).toEqual([])
  })

  it('fires nothing while standing still', () => {
    const state = createCueState()
    stepCues(state, walking({ speed: 0 }), FRAME)
    for (let i = 0; i < 600; i++) {
      expect(stepCues(state, walking({ speed: 0 }), FRAME)).toEqual([])
    }
  })

  it('spaces steps by distance, not by time', () => {
    const steps = walk(10).filter((c) => c === 'step')
    expect(steps.length).toBe(Math.floor(10 / CUES.stride))
  })

  it('fires the same number however many frames it took', () => {
    // Frame rate must not change the cadence, which is what carrying the
    // remainder between frames is for.
    const coarse = walk(10, {}, 30).filter((c) => c === 'step').length
    const fine = walk(10, {}, 600).filter((c) => c === 'step').length
    expect(coarse).toBe(fine)
  })

  it('lengthens the stride when running rather than shuffling faster', () => {
    expect(strideFor(CUES.strideSpeed)).toBe(CUES.stride)
    expect(strideFor(CUES.strideSpeed * 1.5)).toBeGreaterThan(CUES.stride)
    expect(strideFor(1000)).toBeCloseTo(CUES.stride * CUES.strideMax, 9)
    // So a run over the same ground is fewer steps, not more.
    const runSteps = walk(20, { speed: CUES.strideSpeed * 1.8 }).filter((c) => c === 'step')
    const walkSteps = walk(20, { speed: CUES.strideSpeed }).filter((c) => c === 'step')
    expect(runSteps.length).toBeLessThan(walkSteps.length)
  })

  it('fires nothing while airborne, however far you travel', () => {
    const fired = walk(30, { grounded: false, vy: -2 })
    expect(fired.filter((c) => c === 'step')).toEqual([])
  })

  it('fires nothing while swimming, however far you travel', () => {
    const fired = walk(30, { swimming: true, grounded: false })
    expect(fired.filter((c) => c === 'step')).toEqual([])
  })

  it('does not owe a step for ground covered in the air', () => {
    // Landing after a long jump should not immediately fire, or a jump always
    // ends with a double thud.
    const state = createCueState()
    stepCues(state, walking(), FRAME)
    for (let i = 1; i <= 40; i++) {
      stepCues(state, walking({ z: -i, grounded: false, vy: -1 }), FRAME)
    }
    const onLanding = stepCues(state, walking({ z: -41, vy: 0 }), FRAME)
    expect(onLanding.filter((c) => c === 'step')).toEqual([])
  })
})

describe('jumping and landing', () => {
  it('fires a jump on the frame the feet leave the ground going up', () => {
    const state = createCueState()
    stepCues(state, walking(), FRAME)
    expect(stepCues(state, walking({ grounded: false, vy: 11 }), FRAME)).toContain('jump')
  })

  it('does not fire a jump for simply walking off a ledge', () => {
    // Falling is not jumping, and the difference is which way you are going.
    const state = createCueState()
    stepCues(state, walking(), FRAME)
    expect(stepCues(state, walking({ grounded: false, vy: -0.4 }), FRAME)).not.toContain('jump')
  })

  it('fires a landing after a real fall', () => {
    const state = createCueState()
    stepCues(state, walking(), FRAME)
    stepCues(state, walking({ grounded: false, vy: 11 }), FRAME)
    for (let i = 0; i < 30; i++) {
      stepCues(state, walking({ grounded: false, vy: -2 - i }), FRAME)
    }
    expect(stepCues(state, walking({ grounded: true, vy: 0 }), FRAME)).toContain('land')
  })

  it('does not thud every frame walking downhill', () => {
    // The player's ground reach catches the body every frame on a slope, which
    // looks like a landing each time and is the reason `landSpeed` exists.
    const state = createCueState()
    stepCues(state, walking(), FRAME)
    let thuds = 0
    for (let i = 1; i <= 200; i++) {
      // Barely airborne, barely falling: caught again immediately.
      thuds += stepCues(state, walking({ z: -i * 0.1, grounded: false, vy: -0.3 }), FRAME).filter(
        (c) => c === 'land',
      ).length
      thuds += stepCues(state, walking({ z: -i * 0.1 - 0.05, grounded: true, vy: 0 }), FRAME).filter(
        (c) => c === 'land',
      ).length
    }
    expect(thuds).toBe(0)
  })

  it('fires each of a jump and a landing exactly once', () => {
    const state = createCueState()
    stepCues(state, walking(), FRAME)
    const fired: string[] = []
    fired.push(...stepCues(state, walking({ grounded: false, vy: 11 }), FRAME))
    for (let i = 0; i < 40; i++) {
      fired.push(...stepCues(state, walking({ grounded: false, vy: 10 - i }), FRAME))
    }
    for (let i = 0; i < 20; i++) {
      fired.push(...stepCues(state, walking({ grounded: true, vy: 0, speed: 0 }), FRAME))
    }
    expect(fired.filter((c) => c === 'jump').length).toBe(1)
    expect(fired.filter((c) => c === 'land').length).toBe(1)
  })
})

describe('swimming', () => {
  it('strokes on a beat rather than by distance', () => {
    // You keep paddling even when you are barely getting anywhere.
    const state = createCueState()
    const swimmer = walking({ swimming: true, grounded: false, speed: 6.5 })
    stepCues(state, swimmer, FRAME)
    let strokes = 0
    for (let i = 0; i < 60 * 12; i++) {
      strokes += stepCues(state, swimmer, FRAME).filter((c) => c === 'stroke').length
    }
    expect(strokes).toBeGreaterThan(8)
    expect(strokes).toBeLessThan(12)
  })

  it('goes quiet when you stop swimming and float', () => {
    const state = createCueState()
    const still = walking({ swimming: true, grounded: false, speed: 0 })
    stepCues(state, still, FRAME)
    let strokes = 0
    for (let i = 0; i < 600; i++) {
      strokes += stepCues(state, still, FRAME).filter((c) => c === 'stroke').length
    }
    expect(strokes).toBe(0)
  })

  it('does not thud when it reaches the shallows', () => {
    // Swimming is not grounded, so wading out looks exactly like a landing
    // unless swimming is handled first.
    const state = createCueState()
    stepCues(state, walking({ swimming: true, grounded: false }), FRAME)
    for (let i = 0; i < 60; i++) {
      stepCues(state, walking({ swimming: true, grounded: false, z: -i * 0.1 }), FRAME)
    }
    const ashore = stepCues(state, walking({ grounded: true, z: -7 }), FRAME)
    expect(ashore).not.toContain('land')
  })
})

describe('losing the player', () => {
  it('fires nothing and picks up cleanly', () => {
    // The player module can be switched off mid-stride. Coming back must not
    // fire a step for the distance across the island.
    const state = createCueState()
    stepCues(state, walking(), FRAME)
    for (let i = 1; i <= 10; i++) stepCues(state, walking({ z: -i * 0.1 }), FRAME)
    expect(stepCues(state, null, FRAME)).toEqual([])
    expect(stepCues(state, walking({ x: 400, z: 400 }), FRAME)).toEqual([])
  })
})

describe('how the sounds are played', () => {
  it('has a file for every cue', () => {
    for (const name of ['step', 'jump', 'land', 'stroke'] as const) {
      expect(SOUNDS[name].file.startsWith('audio/')).toBe(true)
      expect(SOUNDS[name].file.endsWith('.mp3')).toBe(true)
      expect(SOUNDS[name].gain).toBeGreaterThan(0)
      expect(SOUNDS[name].gain).toBeLessThanOrEqual(1)
    }
  })

  it('varies the pitch, so a run does not sound like a machine', () => {
    for (const name of ['step', 'jump', 'land', 'stroke'] as const) {
      expect(SOUNDS[name].wobble).toBeGreaterThan(0)
    }
    expect(pitchFor(0.14, 0)).toBeCloseTo(0.86, 9)
    expect(pitchFor(0.14, 0.5)).toBeCloseTo(1, 9)
    expect(pitchFor(0.14, 1)).toBeCloseTo(1.14, 9)
  })

  it('never pitches so far it becomes a different sound', () => {
    for (const random of [0, 0.5, 1]) {
      for (const name of ['step', 'jump', 'land', 'stroke'] as const) {
        const pitch = pitchFor(SOUNDS[name].wobble, random)
        expect(pitch).toBeGreaterThan(0.8)
        expect(pitch).toBeLessThan(1.25)
      }
    }
  })

  it('clamps a nonsense wobble or random rather than producing a silent rate', () => {
    // A playback rate of zero or below throws in the browser.
    for (const wobble of [-1, 0, 5]) {
      for (const random of [-3, 0.5, 9]) {
        expect(pitchFor(wobble, random)).toBeGreaterThan(0)
      }
    }
  })

  it('clamps the volume, including whatever was in storage', () => {
    expect(clampVolume(-1)).toBe(0)
    expect(clampVolume(2)).toBe(1)
    expect(clampVolume(Number.NaN)).toBe(AUDIO.defaultVolume)
    expect(clampVolume(Number.parseFloat('rubbish'))).toBe(AUDIO.defaultVolume)
  })

  it('caps how many of one sound can play at once', () => {
    expect(AUDIO.maxVoices).toBeGreaterThan(1)
    expect(AUDIO.maxVoices).toBeLessThan(20)
  })
})
