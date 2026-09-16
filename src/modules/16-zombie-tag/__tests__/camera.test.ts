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
import { FILL, FLOOR, FOV, TILT, frameArena, headingToYaw } from '../internal/camera'

/** Every corner of the room as drawn - outside of the walls, slab to wall top. */
function corners(): Vector3[] {
  const out: Vector3[] = []
  const w = HALF_W + FLOOR.wallThickness
  const d = HALF_H + FLOOR.wallThickness
  for (const x of [-w, w]) {
    for (const z of [-d, d]) {
      for (const y of [-FLOOR.thickness, FLOOR.wallHeight]) out.push(new Vector3(x, y, z))
    }
  }
  return out
}

/** Where each corner lands on the screen, from -1 to 1 across and up. */
function onScreen(aspect: number): Vector3[] {
  const camera = cameraFor(aspect)
  return corners().map((c) => c.clone().project(camera))
}

/** The camera as it is actually built, for a window of the given shape. */
function cameraFor(aspect: number): PerspectiveCamera {
  const shot = frameArena(aspect)
  const camera = new PerspectiveCamera(FOV, aspect, 1, 400)
  camera.position.set(shot.x, shot.y, shot.z)
  camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  return camera
}

const SHAPES = [0.5, 0.75, 1, 1.33, 1.6, 1.78, 2.35, 3.5]

describe('the fixed camera', () => {
  it('looks down at sixty degrees, not straight down', () => {
    const shot = frameArena(1.6)
    // The angle up from the floor, which is what "sixty degrees" means here.
    const elevation =
      (Math.atan2(shot.y - shot.target.y, Math.hypot(shot.x, shot.z - shot.target.z)) * 180) /
      Math.PI
    expect(elevation).toBeCloseTo(TILT, 6)
    expect(TILT).toBe(60)
    // And emphatically not an overhead view.
    expect(elevation).toBeLessThan(89)
    expect(shot.z).toBeGreaterThan(shot.target.z)
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

  it('fills the window, rather than leaving a border of sky round the room', () => {
    // On every shape the room reaches the edge of the frame on at least one
    // side - across or up - give or take the sliver `FILL` leaves.
    for (const aspect of SHAPES) {
      const points = onScreen(aspect)
      const across = Math.max(...points.map((p) => Math.abs(p.x)))
      const up = Math.max(...points.map((p) => Math.abs(p.y)))
      expect(Math.max(across, up), `${aspect}`).toBeGreaterThan(FILL - 0.01)
    }
  })

  it('leaves as much sky above the room as below it', () => {
    // Aimed at the middle, the far wall would sit well down from the top of
    // the frame while the near wall touched the bottom.
    for (const aspect of SHAPES) {
      const ys = onScreen(aspect).map((p) => p.y)
      expect(Math.max(...ys) + Math.min(...ys), `${aspect}`).toBeCloseTo(0, 2)
    }
  })

  it('comes closer as the window widens, until the height decides it', () => {
    const order = SHAPES.map((aspect) => frameArena(aspect).distance)
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeLessThanOrEqual(order[i - 1] + 1e-9)
    // Past that point widening the screen gives you more sky at the sides, not
    // a bigger room.
    expect(frameArena(3.5).distance).toBeCloseTo(frameArena(2.35).distance, 6)
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
