/**
 * The lane: a rush from a spawn line to a tower, grown from the seed.
 *
 * Not a square arena like He's One Shot - a bounded rectangle, runners at one
 * end, the tower at the other, with cover scattered between them for a runner
 * to duck behind and a sniper's laser to be blocked by. **Everything here is
 * pure.**
 *
 * Cover comes in three kinds: crates and barrels are short enough that a jump
 * clears them - Space vaults, nothing more is needed - and trees are tall
 * enough that nothing does, so they always block a shot too. The tower itself
 * is a block like any other, with a small bounded platform on top the sniper
 * is clamped to (never fall-off-able) and a base zone at its foot that a
 * runner reaching it wins the round by touching.
 */
import { createRng, hashSeed } from '../../00-core'

export const FIELD = {
  /** Half the lane's width. */
  halfWidth: 16,
  /** How far the spawn line sits from the tower, along -Z. */
  length: 70,
  /** The boundary wall round the lane. */
  wallHeight: 6,
  wallThickness: 1,
  /** How tall the tower is: the platform's height off the ground. */
  towerHeight: 13,
  /** Half the tower platform's width: how far the sniper can walk from its middle. */
  platformHalf: 2.6,
  /** Half the tower's own footprint on the ground. */
  towerFootHalf: 1.6,
  /** How close to the tower's foot counts as reaching base. */
  baseRadius: 6,
  /** Cover is kept this far clear of the spawn line and the tower's foot. */
  spawnClear: 4,
  towerClear: 2.5,
  /** How many pieces of cover to try for. */
  cover: 46,
  /** The least gap between two pieces of cover: room to pass. */
  gap: 1.8,
  /** Short cover: under a jump's apex, so Space vaults it. */
  crateHeight: 1.05,
  barrelHeight: 0.9,
  /** Tall cover: over anybody's jump, so it always blocks a shot and is never vaulted. */
  treeHeight: 3.4,
} as const

/** Where the spawn line and the tower sit, along Z: spawn south, the tower north. */
export const SPAWN_Z = FIELD.length / 2
export const TOWER_Z = -FIELD.length / 2

