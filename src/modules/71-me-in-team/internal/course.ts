import { createRng, hashSeed } from '../../00-core'

export const HALF_WIDTH = 13
export const HALF_LENGTH = 24
export const BODY_RADIUS = 0.38
export interface Point { x: number; z: number }
export interface Obstacle extends Point { w: number; d: number; h: number }
export interface Course { obstacles: Obstacle[]; checkpoints: readonly Point[]; finish: Point }
const cache = new Map<number, Course>()
export function courseFor(seed: number): Course {
  const old = cache.get(seed)
  if (old) return old
  const rng = createRng(hashSeed(seed, 'me-in-team:course'))
  const course: Course = {
    obstacles: [[5, 10], [-3, -1], [5, -12], [-6, -17]].map(([x, z]) => ({ x: x + (rng() - .5) * .5, z: z + (rng() - .5) * .5, w: 2.3, d: 2.8, h: 2.4 })),
    checkpoints: [{ x: -8, z: 7 }, { x: 8, z: -6 }, { x: 0, z: -16 }],
    finish: { x: 0, z: -21 },
  }
  cache.set(seed, course)
  if (cache.size > 12) cache.delete(cache.keys().next().value!)
  return course
}
export function resolvePoint(course: Course, p: Point, radius = BODY_RADIUS): void {
  p.x = Math.max(-HALF_WIDTH + radius, Math.min(HALF_WIDTH - radius, p.x))
  p.z = Math.max(-HALF_LENGTH + radius, Math.min(HALF_LENGTH - radius, p.z))
  for (const c of course.obstacles) {
    const x = c.w / 2 + radius - Math.abs(p.x - c.x), z = c.d / 2 + radius - Math.abs(p.z - c.z)
    if (x <= 0 || z <= 0) continue
    if (x < z) p.x += (p.x >= c.x ? 1 : -1) * x
    else p.z += (p.z >= c.z ? 1 : -1) * z
  }
}
export function validPoint(course: Course, p: Point, radius = BODY_RADIUS): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) <= HALF_WIDTH - radius + 1e-7 && Math.abs(p.z) <= HALF_LENGTH - radius + 1e-7
    && course.obstacles.every((c) => Math.abs(p.x - c.x) >= c.w / 2 + radius - 1e-7 || Math.abs(p.z - c.z) >= c.d / 2 + radius - 1e-7)
}
export function closestOnSegment(p: Point, a: Point, b: Point): Point & { t: number } {
  const dx = b.x - a.x, dz = b.z - a.z, d = dx * dx + dz * dz
  const t = d < 1e-10 ? .5 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / d))
  return { x: a.x + dx * t, z: a.z + dz * t, t }
}
