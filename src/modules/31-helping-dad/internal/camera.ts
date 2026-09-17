/**
 * Where the camera stands over the maze, and where the mouse is in it.
 *
 * High over the maze and nearly straight down, so the mouse on the screen and
 * the torch on the ground go together, with Dad standing at the top edge. The
 * walls are low, and the torch is carried at the height of their tops - so what
 * you see a torch touch is what it touches.
 *
 * Fitted the same way as the other minigames' cameras: slid along its line of
 * sight until the maze touches the edge of the frame, and aimed so the space
 * above and below comes out even.
 */
import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three'
import { GRID, HALF, type Point } from './maze'

/**
 * Where Dad stands, how big he is, and how far he leans back - radians - so his
 * face, not the top of his cap, is what the camera looking down on him sees.
 */
export const DAD = { z: -HALF.z - 0.9, scale: 1.4, height: 1.8 * 1.4, lean: 1.05 } as const

/** The top of Dad's head, leaning back. */
const dadTop = { y: DAD.height * Math.cos(DAD.lean), z: DAD.z - DAD.height * Math.sin(DAD.lean) }

/** The height a torch is carried at: the top of the walls. */
export const HOLD = GRID.height

/** The points that have to be in frame: the maze with its outer wall, and Dad. */
export const POINTS: readonly [number, number, number][] = [
  [-HALF.x - 0.2, 0, -HALF.z - 0.2],
  [HALF.x + 0.2, 0, -HALF.z - 0.2],
  [-HALF.x - 0.2, 0, HALF.z + 0.2],
  [HALF.x + 0.2, 0, HALF.z + 0.2],
  // His head and cap, with room for the jump when he yells.
  [-1.2, dadTop.y + 0.7, dadTop.z - 0.7],
  [1.2, dadTop.y + 0.7, dadTop.z - 0.7],
]

/** Degrees up from the ground: nearly straight down. */
export const TILT = 70
/** The lens. */
export const FOV = 40
/** How much of the frame, middle to edge, the scene may fill. */
export const FILL = 0.96

export interface Shot {
  x: number
  y: number
  z: number
  target: { x: number; y: number; z: number }
  distance: number
}

const radians = (d: number) => (d * Math.PI) / 180
let last: { aspect: number; shot: Shot } | null = null

export function frameScene(aspect: number): Shot {
  const safeAspect = Math.max(0.2, Number.isFinite(aspect) ? aspect : 1)
  if (last && last.aspect === safeAspect) return last.shot

  const tanV = Math.tan(radians(FOV) / 2) * FILL
  const tanH = tanV * safeAspect
  const up = radians(TILT)
  const back = { y: Math.sin(up), z: Math.cos(up) }
  const screenUp = { y: Math.cos(up), z: -Math.sin(up) }

  const needed = (aim: number) => {
    let most = 0
    for (const [x, y, z] of POINTS) {
      const along = y * back.y + (z - aim) * back.z
      const high = y * screenUp.y + (z - aim) * screenUp.z
      most = Math.max(most, along + Math.abs(x) / tanH, along + Math.abs(high) / tanV)
    }
    return most
  }
  const lopsided = (aim: number, distance: number) => {
    let top = -Infinity
    let bottom = Infinity
    for (const [, y, z] of POINTS) {
      const along = y * back.y + (z - aim) * back.z
      const high = (y * screenUp.y + (z - aim) * screenUp.z) / (distance - along)
      top = Math.max(top, high)
      bottom = Math.min(bottom, high)
    }
    return top + bottom
  }
  const centred = (distance: number) => {
    let low = -12
    let high = 12
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2
      if (lopsided(mid, distance) > 0) high = mid
      else low = mid
    }
    return (low + high) / 2
  }

  let aim = 0
  let distance = needed(aim)
  for (let i = 0; i < 20; i++) {
    aim = centred(distance)
    distance = needed(aim)
  }

  const shot: Shot = { x: 0, y: back.y * distance, z: aim + back.z * distance, target: { x: 0, y: 0, z: aim }, distance }
  last = { aspect: safeAspect, shot }
  return shot
}

/** The camera itself, for a window shape - the one the scene uses. */
export function cameraFor(aspect: number): PerspectiveCamera {
  const shot = frameScene(aspect)
  const camera = new PerspectiveCamera(FOV, Math.max(0.2, Number.isFinite(aspect) ? aspect : 1), 0.5, 200)
  camera.position.set(shot.x, shot.y, shot.z)
  camera.lookAt(shot.target.x, shot.target.y, shot.target.z)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  return camera
}

const cameras = new Map<number, PerspectiveCamera>()
const ray = new Raycaster()
const hold = new Plane(new Vector3(0, 1, 0), -HOLD)
const hitPoint = new Vector3()

/**
 * Where the mouse is in the maze, at the height a torch is carried: `ndc` is the
 * pointer in the board, -1 to 1 each way, up positive. Null if it points at the sky.
 */
export function aimAt(ndc: { x: number; y: number }, aspect: number): Point | null {
  let camera = cameras.get(aspect)
  if (!camera) {
    camera = cameraFor(aspect)
    cameras.set(aspect, camera)
    if (cameras.size > 8) cameras.delete(cameras.keys().next().value!)
  }
  ray.setFromCamera(new Vector2(ndc.x, ndc.y), camera)
  const hit = ray.ray.intersectPlane(hold, hitPoint)
  return hit ? { x: hit.x, z: hit.z } : null
}
