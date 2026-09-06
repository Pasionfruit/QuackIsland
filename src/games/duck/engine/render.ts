/**
 * Draws a Duck szn round.
 *
 * Fixed camera, so the backdrop for each stage is baked once and everything
 * else is painted over it back to front. Targets carry their own depth, and a
 * clay pigeon sailing toward the horizon shrinks by the same number that makes
 * it harder to hit - the picture and the hit test never disagree.
 */
import { PAL } from '../../../art/palette'
import { bush, cloud, pine, rock, tent } from '../../../art/props'
import { DAY, DUSK, NIGHT, ground, sky, stars, sun, treeline, water } from '../../../art/scenes'
import {
  clamp,
  ellipse,
  facet,
  fillPoly,
  makeScene,
  noise,
  rand,
  sceneScale,
  shade,
  withAlpha,
  type Pt,
} from '../../../lib/draw'
import { drawText } from '../../../lib/text'
import type { DuckEngine } from './engine'
import { GROUND, HORIZON, VIEW_H, VIEW_W, type StageId, type Target } from './types'

// ----------------------------------------------------------------- backdrop

/**
 * One entry per stage rather than one entry total. A single slot meant every
 * stage change threw the previous backdrop away and rebuilt the new one
 * synchronously mid-frame - a full-resolution facet pass, and a visible hitch
 * on exactly the STAGE CLEAR beat where the player is watching the screen.
 * Five small canvases is a cheap price for losing that.
 */
const backCache = new Map<string, HTMLCanvasElement>()
let backCacheScale = 0

function buildBackdrop(stage: StageId, ss: number): HTMLCanvasElement {
  const { canvas, ctx } = makeScene(VIEW_W, VIEW_H, ss)

  if (stage === 'ufos') {
    sky(ctx, VIEW_W, HORIZON, NIGHT)
    stars(ctx, VIEW_W, HORIZON - 20, 0)
    treeline(ctx, VIEW_W, HORIZON, 14, -1)
    ground(ctx, VIEW_W, VIEW_H, HORIZON, shade(PAL.grass, -0.4))
  } else if (stage === 'clays') {
    sky(ctx, VIEW_W, HORIZON, DUSK)
    sun(ctx, 390, 44, 10)
    treeline(ctx, VIEW_W, HORIZON, 12, -1)
    ground(ctx, VIEW_W, VIEW_H, HORIZON, PAL.grass)
  } else if (stage === 'balloons') {
    sky(ctx, VIEW_W, HORIZON, DAY)
    sun(ctx, 74, 34, 9)
    cloud(ctx, 300, 40, 34)
    cloud(ctx, 150, 24, 26)
    treeline(ctx, VIEW_W, HORIZON, 12, -1)
    water(ctx, VIEW_W, VIEW_H, HORIZON, 0)
  } else {
    sky(ctx, VIEW_W, HORIZON, DAY)
    cloud(ctx, 90, 30, 30)
    cloud(ctx, 340, 22, 24)
    treeline(ctx, VIEW_W, HORIZON, 12, -1)
    ground(ctx, VIEW_W, VIEW_H, HORIZON, PAL.grass)
  }

  // The range itself: a bench across the front and some scenery either side.
  if (stage !== 'balloons') {
    for (let i = 0; i < 5; i++) {
      const x = 30 + i * 108 + noise(i * 3.3) * 20
      if (i % 2 === 0) pine(ctx, x, GROUND + 6, 20)
      else bush(ctx, x, GROUND + 4, 15)
    }
    rock(ctx, 60, GROUND + 10, 13)
    rock(ctx, 420, GROUND + 12, 15)
  }
  if (stage === 'targets') tent(ctx, 415, GROUND + 2, 26)

  return canvas
}

/**
 * The dark apron the HUD sits on. Drawn with the HUD rather than baked into
 * the backdrop, because the backdrop shakes on every hit and the HUD does not
 * - so the text used to slide off its own backing strip.
 */
function drawApron(ctx: CanvasRenderingContext2D): void {
  const apron: Pt[] = [
    { x: 0, y: VIEW_H },
    { x: 0, y: VIEW_H - 22 },
    { x: VIEW_W, y: VIEW_H - 26 },
    { x: VIEW_W, y: VIEW_H },
  ]
  fillPoly(ctx, apron, shade(PAL.dirt, -0.45))
}

