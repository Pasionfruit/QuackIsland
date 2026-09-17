/**
 * The junkyard, and where Midnight is hiding in it.
 *
 * Everything comes from one seed that every browser knows, since every browser
 * draws it: car wrecks, stacks of crushed cars, tyres, drums, crates, fridges,
 * black bin bags, mounds of scrap - scattered in a fan in front of the camera -
 * and one all-black cat among them.
 *
 * **Every piece of junk is two things**: the parts that are drawn, and a few
 * boxes that stand in for it when working out what is in the way. A click
 * behind a crate hits the crate. The boxes are the drawn shapes exactly where
 * the junk is boxes, and a little inside them where it is round, so a click
 * never lands on something that looks like it missed.
 *
 * **Midnight is always partly in sight and never all of it.** She is placed
 * beside or on top of a piece of junk, somewhere her head can be seen from the
 * camera and between a third and four fifths of her can. Tested for hundreds of
 * seeds.
 *
 * Pure: no three.js, no clock.
 */
import { createRng, hashSeed } from '../../00-core'
import { EYE, type Vec3 } from './view'

export const YARD = {
  /** How many pieces of junk the scatter aims for. */
  pieces: 100,
  /** The fan the junk is scattered in: distance from the camera's feet, and angle either side of north. */
  near: 7,
  far: 34,
  /** Big junk - cars, stacks, mounds - no nearer than this, so the foreground is not a wall. */
  bigNear: 11,
  spread: (60 * Math.PI) / 180,
  /** Where the fence runs round the back. */
  fence: 38,
  /** How far away Midnight may be: far enough that finding her wants the zoom. */
  catNear: 11,
  catFar: 30,
  /** How much of her must be in sight, least and most, as a share of her sample points. */
  seenLeast: 0.3,
  seenMost: 0.8,
  lamps: 3,
} as const

export type Shape = 'box' | 'cylinder' | 'tyre' | 'blob'

/**
 * One drawn part. A `box` is a unit cube, a `cylinder` a unit-tall one of radius
 * one half standing up, a `tyre` a torus facing +Z, a `blob` an icosahedron of
 * radius one half - each scaled by `s`, turned by `r` in the order Y, X, Z the
 * way three.js does it with `YXZ`, and placed at `p`.
 */
export interface Part {
  shape: Shape
  p: Vec3
  s: Vec3
  r: Vec3
  colour: string
  /** Drawn glowing faintly - reflectors, a dead television's standby light. */
  glow?: boolean
}

/** A box that blocks sight and clicks: a middle, half-sizes, and a turn about +Y. */
export interface Box {
  x: number
  y: number
  z: number
  hx: number
  hy: number
  hz: number
  yaw: number
}

export type Kind = 'car' | 'stack' | 'tyres' | 'tyre' | 'drums' | 'crates' | 'fridge' | 'bags' | 'mound' | 'pipes' | 'telly'

export interface Piece {
  kind: Kind
  x: number
  z: number
  /** How much ground it takes up, as a circle. For the scatter only. */
  radius: number
  parts: Part[]
  boxes: Box[]
}

export interface Lamp {
  x: number
  z: number
  height: number
}

export interface Sphere {
  x: number
  y: number
  z: number
  r: number
}

export type Pose = 'sit' | 'loaf'

export interface Midnight {
  x: number
  y: number
  z: number
  /** Which way she faces, radians about +Y: zero faces +Z. */
  heading: number
  pose: Pose
  /** Her body, head first: the shapes a click has to land in, before padding. */
  spheres: Sphere[]
  /** Points on her the camera's sight is tested against. The head's middle is first. */
  points: Vec3[]
  /** How many of `points` the camera can see. */
  seen: number
  /** What she is beside or sitting on. */
  by: Kind
  on: boolean
}

export interface Yard {
  seed: number
  pieces: Piece[]
  boxes: Box[]
  lamps: Lamp[]
  midnight: Midnight
}

