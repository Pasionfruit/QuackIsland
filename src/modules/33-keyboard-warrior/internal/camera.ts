/**
 * Where everybody stands, and where the camera looks at them from.
 *
 * Everybody stands in a shallow curve across the back of the arena, facing the
 * camera, and the letters float in the space between them and it. The camera is
 * still: a little above, looking a little down, and pulled back just far enough
 * that the whole line of players and every place a letter can float are in frame,
 * whatever shape the window is.
 */
import { PerspectiveCamera, Vector3 } from 'three'
import { FLOAT } from './rules'

/** The lens. */
export const FOV = 42
/** Degrees the camera looks down. */
export const TILT = 12
/** How much of the frame, middle to edge, the scene may fill. */
export const FILL = 0.92
/** What the camera looks at. */
export const TARGET = { x: 0, y: 2, z: -0.4 } as const
/** Half the width of the line of players, and how far back it stands. */
export const LINE = { half: 4.2, back: -3, bow: 0.5 } as const
/** A letter tile's half size, and how much bigger it pops as it appears. */
export const TILE = { half: 0.8, pop: 1.15 } as const

/** Where player `index` of `count` stands: evenly along the curve, the ends a little forward. */
export function standPoint(count: number, index: number): { x: number; z: number } {
  const x = count <= 1 ? 0 : -LINE.half + (index / (count - 1)) * LINE.half * 2
  return { x, z: LINE.back + LINE.bow * (x / LINE.half) ** 2 }
}

const reach = TILE.half * TILE.pop

/** The points that have to be in frame: the ends of the line, head to foot, and every corner a letter can reach. */
export const POINTS: readonly [number, number, number][] = [
  [-LINE.half - 0.6, 0, LINE.back + LINE.bow],
  [LINE.half + 0.6, 0, LINE.back + LINE.bow],
  [-LINE.half - 0.6, 2.6, LINE.back],
  [LINE.half + 0.6, 2.6, LINE.back],
  ...[FLOAT.x[0] - reach, FLOAT.x[1] + reach].flatMap((x) =>
    [FLOAT.y[0] - reach - 0.15, FLOAT.y[1] + reach + 0.15].flatMap((y) => [FLOAT.z[0], FLOAT.z[1]].map((z): [number, number, number] => [x, y, z])),
  ),
]

const cache = new Map<number, PerspectiveCamera>()

/** The camera for a window shape: slid back along its line of sight until everything fits. */
export function cameraFor(aspect: number): PerspectiveCamera {
  const safe = Math.max(0.3, Number.isFinite(aspect) ? aspect : 1)
  const known = cache.get(safe)
  if (known) return known
  const camera = new PerspectiveCamera(FOV, safe, 0.1, 200)
  const tilt = (TILT * Math.PI) / 180
  const back = new Vector3(0, Math.sin(tilt), Math.cos(tilt))
  const point = new Vector3()
  const place = (distance: number) => {
    camera.position.set(TARGET.x, TARGET.y, TARGET.z).addScaledVector(back, distance)
    camera.lookAt(TARGET.x, TARGET.y, TARGET.z)
    camera.updateMatrixWorld(true)
    camera.updateProjectionMatrix()
  }
  const fits = () =>
    POINTS.every(([x, y, z]) => {
      point.set(x, y, z).project(camera)
      return point.z < 1 && Math.abs(point.x) <= FILL && Math.abs(point.y) <= FILL
    })
  let near = 3
  let far = 80
  for (let i = 0; i < 40; i++) {
    const mid = (near + far) / 2
    place(mid)
    if (fits()) far = mid
    else near = mid
  }
  place(far)
  cache.set(safe, camera)
  if (cache.size > 8) cache.delete(cache.keys().next().value!)
  return camera
}