function backdropFor(ctx: CanvasRenderingContext2D, stage: StageId): HTMLCanvasElement {
  // Exact scale, quantised: rounding meant the largest thing on screen was
  // resampled on its way in, which is what the flat shading cannot survive.
  const ss = Math.round(Math.max(1, Math.min(4, sceneScale(ctx))) * 4) / 4
  if (ss !== backCacheScale) {
    backCache.clear()
    backCacheScale = ss
  }
  let canvas = backCache.get(stage)
  if (!canvas) {
    canvas = buildBackdrop(stage, ss)
    backCache.set(stage, canvas)
  }
  return canvas
}

// ------------------------------------------------------------------ targets

function ngon(cx: number, cy: number, rx: number, ry: number, sides: number, rot = 0): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry })
  }
  return out
}

function drawTarget(ctx: CanvasRenderingContext2D, t: Target, frame: number): void {
  const s = 0.35 + t.z * 0.65
  const r = t.r * s
  const fade = t.dying > 0 ? clamp(t.dying / 10, 0, 1) : 1
  const prev = ctx.globalAlpha
  ctx.globalAlpha = prev * fade

  switch (t.kind) {
    case 'balloon': {
      // String first, so the knot sits on top of it.
      ctx.strokeStyle = 'rgba(60, 56, 48, 0.5)'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(t.x, t.y + r * 0.95)
      ctx.quadraticCurveTo(t.x + Math.sin(t.age * 0.06) * 4, t.y + r * 2.1, t.x, t.y + r * 3)
      ctx.stroke()
      facet(ctx, ngon(t.x, t.y, r, r * 1.15, 9, t.age * 0.01), t.color, {
        dark: 0.26,
        light: 0.2,
        relief: 1,
      })
      facet(ctx, ngon(t.x, t.y + r * 1.1, r * 0.22, r * 0.2, 3, Math.PI / 2), shade(t.color, -0.3), {
        flat: true,
      })
      break
    }
    case 'bull':
    case 'gold': {
      // A pop-up target rises out of the grass as it appears.
      const rise = clamp(t.age / 8, 0, 1)
      const cy = t.y + (1 - rise) * r * 1.6
      facet(ctx, ngon(t.x, cy, r, r, 11), t.color, { dark: 0.22, light: 0.16 })
      ellipse(ctx, t.x, cy, r * 0.62, r * 0.62, '#f6f2e8')
      ellipse(ctx, t.x, cy, r * 0.3, r * 0.3, t.kind === 'gold' ? '#c9932f' : t.color)
      break
    }
    case 'mii': {
      const rise = clamp(t.age / 8, 0, 1)
      const cy = t.y + (1 - rise) * r * 1.6
      facet(ctx, ngon(t.x, cy, r, r * 1.1, 11), t.color, { dark: 0.16, light: 0.1 })
      // A blank little face, so it reads as "do not shoot" at a glance.
      ellipse(ctx, t.x - r * 0.32, cy - r * 0.16, r * 0.12, r * 0.16, '#3b342c')
      ellipse(ctx, t.x + r * 0.32, cy - r * 0.16, r * 0.12, r * 0.16, '#3b342c')
      ctx.strokeStyle = '#3b342c'
      ctx.lineWidth = Math.max(0.7, r * 0.09)
      ctx.beginPath()
      ctx.arc(t.x, cy + r * 0.12, r * 0.36, 0.25, Math.PI - 0.25)
      ctx.stroke()
      break
    }
    case 'clay': {
      facet(ctx, ngon(t.x, t.y, r, r * 0.42, 9, t.age * 0.06), t.color, {
        dark: 0.28,
        light: 0.18,
      })
      ellipse(ctx, t.x, t.y - r * 0.08, r * 0.5, r * 0.18, shade(t.color, 0.22))
      break
    }
    case 'can': {
      // Each dent crumples the silhouette a little more.
      const dent = t.hits * 0.12
      const w = r * 0.72
      const h = r * 1.1
      const body: Pt[] = [
        { x: t.x - w, y: t.y - h },
        { x: t.x + w * (1 - dent * 0.5), y: t.y - h * (1 - dent * 0.3) },
        { x: t.x + w, y: t.y + h },
        { x: t.x - w * (1 - dent * 0.4), y: t.y + h },
      ]
      facet(ctx, body, t.color, { dark: 0.3, light: 0.24, seed: t.id })
      ellipse(ctx, t.x, t.y - h * 0.94, w * 0.94, w * 0.34, shade(t.color, 0.28))
      // A band per dent, so the count is readable mid-juggle.
      for (let i = 0; i < t.hits; i++) {
        ctx.fillStyle = withAlpha('#d9534f', 0.75)
        ctx.fillRect(t.x - w * 0.8, t.y - h * 0.4 + i * (h * 0.34), w * 1.6, Math.max(0.8, h * 0.12))
      }
      break
    }
    case 'duck': {
      const flap = Math.sin(t.age * 0.35) * r * 0.5
      const dir = Math.sign(t.vx) || 1
      facet(ctx, ngon(t.x, t.y, r, r * 0.62, 8), t.color, { dark: 0.24, light: 0.16 })
      facet(
        ctx,
        [
          { x: t.x, y: t.y - r * 0.2 },
          { x: t.x - dir * r * 0.5, y: t.y - r * 0.2 - flap },
          { x: t.x - dir * r * 0.9, y: t.y + r * 0.1 },
        ],
        shade(t.color, -0.2),
        { flat: true },
      )
      facet(
        ctx,
        [
          { x: t.x + dir * r * 0.8, y: t.y - r * 0.2 },
          { x: t.x + dir * r * 1.5, y: t.y - r * 0.05 },
          { x: t.x + dir * r * 0.8, y: t.y + r * 0.15 },
        ],
        '#e8a33c',
        { flat: true },
      )
      ellipse(ctx, t.x + dir * r * 0.55, t.y - r * 0.28, r * 0.13, r * 0.13, '#241f1c')
      break
    }
    case 'walker': {
      const bobY = t.captured ? 0 : Math.sin(t.age * 0.18) * 1.2
      ellipse(ctx, t.x, t.y + 1, r * 0.8, r * 0.3, 'rgba(40, 44, 38, 0.3)')
      facet(ctx, ngon(t.x, t.y - r * 0.9 + bobY, r * 0.55, r * 0.75, 8), t.color, {
        dark: 0.2,
        light: 0.14,
      })
      ellipse(ctx, t.x - r * 0.18, t.y - r * 1.1 + bobY, r * 0.1, r * 0.12, '#241f1c')
      ellipse(ctx, t.x + r * 0.18, t.y - r * 1.1 + bobY, r * 0.1, r * 0.12, '#241f1c')
      break
    }
    case 'ufo': {
      // Tractor beam first: it belongs behind the saucer.
      if (t.linked !== null) {
        const beam: Pt[] = [
          { x: t.x - r * 0.5, y: t.y + r * 0.2 },
          { x: t.x + r * 0.5, y: t.y + r * 0.2 },
          { x: t.x + r * 1.1, y: t.y + 30 },
          { x: t.x - r * 1.1, y: t.y + 30 },
        ]
        fillPoly(ctx, beam, withAlpha('#9fd3e0', 0.28))
      }
      facet(ctx, ngon(t.x, t.y, r, r * 0.34, 11), t.color, { dark: 0.28, light: 0.2 })
      facet(ctx, ngon(t.x, t.y - r * 0.28, r * 0.5, r * 0.4, 9), '#9fd3e0', {
        dark: 0.2,
        light: 0.24,
      })
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + frame * 0.08
        const on = (Math.floor(frame / 6) + i) % 2 === 0
        ellipse(
          ctx,
          t.x + Math.cos(a) * r * 0.78,
          t.y + Math.sin(a) * r * 0.24 + r * 0.08,
          r * 0.1,
          r * 0.1,
          on ? '#ffe08a' : '#8a6a3a',
        )
      }
      break
    }
  }
  ctx.globalAlpha = prev
}