/** How much bigger than her body a click may land and still be on her. A cat is a small thing to click. */
export const CLICK_PAD = { body: 1.3, head: 1.45 } as const

const CARS = ['#6b3b24', '#34506b', '#3d5a3a', '#7a6a4a', '#5a2a2a', '#4a4a52'] as const
const RUST = ['#6b3b24', '#7a4a2a', '#5a3a28'] as const
const DRUMS = ['#7a2e22', '#2e4a6e', '#8a7026', '#3d5a3a', '#5a5a5a'] as const
const WOOD = ['#6e5436', '#5e4630', '#7a6040'] as const
const WHITE = ['#b8b4a8', '#a8aca6', '#c0b8a0'] as const
const TYRE = '#141416'
const BAG = '#1c1c22'
const SCRAP = ['#3b342c', '#34302a', '#403830'] as const
const PIPE = ['#555a5e', '#6a5a4a', '#4a4e52'] as const

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z })

/** A part and, if it blocks, its box - in the piece's own frame. */
interface Local {
  parts: Part[]
  boxes: Box[]
}

function box(local: Local, p: Vec3, s: Vec3, yaw: number, colour: string, blocks = true): void {
  local.parts.push({ shape: 'box', p, s, r: v(0, yaw, 0), colour })
  if (blocks) local.boxes.push({ x: p.x, y: p.y, z: p.z, hx: s.x / 2, hy: s.y / 2, hz: s.z / 2, yaw })
}

