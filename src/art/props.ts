/**
 * Cozy scenery. Same flat-shaded facets as the cast, so nothing looks like it
 * came from a different game.
 */
import { ellipse, facet, fillPoly, rect, shade, softShadow, type Pt } from '../lib/draw'
import { PAL } from './palette'

export function pine(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  h: number,
  tint = 0,
): void {
  const w = h * 0.5
  const body = tint > 0 ? PAL.pineLit : tint < 0 ? PAL.pineShade : PAL.pine
  rect(ctx, x - h * 0.045, baseY - h * 0.2, h * 0.09, h * 0.2, PAL.trunk)
  for (let i = 0; i < 3; i++) {
    const top = baseY - h + h * 0.26 * i
    const spread = (w / 2) * (0.58 + i * 0.26)
    const bottom = top + h * 0.36
    facet(
      ctx,
      [
        { x, y: top },
        { x: x + spread, y: bottom },
        { x: x + spread * 0.42, y: bottom },
        { x: x + spread * 0.52, y: bottom + h * 0.05 },
        { x: x - spread * 0.52, y: bottom + h * 0.05 },
        { x: x - spread * 0.42, y: bottom },
        { x: x - spread, y: bottom },
      ],
      body,
      { dark: 0.24, light: 0.14, split: -0.1 },
    )
  }
}

export function tent(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number): void {
  const h = w * 0.8
  softShadow(ctx, x, baseY + 1, w * 0.62, w * 0.1, 0.2)
  facet(
    ctx,
    [
      { x, y: baseY - h },
      { x: x + w / 2, y: baseY },
      { x: x - w / 2, y: baseY },
    ],
    '#7d8f95',
    { dark: 0.26, light: 0.14 },
  )
  fillPoly(
    ctx,
    [
      { x, y: baseY - h * 0.66 },
      { x: x + w * 0.18, y: baseY },
      { x: x - w * 0.18, y: baseY },
    ],
    '#39454b',
  )
  // Guy line and peg.
  fillPoly(
    ctx,
    [
      { x: x + w * 0.48, y: baseY - h * 0.08 },
      { x: x + w * 0.74, y: baseY },
      { x: x + w * 0.72, y: baseY + 1 },
      { x: x + w * 0.47, y: baseY - h * 0.06 },
    ],
    shade(PAL.wood, -0.2),
  )
}

export function campfire(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  frame: number,
  scale = 1,
): void {
  const s = scale
  softShadow(ctx, x, baseY, 12 * s, 3 * s, 0.18)
  // Ring of stones.
  for (let i = -2; i <= 2; i++) {
    const sx = x + i * 4.6 * s
    ellipse(ctx, sx, baseY - 1.4 * s, 2.4 * s, 1.7 * s, i % 2 ? PAL.rock : PAL.rockShade)
  }
  // Logs.
  facet(
    ctx,
    [
      { x: x - 6 * s, y: baseY - 3.4 * s },
      { x: x + 6 * s, y: baseY - 4.6 * s },
      { x: x + 6 * s, y: baseY - 3.2 * s },
      { x: x - 6 * s, y: baseY - 2 * s },
    ],
    PAL.wood,
    { dark: 0.28 },
  )
  // Flame.
  const f = Math.sin(frame * 0.24) * 0.5 + Math.sin(frame * 0.41) * 0.3
  const tiers: [number, number, string][] = [
    [1.2 + f * 0.1, 1.0, PAL.fireDeep],
    [0.86 + f * 0.12, 0.7, PAL.fire],
    [0.46 + f * 0.1, 0.4, PAL.fireHot],
  ]
  for (const [hh, ww, color] of tiers) {
    fillPoly(
      ctx,
      [
        { x: x + f * 0.9 * s, y: baseY - (4 + 10 * hh) * s },
        { x: x + 4.2 * ww * s, y: baseY - 3.6 * s },
        { x: x + 1.2 * ww * s, y: baseY - 5.4 * s },
        { x: x - 4.2 * ww * s, y: baseY - 3.6 * s },
      ],
      color,
    )
  }
  // Embers.
  for (let i = 0; i < 3; i++) {
    const t = (frame * 0.05 + i * 0.4) % 1
    ctx.globalAlpha = 1 - t
    ellipse(
      ctx,
      x + Math.sin((frame + i * 30) * 0.08) * 4 * s,
      baseY - 14 * s - t * 15 * s,
      0.8 * s,
      0.8 * s,
      t > 0.6 ? PAL.fire : PAL.fireHot,
    )
    ctx.globalAlpha = 1
  }
}