// --------------------------------------------------------------------- hud

function drawReticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  recoil: number,
  label: string,
): void {
  const r = 9 + recoil * 0.8
  ctx.strokeStyle = color
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = withAlpha('#1c1a16', 0.5)
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.arc(x, y, r + 1.1, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.2
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    ctx.beginPath()
    ctx.moveTo(x + dx * (r - 3), y + dy * (r - 3))
    ctx.lineTo(x + dx * (r + 4), y + dy * (r + 4))
    ctx.stroke()
  }
  if (label) drawText(ctx, label, x, y - r - 10, color, { size: 7, align: 'center', weight: 700 })
}

export function renderRound(ctx: CanvasRenderingContext2D, eng: DuckEngine): void {
  const shake = eng.shake
  const sx = shake > 0.4 ? rand(-shake, shake) : 0
  const sy = shake > 0.4 ? rand(-shake, shake) : 0

  // The backdrop is drawn before the shake and so always covers the view; only
  // the targets and effects kick. Shaking it too would slide it off the edge
  // and leave a strip of the previous frame showing along the side.
  ctx.drawImage(backdropFor(ctx, eng.stage.id), 0, 0, VIEW_W, VIEW_H)

  ctx.save()
  ctx.translate(Math.round(sx), Math.round(sy))

  // Far things first: depth is what sells the fixed perspective.
  const sorted = [...eng.targets].sort((a, b) => a.z - b.z || a.y - b.y)
  for (const t of sorted) drawTarget(ctx, t, eng.frame)

  for (const p of eng.particles) {
    const fade = clamp(p.life / p.maxLife, 0, 1)
    ellipse(ctx, p.x, p.y, p.size, p.size, withAlpha(p.color, fade))
  }
  for (const s of eng.splashes) {
    const fade = clamp(s.life / s.maxLife, 0, 1)
    ctx.globalAlpha = fade
    drawText(ctx, s.text, s.x, s.y, s.color, { size: 10, align: 'center', weight: 800 })
    ctx.globalAlpha = 1
  }
  ctx.restore()

  for (const s of eng.shooters) {
    drawReticle(ctx, s.x, s.y, s.color, s.recoil, eng.shooters.length > 1 ? s.name : '')
  }

  drawHud(ctx, eng)
}

