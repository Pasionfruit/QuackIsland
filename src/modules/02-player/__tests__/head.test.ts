import { describe, expect, it } from 'vitest'
import { createAvatar, smoothAvatarHeadLook } from '../internal/avatar'

describe('smooth local duck head', () => {
  it('eases into a look target without snapping, overshooting, or leaving its angle limits', () => {
    const duck = createAvatar(), head = duck.getObjectByName('avatar-head')!
    smoothAvatarHeadLook(duck, 2, -2, 1 / 60)
    expect(head.rotation.y).toBeGreaterThan(0)
    expect(head.rotation.y).toBeLessThan(.3)
    expect(head.rotation.x).toBeLessThan(0)
    expect(head.rotation.x).toBeGreaterThan(-.3)
    for (let i = 0; i < 120; i++) smoothAvatarHeadLook(duck, 2, -2, 1 / 60)
    expect(head.rotation.y).toBeCloseTo(1.35, 6)
    expect(head.rotation.x).toBeCloseTo(-1.35, 6)
    smoothAvatarHeadLook(duck, -2, 2, 1 / 60)
    expect(head.rotation.y).toBeGreaterThan(.9)
    expect(head.rotation.x).toBeLessThan(-.9)
  })

  it('is consistent across frame rates and reduces walking roll without moving the body', () => {
    const poses = [30, 120].map(fps => {
      const duck = createAvatar(), head = duck.getObjectByName('avatar-head')!
      duck.rotation.z = .06
      for (let i = 0; i < fps; i++) smoothAvatarHeadLook(duck, 1, .3, 1 / fps)
      expect(duck.rotation.z).toBe(.06)
      expect(head.rotation.z).toBeLessThan(0)
      expect(Math.abs(head.rotation.z)).toBeLessThan(.06)
      return head.rotation.toArray().slice(0, 3) as number[]
    })
    poses[0].forEach((angle, i) => expect(angle).toBeCloseTo(poses[1][i], 10))
  })
})
