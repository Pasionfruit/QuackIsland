import { Mesh, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { createAvatar, setAvatarFlap, setAvatarWalk } from '../internal/avatar'
import { advanceFlap, createFlapState, flapPose, type FlightInput } from '../internal/flap'
import { walkPose } from '../internal/walk'

const airborne: FlightInput = { jumped: false, grounded: false, swimming: false, stunned: false }

describe('jump wing flaps', () => {
  it('starts with a jump and keeps flapping on the way down, without treating a ledge fall as a jump', () => {
    const state = createFlapState()
    advanceFlap(state, 1 / 60, airborne)
    expect(state.amount).toBe(0)
    advanceFlap(state, 1 / 60, { ...airborne, jumped: true })
    const heights: number[] = []
    for (let i = 0; i < 60; i++) {
      advanceFlap(state, 1 / 60, airborne)
      heights.push(flapPose(state).raised)
    }
    expect(state.active).toBe(true)
    expect(Math.max(...heights)).toBeGreaterThan(.95)
    expect(Math.min(...heights.slice(15))).toBeLessThan(.05)
  })

  it('folds the wings after landing, swimming, or a stun', () => {
    for (const stop of ['grounded', 'swimming', 'stunned'] as const) {
      const state = createFlapState()
      advanceFlap(state, .05, { ...airborne, jumped: true })
      expect(state.amount).toBeGreaterThan(0)
      for (let i = 0; i < 60; i++) advanceFlap(state, 1 / 60, { ...airborne, [stop]: true })
      expect(state.active).toBe(false)
      expect(flapPose(state)).toEqual({ spread: 0, raised: 0 })
    }
  })

  it('extends both actual wings while leaving the feet and other duck untouched', () => {
    const duck = createAvatar(), other = createAvatar()
    const body = duck.getObjectByName('duck-body') as Mesh
    const otherBody = other.getObjectByName('duck-body') as Mesh
    const positions = body.geometry.getAttribute('position')
    const spread = body.geometry.morphAttributes.position![4]
    setAvatarFlap(duck, { spread: 1, raised: 0 })
    setAvatarWalk(duck, walkPose({ phase: 0, amount: 0 }))
    const point = new Vector3()
    let left = 0, right = 0, foldedReach = 0, spreadReach = 0
    for (let i = 0; i < positions.count; i++) {
      body.getVertexPosition(i, point)
      if (spread.getX(i) !== 0 || spread.getY(i) !== 0) {
        foldedReach = Math.max(foldedReach, Math.abs(positions.getX(i)))
        spreadReach = Math.max(spreadReach, Math.abs(point.x))
        if (positions.getX(i) < 0) left++; else right++
      } else {
        expect(point.x).toBeCloseTo(positions.getX(i), 7)
        expect(point.y).toBeCloseTo(positions.getY(i), 7)
        expect(point.z).toBeCloseTo(positions.getZ(i), 7)
      }
    }
    expect(left).toBeGreaterThan(50); expect(right).toBe(left)
    expect(spreadReach).toBeGreaterThan(foldedReach + .2)
    expect(body.morphTargetInfluences?.[4]).toBe(1)
    expect(otherBody.morphTargetInfluences?.[4]).toBe(0)
    expect(body.geometry).toBe(otherBody.geometry)
  })

  it('has the same flap phase and envelope at 30 and 120 fps', () => {
    const poses = [30, 120].map(fps => {
      const state = createFlapState()
      for (let i = 0; i < fps; i++) advanceFlap(state, 1 / fps, { ...airborne, jumped: i === 0 })
      return flapPose(state)
    })
    expect(poses[0].raised).toBeCloseTo(poses[1].raised, 9)
    expect(poses[0].spread).toBeCloseTo(poses[1].spread, 9)
  })
})
