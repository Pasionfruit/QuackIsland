/**
 * The camera you hold: W A S D that pan it, a wheel that zooms towards the
 * pointer, a flashlight that only the closest zoom allows, and limits that keep
 * the yard in front of you.
 */
import { describe, expect, it } from 'vitest'
import { VIEW, anglesOf, canTorch, clampView, direction, magnification, pan, pin, rayThrough, startView, wheelFov, zoomAt, type Vec3 } from '../internal/view'

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

describe('pinning a direction under a point', () => {
  it('keeps a direction under the point it was pinned to, at any zoom - which is what makes the wheel zoom towards the pointer', () => {
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
    // Pinned hard enough to spin right round, if it were allowed to.
    for (let i = 0; i < 20; i++) pin(view, 1, 1, { x: -1, y: -1, z: 1 }, 1.6)
    expect(Math.abs(view.yaw)).toBeLessThanOrEqual(VIEW.yawLimit + 1e-9)
    expect(view.pitch).toBeGreaterThanOrEqual(VIEW.pitchMin - 1e-9)
    expect(view.pitch).toBeLessThanOrEqual(VIEW.pitchMax + 1e-9)
    // The yard is laid in front of you: the limits keep it there.
    expect(VIEW.yawLimit).toBeGreaterThan((60 * Math.PI) / 180 / 2)
  })
})

describe('W A S D', () => {
  const held = (view: ReturnType<typeof startView>, right: number, up: number, seconds: number, dt = 1 / 60) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) pan(view, right, up, dt)
    return view
  }

  it('turn the view: A and D left and right, W and S up and down', () => {
    const view = startView()
    const before = { ...view }
    held(view, -1, 0, 0.3)
    expect(view.yaw).toBeGreaterThan(before.yaw)
    expect(view.pitch).toBeCloseTo(before.pitch, 9)
    const d = startView()
    held(d, 1, 0, 0.3)
    expect(d.yaw).toBeLessThan(before.yaw)
    const w = startView()
    held(w, 0, 1, 0.3)
    expect(w.pitch).toBeGreaterThan(before.pitch)
    expect(w.yaw).toBeCloseTo(before.yaw, 9)
    const sKey = startView()
    held(sKey, 0, -1, 0.3)
    expect(sKey.pitch).toBeLessThan(before.pitch)
    // Left is left: the point that was on the right of the middle comes towards it.
    const right = rayThrough(before, 0.5, 0, 1)
    const after = rayThrough(held({ ...before }, 1, 0, 0.3), 0.5, 0, 1)
    expect(after.x).not.toBeCloseTo(right.x, 3)
  })

  it('go slower the more it is zoomed in, by the same share of the view, so a second is about the same amount of screen at any zoom', () => {
    const turned = (fov: number) => {
      const view = { ...startView(), fov, pitch: 0 }
      held(view, 1, 0, 0.5)
      return -view.yaw
    }
    expect(turned(VIEW.fovMax)).toBeGreaterThan(turned(30) * 1.8)
    expect(turned(30)).toBeGreaterThan(turned(VIEW.fovMin) * 4)
    // A share of the view a second, whatever the view: the same to a few per cent.
    const share = (fov: number) => turned(fov) / ((fov * Math.PI) / 180)
    expect(share(VIEW.fovMin)).toBeCloseTo(share(VIEW.fovMax), 3)
    // At the widest, quick; zoomed right in, slow enough to walk a crosshair along a bin bag.
    expect((turned(VIEW.fovMax) / 0.5) * (180 / Math.PI)).toBeGreaterThan(40)
    expect((turned(VIEW.fovMin) / 0.5) * (180 / Math.PI)).toBeLessThan(10)
  })

  it('are no faster on a diagonal, nothing for both directions at once, and nothing for no time', () => {
    const straight = startView()
    const diagonal = startView()
    pan(straight, 1, 0, 0.05)
    pan(diagonal, 1, 1, 0.05)
    const along = Math.hypot(diagonal.yaw, diagonal.pitch - VIEW.start.pitch)
    expect(along).toBeCloseTo(Math.abs(straight.yaw), 9)
    const still = startView()
    pan(still, 1, 0, 0)
    pan(still, 0, 0, 1)
    pan(still, -1, 0, 0.05)
    pan(still, 1, 0, 0.05)
    expect(still).toEqual(startView())
  })

  it('never turn past the fan the yard is in, or past straight down, however long they are held', () => {
    const view = startView()
    held(view, -1, 1, 20)
    expect(view.yaw).toBeCloseTo(VIEW.yawLimit, 9)
    expect(view.pitch).toBeCloseTo(VIEW.pitchMax, 9)
    held(view, 1, -1, 20)
    expect(view.yaw).toBeCloseTo(-VIEW.yawLimit, 9)
    expect(view.pitch).toBeCloseTo(VIEW.pitchMin, 9)
    // And a frame that took a second - a tab that lost its turn - is a tenth of one.
    const slow = startView()
    pan(slow, 1, 0, 5)
    const fast = startView()
    pan(fast, 1, 0, 0.1)
    expect(slow.yaw).toBe(fast.yaw)
  })

  it('do not change the zoom', () => {
    const view = { ...startView(), fov: 20 }
    held(view, 1, 1, 0.5)
    expect(view.fov).toBe(20)
  })
})

describe('the flashlight', () => {
  it('is for the closest zoom only, not the merely zoomed in', () => {
    expect(canTorch({ fov: VIEW.fovMax })).toBe(false)
    expect(canTorch({ fov: 30 })).toBe(false)
    // Two and a half times and more used to be enough; ten times, nearly, is not.
    expect(canTorch({ fov: 60 / 2 })).toBe(false)
    expect(canTorch({ fov: 12 })).toBe(false)
    expect(canTorch({ fov: 8 })).toBe(false)
    expect(canTorch({ fov: VIEW.fovMin })).toBe(true)
    expect(canTorch({ fov: VIEW.torchFov })).toBe(true)
    expect(canTorch({ fov: VIEW.torchFov + 0.5 })).toBe(false)
  })

  it('is reached by the wheel, all the way in, from anywhere, and is not reached by anything short of it', () => {
    let fov: number = VIEW.fovMax
    let notches = 0
    while (!canTorch({ fov }) && notches < 200) {
      fov = wheelFov(fov, -100)
      notches += 1
    }
    expect(canTorch({ fov })).toBe(true)
    expect(notches).toBeGreaterThan(5)
    expect(notches).toBeLessThan(200)
    // One notch back out and it is gone.
    expect(canTorch({ fov: wheelFov(fov, 100) })).toBe(false)
    // The closest zoom is still worth having: about ten times.
    expect(magnification({ ...startView(), fov })).toBeGreaterThan(8)
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
