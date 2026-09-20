/**
 * The arena: a walled square of sand with cover in the middle, grown from the seed.
 *
 * Everybody starts on a ring near the wall, facing the middle, nudged along it
 * clear of any cover. Cover is everywhere, not only in the middle - an open
 * band round the edge would be a shooting gallery from the first second. Every
 * piece of cover is taller than anybody's eyes:
 * nobody shoots over it, and a shot either reaches you or it does not.
 *
 * Cover is boxes, square to the world, with room to walk between any two of
 * them - so the arena is always one open space with things in it, never a maze
 * with a corner you can be trapped in.
 *
 * **It is big**: 48 m across, with over fifty pieces of cover. Scattered through
 * it are a few spots where a shield power-up appears - see `pickups` - spread well
 * apart and always in the open - and inside the ring everybody starts on, so nobody
 * starts with one - so getting to one is a run across the arena and a decision
 * about whether it is worth it.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

export const ARENA = {
  /** Half the floor's width: the inner face of the wall. 24 m: a 48 m square, over twice the area it was. */
  half: 24,
  /** The wall round the edge. */
  wallHeight: 3.6,
  wallThickness: 1,
  /**
   * Cover, all of it taller than anybody's eyes - **even at the top of a jump**:
   * eyes 1.7 m, and a jump takes them 0.9 m higher, to 2.6, under the 2.8 m of the
   * cover. Nobody shoots over cover, in the air or on the ground.
   */
  coverHeight: 2.8,
  /** How many pieces of cover to try for. */
  cover: 56,
  /** The least gap between two pieces of cover: room for two to pass. */
  gap: 1.8,
  /** Where everybody starts: a ring this far from the middle. */
  spawnRing: 20,
  /** How many places a shield power-up can appear, and the least distance between two of them. */
  pickups: 10,
  pickupGap: 10,
  /** How much room a pickup needs round it, clear of cover. */
  pickupRoom: 1.4,
  /** How far inside the ring everybody starts on the shields stay, so nobody starts on one. */
  pickupClear: 4,
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
  /** Where a shield power-up appears: the same places all game, from the seed. */
  pickups: Point[]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** How far apart two boxes are on the ground, zero if they overlap. */
function gapBetween(a: Block, b: Block): number {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1, 0)
  const dz = Math.max(a.z0 - b.z1, b.z0 - a.z1, 0)
  return Math.hypot(dx, dz)
}

const cache = new Map<number, Arena>()

