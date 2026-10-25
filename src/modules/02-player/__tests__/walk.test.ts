import { Mesh, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { createAvatar, setAvatarHeadLook, setAvatarWalk } from '../internal/avatar'
import { PLAYER } from '../internal/controller'
import { advanceWalk, createWalkState, walkPose } from '../internal/walk'

describe('lobby duck locomotion', () => {
  it('moves the two feet in opposite directions without moving the head or mutating another duck', () => {
    const duck = createAvatar(), other = createAvatar()
    const body = duck.getObjectByName('duck-body') as Mesh
    const otherBody = other.getObjectByName('duck-body') as Mesh
    const before = new Vector3(), after = new Vector3()
    const left: number[] = [], right: number[] = []
    const positions = body.geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) < .07) (positions.getX(i) < 0 ? left : right).push(i)
    }
    expect(left.length).toBeGreaterThan(0)
    expect(right.length).toBeGreaterThan(0)
    const head = duck.getObjectByName('avatar-head')!
    const headY = head.position.y
    setAvatarHeadLook(duck, .7, -.2)
    setAvatarWalk(duck, walkPose({ phase: Math.PI / 2, amount: 1 }))
    for (const [indices, direction] of [[left, 1], [right, -1]] as const) {
      for (const i of indices) {
        before.fromBufferAttribute(positions, i)
        body.getVertexPosition(i, after)
        expect((after.z - before.z) * direction).toBeGreaterThan(.25)
      }
    }
    expect(head.position.y).toBe(headY)
    expect(head.rotation.y).toBe(.7)
    expect(otherBody.geometry).toBe(body.geometry)
    expect(otherBody.morphTargetInfluences).toEqual([0, 0, 0, 0])
    expect(other.rotation.z).toBe(0)
  })

  it('keeps all the webbed toes above flat ground throughout the gait', () => {
    const duck = createAvatar(), body = duck.getObjectByName('duck-body') as Mesh
    const positions = body.geometry.getAttribute('position'), point = new Vector3()
    for (let frame = 0; frame < 60; frame++) {
      setAvatarWalk(duck, walkPose({ phase: frame / 60 * Math.PI * 2, amount: 1 }))
      duck.updateMatrixWorld(true)
      let lowest = Infinity
      for (let i = 0; i < positions.count; i++) {
        if (positions.getY(i) > .07) continue
        body.getVertexPosition(i, point).applyMatrix4(body.matrixWorld)
        lowest = Math.min(lowest, point.y)
      }
      expect(lowest).toBeGreaterThanOrEqual(-.000001)
      expect(lowest).toBeLessThan(.055)
    }
  })

  it('runs faster than it walks and gives the same pose at 30 and 120 fps', () => {
    const walk = createWalkState(), run = createWalkState()
    advanceWalk(walk, PLAYER.walkSpeed / 60, 1 / 60, true)
    advanceWalk(run, PLAYER.runSpeed / 60, 1 / 60, true)
    expect(run.phase).toBeGreaterThan(walk.phase)
    const poses = [30, 120].map(fps => {
      const state = createWalkState()
      for (let i = 0; i < fps; i++) advanceWalk(state, PLAYER.walkSpeed / fps, 1 / fps, true)
      return walkPose(state)
    })
    for (const key of Object.keys(poses[0]) as (keyof typeof poses[0])[]) {
      expect(poses[0][key]).toBeCloseTo(poses[1][key], 9)
    }
  })

  it('settles after stopping, collision, jumping, swimming, or a stun', () => {
    for (const movingButDisabled of [false, true]) {
      const gait = createWalkState(), duck = createAvatar()
      for (let i = 0; i < 20; i++) advanceWalk(gait, .15, 1 / 60, true)
      expect(gait.amount).toBeGreaterThan(.9)
      const phase = gait.phase
      advanceWalk(gait, movingButDisabled ? .15 : 0, 1 / 60, !movingButDisabled)
      expect(gait.phase).toBe(phase)
      expect(gait.amount).toBeLessThan(1)
      for (let i = 0; i < 90; i++) advanceWalk(gait, movingButDisabled ? .15 : 0, 1 / 60, !movingButDisabled)
      setAvatarWalk(duck, walkPose(gait))
      expect(duck.position.y).toBe(0)
      expect(duck.rotation.z).toBeCloseTo(0, 9)
      expect((duck.getObjectByName('duck-body') as Mesh).morphTargetInfluences).toEqual([0, -0, 0, 0])
    }
  })
})