function build(kind: Kind, random: () => number): Local & { radius: number } {
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]
  const local: Local = { parts: [], boxes: [] }
  let radius = 1

  switch (kind) {
    case 'car': {
      const length = 3.8 + random() * 0.7
      const colour = pick(CARS)
      const lift = random() < 0.5 ? 0.25 : 0.05
      box(local, v(0, lift + 0.45, 0), v(length, 0.9, 1.8), 0, colour)
      box(local, v(-0.2, lift + 1.2, 0), v(length * 0.48, 0.6, 1.6), 0, colour)
      // Windows, gone dark.
      box(local, v(-0.2, lift + 1.22, 0), v(length * 0.46, 0.4, 1.62), 0, '#101418', false)
      for (const side of [-0.6, 0.6]) {
        local.parts.push({ shape: 'box', p: v(-length / 2 - 0.01, lift + 0.7, side), s: v(0.04, 0.1, 0.25), r: v(0, 0, 0), colour: '#ff6a2a', glow: true })
      }
      // Some of its wheels are still on.
      for (const [wx, wz] of [[1.2, 0.95], [-1.2, 0.95], [1.2, -0.95], [-1.2, -0.95]]) {
        if (random() < 0.45) continue
        local.parts.push({ shape: 'tyre', p: v(wx * (length / 3.8), 0.32, wz), s: v(0.58, 0.58, 0.58), r: v(0, 0, 0), colour: TYRE })
      }
      radius = length / 2 + 0.3
      break
    }
    case 'stack': {
      const count = 2 + Math.floor(random() * 4)
      for (let i = 0; i < count; i++) {
        box(local, v((random() - 0.5) * 0.3, 0.23 + i * 0.46, (random() - 0.5) * 0.2), v(3.2, 0.44, 1.7), (random() - 0.5) * 0.25, pick(CARS))
      }
      radius = 1.9
      break
    }
    case 'tyres': {
      const count = 2 + Math.floor(random() * 4)
      for (let i = 0; i < count; i++) {
        local.parts.push({ shape: 'tyre', p: v((random() - 0.5) * 0.1, 0.16 + i * 0.3, (random() - 0.5) * 0.1), s: v(1, 1, 1), r: v(Math.PI / 2, 0, 0), colour: TYRE })
      }
      local.boxes.push({ x: 0, y: count * 0.15, z: 0, hx: 0.42, hy: count * 0.15, hz: 0.42, yaw: 0 })
      radius = 0.8
      break
    }
    case 'tyre': {
      if (random() < 0.5) {
        local.parts.push({ shape: 'tyre', p: v(0, 0.16, 0), s: v(1, 1, 1), r: v(Math.PI / 2, 0, 0), colour: TYRE })
        local.boxes.push({ x: 0, y: 0.1, z: 0, hx: 0.4, hy: 0.1, hz: 0.4, yaw: 0 })
      } else {
        local.parts.push({ shape: 'tyre', p: v(0, 0.55, 0), s: v(1, 1, 1), r: v(0, 0, 0), colour: TYRE })
        local.boxes.push({ x: 0, y: 0.5, z: 0, hx: 0.42, hy: 0.42, hz: 0.12, yaw: 0 })
      }
      radius = 0.7
      break
    }
    case 'drums': {
      const count = 1 + Math.floor(random() * 3)
      for (let i = 0; i < count; i++) {
        const at = v((i - (count - 1) / 2) * 0.72, 0, (random() - 0.5) * 0.3)
        const colour = pick(DRUMS)
        if (random() < 0.7) {
          local.parts.push({ shape: 'cylinder', p: v(at.x, 0.45, at.z), s: v(0.64, 0.9, 0.64), r: v(0, 0, 0), colour })
          local.boxes.push({ x: at.x, y: 0.45, z: at.z, hx: 0.27, hy: 0.45, hz: 0.27, yaw: 0 })
        } else {
          local.parts.push({ shape: 'cylinder', p: v(at.x, 0.32, at.z), s: v(0.64, 0.9, 0.64), r: v(Math.PI / 2, 0, 0), colour })
          local.boxes.push({ x: at.x, y: 0.32, z: at.z, hx: 0.27, hy: 0.27, hz: 0.45, yaw: 0 })
        }
      }
      radius = 0.5 + count * 0.36
      break
    }
    case 'crates': {
      const size = 0.6 + random() * 0.5
      box(local, v(0, size / 2, 0), v(size, size, size), 0, pick(WOOD))
      if (random() < 0.4) {
        const top = size * (0.6 + random() * 0.3)
        box(local, v((random() - 0.5) * 0.2, size + top / 2, (random() - 0.5) * 0.2), v(top, top, top), (random() - 0.5) * 0.6, pick(WOOD))
      }
      if (random() < 0.4) {
        const side = size * (0.6 + random() * 0.3)
        box(local, v(size / 2 + side / 2 + 0.05, side / 2, (random() - 0.5) * 0.3), v(side, side, side), (random() - 0.5) * 0.5, pick(WOOD))
      }
      radius = size + 0.4
      break
    }
    case 'fridge': {
      const colour = pick(WHITE)
      if (random() < 0.55) {
        box(local, v(0, 0.85, 0), v(0.75, 1.7, 0.7), 0, colour)
        box(local, v(0.2, 1.1, 0.36), v(0.04, 0.5, 0.03), 0, '#3a3a3a', false)
        radius = 0.7
      } else {
        box(local, v(0, 0.36, 0), v(0.75, 0.72, 1.7), 0, colour)
        radius = 1
      }
      break
    }
    case 'bags': {
      const count = 1 + Math.floor(random() * 4)
      for (let i = 0; i < count; i++) {
        const s = v(0.55 + random() * 0.3, 0.45 + random() * 0.2, 0.55 + random() * 0.3)
        const at = v((random() - 0.5) * 0.9, s.y * 0.42, (random() - 0.5) * 0.9)
        local.parts.push({ shape: 'blob', p: at, s, r: v(0, random() * Math.PI, 0), colour: BAG })
        local.boxes.push({ x: at.x, y: at.y, z: at.z, hx: s.x * 0.33, hy: s.y * 0.33, hz: s.z * 0.33, yaw: 0 })
      }
      radius = 0.9
      break
    }
    case 'mound': {
      const s = v(3 + random() * 1.8, 1.2 + random() * 1.1, 3 + random() * 1.8)
      local.parts.push({ shape: 'blob', p: v(0, 0, 0), s, r: v(0, random() * Math.PI, 0), colour: pick(SCRAP) })
      local.boxes.push({ x: 0, y: s.y * 0.15, z: 0, hx: s.x * 0.3, hy: s.y * 0.3, hz: s.z * 0.3, yaw: 0 })
      // Bits of scrap sticking out of it. Thin: drawn, not in the way.
      const bits = 2 + Math.floor(random() * 3)
      for (let i = 0; i < bits; i++) {
        const a = random() * Math.PI * 2
        const out = 0.3 + random() * 0.25
        local.parts.push({
          shape: random() < 0.5 ? 'cylinder' : 'box',
          p: v(Math.cos(a) * s.x * out, s.y * 0.3, Math.sin(a) * s.z * out),
          s: v(0.12, 1 + random() * 0.8, 0.12),
          r: v((random() - 0.5) * 1.2, a, (random() - 0.5) * 1.2),
          colour: pick(RUST),
        })
      }
      radius = Math.max(s.x, s.z) / 2 + 0.2
      break
    }
    case 'pipes': {
      const length = 2.4 + random() * 1.6
      const r = 0.25 + random() * 0.15
      const count = random() < 0.4 ? 2 : 1
      const colour = pick(PIPE)
      for (let i = 0; i < count; i++) {
        const at = v(0, r + i * r * 1.7, (i - (count - 1) / 2) * r * 1.9 * (i === 1 ? 0.5 : 1))
        local.parts.push({ shape: 'cylinder', p: at, s: v(r * 2, length, r * 2), r: v(0, 0, Math.PI / 2), colour })
        local.boxes.push({ x: at.x, y: at.y, z: at.z, hx: length / 2, hy: r * 0.85, hz: r * 0.85, yaw: 0 })
      }
      radius = length / 2 + 0.2
      break
    }
    case 'telly': {
      let floor = 0
      if (random() < 0.5) {
        box(local, v(0, 0.35, 0), v(0.75, 0.7, 0.7), 0, pick(WOOD))
        floor = 0.7
      }
      box(local, v(0, floor + 0.25, 0), v(0.62, 0.5, 0.5), 0, '#2a2a2a')
      local.parts.push({ shape: 'box', p: v(0, floor + 0.27, 0.255), s: v(0.5, 0.36, 0.02), r: v(0, 0, 0), colour: '#1c2a2c' })
      local.parts.push({ shape: 'box', p: v(0.22, floor + 0.05, 0.256), s: v(0.03, 0.03, 0.02), r: v(0, 0, 0), colour: '#ff3a2a', glow: true })
      radius = 0.6
      break
    }
  }
  return { ...local, radius }
}

