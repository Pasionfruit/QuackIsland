import type { Pose } from '../../../art/avatar'
import { PAL } from '../../../art/palette'
import { bush, campfire, cloud, log, pine, rock, tent } from '../../../art/props'
import {
  clamp,
  ellipse,
  facet,
  fillPoly,
  makeScene,
  sceneScale,
  path,
  noise,
  rand,
  rect,
  shade,
  softShadow,
  withAlpha,
  type Pt,
} from '../../../lib/draw'
import { drawText } from '../../../lib/text'
import { drawChar } from './characters'
import type { Fighter, SmashEngine } from './engine'
import { SmashEngine as Engine } from './engine'
import { VIEW_H, VIEW_W, type Stage } from './stage'

const SKY = ['#a9cfdc', '#bad8de', '#cbe0da', '#dee5cf', '#eee3c4', '#f7dcb2']
const HORIZON = 168

// ------------------------------------------------------------- background

let bgCache: { canvas: HTMLCanvasElement; scale: number } | null = null

function buildBackground(ss: number): HTMLCanvasElement {
  const { canvas, ctx } = makeScene(VIEW_W, VIEW_H, ss)

  // Sky: a smooth vertical wash through the palette.
  const grad = ctx.createLinearGradient(0, 0, 0, HORIZON)
  SKY.forEach((c, i) => grad.addColorStop(i / (SKY.length - 1), c))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, VIEW_W, HORIZON)

  // Low afternoon sun with a soft halo.
  const halo = ctx.createRadialGradient(372, 62, 4, 372, 62, 70)
  halo.addColorStop(0, 'rgba(255, 244, 214, 0.85)')
  halo.addColorStop(1, 'rgba(255, 244, 214, 0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(372, 62, 70, 0, Math.PI * 2)
  ctx.fill()
  ellipse(ctx, 372, 62, 19, 19, '#fdeec6')
  ellipse(ctx, 372, 62, 14, 14, PAL.sun)

  // Layered hills, palest at the back.
  const ridge = (baseY: number, height: number, step: number, color: string, seed: number) => {
    const at = (x: number) =>
      baseY - noise(x * 0.21 + seed) * height - noise(x * 0.07 + seed + 40) * height * 0.6
    const pts: Pt[] = [{ x: -10, y: baseY + 80 }]
    for (let x = -10; x < VIEW_W + 10; x += step) pts.push({ x, y: at(x) })
    pts.push({ x: VIEW_W + 10, y: at(VIEW_W + 10) })
    pts.push({ x: VIEW_W + 10, y: baseY + 80 })
    fillPoly(ctx, pts, color)
  }
  ridge(150, 34, 30, '#adc3c3', 3)
  ridge(162, 26, 24, '#93aca3', 21)
  ridge(172, 16, 18, '#77937b', 55)

  // Far treeline along the shore.
  for (let i = 0; i < 40; i++) {
    const x = 4 + i * 12.6 + noise(i) * 5
    const h = 14 + noise(i + 7) * 12
    pine(ctx, x, HORIZON + 10, h, noise(i + 3) > 0.6 ? 1 : -1)
  }

  // The lake.
  const water = ctx.createLinearGradient(0, HORIZON, 0, VIEW_H)
  water.addColorStop(0, PAL.waterLit)
  water.addColorStop(0.35, PAL.water)
  water.addColorStop(1, PAL.waterShade)
  ctx.fillStyle = water
  ctx.fillRect(0, HORIZON, VIEW_W, VIEW_H - HORIZON)
  ctx.fillStyle = 'rgba(232, 244, 244, 0.65)'
  ctx.fillRect(0, HORIZON, VIEW_W, 1.2)

  return canvas
}

