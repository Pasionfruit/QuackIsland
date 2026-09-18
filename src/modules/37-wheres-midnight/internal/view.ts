/**
 * Where the camera points, as arithmetic.
 *
 * Everybody stands at the same spot - up on a stack of crushed cars at the near
 * edge of the junkyard - and can turn and zoom but never walk. That is the
 * "holding a camera" the brief asks for: a drag turns it, the wheel zooms it.
 *
 * **A drag grabs the scene.** Whatever was under the pointer when you pressed
 * stays under the pointer as you move it, at any zoom. **The wheel zooms towards
 * the pointer**: the thing you are pointing at stays where it is while
 * everything else grows round it. Both come from `pin`.
 *
 * Pure, and the same numbers three.js uses: a yaw about +Y then a pitch about
 * the camera's own X (Euler order `YXZ`), and a vertical field of view.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface View {
  /** Radians. Zero looks north, down -Z, across the yard. Positive turns left. */
  yaw: number
  /** Radians. Negative looks down. */
  pitch: number
  /** Vertical field of view, degrees. Smaller is zoomed in. */
  fov: number
}

const radians = (d: number) => (d * Math.PI) / 180

/** Where everybody stands: above the south edge of the yard. */
export const EYE: Readonly<Vec3> = Object.freeze({ x: 0, y: 5.5, z: 3 })

export const VIEW = {
  yawLimit: radians(64),
  pitchMin: radians(-55),
  pitchMax: radians(10),
  fovMax: 60,
  fovMin: 6,
  start: { yaw: 0, pitch: radians(-16), fov: 60 },
  /** How far a wheel notch zooms: the field of view is scaled by exp(delta times this). */
  wheelRate: 0.0016,
  /** How far, in pixels, a press has to move before it is a drag rather than a click. */
  dragPixels: 5,
  /** How zoomed in, as a magnification, before the flashlight can be switched on. */
  torchZoom: 2,
} as const

export function startView(): View {
  return { ...VIEW.start }
}

export function clampView(view: View): View {
  view.yaw = Math.max(-VIEW.yawLimit, Math.min(VIEW.yawLimit, view.yaw))
  view.pitch = Math.max(VIEW.pitchMin, Math.min(VIEW.pitchMax, view.pitch))
  view.fov = Math.max(VIEW.fovMin, Math.min(VIEW.fovMax, view.fov))
  return view
}

/** The way the camera faces for a yaw and a pitch. Unit length. */
export function direction(yaw: number, pitch: number): Vec3 {
  return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }
}

/** The yaw and pitch that face along a direction. */
export function anglesOf(d: Vec3): { yaw: number; pitch: number } {
  const length = Math.hypot(d.x, d.y, d.z) || 1
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(Math.max(-1, Math.min(1, d.y / length))) }
}

/**
 * The ray from the eye through a point on the screen, as a unit direction.
 *
 * `nx` and `ny` run -1 to 1, left to right and bottom to top; `aspect` is the
 * view's width over its height.
 */
export function rayThrough(view: View, nx: number, ny: number, aspect: number): Vec3 {
  const tan = Math.tan(radians(view.fov) / 2)
  // In the camera's own frame, looking down -Z.
  let x = nx * tan * aspect
  let y = ny * tan
  let z = -1
  // Pitch about X.
  const cp = Math.cos(view.pitch)
  const sp = Math.sin(view.pitch)
  ;[y, z] = [y * cp - z * sp, y * sp + z * cp]
  // Yaw about Y.
  const cy = Math.cos(view.yaw)
  const sy = Math.sin(view.yaw)
  ;[x, z] = [x * cy + z * sy, -x * sy + z * cy]
  const length = Math.hypot(x, y, z)
  return { x: x / length, y: y / length, z: z / length }
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * Turns the view so a world direction sits under a point on the screen, as near
 * as the limits allow. Mutates and returns the view.
 */
export function pin(view: View, nx: number, ny: number, target: Vec3, aspect: number): View {
  const want = anglesOf(target)
  for (let i = 0; i < 8; i++) {
    const got = anglesOf(rayThrough(view, nx, ny, aspect))
    view.yaw += wrap(want.yaw - got.yaw)
    view.pitch += want.pitch - got.pitch
    clampView(view)
  }
  return view
}

/** Sets the zoom, keeping whatever is under a point on the screen where it is. */
export function zoomAt(view: View, fov: number, nx: number, ny: number, aspect: number): View {
  const under = rayThrough(view, nx, ny, aspect)
  view.fov = fov
  clampView(view)
  return pin(view, nx, ny, under, aspect)
}

/** The field of view one wheel movement leads to. */
export function wheelFov(fov: number, deltaY: number): number {
  return Math.max(VIEW.fovMin, Math.min(VIEW.fovMax, fov * Math.exp(deltaY * VIEW.wheelRate)))
}

/** How zoomed in, as a magnification against the widest view: 1x to 10x or so. */
export function magnification(view: View): number {
  return Math.tan(radians(VIEW.fovMax) / 2) / Math.tan(radians(view.fov) / 2)
}
