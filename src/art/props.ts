/**
 * Cozy scenery pieces. All authored as flat facets so they sit next to the
 * campers without looking like they came from a different game.
 */
import { fillPoly, px, type Pt } from '../lib/pixel'
import { PAL } from './palette'

export function pine(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  h: number,
  tint = 0,
): void {
  const w = h * 0.46
  px(ctx, x - h * 0.05, baseY - h * 0.2, h * 0.1, h * 0.2, PAL.trunk)
  const body = tint > 0 ? PAL.pineLit : tint < 0 ? PAL.pineShade : PAL.pine
  const shade = tint > 0 ? PAL.pine : PAL.pineShade
  for (let i = 0; i < 3; i++) {
    const top = baseY - h + (h * 0.26 * i)
    const spread = (w / 2) * (0.55 + i * 0.24)
    const bottom = top + h * 0.34
    const tier: Pt[] = [
      { x, y: top },
      { x: x + spread, y: bottom },
      { x: x + spread * 0.4, y: bottom },
      { x: x + spread * 0.5, y: bottom + h * 0.05 },
      { x: x - spread * 0.5, y: bottom + h * 0.05 },
      { x: x - spread * 0.4, y: bottom },
      { x: x - spread, y: bottom },
    ]
    fillPoly(ctx, tier, body)
    fillPoly(
      ctx,
      [
        { x, y: top },
        { x: x - spread, y: bottom },
        { x: x - spread * 0.4, y: bottom },
      ],
      shade,
    )
  }
}

export function tent(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number): void {
  const h = w * 0.78
  fillPoly(
    ctx,
    [
      { x, y: baseY - h },
      { x: x + w / 2, y: baseY },
      { x: x - w / 2, y: baseY },
    ],
    '#6f7f86',
  )
  fillPoly(
    ctx,
    [
      { x, y: baseY - h },
      { x: x - w / 2, y: baseY },
      { x: x - w * 0.12, y: baseY },
    ],
    '#56666d',
  )
  // Doorway.
  fillPoly(
    ctx,
    [
      { x, y: baseY - h * 0.62 },
      { x: x + w * 0.17, y: baseY },
      { x: x - w * 0.17, y: baseY },
    ],
    '#39454b',
  )
  px(ctx, x - w * 0.62, baseY - 1, w * 1.24, 2, PAL.dirtShade)
}

export function campfire(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  frame: number,
  scale = 1,
): void {
  // Stones.
  for (let i = -2; i <= 2; i++) {
    const sx = x + i * 4.4 * scale
    px(ctx, sx - 2 * scale, baseY - 2.5 * scale, 4 * scale, 3 * scale, i % 2 ? PAL.rock : PAL.rockShade)
  }
  // Logs.
  px(ctx, x - 6 * scale, baseY - 4.5 * scale, 12 * scale, 2 * scale, PAL.woodShade)
  // Flame, three flickering tiers.
  const f = Math.sin(frame * 0.24) * 0.5 + Math.sin(frame * 0.41) * 0.3
  const tiers: [number, number, string][] = [
    [1.15 + f * 0.1, 1.0, PAL.fireDeep],
    [0.82 + f * 0.12, 0.72, PAL.fire],
    [0.44 + f * 0.1, 0.4, PAL.fireHot],
  ]
  for (const [hh, ww, color] of tiers) {
    fillPoly(
      ctx,
      [
        { x: x + f * 0.8 * scale, y: baseY - (5 + 9 * hh) * scale },
        { x: x + 4 * ww * scale, y: baseY - 4 * scale },
        { x: x - 4 * ww * scale, y: baseY - 4 * scale },
      ],
      color,
    )
  }
  // Embers.
  for (let i = 0; i < 3; i++) {
    const t = (frame * 0.05 + i * 0.4) % 1
    px(
      ctx,
      x + Math.sin((frame + i * 30) * 0.08) * 4 * scale,
      baseY - 14 * scale - t * 14 * scale,
      1,
      1,
      t > 0.6 ? PAL.fire : PAL.fireHot,
    )
  }
}

export function cat(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  h: number,
  facing: 1 | -1,
  frame: number,
): void {
  const body = '#3a3530'
  const shade = '#2a2622'
  const w = h * 1.05
  const tail = Math.sin(frame * 0.06) * h * 0.16
  // Tail.
  fillPoly(
    ctx,
    [
      { x: x - facing * w * 0.42, y: baseY - h * 0.28 },
      { x: x - facing * w * 0.66, y: baseY - h * 0.5 - tail },
      { x: x - facing * w * 0.52, y: baseY - h * 0.56 - tail },
      { x: x - facing * w * 0.34, y: baseY - h * 0.2 },
    ],
    shade,
  )
  // Body.
  fillPoly(
    ctx,
    [
      { x: x - w * 0.42, y: baseY },
      { x: x - w * 0.36, y: baseY - h * 0.46 },
      { x: x + w * 0.3, y: baseY - h * 0.5 },
      { x: x + w * 0.4, y: baseY },
    ],
    body,
  )
  // Head.
  const hx = x + facing * w * 0.26
  const hy = baseY - h * 0.68
  fillPoly(
    ctx,
    [
      { x: hx - h * 0.24, y: hy - h * 0.1 },
      { x: hx - h * 0.2, y: hy - h * 0.28 },
      { x: hx - h * 0.06, y: hy - h * 0.2 },
      { x: hx + h * 0.08, y: hy - h * 0.3 },
      { x: hx + h * 0.24, y: hy - h * 0.08 },
      { x: hx + h * 0.2, y: hy + h * 0.18 },
      { x: hx - h * 0.18, y: hy + h * 0.18 },
    ],
    body,
  )
  px(ctx, hx + facing * h * 0.02 - 1, hy - h * 0.02, 2, 2, '#f6f2e8')
  px(ctx, hx + facing * h * 0.2 - 1, hy - h * 0.02, 2, 2, '#f6f2e8')
}

export function seagull(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  frame: number,
  facing: 1 | -1 = 1,
): void {
  const flap = Math.sin(frame * 0.12) * 2
  fillPoly(
    ctx,
    [
      { x: x - 4, y },
      { x: x + 4 * facing, y: y - 1 },
      { x: x + 1, y: y + 2 },
    ],
    PAL.white,
  )
  px(ctx, x - 3, y - 2 - flap, 3, 1, PAL.cloudShade)
  px(ctx, x + 1, y - 2 + flap, 3, 1, PAL.cloudShade)
}

export function bush(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number): void {
  const h = w * 0.62
  fillPoly(
    ctx,
    [
      { x: x - w / 2, y: baseY },
      { x: x - w * 0.34, y: baseY - h * 0.8 },
      { x: x - w * 0.02, y: baseY - h },
      { x: x + w * 0.3, y: baseY - h * 0.72 },
      { x: x + w / 2, y: baseY },
    ],
    PAL.pine,
  )
  fillPoly(
    ctx,
    [
      { x: x - w / 2, y: baseY },
      { x: x - w * 0.34, y: baseY - h * 0.8 },
      { x: x - w * 0.1, y: baseY },
    ],
    PAL.pineShade,
  )
}
