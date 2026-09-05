/**
 * Drawing primitives for Polyland's low-poly look.
 *
 * Everything is a flat-shaded polygon. Shapes are authored once and then split
 * into two or three facets along the light direction, which is what gives the
 * cast that faceted, papercraft feel without any textures or gradients.
 *
 * All drawing happens in "world units"; the canvas is set up with a supersample
 * transform so the same numbers produce a crisp image at any size.
 */

export interface Pt {
  x: number
  y: number
}

/** Light comes from the upper left, as it does in the reference art. */
export const LIGHT: Pt = { x: -0.5, y: -0.86 }

// ------------------------------------------------------------------- colour

function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a)
  const [br, bg, bb] = parseHex(b)
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

const WARM_WHITE = '#fff6e6'
const WARM_DARK = '#2b241d'

/** Lighter for amt > 0, darker for amt < 0. Stays warm at both ends. */
export function shade(color: string, amt: number): string {
  if (amt === 0) return color
  return amt > 0 ? mix(color, WARM_WHITE, Math.min(1, amt)) : mix(color, WARM_DARK, Math.min(1, -amt))
}

export function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = parseHex(color)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ------------------------------------------------------------------ shapes

export function path(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (pts.length < 3) return
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
}

export function fillPoly(ctx: CanvasRenderingContext2D, pts: Pt[], color: string): void {
  if (pts.length < 3) return
  ctx.fillStyle = color
  path(ctx, pts)
  ctx.fill()
}

export function strokePoly(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  color: string,
  width = 1,
): void {
  if (pts.length < 2) return
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  path(ctx, pts)
  ctx.stroke()
}

/** Axis-aligned rectangle. */
export function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

export function rectPts(x: number, y: number, w: number, h: number): Pt[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

export function ellipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2)
  ctx.fill()
}

/** The soft contact shadow every character and prop sits on. */
export function softShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  alpha = 0.22,
): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, 0.01))
  g.addColorStop(0, `rgba(74, 64, 52, ${alpha})`)
  g.addColorStop(0.65, `rgba(74, 64, 52, ${alpha * 0.55})`)
  g.addColorStop(1, 'rgba(74, 64, 52, 0)')
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, Math.max(0.05, ry / Math.max(rx, 0.01)))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, Math.max(rx, 0.01), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Keeps the half of `pts` on the positive side of a line through (px, py). */
export function clipHalf(pts: Pt[], px: number, py: number, nx: number, ny: number): Pt[] {
  const side = (p: Pt) => (p.x - px) * nx + (p.y - py) * ny
  const out: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const sa = side(a)
    const sb = side(b)
    if (sa >= 0) out.push(a)
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

// ------------------------------------------------------------------ facets

/**
 * Default corner cut. Nothing in Polyland has a razor corner: the reference
 * art is built from moulded, slightly blunted forms, so every faceted shape
 * gets its points knocked off before it is drawn.
 */
export const CORNER_ROUND = 0.26

/** How far in front of the scene the key light sits. Higher reads flatter. */
const LIGHT_Z = 0.72

/** Shade quantisation. Facets snap to these steps so they group into bands. */
const TONE_STEPS = 26

/**
 * The softened outline, plus the original corner each new vertex came from.
 * The mesh below needs that mapping to stitch the outline to its inner ring.
 *
 * The cut is measured against the *shorter* of the two edges meeting at a
 * corner, so a long thin limb keeps its length and only loses its points.
 */
function ring(pts: Pt[], amount: number): { ring: Pt[]; owner: number[] } {
  const n = pts.length
  const owner: number[] = []
  if (n < 3 || amount <= 0) {
    for (let i = 0; i < n; i++) owner.push(i)
    return { ring: pts, owner }
  }
  const t = Math.min(0.45, amount)
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const prev = pts[(i + n - 1) % n]
    const next = pts[(i + 1) % n]
    const pdx = prev.x - p.x
    const pdy = prev.y - p.y
    const ndx = next.x - p.x
    const ndy = next.y - p.y
    const pl = Math.sqrt(pdx * pdx + pdy * pdy) || 1
    const nl = Math.sqrt(ndx * ndx + ndy * ndy) || 1
    const cut = t * Math.min(pl, nl)
    out.push({ x: p.x + (pdx / pl) * cut, y: p.y + (pdy / pl) * cut })
    owner.push(i)
    out.push({ x: p.x + (ndx / nl) * cut, y: p.y + (ndy / nl) * cut })
    owner.push(i)
  }
  return { ring: out, owner }
}

