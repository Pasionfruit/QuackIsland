/**
 * Where the easel, the duck and the chef stand, where the camera looks at them
 * from, and where the mouse is on the board.
 *
 * **The camera looks straight down -Z, square on to the board**, which stands
 * upright facing it. A flat thing square on to the camera is drawn without any
 * perspective distortion, so the board on the screen is an exact square and the
 * mouse on the screen maps to the board by scaling alone: what you see your pen
 * touch is where it is. The camera is slid back until the easel, the duck and the
 * chef all fit, whatever shape the window is, and moved sideways and up to centre
 * them - it never turns.
 */
import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three'
import type { Pt } from './outlines'

export const FOV = 38
/** How much of the frame, middle to edge, the scene may fill. */
export const FILL = 0.94
/** The board: where its middle is, and half its width - board units -1 to 1 span it. */
export const BOARD = { x: -0.7, y: 3.05, z: 0, half: 2.55 } as const
/** The duck, standing on the floor to the right, facing the board. */
export const DUCK = { x: 3.9, z: 0.6, scale: 1.25 } as const
/** The chef at the easel, to its left. */
export const CHEF = { x: -4.35, z: 0.9 } as const

/** The points that have to be in frame: the board in its frame, the easel's feet, the duck, the chef and his hat. */
export const POINTS: readonly [number, number, number][] = [
  [BOARD.x - BOARD.half - 0.2, BOARD.y + BOARD.half + 0.25, BOARD.z],
  [BOARD.x + BOARD.half + 0.2, BOARD.y + BOARD.half + 0.25, BOARD.z],
  [BOARD.x - BOARD.half - 0.2, 0, BOARD.z],
  [BOARD.x + BOARD.half + 0.2, 0, BOARD.z],
  [DUCK.x + 1.05 * DUCK.scale, 0, DUCK.z],
  [DUCK.x + 1.05 * DUCK.scale, 2.55 * DUCK.scale, DUCK.z],
  [CHEF.x - 0.6, 0, CHEF.z],
  [CHEF.x - 0.6, 2.5, CHEF.z],
]

export interface Shot {
  x: number
  y: number
  z: number
}

const shots = new Map<number, Shot>()

/** Where the camera stands for a window shape: centred on everything, back just far enough. */
export function frameScene(aspect: number): Shot {
  const safe = Math.max(0.3, Number.isFinite(aspect) ? aspect : 1)
  const known = shots.get(safe)
  if (known) return known
  const tanV = Math.tan((FOV * Math.PI) / 360) * FILL
  const tanH = tanV * safe
  const xs = POINTS.map((p) => p[0])
  const ys = POINTS.map((p) => p[1])
  const x = (Math.min(...xs) + Math.max(...xs)) / 2
  const y = (Math.min(...ys) + Math.max(...ys)) / 2
  let z = 0
  for (const [px, py, pz] of POINTS) z = Math.max(z, pz + Math.abs(px - x) / tanH, pz + Math.abs(py - y) / tanV)
  const shot = { x, y, z }
  shots.set(safe, shot)
  if (shots.size > 8) shots.delete(shots.keys().next().value!)
  return shot
}

const cameras = new Map<number, PerspectiveCamera>()

/** The camera itself for a window shape - the one the scene uses. */
export function cameraFor(aspect: number): PerspectiveCamera {
  const safe = Math.max(0.3, Number.isFinite(aspect) ? aspect : 1)
  const known = cameras.get(safe)
  if (known) return known
  const shot = frameScene(safe)
  const camera = new PerspectiveCamera(FOV, safe, 0.1, 200)
  camera.position.set(shot.x, shot.y, shot.z)
  camera.lookAt(shot.x, shot.y, shot.z - 1)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  cameras.set(safe, camera)
  if (cameras.size > 8) cameras.delete(cameras.keys().next().value!)
  return camera
}

const ray = new Raycaster()
const plane = new Plane(new Vector3(0, 0, 1), -BOARD.z)
const hit = new Vector3()

/** Where the mouse is on the board: `ndc` is the pointer across the canvas, -1 to 1 each way, up positive. */
export function boardPoint(ndc: { x: number; y: number }, aspect: number): Pt | null {
  ray.setFromCamera(new Vector2(ndc.x, ndc.y), cameraFor(aspect))
  const at = ray.ray.intersectPlane(plane, hit)
  return at ? { x: (at.x - BOARD.x) / BOARD.half, y: (at.y - BOARD.y) / BOARD.half } : null
}

/** Where a point on the board is on the canvas, -1 to 1 each way, up positive. */
export function boardToScreen(p: Pt, aspect: number): { x: number; y: number } {
  const v = new Vector3(BOARD.x + p.x * BOARD.half, BOARD.y + p.y * BOARD.half, BOARD.z).project(cameraFor(aspect))
  return { x: v.x, y: v.y }
}
