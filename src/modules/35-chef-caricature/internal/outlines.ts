/**
 * The outlines: ingredients and dishes, as closed paths on the board.
 *
 * The board runs -1 to 1 each way, +y up. Every outline is built from arcs,
 * profiles and corners, then **scaled to the same size** - its widest half
 * extent is `SIZE` - and **resampled to points an even `SPACING` apart**, so
 * how much of an outline you have covered is simply how many of its points your
 * ink passed near. A big shape and a small one are equally hard to cover.
 *
 * Which outline comes next is from the seed: the whole set in a shuffled order,
 * then again in another. Everybody's turn gets the same sequence.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

export interface Pt {
  x: number
  y: number
}

export interface Outline {
  name: string
  /** Points `SPACING` apart round the path; the last joins back to the first. */
  points: Pt[]
  /** The length round the path, in board units. */
  length: number
}

/** How far each outline reaches from the middle of the board, at most. */
export const SIZE = 0.78
/** The distance between an outline's points. */
export const SPACING = 0.02

const rad = (deg: number) => (deg * Math.PI) / 180

/** Points round an ellipse from `a0` to `a1` degrees, anticlockwise. */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 64): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = rad(a0 + ((a1 - a0) * i) / n)
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }
  })
}

/** A shape round and upright like a fruit: `height` half tall, `width(y)` half wide at each height. */
function profile(height: number, width: (y: number) => number, n = 240): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2
    const y = height * Math.cos(t)
    return { x: Math.sin(t) * width(y), y }
  })
}

const bump = (y: number, at: number, spread: number) => Math.exp(-(((y - at) / spread) ** 2))

/** The raw shapes, before sizing and resampling. */
const SHAPES: Record<string, () => Pt[]> = {
  orange: () => arc(0, 0, 0.7, 0.7, 0, 360, 96).slice(0, -1),
  egg: () => profile(0.8, (y) => 0.56 * (1 - 0.2 * (y / 0.8))),
  lemon: () =>
    Array.from({ length: 240 }, (_, i) => {
      const t = (i / 240) * Math.PI * 2
      const c = Math.cos(t)
      return { x: 0.72 * c + 0.14 * c ** 15, y: 0.46 * Math.sin(t) }
    }),
  apple: () =>
    Array.from({ length: 240 }, (_, i) => {
      const a = (i / 240) * Math.PI * 2
      const deg = (a * 180) / Math.PI
      const r = 0.66 - 0.2 * bump(deg, 90, 26) - 0.07 * bump(deg, 270, 30)
      return { x: r * Math.cos(a), y: r * Math.sin(a) * 0.95 }
    }),
  pear: () => profile(0.8, (y) => 0.05 + 0.48 * bump(y, -0.3, 0.42) + 0.22 * bump(y, 0.38, 0.34)),
  carrot: () => profile(0.85, (y) => 0.04 + 0.26 * ((y + 0.85) / 1.7) ** 0.8),
  mushroom: () => profile(0.8, (y) => (y > 0.02 ? 0.8 * Math.sqrt(Math.max(0, 1 - ((y - 0.02) / 0.78) ** 2)) : 0.22), 320),
  fish: () => [
    ...arc(0.12, 0, 0.62, 0.4, 200, 520, 96),
    { x: -0.82, y: 0.42 },
    { x: -0.68, y: 0 },
    { x: -0.82, y: -0.42 },
  ],
  banana: () => [
    ...arc(0, 0.45, 1, 1, 220, 320, 48),
    { x: 0.88, y: -0.03 },
    ...arc(0, 0.75, 1, 1, 315, 225, 48),
    { x: -0.84, y: -0.08 },
  ],
  pizza: () => [{ x: 0, y: -0.82 }, ...arc(0, 0.2, 0.62, 0.62, 14, 166, 48)],
  cheese: () => [
    { x: -0.8, y: -0.4 },
    { x: 0.8, y: -0.4 },
    { x: 0.8, y: 0.12 },
    { x: -0.8, y: 0.55 },
  ],
  icecream: () => [...arc(0, 0.28, 0.5, 0.5, -25, 205, 64), { x: 0, y: -0.88 }],
  cupcake: () => [
    { x: -0.45, y: -0.75 },
    { x: 0.45, y: -0.75 },
    { x: 0.62, y: -0.02 },
    ...arc(0.4, 0.05, 0.24, 0.24, -15, 160, 24),
    ...arc(0, 0.2, 0.26, 0.26, 20, 160, 24),
    ...arc(-0.4, 0.05, 0.24, 0.24, 20, 195, 24),
  ],
  burger: () => [
    ...arc(0, 0.05, 0.78, 0.62, 0, 180, 64),
    { x: -0.84, y: -0.12 },
    { x: -0.78, y: -0.25 },
    { x: -0.72, y: -0.6 },
    { x: 0.72, y: -0.6 },
    { x: 0.78, y: -0.25 },
    { x: 0.84, y: -0.12 },
  ],
  bread: () => [{ x: -0.8, y: -0.55 }, { x: 0.8, y: -0.55 }, ...arc(0, 0.05, 0.8, 0.5, 0, 180, 64)],
  drumstick: () => [
    ...arc(0.22, 0.22, 0.55, 0.45, 245, 565, 80),
    { x: -0.5, y: -0.3 },
    { x: -0.72, y: -0.3 },
    { x: -0.82, y: -0.48 },
    { x: -0.7, y: -0.6 },
    { x: -0.64, y: -0.82 },
    { x: -0.44, y: -0.8 },
    { x: -0.38, y: -0.58 },
    { x: -0.18, y: -0.36 },
  ],
}

