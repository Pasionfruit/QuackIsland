/**
 * Reusable backdrops and set dressing for game cards and panels.
 *
 * Every Polyland game paints its own little scene; these are the pieces that
 * show up again and again, so a new game is a dozen lines rather than a
 * hundred.
 */
import { ellipse, facet, fillPoly, rect, shade, softShadow, type Pt } from '../lib/draw'
import { PAL } from './palette'
import { pine } from './props'

export const DAY = ['#a9cfdc', '#c4dcdc', '#dee5cf', '#f0e3c6']
export const DUSK = ['#8ea9c4', '#b8b6bf', '#e2b9a0', '#f0c89a']
export const NIGHT = ['#22304a', '#33455f', '#4e5c6f', '#6e6f72']

export function sky(
  ctx: CanvasRenderingContext2D,
  w: number,
  to: number,
  colors: string[] = DAY,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, to)
  colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, to)
}

export function stars(ctx: CanvasRenderingContext2D, w: number, to: number, frame: number): void {
  for (let i = 0; i < 30; i++) {
    const x = (i * 37) % w
    const y = (i * 53) % to
    ctx.globalAlpha = (frame + i * 9) % 100 < 70 ? 0.85 : 0.28
    ellipse(ctx, x, y, 0.6, 0.6, '#fdf6e6')
  }
  ctx.globalAlpha = 1
}

export function sun(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const halo = ctx.createRadialGradient(x, y, 1, x, y, r * 3.4)
  halo.addColorStop(0, 'rgba(255, 244, 214, 0.8)')
  halo.addColorStop(1, 'rgba(255, 244, 214, 0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(x, y, r * 3.4, 0, Math.PI * 2)
  ctx.fill()
  ellipse(ctx, x, y, r, r, PAL.sun)
}

export function moon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const halo = ctx.createRadialGradient(x, y, 1, x, y, r * 4)
  halo.addColorStop(0, 'rgba(226, 236, 245, 0.4)')
  halo.addColorStop(1, 'rgba(226, 236, 245, 0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(x, y, r * 4, 0, Math.PI * 2)
  ctx.fill()
  ellipse(ctx, x, y, r, r, '#eef2f4')
}

export function water(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  top: number,
  frame: number,
): void {
  const g = ctx.createLinearGradient(0, top, 0, h)
  g.addColorStop(0, PAL.waterLit)
  g.addColorStop(0.4, PAL.water)
  g.addColorStop(1, PAL.waterShade)
  ctx.fillStyle = g
  ctx.fillRect(0, top, w, h - top)
  ctx.globalAlpha = 0.5
  for (let i = 0; i < 9; i++) {
    const y = top + 4 + ((i * 6 + Math.floor(frame * 0.1)) % Math.max(6, h - top - 6))
    const x = (i * 37 + Math.sin(frame * 0.02 + i) * 8 + 20) % w
    ellipse(ctx, x, y, 5, 0.5, '#e8f4f2')
  }
  ctx.globalAlpha = 1
}

export function treeline(
  ctx: CanvasRenderingContext2D,
  w: number,
  baseY: number,
  count = 13,
  tint = 0,
): void {
  for (let i = 0; i < count; i++) {
    pine(ctx, 3 + i * (w / count), baseY, 13 + ((i * 7) % 10), tint)
  }
}

/** Flat ground with a lit top edge. */
export function ground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  y: number,
  color: string = PAL.grass,
): void {
  rect(ctx, 0, y, w, h - y, color)
  rect(ctx, 0, y, w, 2, shade(color, 0.14))
}

/** Interior back wall and floor, for the indoor games. */
export function room(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  floorY: number,
  wall = '#c9b9a0',
  floor = '#a8845c',
): void {
  const g = ctx.createLinearGradient(0, 0, 0, floorY)
  g.addColorStop(0, shade(wall, -0.16))
  g.addColorStop(1, shade(wall, 0.06))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, floorY)
  const f = ctx.createLinearGradient(0, floorY, 0, h)
  f.addColorStop(0, shade(floor, 0.08))
  f.addColorStop(1, shade(floor, -0.22))
  ctx.fillStyle = f
  ctx.fillRect(0, floorY, w, h - floorY)
  rect(ctx, 0, floorY - 1.5, w, 1.5, shade(wall, -0.3))
}

/** Top-down tile grid, for the board and maze games. */
export function grid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cell: number,
  color: string,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 0.6
  ctx.beginPath()
  for (let x = 0; x <= w; x += cell) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
  }
  for (let y = 0; y <= h; y += cell) {
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
  }
  ctx.stroke()
}

export function crate(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number): void {
  const h = w * 0.86
  softShadow(ctx, x, baseY, w * 0.6, w * 0.12, 0.2)
  facet(
    ctx,
    [
      { x: x - w / 2, y: baseY - h },
      { x: x + w / 2, y: baseY - h },
      { x: x + w / 2, y: baseY },
      { x: x - w / 2, y: baseY },
    ],
    PAL.wood,
    { dark: 0.26, light: 0.14 },
  )
  ctx.strokeStyle = shade(PAL.wood, -0.3)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x - w / 2, baseY - h)
  ctx.lineTo(x + w / 2, baseY)
  ctx.moveTo(x + w / 2, baseY - h)
  ctx.lineTo(x - w / 2, baseY)
  ctx.stroke()
}

