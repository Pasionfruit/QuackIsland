import { Box3, Mesh, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { PLAYER } from '../internal/controller'
import { AVATAR, armPoints, bodyPose, createAvatar, facePoints } from '../internal/avatar'

/**
 * A body is exactly the kind of thing that goes wrong silently - inside out,
 * facing backwards, floating off the ground - and every one of those failures
 * still renders something, so nothing but looking would catch it. These build
 * the real thing and measure it.
 */

const boxOf = (o: object) => new Box3().setFromObject(o as never)

function meshes(o: ReturnType<typeof createAvatar>): Mesh[] {
  const found: Mesh[] = []
  o.traverse((child) => {
    if ((child as Mesh).isMesh) found.push(child as Mesh)
  })
  return found
}

describe('the body', () => {
  it('stands on the ground at exactly the height the controller walks', () => {
    const box = boxOf(createAvatar())
    expect(box.min.y).toBeCloseTo(0, 2)
    expect(box.max.y).toBeCloseTo(PLAYER.height, 2)
  })

  it('is as wide as the controller is round, plus a pair of arms', () => {
    const size = boxOf(createAvatar()).getSize(new Vector3())
    // The arms hang outside the trunk, so the silhouette is wider than the
    // capsule the controller collides with - by less than an arm either side,
    // which is the check that they are hung on the body rather than beside it.
    expect(size.x).toBeGreaterThan(PLAYER.radius * 2)
    expect(size.x).toBeLessThan(PLAYER.radius * 2 + AVATAR.armLength)
    // The face stands a couple of centimetres proud of the front, so depth is
    // allowed to run over - but the arms must not add to it, or they are
    // sticking out in front instead of hanging down.
    expect(size.z).toBeGreaterThanOrEqual(PLAYER.radius * 2)
    expect(size.z).toBeLessThan(PLAYER.radius * 2 + 0.1)
  })

  it('is two draw calls, over geometry every body shares', () => {
    const one = meshes(createAvatar())
    const two = meshes(createAvatar())
    expect(one).toHaveLength(2)
    expect(one[0].geometry).toBe(two[0].geometry)
    expect(one[1].geometry).toBe(two[1].geometry)
    expect(one[0].material).toBe(two[0].material)
  })

  it('gives each body its own transform', () => {
    const one = createAvatar()
    const two = createAvatar()
    one.position.x = 10
    expect(two.position.x).toBe(0)
  })

  it('casts a shadow from the body and not from the face', () => {
    const [pill, smile] = meshes(createAvatar())
    expect(pill.castShadow).toBe(true)
    expect(smile.castShadow).toBe(false)
  })
})

describe('the face', () => {
  const points = facePoints()
  const eyes = points.slice(0, 2)
  const mouth = points.slice(2)

  it('is on the front, which is where a heading of zero looks', () => {
    for (const p of points) expect(p.z).toBeGreaterThan(0)
  })

  it('sits against the body rather than floating in front of it', () => {
    for (const p of points) {
      // How far the curve of the body stands at this point, sideways offset
      // and all, against how far out the face piece was put.
      const surface = Math.sqrt(PLAYER.radius * PLAYER.radius - p.x * p.x)
      expect(surface - p.z).toBeCloseTo(p.radius * AVATAR.faceSink, 6)
      // A dome on the surface: half of every piece shows, whatever size it is,
      // so nothing floats off the front and nothing is swallowed.
      const proud = p.z + p.radius - surface
      expect(proud).toBeCloseTo(p.radius * (1 - AVATAR.faceSink), 6)
      expect(proud).toBeGreaterThan(0.005)
    }
  })

  it('keeps clear of the rounded ends, where the body stops being a cylinder', () => {
    const straightFrom = PLAYER.radius
    const straightTo = PLAYER.height - PLAYER.radius
    for (const p of points) {
      expect(p.y - p.radius).toBeGreaterThan(straightFrom)
      expect(p.y + p.radius).toBeLessThan(straightTo)
    }
  })

  it('has two eyes, level with each other and either side of the middle', () => {
    expect(eyes).toHaveLength(2)
    expect(eyes[0].x).toBeCloseTo(-eyes[1].x, 9)
    expect(eyes[0].y).toBeCloseTo(eyes[1].y, 9)
    expect(Math.abs(eyes[0].x)).toBeGreaterThan(0)
  })

  it('smiles rather than frowns', () => {
    const middle = mouth[(mouth.length - 1) / 2]
    const left = mouth[0]
    const right = mouth[mouth.length - 1]
    // The ends of a smile are higher than its middle.
    expect(left.y).toBeGreaterThan(middle.y)
    expect(right.y).toBeGreaterThan(middle.y)
    expect(left.y).toBeCloseTo(right.y, 9)
    expect(left.x).toBeCloseTo(-right.x, 9)
    // And it runs left to right, in order, so the dots draw one curve.
    for (let i = 1; i < mouth.length; i++) expect(mouth[i].x).toBeGreaterThan(mouth[i - 1].x)
  })

  it('puts the mouth below the eyes', () => {
    for (const dot of mouth) expect(dot.y).toBeLessThan(eyes[0].y - eyes[0].radius)
  })

  it('draws the smile as a line, with no gaps in it', () => {
    for (let i = 1; i < mouth.length; i++) {
      const a = mouth[i - 1]
      const b = mouth[i]
      const gap = Math.hypot(b.x - a.x, b.y - a.y)
      expect(gap).toBeLessThan(a.radius + b.radius)
    }
  })
})

describe('how it sits in the water', () => {
  it('stands with its middle half a height up', () => {
    const { rise, tip } = bodyPose(0, PLAYER.height, PLAYER.radius)
    expect(rise).toBeCloseTo(PLAYER.height / 2, 9)
    expect(tip).toBe(0)
  })

  it('lies flat when swimming, long axis along the way it is going', () => {
    const { rise, tip } = bodyPose(1, PLAYER.height, PLAYER.radius)
    expect(tip).toBeCloseTo(AVATAR.swimTip, 9)
    // A pill on its side floats a radius up, not half a body.
    expect(rise).toBeCloseTo(PLAYER.radius, 9)
  })

  it('ignores a lean outside nought to one', () => {
    expect(bodyPose(-3, PLAYER.height, PLAYER.radius)).toEqual(bodyPose(0, PLAYER.height, PLAYER.radius))
    expect(bodyPose(9, PLAYER.height, PLAYER.radius)).toEqual(bodyPose(1, PLAYER.height, PLAYER.radius))
  })

  it('goes over backwards when knocked down, not face first', () => {
    // The sign is the whole point: a swimmer goes face down and a stunned body
    // goes on its back, so you can still see whose face it is.
    const { rise, tip } = bodyPose(0, PLAYER.height, PLAYER.radius, 1)
    expect(tip).toBeCloseTo(-1, 9)
    expect(rise).toBeCloseTo(PLAYER.radius, 9)
  })

  it('lies at the same height whichever way it went over', () => {
    const swimming = bodyPose(1, PLAYER.height, PLAYER.radius)
    const floored = bodyPose(0, PLAYER.height, PLAYER.radius, 1)
    expect(floored.rise).toBeCloseTo(swimming.rise, 9)
  })

  it('picks whichever is further over rather than adding them', () => {
    // Knocked over while swimming is not folded in half.
    const both = bodyPose(0.3, PLAYER.height, PLAYER.radius, 0.9)
    expect(both.tip).toBeCloseTo(-0.9, 9)
    expect(Math.abs(both.tip)).toBeLessThanOrEqual(1)

    const mostlySwimming = bodyPose(0.9, PLAYER.height, PLAYER.radius, 0.3)
    expect(mostlySwimming.tip).toBeCloseTo(0.9, 9)
  })

  it('is unchanged for everything that never heard of a stun', () => {
    // `09-net` places every remote body with three arguments. A fourth that
    // changed the answer would sink them all.
    expect(bodyPose(0.4, PLAYER.height, PLAYER.radius)).toEqual(
      bodyPose(0.4, PLAYER.height, PLAYER.radius, 0),
    )
  })
})

describe('the arms', () => {
  it('hangs one a side, level with each other', () => {
    const [left, right] = armPoints()
    expect(left.x).toBeCloseTo(-right.x, 9)
    expect(left.y).toBeCloseTo(right.y, 9)
    expect(left.roll).toBeCloseTo(-right.roll, 9)
  })

  it('attaches them to the body rather than beside it', () => {
    // The shoulder end has to be inside the trunk, or the arms float.
    for (const arm of armPoints()) {
      expect(Math.abs(arm.x)).toBeLessThan(PLAYER.radius + AVATAR.armLength / 2)
      expect(Math.abs(arm.x)).toBeGreaterThan(PLAYER.radius / 2)
    }
  })

  it('hangs them below the shoulder and above the feet', () => {
    for (const arm of armPoints()) {
      expect(arm.y).toBeLessThan(AVATAR.shoulderY)
      expect(arm.y - AVATAR.armLength / 2).toBeGreaterThan(0)
    }
  })

  it('swings them out rather than forwards', () => {
    // Nothing in the arm has a z of its own; they hang in the body's own
    // plane, so turning to face somewhere does not swing them about.
    for (const arm of armPoints()) {
      expect(Math.abs(arm.roll)).toBeCloseTo(AVATAR.armOut, 9)
    }
  })

  it('keeps the face clear of them', () => {
    // An arm across the eyes would be worse than no arms at all.
    const eyes = facePoints().filter((p) => p.radius === AVATAR.eyeRadius)
    for (const arm of armPoints()) {
      for (const eye of eyes) {
        expect(Math.abs(arm.x) - AVATAR.armRadius).toBeGreaterThan(Math.abs(eye.x))
      }
    }
  })
})