/** Knocks the corners off a polygon. */
export function chamfer(pts: Pt[], amount = CORNER_ROUND): Pt[] {
  return ring(pts, amount).ring
}

/** Fills a polygon with its corners already softened. */
export function softPoly(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  color: string,
  amount = CORNER_ROUND,
): void {
  fillPoly(ctx, chamfer(pts, amount), color)
}

const lumMemo = new Map<string, number>()

/** Perceived brightness, 0 to 1. Memoised; there are only so many colours. */
function luminance(hex: string): number {
  let v = lumMemo.get(hex)
  if (v === undefined) {
    const [r, g, b] = parseHex(hex)
    v = (r * 0.299 + g * 0.587 + b * 0.114) / 255
    lumMemo.set(hex, v)
  }
  return v
}

// `shade` parses and reformats hex, which is far too slow to run per triangle.
// Tones are quantised, so a small memo covers essentially every lookup.
const shadeMemo = new Map<string, string>()

function shadeStep(color: string, step: number): string {
  if (step === 0) return color
  const key = color + ':' + step
  let out = shadeMemo.get(key)
  if (out === undefined) {
    if (shadeMemo.size > 4096) shadeMemo.clear()
    out = shade(color, step / TONE_STEPS)
    shadeMemo.set(key, out)
  }
  return out
}

// Device pixels per world unit, recorded when a scene is sized. This only
// picks a facet density, so a stale value costs nothing but a little detail.
const ctxScale = new WeakMap<CanvasRenderingContext2D, number>()

function scaleOf(ctx: CanvasRenderingContext2D): number {
  const s = ctxScale.get(ctx)
  if (s !== undefined) return s
  const t = ctx.getTransform().a || SUPERSAMPLE
  ctxScale.set(ctx, t)
  return t
}

/**
 * Fills one triangle, grown a hair from its own centre so neighbours overlap
 * instead of leaving antialiased hairlines between them.
 */
function fillTri(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  c: Pt,
  color: string,
  grow: number,
): void {
  const mx = (a.x + b.x + c.x) / 3
  const my = (a.y + b.y + c.y) / 3
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 3; i++) {
    const p = i === 0 ? a : i === 1 ? b : c
    const dx = p.x - mx
    const dy = p.y - my
    const d = Math.sqrt(dx * dx + dy * dy) || 1
    const x = p.x + (dx / d) * grow
    const y = p.y + (dy / d) * grow
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
}

export interface FacetOpts {
  /** How much darker the shadow side goes. */
  dark?: number
  /** How much lighter the lit side goes. */
  light?: number
  /** Light direction; defaults to the global one. */
  dir?: Pt
  /** Pushes the terminator: -1 is fully lit, 1 is fully in shadow. */
  split?: number
  /** Drops the lit facets, for shapes that should sit back. */
  flat?: boolean
  /** How domed the form reads. 0 is a flat plate, 1 is a full ball. */
  relief?: number
  /** Corner cut for this shape. 0 keeps the authored corners sharp. */
  round?: number
  /** Varies the facet jitter between shapes that share a corner count. */
  seed?: number
  /** Forces a facet density instead of deriving one from on-screen size. */
  detail?: 0 | 1 | 2
}

/**
 * The workhorse of the whole art style: fills a polygon as a little low-poly
 * shell rather than as a flat colour.
 *
 * The outline is softened, then split into a band of triangles around the rim
 * and a cap in the middle. Each triangle is shaded once, from a normal faked
 * by treating the shape as a dome, and snapped to a tone step - which is what
 * gives the moulded, many-facet look of the reference art instead of a single
 * hard light/dark seam. Shapes only a few pixels across skip the mesh and fall
 * back to two tones, since nobody can see facets that small.
 */