function drawBackground(ctx: CanvasRenderingContext2D, frame: number): void {
  // Rebuild the cached sky whenever the canvas resolution changes, so the
  // blit is one-to-one with device pixels and stays sharp.
  const ss = sceneScale(ctx)
  if (!bgCache || Math.abs(bgCache.scale - ss) > 0.01) {
    bgCache = { canvas: buildBackground(ss), scale: ss }
  }
  ctx.drawImage(bgCache.canvas, 0, 0, VIEW_W, VIEW_H)

  for (let i = 0; i < 5; i++) {
    const speed = 0.05 + (i % 3) * 0.03
    const x = ((noise(i + 4) * (VIEW_W + 140) + frame * speed) % (VIEW_W + 140)) - 70
    const y = 18 + noise(i + 14) * 60
    cloud(ctx, x, y, 28 + noise(i + 24) * 26)
  }

  // Shimmer on the water.
  ctx.globalAlpha = 0.5
  for (let i = 0; i < 22; i++) {
    const y = HORIZON + 6 + ((i * 5 + Math.floor(frame * 0.06)) % (VIEW_H - HORIZON - 8))
    const x = (noise(i + 60) * VIEW_W + Math.sin(frame * 0.02 + i) * 10) % VIEW_W
    const w = 4 + noise(i + 90) * 8
    ellipse(ctx, x, y, w, 0.5, '#e8f4f2')
  }
  ctx.globalAlpha = 1

  // A gull doing laps, far off.
  const gx = 40 + ((frame * 0.22) % 460)
  const gy = 38 + Math.sin(frame * 0.03) * 6
  const flap = Math.sin(frame * 0.16) * 2.4
  ctx.strokeStyle = 'rgba(250, 250, 245, 0.9)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(gx - 4, gy + flap)
  ctx.lineTo(gx, gy - 1)
  ctx.lineTo(gx + 4, gy + flap)
  ctx.stroke()
}

function drawStage(ctx: CanvasRenderingContext2D, stage: Stage, frame: number): void {
  const main = stage.platforms[0]

  // The bluff: grass cap over a dirt cliff.
  const body: Pt[] = [
    { x: main.x1, y: main.top },
    { x: main.x2, y: main.top },
    { x: main.x2, y: main.top + main.depth },
    { x: main.x2 - 32, y: main.top + main.depth + 22 },
    { x: main.x1 + 44, y: main.top + main.depth + 18 },
    { x: main.x1, y: main.top + main.depth },
  ]
  const cliff = ctx.createLinearGradient(0, main.top, 0, main.top + main.depth + 22)
  cliff.addColorStop(0, shade(PAL.dirt, 0.1))
  cliff.addColorStop(0.55, PAL.dirt)
  cliff.addColorStop(1, shade(PAL.dirt, -0.34))
  path(ctx, body)
  ctx.fillStyle = cliff
  ctx.fill()

  // Grass cap with a soft, slightly wavy lip.
  const cap: Pt[] = [{ x: main.x1, y: main.top + 9 }]
  for (let x = main.x1; x <= main.x2; x += 6) {
    cap.push({ x, y: main.top + Math.sin(x * 0.09) * 0.8 })
  }
  cap.push({ x: main.x2, y: main.top + 9 })
  facet(ctx, cap, PAL.grass, { dark: 0.2, light: 0.16, split: -0.2 })

  // Rocks in the cliff face.
  for (let i = 0; i < 6; i++) {
    const rx = main.x1 + 24 + i * 45
    const ry = main.top + 16 + (i % 3) * 5
    facet(
      ctx,
      [
        { x: rx - 6, y: ry + 5 },
        { x: rx - 3, y: ry - 4 },
        { x: rx + 4, y: ry - 5 },
        { x: rx + 8, y: ry + 3 },
        { x: rx + 3, y: ry + 6 },
      ],
      PAL.rock,
      { dark: 0.22, light: 0.14 },
    )
  }

  // Grass tufts along the lip.
  ctx.strokeStyle = PAL.grassLit
  ctx.lineWidth = 0.9
  ctx.beginPath()
  for (let i = 0; i < 34; i++) {
    const gx = main.x1 + 5 + i * 8.4
    const sway = Math.sin(frame * 0.04 + i) * 0.8
    ctx.moveTo(gx, main.top + 0.5)
    ctx.lineTo(gx + sway, main.top - 2.6 - (i % 3))
  }
  ctx.stroke()

  // Camp furniture, behind the fighters.
  pine(ctx, main.x1 + 10, main.top + 1, 48)
  pine(ctx, main.x2 - 12, main.top + 1, 54)
  tent(ctx, main.x1 + 40, main.top + 1, 38)
  bush(ctx, main.x2 - 42, main.top + 1, 16)
  rock(ctx, main.x1 + 84, main.top + 1, 12)
  log(ctx, main.x2 - 92, main.top + 1, 22)
  campfire(ctx, main.x2 - 66, main.top + 1, frame)

  // Plank platforms slung between two posts.
  for (let i = 1; i < stage.platforms.length; i++) {
    const p = stage.platforms[i]
    const pw = p.x2 - p.x1
    facet(
      ctx,
      [
        { x: p.x1 - 1, y: p.top },
        { x: p.x2 + 1, y: p.top },
        { x: p.x2, y: p.top + p.depth },
        { x: p.x1, y: p.top + p.depth },
      ],
      PAL.wood,
      { dark: 0.3, light: 0.14, split: -0.4 },
    )
    ctx.strokeStyle = withAlpha(PAL.woodShade, 0.7)
    ctx.lineWidth = 0.7
    ctx.beginPath()
    for (let k = 1; k < 4; k++) {
      ctx.moveTo(p.x1 + (pw / 4) * k, p.top + 0.6)
      ctx.lineTo(p.x1 + (pw / 4) * k, p.top + p.depth)
    }
    ctx.stroke()
    rect(ctx, p.x1 - 1.5, p.top - 3, 1.5, 3.5, shade(PAL.wood, -0.25))
    rect(ctx, p.x2, p.top - 3, 1.5, 3.5, shade(PAL.wood, -0.25))
  }
}