function drawHud(ctx: CanvasRenderingContext2D, eng: DuckEngine): void {
  const barY = VIEW_H - 20
  drawApron(ctx)

  drawText(ctx, `${eng.score}`, 12, barY - 2, '#f6f2e8', { size: 17, weight: 800 })
  drawText(ctx, 'SCORE', 12, barY + 12, '#b9b0a0', { size: 7, weight: 700 })

  // The combo is shared, so it gets the middle of the bar.
  if (eng.combo > 0) {
    const mult = eng.multiplier
    drawText(ctx, `x${mult}`, VIEW_W / 2, barY - 4, mult >= 4 ? '#e8c05f' : '#f6f2e8', {
      size: 16,
      align: 'center',
      weight: 800,
    })
    drawText(ctx, `${eng.combo} IN A ROW`, VIEW_W / 2, barY + 12, '#b9b0a0', {
      size: 7,
      align: 'center',
      weight: 700,
    })
  } else if (eng.frame - eng.comboBrokeFrame < 70) {
    // Only just after a break - it used to sit there from the opening frame of
    // every stage, announcing the loss of a combo nobody had started yet.
    const fade = clamp(1 - (eng.frame - eng.comboBrokeFrame) / 70, 0, 1)
    ctx.save()
    ctx.globalAlpha = fade
    drawText(ctx, 'COMBO LOST', VIEW_W / 2, barY + 4, '#e8703a', {
      size: 8,
      align: 'center',
      weight: 700,
    })
    ctx.restore()
  }

  const secs = Math.max(0, Math.ceil(eng.stageTimer / 60))
  drawText(ctx, `${secs}`, VIEW_W - 12, barY - 2, secs <= 5 ? '#d9534f' : '#f6f2e8', {
    size: 17,
    align: 'right',
    weight: 800,
  })
  drawText(ctx, eng.stage.name.toUpperCase(), VIEW_W - 12, barY + 12, '#b9b0a0', {
    size: 7,
    align: 'right',
    weight: 700,
  })

  if (eng.phase === 'ready') {
    const secsToGo = Math.ceil(eng.phaseTimer / 60)
    panel(ctx, `STAGE ${eng.stageIndex + 1}`, eng.stage.name, eng.stage.brief, `${secsToGo}`)
  } else if (eng.phase === 'stageEnd') {
    panel(ctx, 'STAGE CLEAR', eng.stage.name, `Best run: ${eng.bestCombo} in a row`, '')
  } else if (eng.phase === 'over') {
    panel(ctx, 'RANGE CLOSED', `${eng.score} points`, `Best run: ${eng.bestCombo} in a row`, '')
  }
}

function panel(
  ctx: CanvasRenderingContext2D,
  kicker: string,
  title: string,
  sub: string,
  count: string,
): void {
  ctx.fillStyle = 'rgba(28, 26, 22, 0.62)'
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  drawText(ctx, kicker, VIEW_W / 2, 74, '#e8c05f', {
    size: 10,
    align: 'center',
    weight: 800,
    tracking: 2,
  })
  drawText(ctx, title, VIEW_W / 2, 92, '#f6f2e8', { size: 26, align: 'center', weight: 800 })
  drawText(ctx, sub, VIEW_W / 2, 126, '#cfc6b4', { size: 10, align: 'center' })
  if (count) {
    drawText(ctx, count, VIEW_W / 2, 152, '#f6f2e8', { size: 30, align: 'center', weight: 800 })
  }
}