/** Every outline's name, in a fixed order. */
export const OUTLINE_NAMES = Object.keys(SHAPES)

/** Centres a path on the board and scales it so its widest half extent is `SIZE`. */
function fit(points: Pt[]): Pt[] {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2
  return points.map((p) => ({ x: ((p.x - cx) / half) * SIZE, y: ((p.y - cy) / half) * SIZE }))
}

/** Points an even `SPACING` apart round a closed path. */
function resample(points: Pt[]): { points: Pt[]; length: number } {
  const loop = [...points, points[0]]
  const lengths = loop.slice(1).map((p, i) => Math.hypot(p.x - loop[i].x, p.y - loop[i].y))
  const total = lengths.reduce((a, b) => a + b, 0)
  const count = Math.max(8, Math.round(total / SPACING))
  const out: Pt[] = []
  let segment = 0
  let into = 0
  for (let i = 0; i < count; i++) {
    const want = (i / count) * total
    while (segment < lengths.length - 1 && into + lengths[segment] < want) {
      into += lengths[segment]
      segment += 1
    }
    const k = lengths[segment] > 0 ? (want - into) / lengths[segment] : 0
    const a = loop[segment]
    const b = loop[segment + 1]
    out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k })
  }
  return { points: out, length: total }
}

const built = new Map<string, Outline>()

/** An outline by name, sized and resampled. */
export function outlineNamed(name: string): Outline {
  const known = built.get(name)
  if (known) return known
  const shape = SHAPES[name]
  if (!shape) throw new Error(`no outline called ${name}`)
  const { points, length } = resample(fit(shape()))
  const outline = { name, points, length }
  built.set(name, outline)
  return outline
}

/** The `k`th outline of a game, from its seed: the whole set shuffled, then shuffled again. */
export function outlineFor(seed: number, k: number): Outline {
  const round = Math.floor(k / OUTLINE_NAMES.length)
  const random = createRng(hashSeed(seed, `chef-caricature:outlines:${round}`))
  const order = [...OUTLINE_NAMES]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return outlineNamed(order[k % OUTLINE_NAMES.length])
}

/** The shortest distance from `p` to the segment `a`-`b`. */
export function toSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

/** The shortest distance from `p` to an outline - to within half its spacing. */
export function toOutline(outline: Outline, p: Pt): number {
  let best = Infinity
  for (const q of outline.points) {
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

/** The point `distance` round an outline from its first point, either way round. */
export function pointAlong(outline: Outline, distance: number): Pt {
  const n = outline.points.length
  const f = (((distance / outline.length) % 1) + 1) % 1
  const at = f * n
  const i = Math.floor(at) % n
  const a = outline.points[i]
  const b = outline.points[(i + 1) % n]
  const k = at - Math.floor(at)
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
}
