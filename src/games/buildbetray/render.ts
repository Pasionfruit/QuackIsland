/**
 * Draws a Build & Betray match: the level fits the whole viewport at a fixed
 * scale (no camera to build or tune) - readability with up to eight players
 * comes from that fixed frame plus a name tag and a colour ring on every
 * character, the same trick Duck szn uses for eight lanes.
 */
import { drawAvatar } from '../../art/avatar'
import { CAST } from '../../art/cast'
import { PAL } from '../../art/palette'
import { ellipse, facet, fillPoly, rect, shade, withAlpha, type Pt } from '../../lib/draw'
import { drawText } from '../../lib/text'
import type { RunnerState } from './engine/engine'
import { VIEW_H, VIEW_W } from './engine/engine'
import { fixedSolids, goalRect, solidAt, trapArmed, type Level, type PlacedPiece } from './engine/level'
import { CELL_H, CELL_W, pieceById, type PieceDef } from './engine/pieces'

// ------------------------------------------------------------------- ground

function drawSlab(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, faded = false): void {
  const a = faded ? 0.55 : 1
  ctx.save()
  ctx.globalAlpha = a
  rect(ctx, x, y, w, h, PAL.dirt)
  rect(ctx, x, y, w, 3, PAL.grass)
  rect(ctx, x, y, w, 1.4, PAL.grassLit)
  rect(ctx, x, y + h - 3, w, 3, withAlpha(PAL.dirtShade, 0.5))
  ctx.restore()
}

function drawBackground(ctx: CanvasRenderingContext2D, frame: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H)
  sky.addColorStop(0, PAL.skyHigh)
  sky.addColorStop(0.6, PAL.skyMid)
  sky.addColorStop(1, PAL.skyLow)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)

  ctx.fillStyle = withAlpha('#7f9c9c', 0.4)
  ctx.beginPath()
  ctx.moveTo(0, VIEW_H)
  for (let x = 0; x <= VIEW_W; x += 20) ctx.lineTo(x, 150 - Math.sin(x * 0.02 + frame * 0.002) * 10)
  ctx.lineTo(VIEW_W, VIEW_H)
  ctx.closePath()
  ctx.fill()

  // The chasm below everything - falling into it is what "out of bounds" means here.
  ctx.fillStyle = withAlpha('#2b241d', 0.5)
  ctx.fillRect(0, VIEW_H - 26, VIEW_W, 26)
}

// --------------------------------------------------------------- one piece

function sawTeeth(r: number): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const rr = i % 2 === 0 ? r : r * 0.62
    pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr })
  }
  return pts
}

