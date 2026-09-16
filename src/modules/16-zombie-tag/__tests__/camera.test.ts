/**
 * Where the camera stands.
 *
 * The failure that matters is a corner of the arena off the edge of the
 * screen, where somebody could be caught out of sight - so these build a real
 * three.js camera from the numbers and check the arena is actually inside its
 * frustum, at every window shape from a phone on its side to an ultrawide.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { HALF_H, HALF_W } from '../internal/arena'
import { FLOOR, FOV, TILT, frameArena, headingToYaw } from '../internal/camera'

/** Every corner of the room, floor and head height, as world points. */
function corners(): Vector3[] {
  const out: Vector3[] = []
  for (const x of [-HALF_W, HALF_W]) {
    for (const z of [-HALF_H, HALF_H]) {
      for (const y of [0, FLOOR.wallHeight]) out.push(new Vector3(x, y, z))
    }
  }
  return out
}

/** The camera as it is actually built, for a window of the given shape. */
function cameraFor(aspect: number): PerspectiveCamera {
  const shot = frameArena(aspect)
  const camera = new PerspectiveCamera(FOV, aspect, 1, 400)
  camera.position.set(shot.x, shot.y, shot.z)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  return camera
}

const SHAPES = [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]

describe('the fixed camera', () => {
  it('looks down at sixty degrees, not straight down', () => {
    const shot = frameArena(1.6)
    // The angle up from the floor, which is what "sixty degrees" means here.
    const elevation = (Math.atan2(shot.y, Math.hypot(shot.x, shot.z)) * 180) / Math.PI
    expect(elevation).toBeCloseTo(TILT, 6)
    expect(TILT).toBe(60)
    // And emphatically not an overhead view.
    expect(elevation).toBeLessThan(89)
    expect(shot.z).toBeGreaterThan(0)
  })

  it('keeps the whole room in frame, at every window shape', () => {
    for (const aspect of SHAPES) {
      const camera = cameraFor(aspect)
      const frustum = new Frustum().setFromProjectionMatrix(
        new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      )
      for (const corner of corners()) {
        expect(frustum.containsPoint(corner), `${aspect} missed ${corner.toArray()}`).toBe(true)
      }
    }
  })

  it('backs off further once the window is narrower than it is tall', () => {
    // Anything at least as wide as it is tall is limited by its height, so the
    // distance is the same for every landscape window - widening the screen
    // gives you more sky at the sides, not a smaller arena.
    expect(frameArena(2.35).distance).toBeCloseTo(frameArena(1).distance, 9)
    expect(frameArena(1.6).distance).toBeCloseTo(frameArena(1).distance, 9)

    // Narrower than square, and the width starts deciding it instead.
    expect(frameArena(0.75).distance).toBeGreaterThan(frameArena(1).distance)
    expect(frameArena(0.5).distance).toBeGreaterThan(frameArena(0.75).distance)
  })

  it('stands over the middle of the arena, not off to one side', () => {
    expect(frameArena(1.6).x).toBe(0)
  })

  it('survives a window with no width at all', () => {
    // A canvas measured before layout reports zero, and a camera placed at
    // infinity never comes back.
    const shot = frameArena(0)
    expect(Number.isFinite(shot.distance)).toBe(true)
    expect(shot.distance).toBeGreaterThan(0)
  })

  it('stays well inside the far plane', () => {
    // The canvas is built with a far plane of 400; a camera parked beyond it
    // would render an empty blue screen.
    for (const aspect of SHAPES) {
      expect(frameArena(aspect).distance).toBeLessThan(300)
    }
  })
})

describe('turning a heading into a facing', () => {
  it('points a body along the way the rules say it is going', () => {
    // The rules work in x/y with zero along +x; the world is x/z with a body
    // facing +z at rest. Each of these is a right angle apart in both.
    const cases: [number, number, number][] = [
      // heading, expected world x, expected world z
      [0, 1, 0],
      [Math.PI / 2, 0, 1],
      [Math.PI, -1, 0],
      [-Math.PI / 2, 0, -1],
    ]
    for (const [heading, wantX, wantZ] of cases) {
      const yaw = headingToYaw(heading)
      // Where a body facing +z ends up pointing once turned by `yaw`.
      expect(Math.sin(yaw)).toBeCloseTo(wantX, 9)
      expect(Math.cos(yaw)).toBeCloseTo(wantZ, 9)
    }
  })

  it('turns a full circle into a full circle', () => {
    for (let i = 0; i < 16; i++) {
      const heading = (Math.PI * 2 * i) / 16
      const yaw = headingToYaw(heading)
      expect(Math.hypot(Math.sin(yaw), Math.cos(yaw))).toBeCloseTo(1, 9)
    }
  })
})
