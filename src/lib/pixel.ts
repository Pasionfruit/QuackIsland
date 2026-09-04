/**
 * Low-level pixel drawing helpers.
 *
 * Everything in Polyland is drawn into a small low-resolution canvas which is
 * then scaled up with `image-rendering: pixelated`. To keep the art honest we
 * never rely on the canvas path rasterizer (it anti-aliases); polygons are
 * scanline-filled into whole pixels instead.
 */

export interface Pt {
  x: number
  y: number
}

/** A single hard-edged rectangle snapped to the pixel grid. */
export function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

/** Scanline-fills a polygon with no anti-aliasing. */
export function fillPoly(ctx: CanvasRenderingContext2D, pts: Pt[], color: string): void {
  if (pts.length < 3) return
  let minY = Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const y0 = Math.floor(minY)
  const y1 = Math.ceil(maxY)
  ctx.fillStyle = color
  const xs: number[] = []
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5
    xs.length = 0
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      if ((a.y <= cy && b.y > cy) || (b.y <= cy && a.y > cy)) {
        xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x))
      }
    }
    if (xs.length < 2) continue
    xs.sort((m, n) => m - n)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const sx = Math.round(xs[i])
      const ex = Math.round(xs[i + 1])
      if (ex > sx) ctx.fillRect(sx, y, ex - sx, 1)
    }
  }
}

/** Pulls every vertex toward the centroid, used to fake a pixel outline. */
export function insetPoly(pts: Pt[], amount: number): Pt[] {
  let cx = 0
  let cy = 0
  for (const p of pts) {
    cx += p.x
    cy += p.y
  }
  cx /= pts.length
  cy /= pts.length
  return pts.map((p) => {
    const dx = p.x - cx
    const dy = p.y - cy
    const len = Math.hypot(dx, dy) || 1
    const k = Math.max(0, len - amount) / len
    return { x: cx + dx * k, y: cy + dy * k }
  })
}

/** Filled polygon with a 1px darker border. */
export function shapePoly(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  fill: string,
  outline: string,
  weight = 1.6,
): void {
  fillPoly(ctx, pts, outline)
  fillPoly(ctx, insetPoly(pts, weight), fill)
}

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

/** Regular n-gon centred on the origin, flat-ish top, radius 1. */
export function regularPoly(sides: number, rotation = 0): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2
    out.push({ x: Math.cos(a), y: Math.sin(a) })
  }
  return out
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Small deterministic-ish helper so effects do not need a seeded RNG. */
export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** Creates an offscreen low-res canvas ready for pixel work. */
export function makePixelCanvas(w: number, h: number): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
} {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  return { canvas, ctx }
}