// ------------------------------------------------------------------ fighters

function poseFor(f: Fighter): Pose {
  switch (f.state) {
    case 'walk':
      return 'walk'
    case 'air':
      return f.vy < 0 ? 'jump' : 'fall'
    case 'hitstun':
      return Math.abs(f.vx) + Math.abs(f.vy) > 6 ? 'tumble' : 'hurt'
    case 'helpless':
      return 'tumble'
    case 'landing':
      return 'brace'
    case 'attack': {
      const mv = f.move
      if (!mv) return 'idle'
      if (f.moveFrame <= mv.startup) return 'brace'
      switch (mv.art) {
        case 'rise':
        case 'burst':
          return 'swingUp'
        case 'quake':
        case 'stomp':
          return 'swingDown'
        default:
          return 'swingFwd'
      }
    }
    default:
      return 'idle'
  }
}

function drawShadow(ctx: CanvasRenderingContext2D, f: Fighter, stage: Stage): void {
  let ground: number | null = null
  const hw = f.def.hurt.w / 2
  for (const p of stage.platforms) {
    if (f.x + hw < p.x1 || f.x - hw > p.x2) continue
    if (p.top < f.y - 1) continue
    if (ground === null || p.top < ground) ground = p.top
  }
  if (ground === null) return
  const dist = clamp((ground - f.y) / 90, 0, 1)
  softShadow(ctx, f.x, ground + 1, (f.def.hurt.w / 2) * (1 - dist * 0.4), 3.2, 0.26 * (1 - dist * 0.6))
}

