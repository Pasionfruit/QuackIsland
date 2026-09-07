/**
 * The player on screen: a body that walks the island, and a camera you aim.
 *
 * Third person. The mouse turns the camera; the body walks wherever the camera
 * is facing and turns to follow. All the movement maths is in controller.ts;
 * this reads input, feeds it in, and puts the result on a mesh.
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Group, Vector3 } from 'three'
import { PRIORITY, setCameraMode, useGameFrame } from '../../00-core'
import { heightAt, worldBounds } from '../../01-terrain'
import { IDLE_INPUT, PLAYER, createPlayer, stepPlayer, type PlayerInput, type PlayerState } from './controller'

/** How far back and up the camera sits, and how quickly it catches up. */
const CAM_DISTANCE = 9
const CAM_HEIGHT = 2.6
const CAM_EASE = 12
/** Radians per pixel of mouse movement. */
const SENSITIVITY = 0.0026
/** How far up and down the camera may be aimed. Kept well short of straight up. */
const PITCH_MIN = -0.55
const PITCH_MAX = 0.85

/**
 * The live player, readable by other modules.
 *
 * Footprints and anything else that follows the player need its position every
 * frame, which is far too often to go through React state. This is the same
 * object the controller mutates, exposed read-only.
 */
let live: PlayerState | null = null

export function getPlayerState(): Readonly<PlayerState> | null {
  return live
}

export function Player({ spawnX = 0, spawnZ = 0 }: { spawnX?: number; spawnZ?: number }) {
  const camera = useThree((s) => s.camera)
  const domElement = useThree((s) => s.gl.domElement)
  const body = useRef<Group>(null)

  const state = useMemo(() => createPlayer(spawnX, spawnZ, heightAt), [spawnX, spawnZ])
  const keys = useRef<PlayerInput>({ ...IDLE_INPUT })
  const jumpEdge = useRef(false)
  const yaw = useRef(Math.PI)
  const pitch = useRef(0.16)

  const bounds = useMemo(() => {
    const b = worldBounds()
    return { minX: b.minX + 2, maxX: b.maxX - 2, minZ: b.minZ + 2, maxZ: b.maxZ - 2 }
  }, [])

  useEffect(() => {
    live = state
    setCameraMode('player')
    return () => {
      live = null
      setCameraMode('orbit')
    }
  }, [state])

  // Mouse look. Click to capture the pointer; Escape releases it. Dragging
  // works too, so the camera is still usable without committing to a lock.
  useEffect(() => {
    let dragging = false

    const onMove = (e: MouseEvent) => {
      const locked = document.pointerLockElement === domElement
      if (!locked && !dragging) return
      yaw.current -= e.movementX * SENSITIVITY
      pitch.current = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch.current + e.movementY * SENSITIVITY))
    }
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      dragging = true
      // requestPointerLock can reject (a recent Escape, or no gesture); the
      // drag path above keeps the camera working either way.
      void Promise.resolve(domElement.requestPointerLock()).catch(() => {})
    }
    const onUp = () => {
      dragging = false
    }

    domElement.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      domElement.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (document.pointerLockElement === domElement) document.exitPointerLock()
    }
  }, [domElement])

  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const k = keys.current
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          k.forward = down
          break
        case 'KeyS':
        case 'ArrowDown':
          k.back = down
          break
        case 'KeyA':
        case 'ArrowLeft':
          k.left = down
          break
        case 'KeyD':
        case 'ArrowRight':
          k.right = down
          break
        case 'Space':
          // Edge-detected here, so holding the key does not turn into a hover.
          if (down && !k.jump) jumpEdge.current = true
          k.jump = down
          break
        default:
          return
      }
      e.preventDefault()
    }
    const kd = (e: KeyboardEvent) => set(e, true)
    const ku = (e: KeyboardEvent) => set(e, false)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [])

  const camWant = useMemo(() => new Vector3(), [])
  const camLook = useMemo(() => new Vector3(), [])

  useGameFrame((_s, delta) => {
    const k = keys.current
    const input: PlayerInput = { ...k, jump: jumpEdge.current, cameraYaw: yaw.current }
    jumpEdge.current = false

    stepPlayer(state, input, delta, heightAt, bounds)

    if (body.current) {
      body.current.position.set(state.x, state.y + PLAYER.height / 2, state.z)
      body.current.rotation.y = state.facing
    }

    // Orbit the body at the aimed angle rather than trailing behind it, so
    // looking around does not drag the player round with it.
    const flat = Math.cos(pitch.current) * CAM_DISTANCE
    camWant.set(
      state.x - Math.sin(yaw.current) * flat,
      state.y + CAM_HEIGHT + Math.sin(pitch.current) * CAM_DISTANCE,
      state.z - Math.cos(yaw.current) * flat,
    )
    // Never let the camera end up under the sand.
    const floor = heightAt(camWant.x, camWant.z) + 1.2
    if (camWant.y < floor) camWant.y = floor

    camera.position.lerp(camWant, 1 - Math.exp(-delta * CAM_EASE))
    camLook.set(state.x, state.y + PLAYER.eyeHeight, state.z)
    camera.lookAt(camLook)
  }, PRIORITY.camera)

  return (
    <group ref={body}>
      <mesh castShadow>
        <capsuleGeometry args={[PLAYER.radius, PLAYER.height - PLAYER.radius * 2, 6, 12]} />
        <meshStandardMaterial color="#e0563f" roughness={0.55} />
      </mesh>
      {/* A snout, so which way the body is facing is obvious. */}
      <mesh castShadow position={[0, 0.25, PLAYER.radius + 0.16]}>
        <boxGeometry args={[0.22, 0.22, 0.34]} />
        <meshStandardMaterial color="#f2e9d8" roughness={0.6} />
      </mesh>
    </group>
  )
}