const WEIGHTS: readonly [Kind, number][] = [
  ['car', 3],
  ['stack', 2],
  ['tyres', 3],
  ['tyre', 3],
  ['drums', 4],
  ['crates', 3],
  ['fridge', 2],
  ['bags', 4],
  ['mound', 2],
  ['pipes', 2],
  ['telly', 1],
]
const BIG: ReadonlySet<Kind> = new Set(['car', 'stack', 'mound'])

function pickKind(random: () => number): Kind {
  const total = WEIGHTS.reduce((sum, [, w]) => sum + w, 0)
  let roll = random() * total
  for (const [kind, w] of WEIGHTS) {
    roll -= w
    if (roll < 0) return kind
  }
  return 'drums'
}

/** A point on the ground in the fan: its distance from the camera's feet, and its angle from north. */
export function fanPoint(distance: number, angle: number): { x: number; z: number } {
  return { x: EYE.x - Math.sin(angle) * distance, z: EYE.z - Math.cos(angle) * distance }
}

function place(local: Local, x: number, z: number, yaw: number): { parts: Part[]; boxes: Box[] } {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const at = (p: { x: number; z: number }) => ({ x: x + c * p.x + s * p.z, z: z - s * p.x + c * p.z })
  return {
    parts: local.parts.map((part) => {
      const w = at(part.p)
      return { ...part, p: v(w.x, part.p.y, w.z), r: v(part.r.x, part.r.y + yaw, part.r.z) }
    }),
    boxes: local.boxes.map((b) => {
      const w = at(b)
      return { ...b, x: w.x, z: w.z, yaw: b.yaw + yaw }
    }),
  }
}