function drawPiece(ctx: CanvasRenderingContext2D, p: PlacedPiece, def: PieceDef, frame: number, viewerSlot: number | null): void {
  const x = p.gx * CELL_W
  const y = p.gy * CELL_H
  const w = p.w * CELL_W
  const h = p.h * CELL_H
  const cx = x + w / 2
  const cy = y + h / 2

  const stillSolid = solidAt(p, frame)

  switch (def.behavior) {
    case 'static':
    case 'oneway':
      if (def.behavior === 'oneway') ctx.globalAlpha = 0.72
      drawSlab(ctx, x, y, w, h)
      ctx.globalAlpha = 1
      return
    case 'breakable': {
      if (!stillSolid) return
      const warn = p.brokenAtFrame !== undefined
      drawSlab(ctx, x, y, w, h, warn && (frame >> 2) % 2 === 0)
      if (warn) {
        ctx.strokeStyle = withAlpha('#3b372f', 0.6)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x + w * 0.3, y)
        ctx.lineTo(x + w * 0.45, y + h * 0.6)
        ctx.moveTo(x + w * 0.7, y)
        ctx.lineTo(x + w * 0.58, y + h * 0.6)
        ctx.stroke()
      }
      return
    }
    case 'fake': {
      if (!stillSolid) return
      drawSlab(ctx, x, y, w, h)
      if (p.ownerSlot === viewerSlot) {
        ctx.strokeStyle = withAlpha('#fff6e2', 0.55 + Math.sin(frame * 0.15) * 0.25)
        ctx.lineWidth = 1.4
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)
      }
      return
    }
    case 'triggerTrap': {
      const armed = trapArmed(p, frame, def.params?.delay ?? 16)
      const primed = p.triggeredAtFrame !== undefined
      if (!armed) {
        drawSlab(ctx, x, y, w, h, primed && (frame >> 1) % 2 === 0)
        if (p.ownerSlot === viewerSlot) {
          ctx.strokeStyle = withAlpha('#fff6e2', 0.5 + Math.sin(frame * 0.15) * 0.2)
          ctx.lineWidth = 1.2
          ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)
        }
      } else {
        drawHazardSpikes(ctx, x, y, w, h)
      }
      return
    }
    case 'moving': {
      const speed = def.params?.speed ?? 0.9
      const range = (def.params?.range ?? 3) * CELL_W
      const off = Math.sin(frame * speed * 0.03) * range * p.dir
      drawSlab(ctx, x + off, y, w, h)
      ctx.fillStyle = withAlpha('#3b372f', 0.35)
      ellipse(ctx, x + off + w * 0.22, y + h + 1, 2.2, 1.2, withAlpha('#3b372f', 0.3))
      ellipse(ctx, x + off + w * 0.78, y + h + 1, 2.2, 1.2, withAlpha('#3b372f', 0.3))
      return
    }
    case 'conveyor': {
      rect(ctx, x, y, w, h, def.color)
      rect(ctx, x, y, w, 2, shade(def.color, 0.2))
      const n = Math.max(2, Math.round(w / 10))
      for (let i = 0; i < n; i++) {
        const t = ((frame * 0.06 * p.dir + i) % n) / n
        const ax = x + t * w
        ctx.fillStyle = withAlpha('#fff6e2', 0.5)
        ctx.beginPath()
        const dir = p.dir
        ctx.moveTo(ax - 3 * dir, y + h * 0.3)
        ctx.lineTo(ax + 3 * dir, y + h * 0.5)
        ctx.lineTo(ax - 3 * dir, y + h * 0.7)
        ctx.fill()
      }
      return
    }
    case 'bounce': {
      rect(ctx, x, y + h * 0.5, w, h * 0.5, shade(def.color, -0.2))
      const squash = 0.6 + 0.4 * Math.abs(Math.sin(frame * 0.1))
      facet(
        ctx,
        [
          { x, y: y + h * 0.5 },
          { x: x + w, y: y + h * 0.5 },
          { x: x + w, y: y + h * (0.5 - 0.4 * squash) },
          { x, y: y + h * (0.5 - 0.4 * squash) },
        ],
        def.color,
        { dark: 0.2, light: 0.2 },
      )
      return
    }
    case 'launch': {
      rect(ctx, x, y, w, h, def.color)
      const dir = p.dir
      ctx.fillStyle = withAlpha('#fff6e2', 0.8)
      ctx.beginPath()
      ctx.moveTo(cx - 5 * dir, y + h * 0.75)
      ctx.lineTo(cx + 5 * dir, y + h * 0.4)
      ctx.lineTo(cx - 1 * dir, y + h * 0.4)
      ctx.lineTo(cx + 4 * dir, y - h * 0.1)
      ctx.lineTo(cx - 6 * dir, y + h * 0.28)
      ctx.lineTo(cx - 1 * dir, y + h * 0.28)
      ctx.closePath()
      ctx.fill()
      return
    }
    case 'spikes':
      drawHazardSpikes(ctx, x, y, w, h)
      return
    case 'saw': {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(frame * 0.22)
      facet(ctx, sawTeeth(CELL_W * 0.42), def.color, { dark: 0.28, light: 0.18 })
      ctx.restore()
      ellipse(ctx, cx, cy, 1.6, 1.6, '#4d4842')
      return
    }
    case 'fire': {
      const flared = frame % (def.params?.period ?? 90) < (def.params?.period ?? 90) * 0.55
      ellipse(ctx, cx, y + h - 1, w * 0.32, 2, withAlpha('#3b372f', 0.3))
      if (!flared) {
        ellipse(ctx, cx, y + h * 0.7, 2.4, 1.6, '#6b5a44')
        return
      }
      const f = Math.sin(frame * 0.3) * 0.5 + Math.sin(frame * 0.5) * 0.3
      const tiers: [number, string][] = [
        [1.1 + f * 0.1, PAL.fireDeep],
        [0.78 + f * 0.12, PAL.fire],
        [0.42 + f * 0.1, PAL.fireHot],
      ]
      for (const [hh, color] of tiers) {
        fillPoly(
          ctx,
          [
            { x: cx + f, y: y + h - hh * h },
            { x: cx + w * 0.3, y: y + h * 0.8 },
            { x: cx, y: y + h * 0.6 },
            { x: cx - w * 0.3, y: y + h * 0.8 },
          ],
          color,
        )
      }
      return
    }
    case 'checkpoint': {
      rect(ctx, cx - 1, y, 2, h, shade(PAL.wood, -0.2))
      fillPoly(
        ctx,
        [
          { x: cx + 1, y: y + 2 },
          { x: cx + h * 0.5, y: y + h * 0.18 },
          { x: cx + 1, y: y + h * 0.34 },
        ],
        def.color,
      )
      return
    }
    default:
      rect(ctx, x, y, w, h, def.color)
  }
}

