/**
 * The field: an open walled square with scattered rock cover and a cosmetic
 * hill at the middle, grown from the seed.
 *
 * Modelled closely on `32-hes-one-shot`'s own arena: not a lane or a maze,
 * cover everywhere rather than only round the edge, kept `FIELD.gap` apart
 * so there is always room to walk between any two pieces - one open space
 * with things in it, never a maze with a corner to be trapped in.
 *
 * **The hill is a visual set piece only.** It is drawn at the middle,
 * Mama Tank's own spawn sitting at its top, but it is not a `Block` and
 * never collides - movement and collision stay flat 2D for both roles
 * across the whole field, including the hill's own footprint, the same
 * simplification `65-big-backs-are-near` already made for its maze. See
 * `MODULE.md`.
 *
 * Cover is kept clear of the middle - where Mama Tank starts, and the hill
 * sits - and of the spawn ring the mini tanks start on. Everything here is
 * pure.
 */
import { createRng, hashSeed } from '../../00-core'

export const FIELD = {
  /** Half the floor's width: the inner face of the wall. 45 m: a 90 m square. */
  half: 45,
  wallHeight: 4,
  wallThickness: 1,
  /**
   * Cover, tall enough to block a shot from either role's own eye height -
   * Mama Tank's is the higher of the two - so nobody ever shoots over it,
   * either way.
   */
  coverHeight: 2.4,
  /** How many pieces of cover to try for. */
  cover: 60,
  /** The least gap between two pieces of cover: room for two tanks to pass. */
  gap: 2.2,
  /** Where the mini tanks start: a ring this far from the middle. */
  spawnRing: 38,
  /** The cosmetic hill at the middle: how wide its footprint is drawn, and how tall. Never collided with. */
  hillRadius: 11,
  hillHeight: 3.2,
  /** How far cover is kept clear of the middle - Mama Tank's own spawn, and the hill's own footprint. */
  centreClear: 13,
} as const

export interface Point {
  x: number
  z: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** A box standing on the floor: its extent on the ground, and how tall it is. */
export interface Block {
  x0: number
  z0: number
  x1: number
  z1: number
  height: number
  /** Part of the wall round the edge, rather than cover. */
  wall: boolean
}

export interface Arena {
  seed: number
  blocks: Block[]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** How far apart two boxes are on the ground, zero if they overlap. */
function gapBetween(a: Block, b: Block): number {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1, 0)
  const dz = Math.max(a.z0 - b.z1, b.z0 - a.z1, 0)
  return Math.hypot(dx, dz)
}

const cache = new Map<number, Arena>()

/** The field for a seed. The same seed, the same field. */
export function arenaFor(seed: number): Arena {
  const known = cache.get(seed)
  if (known) return known
  const { half, wallHeight: h, wallThickness: w } = FIELD
  const blocks: Block[] = [
    { x0: -half - w, x1: half + w, z0: -half - w, z1: -half, height: h, wall: true },
    { x0: -half - w, x1: half + w, z0: half, z1: half + w, height: h, wall: true },
    { x0: -half - w, x1: -half, z0: -half, z1: half, height: h, wall: true },
    { x0: half, x1: half + w, z0: -half, z1: half, height: h, wall: true },
  ]

  const random = createRng(hashSeed(seed, 'mama-tank:arena'))
  const cover: Block[] = []
  for (let attempt = 0; attempt < 1600 && cover.length < FIELD.cover; attempt++) {
    const sx = 1.4 + random() * 1.8
    const sz = 1.4 + random() * 1.8
    const reach = FIELD.half - FIELD.gap
    const cx = (random() * 2 - 1) * (reach - sx / 2)
    const cz = (random() * 2 - 1) * (reach - sz / 2)
    // Clear of the middle - Mama Tank's own spawn and the hill's footprint.
    if (Math.hypot(cx, cz) < FIELD.centreClear + Math.max(sx, sz) / 2) continue
    const block: Block = { x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2, height: FIELD.coverHeight, wall: false }
    if (cover.some((other) => gapBetween(block, other) < FIELD.gap)) continue
    cover.push(block)
  }

  const arena: Arena = { seed, blocks: [...blocks, ...cover] }
  cache.set(seed, arena)
  if (cache.size > 16) cache.delete(cache.keys().next().value!)
  return arena
}

/** Whether a body of `radius` standing at `p` overlaps anything. */
export function blocked(arena: Arena, p: Point, radius: number): boolean {
  for (const b of arena.blocks) {
    const dx = p.x - clamp(p.x, b.x0, b.x1)
    const dz = p.z - clamp(p.z, b.z0, b.z1)
    if (dx * dx + dz * dz < radius * radius - 1e-9) return true
  }
  return false
}

/**
 * The nearest place to `p` a body of `radius` can stand: pushed out of
 * anything it overlaps. Walking into a rock slides along it rather than
 * stopping dead.
 */
export function collide(arena: Arena, p: Point, radius: number): Point {
  let x = clamp(p.x, -FIELD.half + radius, FIELD.half - radius)
  let z = clamp(p.z, -FIELD.half + radius, FIELD.half - radius)
  for (let pass = 0; pass < 4; pass++) {
    let moved = false
    for (const b of arena.blocks) {
      const nx = clamp(x, b.x0, b.x1)
      const nz = clamp(z, b.z0, b.z1)
      const dx = x - nx
      const dz = z - nz
      const d2 = dx * dx + dz * dz
      if (d2 >= radius * radius) continue
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2)
        x = nx + (dx / d) * radius
        z = nz + (dz / d) * radius
      } else {
        const out = [x - b.x0, b.x1 - x, z - b.z0, b.z1 - z]
        const side = out.indexOf(Math.min(...out))
        if (side === 0) x = b.x0 - radius
        else if (side === 1) x = b.x1 + radius
        else if (side === 2) z = b.z0 - radius
        else z = b.z1 + radius
      }
      moved = true
    }
    if (!moved) break
  }
  return { x, z }
}