/** Where the ray from `origin` along `dir` first enters a box, or Infinity. */
export function rayBox(origin: Vec3, dir: Vec3, b: Box): number {
  const c = Math.cos(b.yaw)
  const s = Math.sin(b.yaw)
  const ox = origin.x - b.x
  const oz = origin.z - b.z
  // Into the box's own frame: the inverse of its turn about +Y.
  const o = [c * ox - s * oz, origin.y - b.y, s * ox + c * oz]
  const d = [c * dir.x - s * dir.z, dir.y, s * dir.x + c * dir.z]
  const half = [b.hx, b.hy, b.hz]
  let near = -Infinity
  let far = Infinity
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (Math.abs(o[i]) > half[i]) return Infinity
      continue
    }
    let t1 = (-half[i] - o[i]) / d[i]
    let t2 = (half[i] - o[i]) / d[i]
    if (t1 > t2) [t1, t2] = [t2, t1]
    near = Math.max(near, t1)
    far = Math.min(far, t2)
    if (near > far) return Infinity
  }
  if (far < 0) return Infinity
  return Math.max(0, near)
}

function inside(p: Vec3, b: Box, margin: number): boolean {
  const c = Math.cos(b.yaw)
  const s = Math.sin(b.yaw)
  const dx = p.x - b.x
  const dz = p.z - b.z
  return (
    Math.abs(c * dx - s * dz) <= b.hx + margin &&
    Math.abs(p.y - b.y) <= b.hy + margin &&
    Math.abs(s * dx + c * dz) <= b.hz + margin
  )
}

/** Whether anything stands between the camera and a point. */
export function inSight(boxes: readonly Box[], point: Vec3): boolean {
  const dx = point.x - EYE.x
  const dy = point.y - EYE.y
  const dz = point.z - EYE.z
  const length = Math.hypot(dx, dy, dz)
  const dir = v(dx / length, dy / length, dz / length)
  for (const b of boxes) if (rayBox(EYE, dir, b) < length - 0.03) return false
  return true
}

/** Her body, head first, and the points her sight is tested on - for a pose, a place and a heading. */
export function catShape(pose: Pose, x: number, y: number, z: number, heading: number): { spheres: Sphere[]; points: Vec3[] } {
  const c = Math.cos(heading)
  const s = Math.sin(heading)
  const at = (lx: number, ly: number, lz: number) => v(x + c * lx + s * lz, y + ly, z - s * lx + c * lz)
  const sphere = (lx: number, ly: number, lz: number, r: number): Sphere => ({ ...at(lx, ly, lz), r })
  const spheres =
    pose === 'sit'
      ? [sphere(0, 0.46, 0.1, 0.095), sphere(0, 0.3, 0.06, 0.12), sphere(0, 0.17, -0.04, 0.16)]
      : [sphere(0, 0.24, 0.27, 0.095), sphere(0, 0.14, 0.12, 0.14), sphere(0, 0.14, -0.05, 0.16)]
  const body = spheres[2]
  const points = [
    v(spheres[0].x, spheres[0].y, spheres[0].z),
    at(0, pose === 'sit' ? 0.55 : 0.33, pose === 'sit' ? 0.1 : 0.27),
    v(spheres[1].x, spheres[1].y, spheres[1].z),
    v(body.x, body.y, body.z),
    at(0.13, body.y - y, pose === 'sit' ? -0.04 : -0.05),
    at(-0.13, body.y - y, pose === 'sit' ? -0.04 : -0.05),
    pose === 'sit' ? at(0.16, 0.04, 0.1) : at(0.2, 0.04, -0.25),
  ]
  return { spheres, points }
}