/** The arena for a seed. The same seed, the same arena. */
export function arenaFor(seed: number): Arena {
  const known = cache.get(seed)
  if (known) return known
  const { half, wallHeight: h, wallThickness: w } = ARENA
  const blocks: Block[] = [
    { x0: -half - w, x1: half + w, z0: -half - w, z1: -half, height: h, wall: true },
    { x0: -half - w, x1: half + w, z0: half, z1: half + w, height: h, wall: true },
    { x0: -half - w, x1: -half, z0: -half, z1: half, height: h, wall: true },
    { x0: half, x1: half + w, z0: -half, z1: half, height: h, wall: true },
  ]

  const random = createRng(hashSeed(seed, 'hes-one-shot:arena'))
  const cover: Block[] = []
  for (let attempt = 0; attempt < 1200 && cover.length < ARENA.cover; attempt++) {
    // A crate, or a length of wall one way or the other.
    const kind = random()
    let sx: number
    let sz: number
    if (kind < 0.55) {
      sx = 1.2 + random() * 1.2
      sz = 1.2 + random() * 1.2
    } else {
      const long = 3 + random() * 2.5
      const thin = 0.6
      ;[sx, sz] = kind < 0.78 ? [long, thin] : [thin, long]
    }
    // Wholly inside the wall, with room to walk between it and the wall.
    const reach = ARENA.half - ARENA.gap
    const cx = (random() * 2 - 1) * (reach - sx / 2)
    const cz = (random() * 2 - 1) * (reach - sz / 2)
    const block: Block = { x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2, height: ARENA.coverHeight, wall: false }
    if (cover.some((other) => gapBetween(block, other) < ARENA.gap)) continue
    cover.push(block)
  }

  // Where the shields appear: in the open, well apart, from a stream of their own so the cover is what it always was for a seed.
  const luck = createRng(hashSeed(seed, 'hes-one-shot:pickups'))
  const pickups: Point[] = []
  const all = [...blocks, ...cover]
  const reach = ARENA.half - ARENA.pickupRoom - 1
  for (let attempt = 0; attempt < 600 && pickups.length < ARENA.pickups; attempt++) {
    const at = { x: (luck() * 2 - 1) * reach, z: (luck() * 2 - 1) * reach }
    // Inside the ring everybody starts on, well clear of it: nobody starts with a shield by starting on one.
    if (Math.hypot(at.x, at.z) > ARENA.spawnRing - ARENA.pickupClear) continue
    if (all.some((b) => Math.hypot(at.x - clamp(at.x, b.x0, b.x1), at.z - clamp(at.z, b.z0, b.z1)) < ARENA.pickupRoom)) continue
    if (pickups.some((other) => Math.hypot(at.x - other.x, at.z - other.z) < ARENA.pickupGap)) continue
    pickups.push(at)
  }

  const arena: Arena = { seed, blocks: all, pickups }
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
 * The nearest place to `p` a body of `radius` can stand: pushed out of anything
 * it overlaps, the shortest way. Walking into a box slides along it rather than
 * stopping dead.
 */
export function collide(arena: Arena, p: Point, radius: number): Point {
  let x = clamp(p.x, -ARENA.half + radius, ARENA.half - radius)
  let z = clamp(p.z, -ARENA.half + radius, ARENA.half - radius)
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
        // The middle is inside the box: out through the nearest side.
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

/**
 * Moves a body from `from` by (`dx`, `dz`), a few centimetres at a time, sliding
 * round whatever is in the way. It can never come out the far side of a box.
 */
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

/**
 * How far along a ray from `from` in direction `dir` (a unit vector) it goes
 * before it meets a box or the floor - or `maxT`, if it meets nothing first.
 */
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

/** Whether a straight line from `a` to `b` is clear of every box. */
export function lineClear(arena: Arena, a: Vec3, b: Vec3): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  if (d < 1e-9) return true
  const dir = { x: (b.x - a.x) / d, y: (b.y - a.y) / d, z: (b.z - a.z) / d }
  return rayHit(arena, a, dir, d) >= d - 1e-6
}

/** How much room a start needs round it: a body, and a step to turn round in. */
export const SPAWN_ROOM = 0.9

/**
 * Where player `index` of `count` starts, and the way they face: evenly round
 * the ring, turned by the seed, looking at the middle - and if a piece of cover
 * is there, the nearest clear spot along the ring, either way.
 */
export function spawnPoint(seed: number, count: number, index: number): Point & { yaw: number } {
  const arena = arenaFor(seed)
  const turn = createRng(hashSeed(seed, 'hes-one-shot:spawn'))() * Math.PI * 2
  const angle = turn + (index / Math.max(1, count)) * Math.PI * 2
  const at = (a: number, ring: number) => ({ x: Math.sin(a) * ring, z: Math.cos(a) * ring })
  let p = at(angle, ARENA.spawnRing)
  search: for (let step = 0; step < 60; step++) {
    for (const ring of [ARENA.spawnRing, ARENA.spawnRing - 1.2]) {
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

/** A place a body of `radius` could stand, somewhere in the arena, for a stand-in to head for. */
export function openPoint(arena: Arena, random: () => number, radius: number): Point {
  const reach = ARENA.half - radius - 1
  for (let i = 0; i < 50; i++) {
    const p = { x: (random() * 2 - 1) * reach, z: (random() * 2 - 1) * reach }
    if (!blocked(arena, p, radius + 0.4)) return p
  }
  return spawnPoint(arena.seed, 1, 0)
}

/**
 * Where somebody eliminated starts hunting again: a few metres behind the one
 * who eliminated them, on the way they came from, at the nearest clear spot -
 * looking the way their new master looks. Never on top of cover, never outside the
 * wall. Deterministic: the same killer in the same place, the same spot.
 */
export function respawnSpot(arena: Arena, killer: Point & { yaw: number }): Point & { yaw: number } {
  // "Behind" is the way away from where the killer looks: (sin yaw, cos yaw).
  const back = Math.atan2(Math.sin(killer.yaw), Math.cos(killer.yaw))
  for (const distance of [2.6, 3.4, 4.4, 5.6]) {
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.2, -2.2]) {
      const a = back + turn
      const q = { x: killer.x + Math.sin(a) * distance, z: killer.z + Math.cos(a) * distance }
      const at = collide(arena, q, SPAWN_ROOM)
      if (!blocked(arena, at, SPAWN_ROOM - 0.05) && Math.hypot(at.x - q.x, at.z - q.z) < 0.6) return { ...at, yaw: killer.yaw }
    }
  }
  // Nowhere clear nearby: the killer's own spot, pushed out of anything.
  return { ...collide(arena, killer, SPAWN_ROOM), yaw: killer.yaw }
}
