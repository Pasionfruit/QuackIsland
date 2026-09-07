/**
 * The player on screen: a body that walks the island, and a camera you aim.
 *
 * Third person. Hold the left button and drag to look; hold the right button
 * and drag to slide the view off the player; the wheel pulls back. A click
 * that does not drag does nothing at all - the camera only ever moves while a
 * button is actually held, which is why there is no pointer lock here.
 *
 * All the movement maths is in controller.ts. This reads input, feeds it in,
 * and puts the result on a mesh.
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Group, Vector3 } from 'three'
import { PRIORITY, getDayTime, setCameraMode, tideAt, useGameFrame } from '../../00-core'
import { SEA_LEVEL, heightAt, worldBounds } from '../../01-terrain'
import { IDLE_INPUT, PLAYER, createPlayer, stepPlayer, type PlayerInput, type PlayerState } from './controller'
import { bodyPose } from './duck'
import { useDuck } from './DuckModel'

const CAM_HEIGHT = 2.6
const CAM_EASE = 12
/** Radians per pixel dragged. */
const SENSITIVITY = 0.0042
/** Metres per pixel dragged, at the closest zoom. Scaled up as you pull back. */
const PAN_SENSITIVITY = 0.016
const PITCH_MIN = -0.5
const PITCH_MAX = 1.05
export const CAM_DISTANCE_MIN = 4
export const CAM_DISTANCE_MAX = 260
const CAM_DISTANCE_DEFAULT = 9
/** How far the view may be slid off the player before it stops. */
const PAN_LIMIT = 400

/**
 * The live player, readable by other modules.
 *
 * Footprints and anything else following the player need its position every
 * frame, which is far too often to go through React state. This is the same
 * object the controller mutates, exposed read-only.
 */
let live: PlayerState | null = null

export function getPlayerState(): Readonly<PlayerState> | null {
  return live
}

/** Camera state, kept outside React so dragging costs no re-renders. */
const rig = {
  yaw: Math.PI,
  pitch: 0.2,
  distance: CAM_DISTANCE_DEFAULT,
  panX: 0,
  panZ: 0,
}

/** Snaps the view back onto the player. Wired to the button in the panel. */
export function refocusCamera(): void {
  rig.panX = 0
  rig.panZ = 0
  rig.distance = CAM_DISTANCE_DEFAULT
}

/** True when the view has been slid off the player, so the button can say so. */
export function isCameraOffPlayer(): boolean {
  return Math.hypot(rig.panX, rig.panZ) > 0.5
}

export interface PlayerProps {
  spawnX?: number
  spawnZ?: number
  /**
   * Height of the water surface above sea level at a point, at a moment -
   * the swell. Optional: without it the player floats at a flat sea level.
   *
   * Passed in rather than imported so this module does not depend on the water
   * module. Whether the player swims at all is decided from the terrain, so a
   * missing surface changes how they float and never whether they float.
   */
  surfaceAt?: (x: number, z: number, time: number) => number
}