function drawMoveFx(ctx: CanvasRenderingContext2D, f: Fighter): void {
  const mv = f.move
  if (!mv) return
  const dir: number = mv.symmetric ? 1 : f.facing
  const hx = f.x + mv.hit.x * dir
  const hy = f.y - mv.hit.y
  const active = f.moveFrame > mv.startup && f.moveFrame <= mv.startup + mv.active
  if (!active) return
  const t = (f.moveFrame - mv.startup) / mv.active
  const warm = f.def.theme.primary
  const glow = '#fff6dd'

  switch (mv.art) {
    case 'jab': {
      const len = mv.hit.w
      ctx.globalAlpha = 0.9 - t * 0.4
      fillPoly(
        ctx,
        [
          { x: hx - (len / 2) * dir, y: hy - 1.6 },
          { x: hx + (len / 2) * dir, y: hy - 0.6 },
          { x: hx + (len / 2) * dir, y: hy + 1.4 },
          { x: hx - (len / 2) * dir, y: hy + 2 },
        ],
        glow,
      )
      ctx.globalAlpha = 1
      ellipse(ctx, hx + (len / 2) * dir, hy, 2.6, 3.4, warm)
      break
    }
    case 'swing': {
      const radius = Math.abs(mv.hit.x) * 0.92
      const a = -1.25 + 1.95 * t
      ctx.globalAlpha = 0.85
      for (let i = 0; i < 7; i++) {
        const aa = a - i * 0.15
        const rr = radius - i * 0.7
        const sxp = f.x + Math.cos(aa) * rr * dir
        const syp = f.y - mv.hit.y + Math.sin(aa) * rr
        ctx.globalAlpha = 0.85 - i * 0.11
        ellipse(ctx, sxp, syp, 3.4 - i * 0.3, 3.4 - i * 0.3, i < 2 ? glow : warm)
      }
      ctx.globalAlpha = 1
      break
    }
    case 'rise': {
      const h = mv.hit.h
      ctx.globalAlpha = 0.8 - t * 0.3
      fillPoly(
        ctx,
        [
          { x: hx - 1.4, y: hy - h / 2 },
          { x: hx + 1.4, y: hy - h / 2 },
          { x: hx + 3.4, y: hy + h / 2 },
          { x: hx - 3.4, y: hy + h / 2 },
        ],
        glow,
      )
      ctx.globalAlpha = 1
      for (let i = 0; i < 4; i++) {
        ellipse(ctx, hx - 6 + i * 4.5, hy - h / 2 - 1.5 - i, 1.4, 1.4, warm)
      }
      break
    }
    case 'stomp': {
      ctx.globalAlpha = 0.85
      fillPoly(
        ctx,
        [
          { x: f.x - mv.hit.w / 2, y: hy - 4 },
          { x: f.x + mv.hit.w / 2, y: hy - 4 },
          { x: f.x, y: hy + 8 },
        ],
        glow,
      )
      ctx.globalAlpha = 1
      break
    }
    case 'quake': {
      const spread = (mv.hit.w / 2) * (0.4 + t * 0.6)
      ctx.globalAlpha = 0.8 - t * 0.4
      for (const s of [-1, 1]) {
        ellipse(ctx, f.x + s * spread, f.y - 3, 5, 4.5, PAL.cream)
        ellipse(ctx, f.x + s * spread, f.y - 6, 3, 3, glow)
      }
      ellipse(ctx, f.x, f.y - 1, spread, 1.6, PAL.cream)
      ctx.globalAlpha = 1
      break
    }
    case 'burst': {
      ctx.globalAlpha = 0.85 - t * 0.4
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + f.moveFrame * 0.12
        const rr = 4 + t * 12
        ellipse(ctx, f.x + Math.cos(a) * rr, hy + Math.sin(a) * rr, 2.4, 2.4, i % 2 ? glow : PAL.cream)
      }
      ctx.globalAlpha = 1
      break
    }
    case 'spin': {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + f.moveFrame * 0.5
        const rr = mv.hit.w / 2
        ellipse(ctx, f.x + Math.cos(a) * rr, hy + Math.sin(a) * rr * 0.7, 2.6, 2.6, glow)
      }
      break
    }
  }
}

function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, frame: number): void {
  if (f.state === 'dead') return
  const blinking = f.invuln > 0 && Math.floor(frame / 4) % 2 === 0

  const jitter = f.hitlag > 0 ? rand(-1.4, 1.4) : 0
  const bob = f.grounded && f.state === 'idle' ? Math.sin(f.animTimer * 0.07) * 0.5 : 0

  drawChar(ctx, f.def, f.x + jitter, f.y + bob, {
    facing: f.facing,
    pose: poseFor(f),
    phase: f.animTimer,
    squash: f.squash,
    spin: f.state === 'helpless' || f.state === 'hitstun' ? f.spin : 0,
    tint: f.hitlag > 0 ? '#fff3d6' : null,
    alpha: blinking ? 0.35 : 1,
  })

  if (f.state === 'attack') drawMoveFx(ctx, f)

  // A little pennant above the head so you never lose your fighter.
  const color = Engine.playerColor(f.index)
  const top = f.y - f.def.hurt.h - 8
  const bobY = Math.sin(frame * 0.08) * 0.6
  fillPoly(
    ctx,
    [
      { x: f.x - 4.5, y: top + bobY },
      { x: f.x + 4.5, y: top + bobY },
      { x: f.x, y: top + 5.5 + bobY },
    ],
    color,
  )
}

