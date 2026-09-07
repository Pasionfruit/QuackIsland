/**
 * The player on screen: a body that walks the island, and a camera behind it.
 *
 * All the movement maths is in controller.ts; this reads the keyboard, feeds it
 * in, and puts the result on a mesh. Ground height comes from the terrain
 * module's contract, so the player walks on exactly the surface being drawn.
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Group, Vector3 } from 'three'
import { PRIORITY, setCameraMode, useGameFrame } from '../../00-core'
import { heightAt, worldBounds } from '../../01-terrain'
import { IDLE_INPUT, PLAYER, createPlayer, stepPlayer, type PlayerInput } from './controller'

/** How far back and up the camera sits, and how quickly it catches up. */
const CAM_BACK = 9
const CAM_UP = 4.2
const CAM_EASE = 6

export function Player({ spawnX = 0, spawnZ = 0 }: { spawnX?: number; spawnZ?: number }) {
  const camera = useThree((s) => s.camera)
  const body = useRef<Group>(null)

  const state = useMemo(() => createPlayer(spawnX, spawnZ, heightAt), [spawnX, spawnZ])
  const keys = useRef<PlayerInput>({ ...IDLE_INPUT })
  const jumpEdge = useRef(false)
  const bounds = useMemo(() => {
    const b = worldBounds()
    // Keep a little margin so the player cannot stand exactly on the seam.
    return { minX: b.minX + 2, maxX: b.maxX - 2, minZ: b.minZ + 2, maxZ: b.maxZ - 2 }
  }, [])

  // Claim the camera while the player exists, and give it back on unmount.
  useEffect(() => {
    setCameraMode('player')
    return () => setCameraMode('orbit')
  }, [])

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
          // Edge-detected here rather than in the controller, so holding the
          // key does not turn into a hover.
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

  const camTarget = useMemo(() => new Vector3(), [])
  const camLook = useMemo(() => new Vector3(), [])
  const yaw = useRef(0)

  useGameFrame((_s, delta) => {
    const k = keys.current
    const input: PlayerInput = { ...k, jump: jumpEdge.current, cameraYaw: yaw.current }
    jumpEdge.current = false

    stepPlayer(state, input, delta, heightAt, bounds)

    if (body.current) {
      body.current.position.set(state.x, state.y + PLAYER.height / 2, state.z)
      body.current.rotation.y = state.facing
    }

    // A follow camera that trails the body rather than being rigidly bolted to
    // it, so turning reads as the camera swinging round rather than snapping.
    const behind = state.facing
    camTarget.set(
      state.x - Math.sin(behind) * CAM_BACK,
      state.y + CAM_UP,
      state.z - Math.cos(behind) * CAM_BACK,
    )
    // Never let the camera end up under the sand.
    const floor = heightAt(camTarget.x, camTarget.z) + 1.5
    if (camTarget.y < floor) camTarget.y = floor

    const t = 1 - Math.exp(-delta * CAM_EASE)
    camera.position.lerp(camTarget, t)
    camLook.set(state.x, state.y + PLAYER.eyeHeight, state.z)
    camera.lookAt(camLook)
    yaw.current = Math.atan2(camera.position.x - state.x, camera.position.z - state.z) + Math.PI
  }, PRIORITY.camera)

  return (
    <group ref={body}>
      <mesh castShadow position={[0, 0, 0]}>
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