/** A little faceted tank, seen from above and slightly to the side. */
export function tank(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  angle: number,
): void {
  softShadow(ctx, x, y + size * 0.5, size * 0.7, size * 0.24, 0.22)
  const treads = shade(color, -0.42)
  facet(
    ctx,
    [
      { x: x - size * 0.7, y: y - size * 0.56 },
      { x: x + size * 0.7, y: y - size * 0.56 },
      { x: x + size * 0.7, y: y - size * 0.3 },
      { x: x - size * 0.7, y: y - size * 0.3 },
    ],
    treads,
    { flat: true },
  )
  facet(
    ctx,
    [
      { x: x - size * 0.7, y: y + size * 0.3 },
      { x: x + size * 0.7, y: y + size * 0.3 },
      { x: x + size * 0.7, y: y + size * 0.56 },
      { x: x - size * 0.7, y: y + size * 0.56 },
    ],
    treads,
    { flat: true },
  )
  facet(
    ctx,
    [
      { x: x - size * 0.62, y: y - size * 0.42 },
      { x: x + size * 0.62, y: y - size * 0.42 },
      { x: x + size * 0.62, y: y + size * 0.42 },
      { x: x - size * 0.62, y: y + size * 0.42 },
    ],
    color,
    { dark: 0.24, light: 0.16 },
  )
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  facet(
    ctx,
    [
      { x: x + c * size * 0.2 - s * size * 0.12, y: y + s * size * 0.2 + c * size * 0.12 },
      { x: x + c * size * 1.25 - s * size * 0.1, y: y + s * size * 1.25 + c * size * 0.1 },
      { x: x + c * size * 1.25 + s * size * 0.1, y: y + s * size * 1.25 - c * size * 0.1 },
      { x: x + c * size * 0.2 + s * size * 0.12, y: y + s * size * 0.2 - c * size * 0.12 },
    ],
    shade(color, -0.24),
    { flat: true },
  )
  ellipse(ctx, x, y, size * 0.3, size * 0.3, shade(color, 0.16))
}

export function ghost(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  frame: number,
): void {
  const bob = Math.sin(frame * 0.05) * w * 0.08
  const h = w * 1.15
  const pts: Pt[] = [
    { x: x - w / 2, y: y + bob },
    { x: x - w * 0.4, y: y - h * 0.55 + bob },
    { x: x, y: y - h * 0.72 + bob },
    { x: x + w * 0.4, y: y - h * 0.55 + bob },
    { x: x + w / 2, y: y + bob },
    { x: x + w * 0.28, y: y - w * 0.12 + bob },
    { x: x + w * 0.06, y: y + w * 0.08 + bob },
    { x: x - w * 0.18, y: y - w * 0.12 + bob },
    { x: x - w * 0.36, y: y + w * 0.06 + bob },
  ]
  ctx.globalAlpha = 0.78
  facet(ctx, pts, '#e8eef2', { dark: 0.12, light: 0.06 })
  ctx.globalAlpha = 1
  ellipse(ctx, x - w * 0.16, y - h * 0.4 + bob, w * 0.09, w * 0.12, '#2b3138')
  ellipse(ctx, x + w * 0.16, y - h * 0.4 + bob, w * 0.09, w * 0.12, '#2b3138')
}

/** Cone of lantern or torch light. */
export function lightCone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  len: number,
  spread = 0.35,
): void {
  const g = ctx.createLinearGradient(x, y, x + Math.cos(angle) * len, y + Math.sin(angle) * len)
  g.addColorStop(0, 'rgba(255, 224, 150, 0.5)')
  g.addColorStop(1, 'rgba(255, 224, 150, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + Math.cos(angle - spread) * len, y + Math.sin(angle - spread) * len)
  ctx.lineTo(x + Math.cos(angle + spread) * len, y + Math.sin(angle + spread) * len)
  ctx.closePath()
  ctx.fill()
}

export function bunting(ctx: CanvasRenderingContext2D, w: number, y: number, sag = 6): void {
  const colors = ['#e0794f', '#e8c05f', '#7f9c62', '#5f92b8', '#c87fa8']
  ctx.strokeStyle = '#8d8474'
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(0, y)
  ctx.quadraticCurveTo(w / 2, y + sag * 2, w, y)
  ctx.stroke()
  for (let i = 0; i < 10; i++) {
    const t = (i + 0.5) / 10
    const fx = t * w
    const fy = y + Math.sin(t * Math.PI) * sag * 2
    fillPoly(
      ctx,
      [
        { x: fx - 3, y: fy },
        { x: fx + 3, y: fy },
        { x: fx, y: fy + 6 },
      ],
      colors[i % colors.length],
    )
  }
}

export function confetti(ctx: CanvasRenderingContext2D, w: number, h: number, frame: number): void {
  const colors = ['#e0794f', '#e8c05f', '#7f9c62', '#5f92b8', '#c87fa8']
  for (let i = 0; i < 22; i++) {
    const x = (i * 53 + Math.sin((frame + i * 20) * 0.03) * 10) % w
    const y = ((i * 31 + frame * 0.5) % (h + 20)) - 10
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate((frame + i * 30) * 0.05)
    rect(ctx, -1.6, -1, 3.2, 2, colors[i % colors.length])
    ctx.restore()
  }
}

/** A flag on a pole, planted in the ground. */
export function flag(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  h: number,
  color: string,
  frame: number,
): void {
  rect(ctx, x - 0.7, baseY - h, 1.4, h, '#8d7a5e')
  const wave = Math.sin(frame * 0.08) * h * 0.06
  facet(
    ctx,
    [
      { x: x + 0.7, y: baseY - h },
      { x: x + h * 0.55, y: baseY - h * 0.9 + wave },
      { x: x + h * 0.5, y: baseY - h * 0.66 + wave },
      { x: x + 0.7, y: baseY - h * 0.58 },
    ],
    color,
    { dark: 0.22, light: 0.12 },
  )
}
