// @vitest-environment jsdom
import { PerspectiveCamera, Vector3 } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { createAvatar, smoothAvatarHeadLook } from '../internal/avatar'
import { createHeadCursor, cursorHeadLook, watchHeadCursor } from '../internal/headCursor'

const cleanups: (() => void)[] = []
function fixture(enabled: () => boolean = () => true) {
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () => new DOMRect(100, 50, 800, 600)
  document.body.append(canvas)
  const cursor = createHeadCursor()
  const stop = watchHeadCursor(canvas, cursor, enabled)
  cleanups.push(stop)
  const move = (clientX: number, clientY: number) => canvas.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY, bubbles: true }))
  return { canvas, cursor, move, stop }
}

afterEach(() => {
  cleanups.splice(0).forEach(stop => stop())
  document.body.replaceChildren()
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: null })
})

describe('unlocked lobby head cursor', () => {
  it('turns the actual duck head from plain cursor movement without a click or camera movement', () => {
    const { cursor, move } = fixture()
    const duck = createAvatar(), head = duck.getObjectByName('avatar-head')!
    const camera = new PerspectiveCamera()
    camera.position.set(0, 1.4, 9); camera.lookAt(0, 1.4, 0); camera.updateMatrixWorld()
    const originalCamera = camera.quaternion.clone()
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    move(850, 120)
    expect(cursor.active).toBe(true)
    const first = cursorHeadLook(cursor, 0, right)
    for (let i = 0; i < 60; i++) smoothAvatarHeadLook(duck, first.yaw, first.pitch, 1 / 60)
    expect(head.rotation.y).toBeGreaterThan(.5)
    expect(head.rotation.x).toBeLessThan(-.4)
    move(150, 580)
    const second = cursorHeadLook(cursor, 0, right)
    for (let i = 0; i < 60; i++) smoothAvatarHeadLook(duck, second.yaw, second.pitch, 1 / 60)
    expect(head.rotation.y).toBeLessThan(-.5)
    expect(head.rotation.x).toBeGreaterThan(.4)
    expect(camera.quaternion.equals(originalCamera)).toBe(true)
  })

  it('uses canvas-relative coordinates and turns toward screen-right from both front and back views', () => {
    const { cursor, move } = fixture()
    move(500, 350)
    expect(cursor.x).toBe(0); expect(cursor.y).toBe(0)
    move(900, 350)
    for (const z of [9, -9]) {
      const camera = new PerspectiveCamera()
      camera.position.set(0, 1.4, z); camera.lookAt(0, 1.4, 0); camera.updateMatrixWorld()
      const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
      const look = cursorHeadLook(cursor, 0, right)
      const gaze = new Vector3(Math.sin(look.yaw), 0, Math.cos(look.yaw))
      expect(gaze.dot(right)).toBeGreaterThan(.6)
    }
  })

  it('releases gaze over blocked UI, on leaving the canvas, on blur, and on pointer capture', () => {
    let enabled = true
    const { canvas, cursor, move } = fixture(() => enabled)
    move(800, 200); expect(cursor.active).toBe(true)
    enabled = false; move(800, 200); expect(cursor.active).toBe(false)
    enabled = true; move(800, 200)
    canvas.dispatchEvent(new MouseEvent('mouseleave')); expect(cursor.active).toBe(false)
    move(800, 200); window.dispatchEvent(new Event('blur')); expect(cursor.active).toBe(false)
    move(800, 200)
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: canvas })
    document.dispatchEvent(new Event('pointerlockchange')); expect(cursor.active).toBe(false)
    move(800, 200); expect(cursor.active).toBe(false)
    expect(cursorHeadLook(cursor, 0, { x: 1, z: 0 })).toEqual({ yaw: 0, pitch: 0 })
  })

  it('cleans up its mouse listener', () => {
    const { cursor, move, stop } = fixture()
    move(800, 200); expect(cursor.active).toBe(true)
    stop(); move(200, 500)
    expect(cursor.active).toBe(false)
  })
})
