/**
 * Draws a Tank Trouble match: a tiled pit, faceted walls, and tanks with a
 * turret that points wherever the driver is aiming.
 */
import { grid } from '../../../art/scenes'
import { clamp, ellipse, facet, fillPoly, rand, rectPts, shade, withAlpha } from '../../../lib/draw'
import { drawText } from '../../../lib/text'
import type { TankEngine } from './engine'
import { ARENA, VIEW_H, VIEW_W } from './types'

const FLOOR = '#cdbfa0'
const STONE = '#7d7264'
const WOOD = '#a9835a'

function drawTank(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
  flash: number,
  label: string,
): void {
  const r = 8.5
  const body = shade(color, flash > 0 ? 0.6 : 0)
  facet(ctx, rectPts(x - r, y - r * 0.8, r * 2, r * 1.6), body, { dark: 0.26, light: 0.16, round: 0.3 })
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  facet(ctx, rectPts(-2, -2.4, r * 1.6, 4.8), shade(color, -0.15), { dark: 0.2, light: 0.14, round: 0.2 })
  ctx.restore()
  ellipse(ctx, x, y, r * 0.55, r * 0.55, shade(color, -0.1))
  if (label) drawText(ctx, label, x, y - r - 11, color, { size: 7, align: 'center', weight: 700 })
}

/** A dotted line from a tank to wherever it is currently aiming. */
export function drawAimLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
): void {
  ctx.save()
  ctx.strokeStyle = withAlpha(color, 0.55)
  ctx.lineWidth = 1
  ctx.setLineDash([3, 4])
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

export function renderMatch(ctx: CanvasRenderingContext2D, eng: TankEngine): void {
  const sx = eng.shake > 0.4 ? rand(-eng.shake, eng.shake) : 0
  const sy = eng.shake > 0.4 ? rand(-eng.shake, eng.shake) : 0

  ctx.save()
  ctx.translate(Math.round(sx), Math.round(sy))
  ctx.fillStyle = FLOOR
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  grid(ctx, VIEW_W, VIEW_H, 12, 'rgba(120, 104, 78, 0.22)')
  fillPoly(ctx, rectPts(ARENA.x, ARENA.y, ARENA.w, ARENA.h), 'rgba(0,0,0,0.06)')

  eng.maze.walls.forEach((w, i) => {
    if (eng.destroyedWalls.has(i)) return
    const wood = w.kind === 'wood'
    facet(ctx, rectPts(w.x, w.y, w.w, w.h), wood ? WOOD : STONE, {
      dark: wood ? 0.32 : 0.28,
      light: wood ? 0.22 : 0.2,
      round: 0.15,
    })
    if (wood && w.w > w.h) {
      // A couple of plank seams, so wood reads as breakable at a glance.
      ctx.strokeStyle = 'rgba(60, 42, 24, 0.35)'
      ctx.lineWidth = 0.8
      for (const fx of [0.33, 0.66]) {
        ctx.beginPath()
        ctx.moveTo(w.x + w.w * fx, w.y + 1)
        ctx.lineTo(w.x + w.w * fx, w.y + w.h - 1)
        ctx.stroke()
      }
    } else if (wood) {
      ctx.strokeStyle = 'rgba(60, 42, 24, 0.35)'
      ctx.lineWidth = 0.8
      for (const fy of [0.33, 0.66]) {
        ctx.beginPath()
        ctx.moveTo(w.x + 1, w.y + w.h * fy)
        ctx.lineTo(w.x + w.w - 1, w.y + w.h * fy)
        ctx.stroke()
      }
    }
  })

  for (const m of eng.mines) {
    const armed = m.armIn <= 0
    const pulse = armed ? 0.6 + Math.sin(eng.frame * 0.2) * 0.4 : 0.3
    ellipse(ctx, m.x, m.y, 4.2, 4.2, withAlpha(armed ? '#d9534f' : '#8d8578', clamp(pulse, 0.25, 1)))
    ellipse(ctx, m.x, m.y, 1.6, 1.6, '#2b2622')
  }

  for (const b of eng.bullets) {
    if (b.homing) {
      // A little flame behind it, so a tracking round reads as a missile
      // rather than just another shot.
      const a = Math.atan2(b.vy, b.vx)
      ellipse(ctx, b.x - Math.cos(a) * 4, b.y - Math.sin(a) * 4, 2, 1.3, 'rgba(232,192,95,0.85)')
      ellipse(ctx, b.x, b.y, 2.6, 1.6, '#3f7a6e')
      ellipse(ctx, b.x + Math.cos(a) * 2, b.y + Math.sin(a) * 2, 1, 1, '#f6f2e8')
    } else {
      ellipse(ctx, b.x, b.y, 2.6, 2.6, '#2b2622')
      ellipse(ctx, b.x, b.y, 1.2, 1.2, '#f6f2e8')
    }
  }

  const sorted = [...eng.tanks].sort((a, b) => a.y - b.y)
  for (const t of sorted) {
    if (!t.alive) continue
    drawTank(ctx, t.x, t.y, t.angle, t.color, t.flash, t.slot >= 0 ? t.name : '')
  }

  for (const p of eng.particles) {
    ellipse(ctx, p.x, p.y, p.size, p.size, withAlpha(p.color, clamp(p.life / p.maxLife, 0, 1)))
  }
  ctx.restore()

  drawHud(ctx, eng)
}

function drawHud(ctx: CanvasRenderingContext2D, eng: TankEngine): void {
  const alive = eng.players.filter((p) => p.alive).length
  const enemiesLeft = eng.enemies.filter((e) => e.alive).length
  drawText(ctx, `LEVEL ${eng.level}`, 12, 6, '#3b372f', { size: 11, weight: 800 })
  drawText(ctx, `TANKS ${alive}/${eng.players.length}`, 12, VIEW_H - 16, '#3b372f', {
    size: 9,
    weight: 700,
  })
  drawText(ctx, `ENEMIES ${enemiesLeft}`, VIEW_W - 12, VIEW_H - 16, '#8a3f3f', {
    size: 9,
    align: 'right',
    weight: 700,
  })

  if (eng.phase === 'intro') {
    panel(ctx, `LEVEL ${eng.level}`, `${eng.enemies.length} sentries in the maze`, Math.ceil(eng.phaseTimer / 60))
  } else if (eng.phase === 'levelClear') {
    panel(ctx, 'LEVEL CLEAR', eng.level >= 20 ? 'Final level down.' : 'Regrouping...', null)
  } else if (eng.phase === 'over') {
    panel(ctx, 'ALL TANKS LOST', `Fell on level ${eng.level}`, null)
  } else if (eng.phase === 'victory') {
    panel(ctx, 'PIT CLEARED', 'All twenty levels down.', null)
  }
}

function panel(ctx: CanvasRenderingContext2D, title: string, sub: string, count: number | null): void {
  ctx.fillStyle = 'rgba(28, 26, 22, 0.6)'
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  drawText(ctx, title, VIEW_W / 2, 96, '#f6f2e8', { size: 24, align: 'center', weight: 800 })
  drawText(ctx, sub, VIEW_W / 2, 128, '#cfc6b4', { size: 11, align: 'center' })
  if (count !== null) {
    drawText(ctx, `${count}`, VIEW_W / 2, 148, '#e8c05f', { size: 26, align: 'center', weight: 800 })
  }
}
