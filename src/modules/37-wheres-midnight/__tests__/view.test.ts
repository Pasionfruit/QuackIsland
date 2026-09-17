/**
 * The camera you hold: a drag that grabs the scene, a wheel that zooms towards
 * the pointer, and limits that keep the yard in front of you.
 */
import { describe, expect, it } from 'vitest'
import { VIEW, anglesOf, clampView, direction, magnification, pin, rayThrough, startView, wheelFov, zoomAt, type Vec3 } from '../internal/view'

const ASPECTS = [0.6, 1, 16 / 9, 2.4]
const near = (a: Vec3, b: Vec3, digits = 5) => {
  expect(a.x).toBeCloseTo(b.x, digits)
  expect(a.y).toBeCloseTo(b.y, digits)
  expect(a.z).toBeCloseTo(b.z, digits)
}

describe('a ray through the screen', () => {
  it('is unit length wherever it goes, at any zoom and any shape of window', () => {
    for (const aspect of ASPECTS) {
      for (const fov of [VIEW.fovMin, 24, VIEW.fovMax]) {
        const view = { ...startView(), fov }
        for (const [nx, ny] of [
          [0, 0],
          [-1, -1],
          [1, 1],
          [0.3, -0.8],
        ]) {
          const d = rayThrough(view, nx, ny, aspect)
          expect(Math.hypot(d.x, d.y, d.z), `${aspect} ${fov}`).toBeCloseTo(1, 9)
        }
      }
    }
  })

  it('goes right for a point on the right and up for a point at the top', () => {
    const view = { yaw: 0, pitch: 0, fov: 60 }
    const middle = rayThrough(view, 0, 0, 1)
    near(middle, { x: 0, y: 0, z: -1 })
    expect(rayThrough(view, 1, 0, 1).x).toBeGreaterThan(0)
    expect(rayThrough(view, -1, 0, 1).x).toBeLessThan(0)
    expect(rayThrough(view, 0, 1, 1).y).toBeGreaterThan(0)
    expect(rayThrough(view, 0, -1, 1).y).toBeLessThan(0)
  })

  it('reaches further across a wide window than a tall one', () => {
    const view = { yaw: 0, pitch: 0, fov: 40 }
    expect(Math.abs(rayThrough(view, 1, 0, 2.4).x)).toBeGreaterThan(Math.abs(rayThrough(view, 1, 0, 0.6).x))
    // Up and down is the field of view itself, whatever the window's shape.
    expect(rayThrough(view, 0, 1, 2.4).y).toBeCloseTo(rayThrough(view, 0, 1, 0.6).y, 9)
  })

  it('and the angles that face along it are each other backwards', () => {
    for (const yaw of [-1.1, 0, 0.7]) {
      for (const pitch of [-0.9, 0, 0.15]) {
        const angles = anglesOf(direction(yaw, pitch))
        expect(angles.yaw).toBeCloseTo(yaw, 9)
        expect(angles.pitch).toBeCloseTo(pitch, 9)
      }
    }
  })
})

describe('a drag', () => {
  it('keeps whatever was grabbed under the pointer, at any zoom', () => {
    for (const aspect of ASPECTS) {
      for (const fov of [VIEW.fovMax, 20, VIEW.fovMin]) {
        const view = { ...startView(), fov }
        const grabbed = rayThrough(view, -0.4, 0.2, aspect)
        pin(view, 0.35, -0.15, grabbed, aspect)
        near(rayThrough(view, 0.35, -0.15, aspect), grabbed, 4)
      }
    }
  })

  it('never turns past the fan the yard is in, or past straight down', () => {
    const view = startView()
    // Dragged hard enough to spin right round, if it were allowed to.
    for (let i = 0; i < 20; i++) pin(view, 1, 1, { x: -1, y: -1, z: 1 }, 1.6)
    expect(Math.abs(view.yaw)).toBeLessThanOrEqual(VIEW.yawLimit + 1e-9)
    expect(view.pitch).toBeGreaterThanOrEqual(VIEW.pitchMin - 1e-9)
    expect(view.pitch).toBeLessThanOrEqual(VIEW.pitchMax + 1e-9)
    // The yard is laid in front of you: the limits keep it there.
    expect(VIEW.yawLimit).toBeGreaterThan((60 * Math.PI) / 180 / 2)
  })
})

describe('the wheel', () => {
  it('zooms in when it is pushed and out when it is pulled, and stops at the limits', () => {
    expect(wheelFov(40, -100)).toBeLessThan(40)
    expect(wheelFov(40, 100)).toBeGreaterThan(40)
    expect(wheelFov(VIEW.fovMin, -100000)).toBe(VIEW.fovMin)
    expect(wheelFov(VIEW.fovMax, 100000)).toBe(VIEW.fovMax)
  })

  it('keeps whatever is under the pointer where it is', () => {
    for (const aspect of ASPECTS) {
      const view = startView()
      const under = rayThrough(view, 0.6, -0.45, aspect)
      zoomAt(view, 12, 0.6, -0.45, aspect)
      expect(view.fov).toBe(12)
      near(rayThrough(view, 0.6, -0.45, aspect), under, 4)
    }
  })

  it('is worth something to zoom: ten times the magnification, corner to corner of the range', () => {
    expect(magnification({ ...startView(), fov: VIEW.fovMax })).toBeCloseTo(1, 6)
    expect(magnification({ ...startView(), fov: VIEW.fovMin })).toBeGreaterThan(8)
  })

  it('cannot be talked into a view that is not a view', () => {
    const bent = clampView({ yaw: 99, pitch: -99, fov: 0 })
    expect(bent.yaw).toBe(VIEW.yawLimit)
    expect(bent.pitch).toBe(VIEW.pitchMin)
    expect(bent.fov).toBe(VIEW.fovMin)
  })
})

describe('where everybody starts', () => {
  it('looks north, a little down, at the widest view - the same for everybody', () => {
    const view = startView()
    expect(view.yaw).toBe(0)
    expect(view.pitch).toBeLessThan(0)
    expect(view.fov).toBe(VIEW.fovMax)
    near(direction(view.yaw, 0), { x: 0, y: 0, z: -1 })
    // A fresh view is a fresh object: turning one must not turn everybody's.
    const other = startView()
    view.yaw = 1
    expect(other.yaw).toBe(0)
  })
})