function drawHazardSpikes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const n = Math.max(2, Math.round(w / 8))
  const step = w / n
  for (let i = 0; i < n; i++) {
    facet(
      ctx,
      [
        { x: x + i * step, y: y + h },
        { x: x + (i + 0.5) * step, y: y + h * 0.15 },
        { x: x + (i + 1) * step, y: y + h },
      ],
      '#8a8f96',
      { dark: 0.3, light: 0.16, flat: true },
    )
  }
}

/** The wall gets its own pass so its full height reads clearly even mid-list. */
function drawWall(ctx: CanvasRenderingContext2D, p: PlacedPiece, def: PieceDef): void {
  const x = p.gx * CELL_W
  const y = p.gy * CELL_H
  const w = p.w * CELL_W
  const h = p.h * CELL_H
  rect(ctx, x, y, w, h, def.color)
  rect(ctx, x, y, w, 2, shade(def.color, 0.16))
  rect(ctx, x, y + h - 2, w, 2, shade(def.color, -0.2))
}

// --------------------------------------------------------------- the level

export function drawLevel(ctx: CanvasRenderingContext2D, level: Level, frame: number, viewerSlot: number | null): void {
  drawBackground(ctx, frame)
  for (const s of fixedSolids()) drawSlab(ctx, s.gx * CELL_W, s.gy * CELL_H, s.w * CELL_W, s.h * CELL_H)

  const goal = goalRect()
  ctx.save()
  ctx.globalAlpha = 0.5 + Math.sin(frame * 0.08) * 0.15
  ctx.fillStyle = '#8fae6a'
  ctx.fillRect(goal.x + goal.w * 0.35, goal.y, goal.w * 0.06, goal.h)
  fillPoly(
    ctx,
    [
      { x: goal.x + goal.w * 0.41, y: goal.y },
      { x: goal.x + goal.w * 0.41 + 14, y: goal.y + 5 },
      { x: goal.x + goal.w * 0.41, y: goal.y + 10 },
    ],
    '#e0794f',
  )
  ctx.restore()

  for (const p of level.placed) {
    const def = pieceById(p.pieceId)
    if (def.id === 'wall') drawWall(ctx, p, def)
    else drawPiece(ctx, p, def, frame, viewerSlot)
  }
}

