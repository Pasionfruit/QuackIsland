import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { PLAYER } from '../internal/controller'
import { VIEW, VIEW_MODES, clampPitch, lookDirection, placeCamera, type RigState } from '../internal/camera'

const rig = (over: Partial<RigState> = {}): RigState => ({
  yaw: 0,
  pitch: 0,
  distance: 9,
  panX: 0,
  panZ: 0,
  ...over,
})

const player = { x: 12, y: 3, z: -40 }
// Well below the player, so the third-person ground clearance never engages;
// when it does it deliberately changes the aim, and that has its own test.
const flat = () => -500

/** Builds a real camera and reads the way it is actually pointing. */
function aimOf(mode: 'first' | 'third', r: RigState) {
  const place = placeCamera(mode, r, player, PLAYER.eyeHeight, flat)
  const camera = new PerspectiveCamera(55, 16 / 9, 0.5, 5000)
  camera.position.set(place.x, place.y, place.z)
  camera.lookAt(place.lookX, place.lookY, place.lookZ)
  camera.updateMatrixWorld(true)
  // Column 2 of the world matrix is the camera's +Z, which points *backwards*.
  const back = new Vector3().setFromMatrixColumn(camera.matrixWorld, 2)
  return { place, forward: back.multiplyScalar(-1).normalize() }
}

describe('which way the camera looks', () => {
  it('is the same direction in both views, at every angle', () => {
    // The whole risk of adding a second view: if the two disagree about which
    // way `yaw` points, swapping between them feels like the controls invert.
    for (const yaw of [0, 0.7, Math.PI / 2, 2.4, Math.PI, 4.1, 5.9]) {
      for (const pitch of [-0.4, 0, 0.3, 0.9]) {
        const first = aimOf('first', rig({ yaw, pitch }))
        const third = aimOf('third', rig({ yaw, pitch }))
        expect(first.forward.angleTo(third.forward)).toBeLessThan(0.01)
      }
    }
  })

  it('points where the controller thinks forward is', () => {
    // The controller walks along `(sin(yaw), cos(yaw))`. The camera has to
    // agree, or forward stops being away from the camera.
    for (const yaw of [0, 1.1, Math.PI, 4.4]) {
      const { forward } = aimOf('first', rig({ yaw }))
      expect(forward.x).toBeCloseTo(Math.sin(yaw), 5)
      expect(forward.z).toBeCloseTo(Math.cos(yaw), 5)
    }
  })

  it('looks down for a positive pitch and up for a negative one', () => {
    expect(lookDirection(0, 0.5)[1]).toBeLessThan(0)
    expect(lookDirection(0, -0.5)[1]).toBeGreaterThan(0)
    expect(lookDirection(0, 0)[1]).toBeCloseTo(0, 9)
  })

  it('gives a unit direction whatever it is handed', () => {
    for (const yaw of [-9, 0, 2.2, 30]) {
      for (const pitch of [-1.5, 0, 1.5]) {
        const [x, y, z] = lookDirection(yaw, pitch)
        expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9)
      }
    }
  })
})

describe('first person', () => {
  it('puts the camera at the eyes', () => {
    const place = placeCamera('first', rig(), player, PLAYER.eyeHeight, flat)
    expect(place.x).toBe(player.x)
    expect(place.z).toBe(player.z)
    expect(place.y).toBeCloseTo(player.y + PLAYER.eyeHeight, 9)
  })

  it('ignores panning and zoom, which mean nothing from inside a head', () => {
    const panned = placeCamera(
      'first',
      rig({ panX: 200, panZ: -80, distance: 260 }),
      player,
      PLAYER.eyeHeight,
      flat,
    )
    const plain = placeCamera('first', rig(), player, PLAYER.eyeHeight, flat)
    expect(panned.x).toBe(plain.x)
    expect(panned.y).toBe(plain.y)
    expect(panned.z).toBe(plain.z)
  })

  it('is never pushed up by the ground, because it is already standing on it', () => {
    // The third-person clearance would lift the head off the shoulders.
    const hill = () => 500
    const place = placeCamera('first', rig(), player, PLAYER.eyeHeight, hill)
    expect(place.y).toBeCloseTo(player.y + PLAYER.eyeHeight, 9)
  })

  it('can look very nearly straight up and straight down', () => {
    // There is a sky in this game; not being able to look at it would be odd.
    expect(clampPitch('first', -9)).toBeCloseTo(VIEW.pitch.first.min, 9)
    expect(clampPitch('first', 9)).toBeCloseTo(VIEW.pitch.first.max, 9)
    expect(Math.abs(VIEW.pitch.first.min)).toBeGreaterThan(1.2)
    expect(VIEW.pitch.first.max).toBeGreaterThan(1.2)
    // But never past vertical, which would flip the view upside down.
    expect(Math.abs(VIEW.pitch.first.min)).toBeLessThan(Math.PI / 2)
    expect(VIEW.pitch.first.max).toBeLessThan(Math.PI / 2)
  })
})

