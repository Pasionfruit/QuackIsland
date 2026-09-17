/**
 * Where the camera looks at the floor from.
 *
 * Still, high and in front, looking down at the middle of the floor, so the whole
 * round of it - and everybody running round the chairs on it - is in frame, and W
 * runs up the screen. Pulled back just far enough for the floor's edge to fit,
 * whatever shape the window is.
 */
import { PerspectiveCamera, Vector3 } from 'three'
import { FLOOR } from './rules'

export const FOV = 40
/** Degrees the camera looks down from level. */
export const TILT = 58
export const FILL = 0.94

/** The points that have to be in frame: the floor's rim, and a body's height above it. */
export const POINTS: readonly [number, number, number][] = Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * Math.PI * 2
  return [Math.sin(a) * (FLOOR.radius + 0.4), i % 2 === 0 ? 0 : 2, Math.cos(a) * (FLOOR.radius + 0.4)] as [number, number, number]
})

const cache = new Map<number, PerspectiveCamera>()

export function cameraFor(aspect: number): PerspectiveCamera {
  const safe = Math.max(0.3, Number.isFinite(aspect) ? aspect : 1)
  const known = cache.get(safe)
  if (known) return known
  const camera = new PerspectiveCamera(FOV, safe, 0.1, 200)
  const tilt = (TILT * Math.PI) / 180
  const back = new Vector3(0, Math.sin(tilt), Math.cos(tilt))
  const point = new Vector3()
  const place = (distance: number) => {
    camera.position.copy(back).multiplyScalar(distance)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    camera.updateProjectionMatrix()
  }
  const fits = () =>
    POINTS.every(([x, y, z]) => {
      point.set(x, y, z).project(camera)
      return point.z < 1 && Math.abs(point.x) <= FILL && Math.abs(point.y) <= FILL
    })
  let near = 4
  let far = 120
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
