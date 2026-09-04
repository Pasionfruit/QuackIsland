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

export interface FacetOpts {
  /** How much darker the shadow facet is. */
  dark?: number
  /** How much lighter the lit facet is. */
  light?: number
  /** Light direction; defaults to the global one. */
  dir?: Pt
  /** Where the lit/shadow seam sits, -1 (all lit) to 1 (all shadow). */
  split?: number
  /** Skip the lit facet, for shapes that should read flat. */
  flat?: boolean
}

/**
 * Fills a polygon in three tones: base, a lit facet toward the light, and a
 * shadow facet away from it. This is the workhorse of the whole art style.
 */
export function facet(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  base: string,
  opts: FacetOpts = {},
): void {
  if (pts.length < 3) return
  const dir = opts.dir ?? LIGHT
  const dark = opts.dark ?? 0.26
  const light = opts.light ?? 0.16
  const split = opts.split ?? 0

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let cx = 0
  let cy = 0
  for (const p of pts) {
    cx += p.x
    cy += p.y
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  cx /= pts.length
  cy /= pts.length
  const reach = Math.max(maxX - minX, maxY - minY) * 0.5

  fillPoly(ctx, pts, base)

  // Shadow facet: everything past the seam, away from the light.
  const sx = cx + dir.x * reach * split
  const sy = cy + dir.y * reach * split
  const darkSide = clipHalf(pts, sx, sy, -dir.x, -dir.y)
  if (darkSide.length >= 3) fillPoly(ctx, darkSide, shade(base, -dark))

  if (!opts.flat) {
    // Lit facet: a narrower wedge on the light side.
    const lx = cx + dir.x * reach * (split + 0.55)
    const ly = cy + dir.y * reach * (split + 0.55)
    const litSide = clipHalf(pts, lx, ly, dir.x, dir.y)
    if (litSide.length >= 3) fillPoly(ctx, litSide, shade(base, light))
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