export function facet(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  base: string,
  opts: FacetOpts = {},
): void {
  if (pts.length < 3) return
  const dir = opts.dir ?? LIGHT
  const split = opts.split ?? 0
  const relief = opts.relief ?? 1
  const seed = opts.seed ?? 0

  // A near-black hoodie has nowhere left to go in shadow, so on dark colours
  // the facets have to be carried by the light side instead. Without this the
  // whole dark half of the cast reads as one flat silhouette.
  const lum = luminance(base)
  const dark = (opts.dark ?? 0.26) * (0.45 + Math.min(lum, 0.45) * 1.22)
  const light = (opts.flat ? 0 : opts.light ?? 0.16) * (1 + Math.max(0, 0.42 - lum) * 2.2)

  const { ring: outer, owner } = ring(pts, opts.round ?? CORNER_ROUND)

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let cx = 0
  let cy = 0
  for (const p of outer) {
    cx += p.x
    cy += p.y
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  cx /= outer.length
  cy /= outer.length
  const rx = Math.max((maxX - minX) * 0.5, 1e-4)
  const ry = Math.max((maxY - minY) * 0.5, 1e-4)

  fillPoly(ctx, outer, base)

  const scale = scaleOf(ctx)
  const span = Math.max(rx, ry) * 2 * scale
  const detail = opts.detail ?? (span < 11 ? 0 : span < 34 ? 1 : 2)

  if (detail === 0) {
    // Two tones. Cheap enough for the hundreds of tiny shapes - eyes, buttons,
    // distant scenery - that make up a frame.
    const reach = Math.max(rx, ry)
    const sx = cx + dir.x * reach * split
    const sy = cy + dir.y * reach * split
    const darkSide = clipHalf(outer, sx, sy, -dir.x, -dir.y)
    if (darkSide.length >= 3) fillPoly(ctx, darkSide, shade(base, -dark))
    if (light > 0) {
      const lx = cx + dir.x * reach * (split + 0.55)
      const ly = cy + dir.y * reach * (split + 0.55)
      const litSide = clipHalf(outer, lx, ly, dir.x, dir.y)
      if (litSide.length >= 3) fillPoly(ctx, litSide, shade(base, light))
    }
    return
  }

  // A light with some depth to it, so the middle of a form is not its
  // brightest part - that is what made the old shapes read as cut paper.
  const ll = Math.sqrt(dir.x * dir.x + dir.y * dir.y + LIGHT_Z * LIGHT_Z)
  const lxN = dir.x / ll
  const lyN = dir.y / ll
  const lzN = LIGHT_Z / ll

  /** Tone step for a facet centred at (tx, ty); `i` only varies the jitter. */
  const toneAt = (tx: number, ty: number, i: number): number => {
    const u = clamp((tx - cx) / rx, -1, 1)
    const v = clamp((ty - cy) / ry, -1, 1)
    const nz = Math.sqrt(Math.max(0.04, 1 - Math.min(1, u * u + v * v) * 0.94))
    const nx = u * relief
    const ny = v * relief
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz)
    const lam = (nx * lxN + ny * lyN + nz * lzN) / nl
    // Straight-on is the neutral tone; everything is measured against it.
    let d = lam - lzN - split * 0.42
    d += (noise(seed * 7.3 + i * 2.7 + 1.3) - 0.5) * 0.13
    const amt = d >= 0 ? light * clamp(d / 0.34, 0, 1.2) : -dark * clamp(-d / 0.92, 0, 1.1)
    return Math.round(amt * TONE_STEPS)
  }

  const tone = (a: Pt, b: Pt, c: Pt, i: number): string =>
    shadeStep(base, toneAt((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, i))

  const n = pts.length
  const grow = 0.55 / scale

  // Inner ring: the authored corners pulled toward the centre by a jittered
  // amount, which keeps the band from looking like a machined bevel.
  const inner: Pt[] = []
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const t = 0.46 + noise(seed * 3.1 + i * 1.7) * 0.2
    inner.push({ x: p.x + (cx - p.x) * t, y: p.y + (cy - p.y) * t })
  }

  // Band: every outline edge is stitched back to the inner ring. A corner cut
  // gives one triangle; a real edge gives a quad, split along a jittered
  // diagonal so the facets never fall into a regular pattern.
  const m = outer.length
  for (let k = 0; k < m; k++) {
    const a = outer[k]
    const b = outer[(k + 1) % m]
    const ia = inner[owner[k]]
    const ib = inner[owner[(k + 1) % m]]
    if (ia === ib) {
      fillTri(ctx, a, b, ia, tone(a, b, ia, k), grow)
    } else if (noise(seed * 5.9 + k * 3.1) > 0.5) {
      fillTri(ctx, a, b, ib, tone(a, b, ib, k), grow)
      fillTri(ctx, a, ib, ia, tone(a, ib, ia, k + 0.5), grow)
    } else {
      fillTri(ctx, a, b, ia, tone(a, b, ia, k), grow)
      fillTri(ctx, b, ib, ia, tone(b, ib, ia, k + 0.5), grow)
    }
  }

  // Cap. Small shapes take one flat facet; larger ones get a fan off an
  // off-centre hub, so the brightest facet is not dead in the middle.
  if (detail === 1) {
    fillPoly(ctx, inner, shadeStep(base, toneAt(cx, cy, 0.7)))
    return
  }
  const hub: Pt = {
    x: cx + (noise(seed * 2.3 + 4.1) - 0.5) * rx * 0.3,
    y: cy + (noise(seed * 2.3 + 9.7) - 0.5) * ry * 0.3,
  }
  for (let i = 0; i < n; i++) {
    const a = inner[i]
    const b = inner[(i + 1) % n]
    fillTri(ctx, a, b, hub, tone(a, b, hub, i + 11), grow)
  }
}