describe('third person', () => {
  it('sits behind the player, along the look direction', () => {
    const place = placeCamera('third', rig({ yaw: 0 }), player, PLAYER.eyeHeight, flat)
    // Looking down +Z, so the camera is on the -Z side of the player.
    expect(place.z).toBeLessThan(player.z)
    expect(Math.hypot(place.x - player.x, place.z - player.z)).toBeCloseTo(9, 3)
  })

  it('aims at the player rather than past them', () => {
    const place = placeCamera('third', rig({ yaw: 1.3, pitch: 0.4 }), player, PLAYER.eyeHeight, flat)
    expect(place.lookX).toBeCloseTo(player.x, 9)
    expect(place.lookZ).toBeCloseTo(player.z, 9)
  })

  it('slides off the player when panned', () => {
    const place = placeCamera('third', rig({ panX: 30, panZ: -20 }), player, PLAYER.eyeHeight, flat)
    expect(place.lookX).toBeCloseTo(player.x + 30, 9)
    expect(place.lookZ).toBeCloseTo(player.z - 20, 9)
  })

  it('pulls further back as the distance grows', () => {
    const near = placeCamera('third', rig({ distance: 4 }), player, PLAYER.eyeHeight, flat)
    const far = placeCamera('third', rig({ distance: 200 }), player, PLAYER.eyeHeight, flat)
    const reach = (p: { x: number; z: number }) => Math.hypot(p.x - player.x, p.z - player.z)
    expect(reach(far)).toBeGreaterThan(reach(near))
  })

  it('is kept clear of the ground', () => {
    // Walking downhill puts the camera inside the slope behind you otherwise.
    const hill = () => 40
    const place = placeCamera('third', rig({ pitch: -0.4 }), player, PLAYER.eyeHeight, hill)
    expect(place.y).toBeGreaterThanOrEqual(40 + VIEW.groundClearance - 1e-9)
  })

  it('cannot be pitched far enough up to bury itself', () => {
    expect(clampPitch('third', -9)).toBeCloseTo(VIEW.pitch.third.min, 9)
    expect(clampPitch('third', 9)).toBeCloseTo(VIEW.pitch.third.max, 9)
    // Tighter than first person, which is the whole reason they differ.
    expect(Math.abs(VIEW.pitch.third.min)).toBeLessThan(Math.abs(VIEW.pitch.first.min))
  })
})

describe('swapping between them', () => {
  it('keeps a pitch that is legal in both', () => {
    for (const mode of VIEW_MODES) {
      expect(clampPitch(mode, 0.2)).toBeCloseTo(0.2, 9)
    }
  })

  it('brings a first-person pitch back into range for third person', () => {
    // Looking at the sky then swapping must not leave the camera underground.
    const steep = VIEW.pitch.first.min
    expect(clampPitch('third', steep)).toBeGreaterThanOrEqual(VIEW.pitch.third.min)
    expect(clampPitch('third', steep)).toBe(VIEW.pitch.third.min)
  })

  it('never moves the player, whichever view is on', () => {
    // The camera is the only thing that changes. A view that shifted the body
    // would desync it from everyone else in a lobby.
    const before = { ...player }
    for (const mode of VIEW_MODES) placeCamera(mode, rig(), player, PLAYER.eyeHeight, flat)
    expect(player).toEqual(before)
  })

  it('puts the eyes at the same height the third-person camera aims at', () => {
    // So the horizon does not jump when you swap.
    const first = placeCamera('first', rig(), player, PLAYER.eyeHeight, flat)
    const third = placeCamera('third', rig(), player, PLAYER.eyeHeight, flat)
    expect(first.y).toBeCloseTo(third.lookY, 9)
  })
})