export interface Point {
  x: number
  z: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type CoverKind = 'crate' | 'barrel' | 'tree' | 'wall' | 'tower'

/** A box standing on the floor: its extent on the ground, and how tall it is. */
export interface Block {
  x0: number
  z0: number
  x1: number
  z1: number
  height: number
  kind: CoverKind
}

export interface Arena {
  seed: number
  blocks: Block[]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function gapBetween(a: Block, b: Block): number {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1, 0)
  const dz = Math.max(a.z0 - b.z1, b.z0 - a.z1, 0)
  return Math.hypot(dx, dz)
}

const cache = new Map<number, Arena>()

/** The lane for a seed. The same seed, the same lane. */
export function arenaFor(seed: number): Arena {
  const known = cache.get(seed)
  if (known) return known
  const { halfWidth, length, wallHeight: h, wallThickness: w } = FIELD
  const halfLen = length / 2 + 4
  const blocks: Block[] = [
    { x0: -halfWidth - w, x1: halfWidth + w, z0: -halfLen - w, z1: -halfLen, height: h, kind: 'wall' },
    { x0: -halfWidth - w, x1: halfWidth + w, z0: halfLen, z1: halfLen + w, height: h, kind: 'wall' },
    { x0: -halfWidth - w, x1: -halfWidth, z0: -halfLen, z1: halfLen, height: h, kind: 'wall' },
    { x0: halfWidth, x1: halfWidth + w, z0: -halfLen, z1: halfLen, height: h, kind: 'wall' },
    {
      x0: -FIELD.towerFootHalf,
      x1: FIELD.towerFootHalf,
      z0: TOWER_Z - FIELD.towerFootHalf,
      z1: TOWER_Z + FIELD.towerFootHalf,
      height: FIELD.towerHeight,
      kind: 'tower',
    },
  ]

  const random = createRng(hashSeed(seed, 'jackal:arena'))
  const cover: Block[] = []
  for (let attempt = 0; attempt < 1400 && cover.length < FIELD.cover; attempt++) {
    const roll = random()
    const kind: CoverKind = roll < 0.4 ? 'crate' : roll < 0.7 ? 'barrel' : 'tree'
    const height = kind === 'crate' ? FIELD.crateHeight : kind === 'barrel' ? FIELD.barrelHeight : FIELD.treeHeight
    const size = kind === 'tree' ? 0.9 + random() * 0.5 : kind === 'crate' ? 1.1 + random() * 1.1 : 0.9 + random() * 0.4
    const cx = (random() * 2 - 1) * (halfWidth - FIELD.gap - size / 2)
    const cz = (random() * 2 - 1) * (length / 2 - FIELD.gap - size / 2)
    // Clear of the spawn line and the tower's foot, both ends of the rush.
    if (Math.abs(cz - SPAWN_Z) < FIELD.spawnClear + size / 2) continue
    if (Math.hypot(cx, cz - TOWER_Z) < FIELD.towerClear + FIELD.towerFootHalf + size / 2) continue
    const block: Block = { x0: cx - size / 2, x1: cx + size / 2, z0: cz - size / 2, z1: cz + size / 2, height, kind }
    if (cover.some((other) => gapBetween(block, other) < FIELD.gap)) continue
    cover.push(block)
  }

  const arena: Arena = { seed, blocks: [...blocks, ...cover] }
  cache.set(seed, arena)
  if (cache.size > 16) cache.delete(cache.keys().next().value!)
  return arena
}

/** Whether a block still stands in the way of a body whose feet are `y` off the ground: a jump over a short one clears it. */
function inTheWay(b: Block, y: number): boolean {
  return y < b.height - 1e-6
}

/** Whether a body of `radius` at height `y` standing at `p` overlaps anything still in its way. */
export function blocked(arena: Arena, p: Point, radius: number, y = 0): boolean {
  for (const b of arena.blocks) {
    if (!inTheWay(b, y)) continue
    const dx = p.x - clamp(p.x, b.x0, b.x1)
    const dz = p.z - clamp(p.z, b.z0, b.z1)
    if (dx * dx + dz * dz < radius * radius - 1e-9) return true
  }
  return false
}

/** The nearest place to `p` a body of `radius` at height `y` can stand, pushed out of anything it overlaps. */
export function collide(arena: Arena, p: Point, radius: number, y = 0): Point {
  const halfLen = FIELD.length / 2
  let x = clamp(p.x, -FIELD.halfWidth + radius, FIELD.halfWidth - radius)
  let z = clamp(p.z, TOWER_Z - halfLen + radius, SPAWN_Z + halfLen - radius)
  for (let pass = 0; pass < 4; pass++) {
    let moved = false
    for (const b of arena.blocks) {
      if (!inTheWay(b, y)) continue
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

/** Moves a body from `from` by (`dx`, `dz`) at height `y`, sliding round whatever is still in the way. */
export function slide(arena: Arena, from: Point, dx: number, dz: number, radius: number, y = 0): Point {
  const length = Math.hypot(dx, dz)
  const steps = Math.max(1, Math.ceil(length / 0.1))
  let at = from
  for (let i = 0; i < steps; i++) at = collide(arena, { x: at.x + dx / steps, z: at.z + dz / steps }, radius, y)
  return at
}

/** The span of `t` for which `o + d t` lies between `lo` and `hi`, or null if never. */
export function slab(o: number, d: number, lo: number, hi: number): [number, number] | null {
  if (Math.abs(d) < 1e-12) return o < lo || o > hi ? null : [-Infinity, Infinity]
  const a = (lo - o) / d
  const b = (hi - o) / d
  return a < b ? [a, b] : [b, a]
}

/** How far along a ray from `from` in direction `dir` it goes before meeting a block or the floor, or `maxT`. */
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

/** How far room a start needs round it. */
export const SPAWN_ROOM = 0.9

/** Where runner `index` of `count` starts, spread along the spawn line, facing the tower (-Z, yaw 0). */
export function runnerSpawn(seed: number, count: number, index: number): Point & { yaw: number } {
  const arena = arenaFor(seed)
  const span = FIELD.halfWidth * 1.6
  const x0 = count <= 1 ? 0 : (index / (count - 1) - 0.5) * span
  let p = { x: x0, z: SPAWN_Z - 1.5 }
  search: for (let step = 0; step < 40; step++) {
    for (const dz of [0, 1, -1, 2, -2]) {
      for (const dx of [0, 1, -1]) {
        const q = { x: x0 + dx * step * 0.4, z: SPAWN_Z - 1.5 + dz * step * 0.4 }
        if (!blocked(arena, q, SPAWN_ROOM, 0) && Math.abs(q.x) < FIELD.halfWidth - 1) {
          p = q
          break search
        }
      }
    }
  }
  return { ...p, yaw: 0 }
}

/** Where the sniper starts: the middle of the tower platform, looking down the lane at the runners. */
export function sniperSpawn(): { x: number; z: number; y: number; yaw: number } {
  return { x: 0, z: TOWER_Z, y: FIELD.towerHeight, yaw: Math.PI }
}

/** Clamps a point to the tower's platform: the sniper never falls or walks off it. */
export function clampToPlatform(p: Point): Point {
  return {
    x: clamp(p.x, -FIELD.platformHalf, FIELD.platformHalf),
    z: clamp(p.z, TOWER_Z - FIELD.platformHalf, TOWER_Z + FIELD.platformHalf),
  }
}

/** Whether `(x, z)` is close enough to the tower's foot to count as reaching base. */
export function atBase(x: number, z: number): boolean {
  return Math.hypot(x, z - TOWER_Z) <= FIELD.baseRadius
}

/** A place a body of `radius` could stand, somewhere in the lane, for a stand-in to head for. */
export function openPoint(arena: Arena, random: () => number, radius: number): Point {
  const reachX = FIELD.halfWidth - radius - 1
  const reachZ = FIELD.length / 2 - radius - 1
  for (let i = 0; i < 50; i++) {
    const p = { x: (random() * 2 - 1) * reachX, z: (random() * 2 - 1) * reachZ }
    if (!blocked(arena, p, radius + 0.4, 0)) return p
  }
  return { x: 0, z: SPAWN_Z - 2 }
}

/**
 * A point a stand-in could head for next, some way closer to the tower than
 * `fromZ` - never past it - biased to cross the lane rather than wander it,
 * and clear of anything still in the way on the ground.
 */
export function advancePoint(arena: Arena, random: () => number, fromZ: number): Point {
  const step = 8 + random() * 10
  const targetZ = Math.max(TOWER_Z + FIELD.towerClear + 1, fromZ - step)
  for (let i = 0; i < 40; i++) {
    const x = (random() * 2 - 1) * (FIELD.halfWidth - 1.5)
    const z = targetZ + (random() * 2 - 1) * 3
    if (!blocked(arena, { x, z }, SPAWN_ROOM, 0)) return { x, z }
  }
  return { x: 0, z: targetZ }
}
