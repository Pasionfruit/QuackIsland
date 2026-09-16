/**
 * Where the camera stands.
 *
 * Built into a real three.js camera and checked against its frustum: every
 * corner of the maze, slab to head height, in frame at every window shape -
 * and the maze actually filling the frame, rather than sitting in a border of
 * sky.
 */
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FILL, FOV, TILT, frameMaze, headingToYaw } from '../internal/camera'
import { HALF } from '../internal/maze'

const SHAPES = [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]

function cameraFor(aspect: number): PerspectiveCamera {
  const shot = frameMaze(aspect)
  const camera = new PerspectiveCamera(FOV, aspect, 1, 500)
  camera.position.set(shot.x, shot.y, shot.z)
  camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  return camera
}

function corners(): Vector3[] {
  const out: Vector3[] = []
  for (const x of [-HALF, HALF]) {
    for (const z of [-HALF, HALF]) {
      for (const y of [-0.6, 1.6]) out.push(new Vector3(x, y, z))
    }
  }
  return out
}

describe('the fixed camera', () => {
  it('looks down at its tilt, from the near side', () => {
    const shot = frameMaze(1.6)
    const elevation =
      (Math.atan2(shot.y - shot.target.y, Math.hypot(shot.x, shot.z - shot.target.z)) * 180) / Math.PI
    expect(elevation).toBeCloseTo(TILT, 6)
    expect(shot.z).toBeGreaterThan(shot.target.z)
    expect(shot.x).toBe(0)
  })

  it('keeps the whole maze in frame at every window shape', () => {
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

  it('fills the window, with the sky even above and below', () => {
    for (const aspect of SHAPES) {
      const camera = cameraFor(aspect)
      const points = corners().map((c) => c.clone().project(camera))
      const across = Math.max(...points.map((p) => Math.abs(p.x)))
      const ys = points.map((p) => p.y)
      expect(Math.max(across, Math.max(...ys.map(Math.abs))), `${aspect}`).toBeGreaterThan(FILL - 0.01)
      expect(Math.max(...ys) + Math.min(...ys), `${aspect}`).toBeCloseTo(0, 2)
    }
  })

  it('survives a window with no width', () => {
    expect(Number.isFinite(frameMaze(0).distance)).toBe(true)
    expect(Number.isFinite(frameMaze(Number.NaN).distance)).toBe(true)
  })

  it('stays inside the far plane', () => {
    for (const aspect of SHAPES) expect(frameMaze(aspect).distance).toBeLessThan(400)
  })

  it('turns a heading into a facing the right way round', () => {
    expect(Math.sin(headingToYaw(0))).toBeCloseTo(1)
    expect(Math.cos(headingToYaw(Math.PI / 2))).toBeCloseTo(1)
  })
})
