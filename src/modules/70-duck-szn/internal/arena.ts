import { createRng, hashSeed } from '../../00-core'

export const EDGE = 23
export const RADIUS = 0.34
export interface Point { x: number; z: number }
export interface Vector extends Point { y: number }
export interface Cover extends Point { w: number; d: number; h: number; kind: 'rock' | 'log' }
export interface Arena { seed: number; cover: Cover[] }
const cache = new Map<number, Arena>()

export function arenaFor(seed: number): Arena {
  const known = cache.get(seed)
  if (known) return known
  const rng = createRng(hashSeed(seed, 'duck-szn:marsh'))
  const cover: Cover[] = []
  for (const z of [-13, -5, 4, 12]) for (const x of [-15, -6, 6, 15]) {
    const log = rng() < 0.55
    cover.push({ x: x + (rng() - 0.5) * 2, z: z + (rng() - 0.5) * 2, w: log ? 3.9 : 2.4, d: log ? 1 : 2.6, h: log ? 0.68 : 2.5, kind: log ? 'log' : 'rock' })
  }
  const arena = { seed, cover }
  cache.set(seed, arena)
  if (cache.size > 12) cache.delete(cache.keys().next().value!)
  return arena
}
export function walkable(a: Arena, x: number, z: number, radius = RADIUS): boolean {
  return Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= EDGE - radius && Math.abs(z) <= EDGE - radius
    && !a.cover.some((c) => Math.abs(x - c.x) < c.w / 2 + radius && Math.abs(z - c.z) < c.d / 2 + radius)
}
export function slide(a: Arena, from: Point, to: Point): Point {
  const target = { x: Math.max(-EDGE + RADIUS, Math.min(EDGE - RADIUS, to.x)), z: Math.max(-EDGE + RADIUS, Math.min(EDGE - RADIUS, to.z)) }
  const steps = Math.max(1, Math.ceil(Math.hypot(target.x - from.x, target.z - from.z) / 0.2))
  const dx = (target.x - from.x) / steps, dz = (target.z - from.z) / steps
  let x = from.x, z = from.z
  for (let i = 0; i < steps; i++) {
    if (walkable(a, x + dx, z + dz)) { x += dx; z += dz }
    else { if (walkable(a, x + dx, z)) x += dx; if (walkable(a, x, z + dz)) z += dz }
  }
  return { x, z }
}
export function spawn(a: Arena, seat: number): Point {
  if (seat < 0) return { x: 0, z: 20 }
  for (let tries = 0; tries < 30; tries++) {
    const angle = seat * 2.39996 + tries * 0.19
    const p = { x: Math.sin(angle) * (13 + tries * 0.18), z: Math.cos(angle) * (13 + tries * 0.18) - 3 }
    if (walkable(a, p.x, p.z)) return p
  }
  return { x: -20 + seat * 2, z: -20 }
}
/** Distance to the first intersection of a ray and an axis-aligned box. */
export function rayBox(origin: Vector, direction: Vector, min: Vector, max: Vector): number | null {
  let near = 0, far = Infinity
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(direction[axis]) < 1e-8) { if (origin[axis] < min[axis] || origin[axis] > max[axis]) return null; continue }
    let a = (min[axis] - origin[axis]) / direction[axis], b = (max[axis] - origin[axis]) / direction[axis]
    if (a > b) [a, b] = [b, a]
    near = Math.max(near, a); far = Math.min(far, b)
    if (near > far) return null
  }
  return far < 0 ? null : near
}
export function blockedAt(a: Arena, origin: Vector, direction: Vector): number {
  let nearest = 80
  for (const c of a.cover) {
    const d = rayBox(origin, direction, { x: c.x - c.w / 2, y: 0, z: c.z - c.d / 2 }, { x: c.x + c.w / 2, y: c.h, z: c.z + c.d / 2 })
    if (d !== null) nearest = Math.min(nearest, d)
  }
  return nearest
}