// -------------------------------------------------------------- geometry

export function transformPts(
  pts: Pt[],
  opts: { x?: number; y?: number; sx?: number; sy?: number; rot?: number },
): Pt[] {
  const { x = 0, y = 0, sx = 1, sy = 1, rot = 0 } = opts
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  return pts.map((p) => {
    const px0 = p.x * sx
    const py0 = p.y * sy
    return { x: x + px0 * c - py0 * s, y: y + px0 * s + py0 * c }
  })
}

/**
 * An ellipse the low-poly way: a slightly irregular ring of vertices, so
 * muzzles, cheeks and bird bodies read as moulded lumps rather than as the
 * perfectly smooth ovals a canvas arc gives you.
 */
export function domePoly(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  sides = 9,
  seed = 0,
): Pt[] {
  // Push the vertices out so the flat edges, not the corners, match the oval.
  const k = 1 / Math.cos(Math.PI / sides)
  const out: Pt[] = []
  for (let i = 0; i < sides; i++) {
    const a = ((i + noise(seed + i * 1.9) * 0.36 - 0.18) / sides) * Math.PI * 2
    const r = k * (0.94 + noise(seed + i * 3.7 + 5.1) * 0.12)
    out.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r })
  }
  return out
}

export function regularPoly(sides: number, rotation = 0): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2
    out.push({ x: Math.cos(a), y: Math.sin(a) })
  }
  return out
}

/** A quad from a start point along an angle: the limb primitive. */
export function limb(ox: number, oy: number, angle: number, len: number, w: number, taper = 1): Pt[] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const nx = -s * (w / 2)
  const ny = c * (w / 2)
  const ex = ox + c * len
  const ey = oy + s * len
  return [
    { x: ox + nx, y: oy + ny },
    { x: ex + nx * taper, y: ey + ny * taper },
    { x: ex - nx * taper, y: ey - ny * taper },
    { x: ox - nx, y: oy - ny },
  ]
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** Stable pseudo-noise, so scenery does not shimmer between reloads. */
export function noise(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// ---------------------------------------------------------------- canvases

/** Fallback device pixels per world unit, for offscreen work with no layout. */
export const SUPERSAMPLE = 3

/** Sizes a canvas for supersampled drawing and returns its world-unit context. */
export function setupScene(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  ss = SUPERSAMPLE,
): CanvasRenderingContext2D {
  canvas.width = Math.round(w * ss)
  canvas.height = Math.round(h * ss)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(ss, 0, 0, ss, 0, 0)
  ctxScale.set(ctx, ss)
  return ctx
}

/**
 * Sizes a canvas so one canvas pixel is exactly one device pixel at its
 * current display size, then scales the context so drawing code can keep
 * working in world units.
 *
 * This is what keeps the art crisp: if the backing store does not match the
 * displayed size the browser resamples the whole canvas, and flat-shaded
 * polygons turn to mush. Call it again whenever the element resizes.
 */
export function fitScene(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  maxScale = 4,
): CanvasRenderingContext2D {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const cssW = canvas.clientWidth || canvas.getBoundingClientRect().width || w
  const scale = clamp((cssW * dpr) / w, 1, maxScale)
  const pxW = Math.max(1, Math.round(w * scale))
  const pxH = Math.max(1, Math.round(h * scale))
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW
    canvas.height = pxH
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(pxW / w, 0, 0, pxH / h, 0, 0)
  ctxScale.set(ctx, pxW / w)
  return ctx
}

/** Device pixels per world unit that a context is currently drawing at. */
export function sceneScale(ctx: CanvasRenderingContext2D): number {
  return ctx.getTransform().a
}

export function makeScene(
  w: number,
  h: number,
  ss = SUPERSAMPLE,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  const ctx = setupScene(canvas, w, h, ss)
  return { canvas, ctx }
}