/** A translucent preview of the piece about to be placed - green if legal, red if not. */
export function drawGhost(ctx: CanvasRenderingContext2D, pieceId: string, gx: number, gy: number, dir: 1 | -1, ok: boolean): void {
  const def = pieceById(pieceId)
  const x = gx * CELL_W
  const y = gy * CELL_H
  const w = def.w * CELL_W
  const h = def.h * CELL_H
  ctx.save()
  ctx.globalAlpha = 0.55
  ctx.fillStyle = ok ? '#8fae6a' : '#c0392b'
  ctx.fillRect(x, y, w, h)
  ctx.globalAlpha = 1
  ctx.strokeStyle = ok ? '#5f7a45' : '#8a2c20'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  if (def.rotatable) {
    ctx.fillStyle = '#fff6e2'
    ctx.beginPath()
    const cx = x + w / 2
    const cy = y + h / 2
    ctx.moveTo(cx - 4 * dir, cy - 3)
    ctx.lineTo(cx + 4 * dir, cy)
    ctx.lineTo(cx - 4 * dir, cy + 3)
    ctx.fill()
  }
  ctx.restore()
}

// ------------------------------------------------------------------ runner

function poseFor(r: RunnerState): 'idle' | 'walk' | 'jump' | 'fall' | 'hurt' {
  if (!r.alive) return 'hurt'
  if (!r.grounded) return r.vy < 0 ? 'jump' : 'fall'
  return Math.abs(r.vx) > 0.3 ? 'walk' : 'idle'
}

export function drawRunner(ctx: CanvasRenderingContext2D, r: RunnerState, frame: number, isSelf: boolean): void {
  if (!r.alive) return
  const avatar = CAST[r.slot % CAST.length]
  const blinking = r.invuln > 0 && Math.floor(frame / 4) % 2 === 0
  ellipse(ctx, r.x, r.y + 1, 7, 2.6, 'rgba(58, 60, 48, 0.26)')
  drawAvatar(ctx, avatar, r.x, r.y, {
    facing: r.facing,
    height: 26,
    pose: poseFor(r),
    phase: frame,
    alpha: blinking ? 0.4 : 1,
  })

  const tagY = r.y - 34
  ctx.save()
  ctx.globalAlpha = 0.85
  drawText(ctx, r.finished ? `${r.name} ✓` : r.name, r.x, tagY, r.color, {
    size: isSelf ? 8.5 : 7.5,
    align: 'center',
    weight: 800,
    shadow: 'rgba(30,26,20,0.6)',
    shadowOffset: 1,
  })
  ctx.restore()
  if (isSelf) {
    ctx.strokeStyle = withAlpha(r.color, 0.8)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(r.x, r.y + 1, 8, 3, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
}

// --------------------------------------------------------------------- hud

export function drawTimer(ctx: CanvasRenderingContext2D, label: string, seconds: number, urgent: boolean): void {
  drawText(ctx, label, VIEW_W / 2, 8, '#fff6e2', { size: 10, align: 'center', weight: 700 })
  drawText(ctx, `${Math.max(0, Math.ceil(seconds))}`, VIEW_W / 2, 18, urgent ? '#ffb04a' : '#fff6e2', {
    size: 20,
    align: 'center',
    weight: 800,
  })
}

export function drawBanner(ctx: CanvasRenderingContext2D, text: string, sub?: string): void {
  ctx.fillStyle = 'rgba(30, 26, 20, 0.4)'
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  drawText(ctx, text, VIEW_W / 2, VIEW_H / 2 - 16, '#fff6e2', { size: 26, align: 'center', weight: 800 })
  if (sub) drawText(ctx, sub, VIEW_W / 2, VIEW_H / 2 + 12, '#f2ece0', { size: 12, align: 'center', weight: 600 })
}