function drawParticles(ctx: CanvasRenderingContext2D, eng: SmashEngine): void {
  for (const p of eng.particles) {
    const a = clamp(p.life / p.maxLife, 0, 1)
    ctx.globalAlpha = a > 0.6 ? 1 : a + 0.3
    const r = p.size * 0.9
    ellipse(ctx, p.x, p.y, r, r, p.color)
  }
  ctx.globalAlpha = 1
}

function drawTexts(ctx: CanvasRenderingContext2D, eng: SmashEngine): void {
  for (const t of eng.texts) {
    ctx.globalAlpha = clamp(t.life / 20, 0, 1)
    drawText(ctx, t.text, t.x, t.y, t.color, {
      size: 9 * t.scale,
      weight: 700,
      align: 'center',
      shadow: 'rgba(60, 52, 40, 0.5)',
    })
  }
  ctx.globalAlpha = 1
}

function drawOffscreenMarkers(ctx: CanvasRenderingContext2D, eng: SmashEngine): void {
  for (const f of eng.fighters) {
    if (f.state === 'dead') continue
    if (f.x > 10 && f.x < VIEW_W - 10 && f.y > 14 && f.y < VIEW_H - 10) continue
    const cx = clamp(f.x, 14, VIEW_W - 14)
    const cy = clamp(f.y, 18, VIEW_H - 46)
    const color = Engine.playerColor(f.index)
    const ang = Math.atan2(f.y - cy, f.x - cx)
    const c = Math.cos(ang)
    const s = Math.sin(ang)
    fillPoly(
      ctx,
      [
        { x: cx + c * 8, y: cy + s * 8 },
        { x: cx - c * 5 - s * 5, y: cy - s * 5 + c * 5 },
        { x: cx - c * 5 + s * 5, y: cy - s * 5 - c * 5 },
      ],
      color,
    )
    drawText(ctx, `${Math.round(f.percent)}`, cx, cy + 9, color, {
      size: 8,
      weight: 700,
      align: 'center',
      shadow: 'rgba(255,255,255,0.7)',
    })
  }
}

function percentColor(p: number): string {
  if (p < 45) return '#4a463f'
  if (p < 85) return '#c78a2c'
  if (p < 125) return '#d2622e'
  return '#c33c34'
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  ctx.fill()
}

function drawHud(ctx: CanvasRenderingContext2D, eng: SmashEngine): void {
  for (let i = 0; i < 2; i++) {
    const f = eng.fighters[i]
    const bx = i === 0 ? 40 : 252
    const by = 232
    const w = 188
    const h = 32
    const color = Engine.playerColor(i)
    const dead = f.state === 'dead'

    ctx.globalAlpha = dead ? 0.7 : 0.93
    roundRect(ctx, bx, by, w, h, 5, '#f7f1e2')
    ctx.globalAlpha = 1
    roundRect(ctx, bx, by, w, 3.4, 2, color)

    drawText(ctx, f.def.name, bx + 8, by + 7, '#4a463f', { size: 9, weight: 700 })

    // Stock pips: one little tent per life left.
    for (let s = 0; s < f.stocks; s++) {
      const sx = bx + 9 + s * 10
      const sy = by + 25
      fillPoly(
        ctx,
        [
          { x: sx + 3.4, y: sy - 7 },
          { x: sx + 7, y: sy },
          { x: sx, y: sy },
        ],
        f.def.theme.primary,
      )
    }

    const pct = Math.round(f.percent)
    const col = dead ? '#a89e8a' : percentColor(pct)
    drawText(ctx, `${pct}`, bx + w - 20, by + 3, col, {
      size: 23,
      weight: 700,
      align: 'right',
    })
    drawText(ctx, '%', bx + w - 17, by + 12, col, { size: 12, weight: 700 })
  }
}