interface Spot {
  x: number
  y: number
  z: number
  by: Kind
  on: boolean
}

/** Places a cat could be, piece by piece: beside any box that stands on the ground, and on top of any that nothing sits on. */
function spots(pieces: readonly Piece[], all: readonly Box[], random: () => number): Spot[][] {
  return pieces.map((piece) => {
    const out: Spot[] = []
    for (const b of piece.boxes) {
      const c = Math.cos(b.yaw)
      const s = Math.sin(b.yaw)
      const world = (lx: number, lz: number) => ({ x: b.x + c * lx + s * lz, z: b.z - s * lx + c * lz })
      if (b.y - b.hy < 0.3) {
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const along = random() * 2 - 1
          const lx = nx !== 0 ? nx * (b.hx + 0.3) : along * b.hx
          const lz = nz !== 0 ? nz * (b.hz + 0.3) : along * b.hz
          out.push({ ...world(lx, lz), y: 0, by: piece.kind, on: false })
        }
      }
      const top = b.y + b.hy
      if (top < 2.6 && b.hx >= 0.28 && b.hz >= 0.28) {
        const p = world((random() * 2 - 1) * (b.hx - 0.2), (random() * 2 - 1) * (b.hz - 0.2))
        const covered = all.some((other) => other !== b && other.y - other.hy >= top - 0.05 && inside(v(p.x, top + 0.2, p.z), other, 0.25))
        if (!covered) out.push({ ...p, y: top, by: piece.kind, on: true })
      }
    }
    return out
  })
}

function hideMidnight(pieces: readonly Piece[], boxes: readonly Box[], seed: number): Midnight {
  const random = createRng(hashSeed(seed, 'wheres-midnight:cat'))
  const shuffle = <T>(list: T[]): T[] => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[list[i], list[j]] = [list[j], list[i]]
    }
    return list
  }
  // A piece first and then a spot on it, so a pile of four bin bags is no likelier a hiding place than one car.
  const candidates = shuffle(spots(pieces, boxes, random)).flatMap((each) => shuffle(each))

  let best: Midnight | null = null
  let bestScore = -Infinity
  for (const spot of candidates) {
    const fromFeet = Math.hypot(spot.x - EYE.x, spot.z - EYE.z)
    if (fromFeet < YARD.catNear || fromFeet > YARD.catFar) continue
    // Low black bags hide exactly some of a black cat, so they pass most often. Half as often, or it is always bags.
    if (spot.by === 'bags' && random() < 0.5) continue
    const toCamera = Math.atan2(EYE.x - spot.x, EYE.z - spot.z)
    const heading = toCamera + (random() * 2 - 1) * 1.1
    const pose: Pose = random() < 0.55 ? 'sit' : 'loaf'
    const shape = catShape(pose, spot.x, spot.y, spot.z, heading)
    if (shape.spheres.some((sphere) => boxes.some((b) => inside(sphere, b, sphere.r * 0.5)))) continue
    const sight = shape.points.map((p) => inSight(boxes, p))
    const seen = sight.filter(Boolean).length
    const cat: Midnight = { x: spot.x, y: spot.y, z: spot.z, heading, pose, ...shape, seen, by: spot.by, on: spot.on }
    const share = seen / shape.points.length
    if (sight[0] && share >= YARD.seenLeast && share <= YARD.seenMost) return cat
    const score = (sight[0] ? 10 : 0) - Math.abs(share - 0.55)
    if (score > bestScore) {
      best = cat
      bestScore = score
    }
  }
  if (best && best.seen > 0) return best
  // Nothing anywhere would do: out in the open, in the middle of the fan.
  const open = fanPoint((YARD.catNear + YARD.catFar) / 2, 0)
  const shape = catShape('loaf', open.x, 0, open.z, 0)
  return { x: open.x, y: 0, z: open.z, heading: 0, pose: 'loaf', ...shape, seen: shape.points.filter((p) => inSight(boxes, p)).length, by: 'bags', on: false }
}