/** Moves a body from `from` by (`dx`, `dz`), a few centimetres at a time, sliding round whatever is in the way. */
export function slide(arena: Arena, from: Point, dx: number, dz: number, radius: number): Point {
  const length = Math.hypot(dx, dz)
  const steps = Math.max(1, Math.ceil(length / 0.1))
  let at = from
  for (let i = 0; i < steps; i++) at = collide(arena, { x: at.x + dx / steps, z: at.z + dz / steps }, radius)
  return at
}

/** The span of `t` for which `o + d t` lies between `lo` and `hi`, or null if never. */
export function slab(o: number, d: number, lo: number, hi: number): [number, number] | null {
  if (Math.abs(d) < 1e-12) return o < lo || o > hi ? null : [-Infinity, Infinity]
  const a = (lo - o) / d
  const b = (hi - o) / d
  return a < b ? [a, b] : [b, a]
}

/** How far along a ray from `from` in direction `dir` it goes before it meets a rock, a wall, or the floor - or `maxT`. */
export function rayHit(arena: Arena, from: Vec3, dir: Vec3, maxT: number): number {
  let best = maxT
  if (dir.y < -1e-9) best = Math.min(best, -from.y / dir.y)
  for (const b of arena.blocks) {
    const xs = slab(from.x, dir.x, b.x0, b.x1)
    const ys = slab(from.y, dir.y, 0, b.height)
    const zs = slab(from.z, dir.z, b.z0, b.z1)
    if (!xs || !ys || !zs) continue
    const enter = Math.max(xs[0], ys[0], zs[0])
    const exit = Math.min(xs[1], ys[1], zs[1])
    if (enter > exit || exit < 0) continue
    best = Math.min(best, Math.max(0, enter))
  }
  return Math.max(0, best)
}

/** Whether a straight line from `a` to `b` is clear of every block. */
export function lineClear(arena: Arena, a: Vec3, b: Vec3): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  if (d < 1e-9) return true
  const dir = { x: (b.x - a.x) / d, y: (b.y - a.y) / d, z: (b.z - a.z) / d }
  return rayHit(arena, a, dir, d) >= d - 1e-6
}

/**
 * How high the cosmetic hill's own surface stands at `(x, z)` - purely for
 * drawing a body at the right height as it crosses the mound's footprint;
 * `blocked`/`collide`/`slide`/`rayHit` never read it, since collision stays
 * flat 2D everywhere, hill included (see `MODULE.md`). Matches the tapered
 * cylinder `MamaScene` actually draws: a flat plateau out to
 * `hillRadius * 0.35`, then a straight taper down to nothing at
 * `hillRadius`, zero beyond it.
 */
export function hillHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z)
  const top = FIELD.hillRadius * 0.35
  if (r <= top) return FIELD.hillHeight
  if (r >= FIELD.hillRadius) return 0
  return (FIELD.hillHeight * (FIELD.hillRadius - r)) / (FIELD.hillRadius - top)
}

/** How much room a start needs round it: a body, and a step to turn round in. */
export const SPAWN_ROOM = 1.6

/** Where Mama Tank starts: fixed at the middle, the hill's own top - facing an arbitrary but seeded direction out across the field. */
export function mamaSpawn(seed: number): Point & { yaw: number } {
  // In -π..π, like every other yaw here - a spawn is never re-wrapped afterwards.
  const yaw = (createRng(hashSeed(seed, 'mama-tank:mama-spawn'))() * 2 - 1) * Math.PI
  return { x: 0, z: 0, yaw }
}

/**
 * Where mini tank `index` of `count` starts, and the way it faces: evenly
 * round the spawn ring, turned by the seed, looking at the middle - and if
 * a piece of cover is there, the nearest clear spot along the ring, either
 * way. Reuses `32-hes-one-shot`'s own `spawnPoint` shape almost directly:
 * attacking from below, from every side, maps onto a ring far better than
 * a single spawn line does.
 */
export function miniSpawn(seed: number, count: number, index: number): Point & { yaw: number } {
  const arena = arenaFor(seed)
  const turn = createRng(hashSeed(seed, 'mama-tank:spawn'))() * Math.PI * 2
  const angle = turn + (index / Math.max(1, count)) * Math.PI * 2
  const at = (a: number, ring: number) => ({ x: Math.sin(a) * ring, z: Math.cos(a) * ring })
  let p = at(angle, FIELD.spawnRing)
  search: for (let step = 0; step < 60; step++) {
    for (const ring of [FIELD.spawnRing, FIELD.spawnRing - 1.4]) {
      for (const side of [1, -1]) {
        const q = at(angle + side * step * 0.03, ring)
        if (!blocked(arena, q, SPAWN_ROOM)) {
          p = q
          break search
        }
      }
    }
  }
  // Facing (-sin yaw, -cos yaw), which is towards the middle.
  return { ...p, yaw: Math.atan2(p.x, p.z) }
}

/** A place a body of `radius` could stand, somewhere in the field, for a stand-in to head for. */
export function openPoint(arena: Arena, random: () => number, radius: number): Point {
  const reach = FIELD.half - radius - 1
  for (let i = 0; i < 50; i++) {
    const p = { x: (random() * 2 - 1) * reach, z: (random() * 2 - 1) * reach }
    if (!blocked(arena, p, radius + 0.4)) return p
  }
  return { x: 0, z: FIELD.spawnRing }
}