export function bush(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number): void {
  const h = w * 0.68
  facet(
    ctx,
    [
      { x: x - w / 2, y: baseY },
      { x: x - w * 0.36, y: baseY - h * 0.82 },
      { x: x - w * 0.02, y: baseY - h },
      { x: x + w * 0.32, y: baseY - h * 0.74 },
      { x: x + w / 2, y: baseY },
    ],
    PAL.pine,
    { dark: 0.24, light: 0.14 },
  )
}

export function rock(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number): void {
  const h = w * 0.72
  facet(
    ctx,
    [
      { x: x - w / 2, y: baseY },
      { x: x - w * 0.34, y: baseY - h * 0.7 },
      { x: x + w * 0.06, y: baseY - h },
      { x: x + w * 0.42, y: baseY - h * 0.56 },
      { x: x + w / 2, y: baseY },
    ],
    PAL.rock,
    { dark: 0.24, light: 0.16 },
  )
}

export function log(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number): void {
  const h = w * 0.3
  facet(ctx, [
    { x: x - w / 2, y: baseY - h },
    { x: x + w / 2, y: baseY - h },
    { x: x + w / 2, y: baseY },
    { x: x - w / 2, y: baseY },
  ], PAL.wood, { dark: 0.26 })
  ellipse(ctx, x + w / 2, baseY - h / 2, h * 0.34, h / 2, shade(PAL.wood, 0.18))
}

/** A hanging lantern for a bit of warm light. */
export function lantern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  frame: number,
): void {
  const sway = Math.sin(frame * 0.03) * h * 0.06
  const cx = x + sway
  rect(ctx, x - 0.5, y - h * 0.9, 1, h * 0.5, shade(PAL.wood, -0.2))
  facet(
    ctx,
    [
      { x: cx - h * 0.24, y: y - h * 0.4 },
      { x: cx + h * 0.24, y: y - h * 0.4 },
      { x: cx + h * 0.2, y: y },
      { x: cx - h * 0.2, y: y },
    ],
    PAL.fireHot,
    { flat: true },
  )
  fillPoly(
    ctx,
    [
      { x: cx - h * 0.26, y: y - h * 0.44 },
      { x: cx + h * 0.26, y: y - h * 0.44 },
      { x: cx + h * 0.2, y: y - h * 0.36 },
      { x: cx - h * 0.2, y: y - h * 0.36 },
    ],
    shade(PAL.wood, -0.3),
  )
  const g = ctx.createRadialGradient(cx, y - h * 0.2, 0, cx, y - h * 0.2, h * 1.4)
  g.addColorStop(0, 'rgba(255, 198, 110, 0.28)')
  g.addColorStop(1, 'rgba(255, 198, 110, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, y - h * 0.2, h * 1.4, 0, Math.PI * 2)
  ctx.fill()
}

/** Cloud used by every outdoor scene. */
export function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  const h = w * 0.36
  const pts: Pt[] = [
    { x: x - w / 2, y: y + h / 2 },
    { x: x - w * 0.36, y: y - h * 0.28 },
    { x: x - w * 0.06, y: y - h / 2 },
    { x: x + w * 0.28, y: y - h * 0.22 },
    { x: x + w / 2, y: y + h / 2 },
  ]
  facet(ctx, pts, PAL.cloud, { dark: 0.1, light: 0.06 })
}