export function layYard(seed: number): Yard {
  const random = createRng(hashSeed(seed, 'wheres-midnight:yard'))
  const pieces: Piece[] = []
  for (let attempt = 0; attempt < 4000 && pieces.length < YARD.pieces; attempt++) {
    const kind = pickKind(random)
    const least = BIG.has(kind) ? YARD.bigNear : YARD.near
    // Even over area, not over distance, so the far rows are as full as the near ones.
    const distance = Math.sqrt(least * least + random() * (YARD.far * YARD.far - least * least))
    const angle = (random() * 2 - 1) * YARD.spread
    const { x, z } = fanPoint(distance, angle)
    const local = build(kind, random)
    if (pieces.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius + local.radius + 0.25)) continue
    pieces.push({ kind, x, z, radius: local.radius, ...place(local, x, z, random() * Math.PI * 2) })
  }

  const lamps: Lamp[] = []
  for (let i = 0; i < YARD.lamps; i++) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const angle = (((i + 0.2 + random() * 0.6) / YARD.lamps) * 2 - 1) * YARD.spread
      const { x, z } = fanPoint(12 + random() * 16, angle)
      if (pieces.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius + 0.4)) continue
      lamps.push({ x, z, height: 4.2 + random() * 0.8 })
      break
    }
  }

  const boxes = [
    ...pieces.flatMap((p) => p.boxes),
    ...lamps.map((l): Box => ({ x: l.x, y: l.height / 2, z: l.z, hx: 0.07, hy: l.height / 2, hz: 0.07, yaw: 0 })),
  ]
  return { seed, pieces, boxes, lamps, midnight: hideMidnight(pieces, boxes, seed) }
}

const yards = new Map<number, Yard>()
/** The same seed's yard, laid once. */
export function yardFor(seed: number): Yard {
  let yard = yards.get(seed)
  if (!yard) {
    yard = layYard(seed)
    if (yards.size > 8) yards.clear()
    yards.set(seed, yard)
  }
  return yard
}

export type Seen = 'midnight' | 'junk' | 'nothing'

/**
 * What a click along `dir` from the camera lands on.
 *
 * Midnight if the ray passes through her - padded, since she is small - and
 * nothing solid is in front of her; junk if it meets junk first; nothing if it
 * meets neither.
 */
export function look(yard: Yard, dir: Vec3): Seen {
  const length = Math.hypot(dir.x, dir.y, dir.z)
  if (!(length > 0)) return 'nothing'
  const d = v(dir.x / length, dir.y / length, dir.z / length)
  let front = Infinity
  yard.midnight.spheres.forEach((s, i) => {
    const pad = s.r * (i === 0 ? CLICK_PAD.head : CLICK_PAD.body)
    const along = (s.x - EYE.x) * d.x + (s.y - EYE.y) * d.y + (s.z - EYE.z) * d.z
    if (along <= 0) return
    const miss = Math.hypot(EYE.x + d.x * along - s.x, EYE.y + d.y * along - s.y, EYE.z + d.z * along - s.z)
    if (miss <= pad) front = Math.min(front, along - s.r)
  })
  let junk = Infinity
  for (const b of yard.boxes) junk = Math.min(junk, rayBox(EYE, d, b))
  if (front < Infinity && junk >= front - 0.05) return 'midnight'
  return junk < Infinity ? 'junk' : 'nothing'
}

/** The direction from the camera to a point. */
export function toward(point: Vec3): Vec3 {
  const dx = point.x - EYE.x
  const dy = point.y - EYE.y
  const dz = point.z - EYE.z
  const length = Math.hypot(dx, dy, dz)
  return v(dx / length, dy / length, dz / length)
}