function drawBanner(ctx: CanvasRenderingContext2D, eng: SmashEngine): void {
  const ink = '#3f382f'
  const paper = '#fffaf0'
  const shadowCol = 'rgba(63, 56, 47, 0.45)'

  if (eng.phase === 'intro') {
    const t = eng.phaseTimer
    const label = t > 140 ? '3' : t > 95 ? '2' : t > 50 ? '1' : 'GO!'
    const beat = ((t % 45) / 45) * 0.18
    drawText(ctx, label, VIEW_W / 2, 54, paper, {
      size: 46 * (1 + beat),
      weight: 700,
      align: 'center',
      baseline: 'middle',
      shadow: shadowCol,
    })
    if (t > 50) {
      drawText(
        ctx,
        `${eng.fighters[0].def.name}  vs  ${eng.fighters[1].def.name}`,
        VIEW_W / 2,
        100,
        ink,
        { size: 12, weight: 700, align: 'center', shadow: 'rgba(255,255,255,0.6)' },
      )
    }
    return
  }

  if (eng.phase === 'over' && eng.winner !== null) {
    const win = eng.fighters[eng.winner]
    drawText(ctx, 'GAME!', VIEW_W / 2, 54, paper, {
      size: 44,
      weight: 700,
      align: 'center',
      baseline: 'middle',
      shadow: shadowCol,
    })
    drawText(ctx, `${win.def.name} wins`, VIEW_W / 2, 92, Engine.playerColor(eng.winner), {
      size: 16,
      weight: 700,
      align: 'center',
      shadow: 'rgba(255,255,255,0.55)',
    })
    return
  }

  if (eng.bannerTimer > 0 && eng.banner) {
    ctx.globalAlpha = clamp(eng.bannerTimer / 20, 0, 1)
    drawText(ctx, eng.banner, VIEW_W / 2, 58, paper, {
      size: 40,
      weight: 700,
      align: 'center',
      baseline: 'middle',
      shadow: shadowCol,
    })
    ctx.globalAlpha = 1
  }
}

export function renderMatch(
  ctx: CanvasRenderingContext2D,
  eng: SmashEngine,
  opts: { debug?: boolean } = {},
): void {
  // Screen shake, snapped to whole device pixels so the cached background
  // never lands on a half pixel.
  const sh = eng.shake
  const px = sceneScale(ctx)
  const snap = (v: number) => Math.round(v * px) / px
  const ox = sh > 0 ? snap(rand(-sh, sh)) : 0
  const oy = sh > 0 ? snap(rand(-sh, sh) * 0.6) : 0

  ctx.save()
  ctx.translate(ox, oy)
  drawBackground(ctx, eng.frame)
  drawStage(ctx, eng.stage, eng.frame)
  for (const f of eng.fighters) drawShadow(ctx, f, eng.stage)
  for (const f of eng.fighters) drawFighter(ctx, f, eng.frame)
  drawParticles(ctx, eng)
  drawTexts(ctx, eng)

  if (opts.debug) {
    for (const f of eng.fighters) {
      ctx.globalAlpha = 0.35
      rect(ctx, f.x - f.def.hurt.w / 2, f.y - f.def.hurt.h, f.def.hurt.w, f.def.hurt.h, '#3fbf6f')
      const mv = f.move
      if (mv && f.moveFrame > mv.startup && f.moveFrame <= mv.startup + mv.active) {
        const dir: number = mv.symmetric ? 1 : f.facing
        rect(
          ctx,
          f.x + mv.hit.x * dir - mv.hit.w / 2,
          f.y - mv.hit.y - mv.hit.h / 2,
          mv.hit.w,
          mv.hit.h,
          '#d94f4f',
        )
      }
      ctx.globalAlpha = 1
    }
  }
  ctx.restore()

  drawOffscreenMarkers(ctx, eng)
  drawHud(ctx, eng)
  drawBanner(ctx, eng)

  if (eng.flash > 0) {
    ctx.globalAlpha = clamp(eng.flash / 26, 0, 0.38)
    rect(ctx, 0, 0, VIEW_W, VIEW_H, '#fff8e8')
    ctx.globalAlpha = 1
  }
}