export function Player({ spawnX = 0, spawnZ = 0, surfaceAt }: PlayerProps) {
  const camera = useThree((s) => s.camera)
  const domElement = useThree((s) => s.gl.domElement)
  const body = useRef<Group>(null)
  const tilt = useRef<Group>(null)
  const duck = useDuck()

  const state = useMemo(() => createPlayer(spawnX, spawnZ, heightAt), [spawnX, spawnZ])
  const keys = useRef<PlayerInput>({ ...IDLE_INPUT })
  const jumpEdge = useRef(false)

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

  // Look, pan and zoom. Everything is drag-driven: the camera moves only while
  // a button is down and the mouse is actually moving, so a plain click - left
  // or right - leaves the view exactly where it was.
  useEffect(() => {
    let button = -1

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 2) return
      button = e.button
      e.preventDefault()
    }

    const onMove = (e: MouseEvent) => {
      if (button === 0) {
        rig.yaw -= e.movementX * SENSITIVITY
        rig.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, rig.pitch + e.movementY * SENSITIVITY))
      } else if (button === 2) {
        // Slide the view across the ground, in the camera's own directions, so
        // dragging right always moves the view right whichever way you face.
        const scale = PAN_SENSITIVITY * (rig.distance / CAM_DISTANCE_DEFAULT)
        const fx = Math.sin(rig.yaw)
        const fz = Math.cos(rig.yaw)
        // Grab and drag: the focus moves opposite to the mouse, so the world
        // follows the cursor. Right is (-fz, fx), same as the controller.
        rig.panX += (e.movementX * fz - e.movementY * fx) * scale
        rig.panZ += (-e.movementX * fx - e.movementY * fz) * scale
        const off = Math.hypot(rig.panX, rig.panZ)
        if (off > PAN_LIMIT) {
          rig.panX = (rig.panX / off) * PAN_LIMIT
          rig.panZ = (rig.panZ / off) * PAN_LIMIT
        }
      }
    }

    const onUp = () => {
      button = -1
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // Proportional, so a notch feels the same close in and far out.
      const next = rig.distance * Math.exp(e.deltaY * 0.0012)
      rig.distance = Math.min(CAM_DISTANCE_MAX, Math.max(CAM_DISTANCE_MIN, next))
    }

    // Right-drag is a camera control here, so the browser menu is in the way.
    const onContext = (e: Event) => e.preventDefault()

    domElement.addEventListener('mousedown', onDown)
    domElement.addEventListener('wheel', onWheel, { passive: false })
    domElement.addEventListener('contextmenu', onContext)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      domElement.removeEventListener('mousedown', onDown)
      domElement.removeEventListener('wheel', onWheel)
      domElement.removeEventListener('contextmenu', onContext)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
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
        case 'ShiftLeft':
        case 'ShiftRight':
          k.run = down
          break
        case 'KeyF':
          if (down) refocusCamera()
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

  // The controller asks for the surface at a point, without a time; the time
  // is whatever frame we are in. Built once over a mutable slot rather than
  // closed over per frame, so stepping the player allocates nothing.
  const clock = useRef(0)
  // Where the still water stands this frame: the datum plus the tide. This is
  // what decides whether you are out of your depth, so it must not include the
  // swell - a heaving surface would make wading flicker into swimming.
  const still = useRef<number>(SEA_LEVEL)
  const surface = useMemo(() => {
    if (!surfaceAt) return undefined
    return (x: number, z: number) => still.current + surfaceAt(x, z, clock.current)
  }, [surfaceAt])

  useGameFrame((frame, delta) => {
    const k = keys.current
    const input: PlayerInput = { ...k, jump: jumpEdge.current, cameraYaw: rig.yaw }
    jumpEdge.current = false

    clock.current = frame.clock.elapsedTime
    still.current = SEA_LEVEL + tideAt(getDayTime())
    stepPlayer(state, input, delta, heightAt, {
      bounds,
      seaLevel: still.current,
      surfaceAt: surface,
    })

    // Shared with every remote duck, so they cannot sit at different heights.
    const { rise, tip } = bodyPose(state.lean, PLAYER.height, PLAYER.radius)

    if (body.current) {
      body.current.position.set(state.x, state.y + rise, state.z)
      body.current.rotation.y = state.facing
    }
    if (tilt.current) {
      tilt.current.rotation.x = tip * (Math.PI / 2)
    }

    // What the camera is pointed at: the player, plus however far the view has
    // been slid off them.
    const focusX = state.x + rig.panX
    const focusZ = state.z + rig.panZ
    const focusY = state.y + CAM_HEIGHT

    // Camera sits behind the focus along the look direction, so forward in the
    // controller is always away from the camera.
    const flat = Math.cos(rig.pitch) * rig.distance
    camWant.set(
      focusX - Math.sin(rig.yaw) * flat,
      focusY + Math.sin(rig.pitch) * rig.distance,
      focusZ - Math.cos(rig.yaw) * flat,
    )
    const floor = heightAt(camWant.x, camWant.z) + 1.2
    if (camWant.y < floor) camWant.y = floor

    camera.position.lerp(camWant, 1 - Math.exp(-delta * CAM_EASE))
    camLook.set(focusX, focusY - CAM_HEIGHT + PLAYER.eyeHeight, focusZ)
    camera.lookAt(camLook)
  }, PRIORITY.camera)

  return (
    <group ref={body}>
      {/* The outer group owns which way the body faces; this one owns the tip
          from standing to swimming, so the two never fight over one rotation. */}
      <group ref={tilt}>
        {/* Both bodies hang half a height below the tilt, because that is the
            middle of the body and the middle is what should pivot. The duck's
            own origin is at its feet, so this puts them on the ground. */}
        <group position={[0, -PLAYER.height / 2, 0]}>
          {duck ? (
            <primitive object={duck} />
          ) : (
            // Shown only until the model arrives, and left in place if it never
            // does - an invisible player is a worse failure than a plain one.
            <group position={[0, PLAYER.height / 2, 0]}>
              <mesh castShadow>
                <capsuleGeometry args={[PLAYER.radius, PLAYER.height - PLAYER.radius * 2, 6, 12]} />
                <meshStandardMaterial color="#e0563f" roughness={0.55} />
              </mesh>
              <mesh castShadow position={[0, 0.25, PLAYER.radius + 0.16]}>
                <boxGeometry args={[0.22, 0.22, 0.34]} />
                <meshStandardMaterial color="#f2e9d8" roughness={0.6} />
              </mesh>
            </group>
          )}
        </group>
      </group>
    </group>
  )
}
