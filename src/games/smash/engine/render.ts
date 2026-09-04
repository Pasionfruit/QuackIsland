import { drawAvatar, type Pose } from '../../../art/avatar'
import { PAL } from '../../../art/palette'
import { bush, campfire, cat, pine, seagull, tent } from '../../../art/props'
import { drawText } from '../../../lib/font'
import { clamp, fillPoly, makePixelCanvas, px, rand, type Pt } from '../../../lib/pixel'
import type { Fighter, SmashEngine } from './engine'
import { SmashEngine as Engine } from './engine'
import { VIEW_H, VIEW_W, type Stage } from './stage'

const SKY = ['#a9cfdc', '#bcdae0', '#cfe3dd', '#e3e5d2', '#f0e2c4', '#f6dcb4']

function noise(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function ditherRow(ctx: CanvasRenderingContext2D, y: number, color: string, density: 1 | 2 | 3): void {
  ctx.fillStyle = color
  for (let x = 0; x < VIEW_W; x++) {
    const m = (x + y * 2) % 4
    const on = density === 1 ? m === 0 : density === 2 ? m % 2 === 0 : m !== 3
    if (on) ctx.fillRect(x, y, 1, 1)
  }
}

let bgCache: HTMLCanvasElement | null = null

function buildBackground(): HTMLCanvasElement {
  const { canvas, ctx } = makePixelCanvas(VIEW_W, VIEW_H)

  // Soft banded sky, dithered so it stays honest pixel art.
  const horizon = 168
  const bandH = horizon / SKY.length
  for (let i = 0; i < SKY.length; i++) {
    px(ctx, 0, Math.round(i * bandH), VIEW_W, Math.ceil(bandH) + 1, SKY[i])
  }
  for (let i = 0; i < SKY.length - 1; i++) {
    const seam = Math.round((i + 1) * bandH)
    ditherRow(ctx, seam - 2, SKY[i + 1], 1)
    ditherRow(ctx, seam - 1, SKY[i + 1], 2)
    ditherRow(ctx, seam, SKY[i], 2)
    ditherRow(ctx, seam + 1, SKY[i], 1)
  }

  // Low afternoon sun.
  const sunPts: Pt[] = []
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    sunPts.push({ x: 372 + Math.cos(a) * 19, y: 62 + Math.sin(a) * 19 })
  }
  fillPoly(ctx, sunPts, '#fdeec6')
  fillPoly(
    ctx,
    sunPts.map((p) => ({ x: 372 + (p.x - 372) * 0.72, y: 62 + (p.y - 62) * 0.72 })),
    PAL.sun,
  )

  // Layered hills, palest at the back.
  const ridge = (baseY: number, height: number, step: number, color: string, seed: number) => {
    const pts: Pt[] = [{ x: -10, y: baseY + 60 }]
    for (let x = -10; x <= VIEW_W + 10; x += step) {
      const n = noise(x * 0.21 + seed)
      const n2 = noise(x * 0.07 + seed + 40)
      pts.push({ x, y: baseY - n * height - n2 * height * 0.6 })
    }
    pts.push({ x: VIEW_W + 10, y: baseY + 60 })
    fillPoly(ctx, pts, color)
  }
  ridge(150, 34, 34, '#a8bfc0', 3)
  ridge(162, 26, 26, '#8fa9a1', 21)
  ridge(172, 16, 20, '#728e78', 55)

  // Far treeline along the shore.
  for (let i = 0; i < 34; i++) {
    const x = 6 + i * 15 + noise(i) * 6
    const h = 16 + noise(i + 7) * 12
    pine(ctx, x, 178, h, noise(i + 3) > 0.6 ? 1 : -1)
  }

  // The lake below the shore.
  px(ctx, 0, 178, VIEW_W, VIEW_H - 178, PAL.water)
  for (let y = 180; y < VIEW_H; y += 3) {
    const shade = (y - 178) / (VIEW_H - 178)
    ditherRow(ctx, y, shade > 0.5 ? PAL.waterShade : PAL.waterLit, 1)
  }
  px(ctx, 0, 178, VIEW_W, 1, '#c6dbdc')

  return canvas
}

function drawBackground(ctx: CanvasRenderingContext2D, frame: number): void {
  if (!bgCache) bgCache = buildBackground()
  ctx.drawImage(bgCache, 0, 0)

  // Drifting chunky clouds.
  for (let i = 0; i < 5; i++) {
    const speed = 0.05 + (i % 3) * 0.03
    const x = ((noise(i + 4) * (VIEW_W + 120) + frame * speed) % (VIEW_W + 120)) - 60
    const y = 18 + noise(i + 14) * 62
    const w = 26 + noise(i + 24) * 26
    const h = w * 0.34
    fillPoly(
      ctx,
      [
        { x: x - w / 2, y: y + h / 2 },
        { x: x - w * 0.34, y: y - h * 0.3 },
        { x: x - w * 0.05, y: y - h / 2 },
        { x: x + w * 0.3, y: y - h * 0.22 },
        { x: x + w / 2, y: y + h / 2 },
      ],
      PAL.cloud,
    )
    px(ctx, x - w / 2, y + h / 2 - 1, w, 1, PAL.cloudShade)
  }

  // Shimmer on the water.
  for (let i = 0; i < 16; i++) {
    const y = 186 + ((i * 7 + Math.floor(frame * 0.08)) % 76)
    const x = (noise(i + 60) * VIEW_W + Math.sin(frame * 0.02 + i) * 8) % VIEW_W
    px(ctx, x, y, 3 + (i % 3), 1, '#cfe4e2')
  }

  // A gull doing laps.
  seagull(ctx, 60 + ((frame * 0.24) % 420), 40 + Math.sin(frame * 0.03) * 6, frame)
}

function drawStage(ctx: CanvasRenderingContext2D, stage: Stage, frame: number): void {
  const main = stage.platforms[0]
  const w = main.x2 - main.x1

  // Bluff: grass cap, dirt body, rocky underside.
  px(ctx, main.x1, main.top, w, 3, PAL.grassLit)
  px(ctx, main.x1, main.top + 3, w, 3, PAL.grass)
  px(ctx, main.x1, main.top + 6, w, 4, PAL.grassShade)
  px(ctx, main.x1, main.top + 10, w, main.depth - 10, PAL.dirt)
  fillPoly(
    ctx,
    [
      { x: main.x1, y: main.top + main.depth },
      { x: main.x2, y: main.top + main.depth },
      { x: main.x2 - 34, y: main.top + main.depth + 22 },
      { x: main.x1 + 46, y: main.top + main.depth + 18 },
    ],
    PAL.dirtShade,
  )
  // Rocks poking out of the cliff face.
  for (let i = 0; i < 6; i++) {
    const rx = main.x1 + 22 + i * 46
    const ry = main.top + 14 + (i % 3) * 5
    fillPoly(
      ctx,
      [
        { x: rx - 6, y: ry + 5 },
        { x: rx - 3, y: ry - 3 },
        { x: rx + 4, y: ry - 4 },
        { x: rx + 7, y: ry + 4 },
      ],
      i % 2 ? PAL.rock : PAL.rockShade,
    )
  }
  // Grass tufts along the lip.
  for (let i = 0; i < 22; i++) {
    const gx = main.x1 + 6 + i * 13
    const tuft = Math.sin(frame * 0.04 + i) > 0.3 ? 1 : 0
    px(ctx, gx, main.top - 2 - tuft, 1, 2 + tuft, PAL.grassLit)
  }

  // Camp furniture, drawn behind the fighters.
  tent(ctx, main.x1 + 34, main.top, 40)
  pine(ctx, main.x1 + 8, main.top, 46)
  pine(ctx, main.x2 - 10, main.top, 52)
  bush(ctx, main.x2 - 40, main.top, 16)
  campfire(ctx, main.x2 - 66, main.top, frame)
  cat(ctx, main.x1 + 62, main.top, 11, -1, frame)

  // Plank platforms slung between poles.
  for (let i = 1; i < stage.platforms.length; i++) {
    const p = stage.platforms[i]
    const pw = p.x2 - p.x1
    px(ctx, p.x1, p.top, pw, 2, PAL.wood)
    px(ctx, p.x1, p.top + 2, pw, p.depth - 2, PAL.woodShade)
    for (let k = 0; k < 4; k++) {
      px(ctx, p.x1 + 8 + k * (pw / 4), p.top, 1, p.depth, PAL.dirtShade)
    }
    px(ctx, p.x1 - 1, p.top - 3, 1, 4, PAL.woodShade)
    px(ctx, p.x2, p.top - 3, 1, 4, PAL.woodShade)
  }
}

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
  const w = Math.round((f.def.hurt.w - 2) * (1 - dist * 0.45))
  ctx.globalAlpha = 0.26 * (1 - dist * 0.6)
  fillPoly(
    ctx,
    [
      { x: f.x - w / 2, y: ground },
      { x: f.x + w / 2, y: ground },
      { x: f.x + w / 2.8, y: ground + 3 },
      { x: f.x - w / 2.8, y: ground + 3 },
    ],
    '#5c5348',
  )
  ctx.globalAlpha = 1
}

function drawMoveFx(ctx: CanvasRenderingContext2D, f: Fighter): void {
  const mv = f.move
  if (!mv) return
  const dir: number = mv.symmetric ? 1 : f.facing
  const hx = f.x + mv.hit.x * dir
  const hy = f.y - mv.hit.y
  const active = f.moveFrame > mv.startup && f.moveFrame <= mv.startup + mv.active
  const t = active ? (f.moveFrame - mv.startup) / mv.active : 0
  const warm = f.def.theme.primary

  if (!active) return

  const glow = '#fff6dd'
  switch (mv.art) {
    case 'jab': {
      const len = mv.hit.w
      px(ctx, hx - (len / 2) * dir, hy - 1, len * dir, 3, glow)
      px(ctx, hx + (len / 2) * dir - 2 * dir, hy - 3, 3, 6, warm)
      break
    }
    case 'swing': {
      // Trailing arc, brightest at the front of the swing.
      const radius = Math.abs(mv.hit.x) * 0.9
      const from = -1.25
      const to = 0.7
      const a = from + (to - from) * t
      for (let i = 0; i < 6; i++) {
        const aa = a - i * 0.17
        const rr = radius - i * 0.8
        const sxp = f.x + Math.cos(aa) * rr * dir
        const syp = f.y - mv.hit.y + Math.sin(aa) * rr
        const s = i < 2 ? 3 : 2
        px(ctx, sxp - s / 2, syp - s / 2, s, s, i < 2 ? glow : warm)
      }
      break
    }
    case 'rise': {
      const h = mv.hit.h
      px(ctx, hx - 2, hy - h / 2, 4, h, glow)
      for (let i = 0; i < 4; i++) {
        px(ctx, hx - 7 + i * 5, hy - h / 2 - 2 - i, 2, 2, warm)
      }
      break
    }
    case 'stomp': {
      fillPoly(
        ctx,
        [
          { x: f.x - mv.hit.w / 2, y: hy - 4 },
          { x: f.x + mv.hit.w / 2, y: hy - 4 },
          { x: f.x, y: hy + 7 },
        ],
        glow,
      )
      break
    }
    case 'quake': {
      // Dust kicked up on both sides.
      const spread = (mv.hit.w / 2) * (0.4 + t * 0.6)
      for (const s of [-1, 1]) {
        px(ctx, f.x + s * spread - 4, f.y - 5, 8, 5, PAL.cream)
        px(ctx, f.x + s * spread - 2, f.y - 8, 4, 4, glow)
      }
      px(ctx, f.x - spread, f.y - 2, spread * 2, 2, PAL.cream)
      break
    }
    case 'burst': {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + f.moveFrame * 0.14
        const rr = 5 + t * 11
        px(ctx, f.x + Math.cos(a) * rr - 1, hy + Math.sin(a) * rr - 1, 3, 3, i % 2 ? glow : PAL.cream)
      }
      break
    }
    case 'spin': {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + f.moveFrame * 0.5
        const rr = mv.hit.w / 2
        px(ctx, f.x + Math.cos(a) * rr - 2, hy + Math.sin(a) * rr * 0.7 - 2, 4, 4, glow)
      }
      break
    }
  }
}

function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, frame: number): void {
  if (f.state === 'dead') return
  if (f.invuln > 0 && Math.floor(frame / 3) % 2 === 0) return

  const jitter = f.hitlag > 0 ? Math.round(rand(-1.5, 1.5)) : 0
  const bob = f.grounded && f.state === 'idle' ? Math.sin(f.animTimer * 0.07) * 0.5 : 0

  drawAvatar(ctx, f.def.avatar, f.x + jitter, f.y + bob, {
    facing: f.facing,
    height: f.def.height,
    pose: poseFor(f),
    phase: f.animTimer,
    squash: f.squash,
    spin: f.state === 'helpless' || f.state === 'hitstun' ? f.spin : 0,
    tint: f.hitlag > 0 ? '#fff3d6' : null,
  })

  if (f.state === 'attack') drawMoveFx(ctx, f)

  // Little pennant above the head so you never lose your camper.
  const color = Engine.playerColor(f.index)
  const top = f.y - f.def.hurt.h - 8
  fillPoly(
    ctx,
    [
      { x: f.x - 4, y: top },
      { x: f.x + 4, y: top },
      { x: f.x, y: top + 5 },
    ],
    color,
  )
}

function drawParticles(ctx: CanvasRenderingContext2D, eng: SmashEngine): void {
  for (const p of eng.particles) {
    const a = clamp(p.life / p.maxLife, 0, 1)
    ctx.globalAlpha = a > 0.6 ? 1 : a + 0.3
    px(ctx, p.x, p.y, p.size, p.size, p.color)
  }
  ctx.globalAlpha = 1
}

function drawTexts(ctx: CanvasRenderingContext2D, eng: SmashEngine): void {
  for (const t of eng.texts) {
    ctx.globalAlpha = clamp(t.life / 20, 0, 1)
    drawText(ctx, t.text, t.x, t.y, t.color, { scale: t.scale, align: 'center', shadow: '#fdf6e6' })
  }
  ctx.globalAlpha = 1
}

function drawOffscreenMarkers(ctx: CanvasRenderingContext2D, eng: SmashEngine): void {
  for (const f of eng.fighters) {
    if (f.state === 'dead') continue
    if (f.x > 10 && f.x < VIEW_W - 10 && f.y > 14 && f.y < VIEW_H - 10) continue
    const cx = clamp(f.x, 14, VIEW_W - 14)
    const cy = clamp(f.y, 18, VIEW_H - 44)
    const color = Engine.playerColor(f.index)
    const ang = Math.atan2(f.y - cy, f.x - cx)
    const c = Math.cos(ang)
    const s = Math.sin(ang)
    fillPoly(
      ctx,
      [
        { x: cx + c * 7, y: cy + s * 7 },
        { x: cx - c * 5 - s * 5, y: cy - s * 5 + c * 5 },
        { x: cx - c * 5 + s * 5, y: cy - s * 5 - c * 5 },
      ],
      color,
    )
    drawText(ctx, `${Math.round(f.percent)}`, cx, cy + 9, color, {
      align: 'center',
      shadow: '#fdf6e6',
    })
  }
}

function percentColor(p: number): string {
  if (p < 45) return '#4a463f'
  if (p < 85) return '#c78a2c'
  if (p < 125) return '#d2622e'
  return '#c33c34'
}

function drawHud(ctx: CanvasRenderingContext2D, eng: SmashEngine): void {
  for (let i = 0; i < 2; i++) {
    const f = eng.fighters[i]
    const bx = i === 0 ? 38 : 250
    const by = 232
    const w = 192
    const h = 32
    const color = Engine.playerColor(i)

    ctx.globalAlpha = 0.94
    px(ctx, bx, by, w, h, '#f6efdd')
    ctx.globalAlpha = 1
    px(ctx, bx, by, w, 2, color)
    px(ctx, bx, by + h - 1, w, 1, '#c9bb9c')
    px(ctx, bx, by, 1, h, '#c9bb9c')
    px(ctx, bx + w - 1, by, 1, h, '#c9bb9c')

    drawText(ctx, f.def.name, bx + 7, by + 7, '#4a463f', { shadow: '#e6dcc2' })

    // Stock pips: one little tent per life left.
    for (let s = 0; s < f.stocks; s++) {
      const sx = bx + 8 + s * 11
      const sy = by + 24
      fillPoly(
        ctx,
        [
          { x: sx + 3.5, y: sy - 7 },
          { x: sx + 7, y: sy },
          { x: sx, y: sy },
        ],
        f.def.theme.primary,
      )
    }

    const pct = Math.round(f.percent)
    const col = f.state === 'dead' ? '#a89e8a' : percentColor(pct)
    drawText(ctx, `${pct}`, bx + w - 17, by + 7, col, {
      scale: 3,
      align: 'right',
      shadow: '#e6dcc2',
    })
    drawText(ctx, '%', bx + w - 14, by + 13, col, { scale: 2, shadow: '#e6dcc2' })
  }
}

function drawBanner(ctx: CanvasRenderingContext2D, eng: SmashEngine): void {
  const ink = '#463f36'
  const paper = '#fdf6e6'

  if (eng.phase === 'intro') {
    const t = eng.phaseTimer
    const label = t > 140 ? '3' : t > 95 ? '2' : t > 50 ? '1' : 'GO!'
    drawText(ctx, label, VIEW_W / 2, 70, paper, { scale: 6, align: 'center', shadow: ink })
    if (t > 50) {
      drawText(
        ctx,
        `${eng.fighters[0].def.name} VS ${eng.fighters[1].def.name}`,
        VIEW_W / 2,
        44,
        paper,
        { align: 'center', shadow: ink },
      )
    }
    return
  }

  if (eng.phase === 'over' && eng.winner !== null) {
    const win = eng.fighters[eng.winner]
    drawText(ctx, 'GAME!', VIEW_W / 2, 56, paper, { scale: 6, align: 'center', shadow: ink })
    drawText(ctx, `${win.def.name} WINS`, VIEW_W / 2, 100, paper, {
      scale: 2,
      align: 'center',
      shadow: ink,
    })
    return
  }

  if (eng.bannerTimer > 0 && eng.banner) {
    ctx.globalAlpha = clamp(eng.bannerTimer / 20, 0, 1)
    drawText(ctx, eng.banner, VIEW_W / 2, 64, paper, { scale: 5, align: 'center', shadow: ink })
    ctx.globalAlpha = 1
  }
}

export function renderMatch(
  ctx: CanvasRenderingContext2D,
  eng: SmashEngine,
  opts: { debug?: boolean } = {},
): void {
  ctx.imageSmoothingEnabled = false
  const sh = eng.shake
  const ox = sh > 0 ? Math.round(rand(-sh, sh)) : 0
  const oy = sh > 0 ? Math.round(rand(-sh, sh) * 0.6) : 0

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
      px(ctx, f.x - f.def.hurt.w / 2, f.y - f.def.hurt.h, f.def.hurt.w, f.def.hurt.h, '#3fbf6f')
      const mv = f.move
      if (mv && f.moveFrame > mv.startup && f.moveFrame <= mv.startup + mv.active) {
        const dir: number = mv.symmetric ? 1 : f.facing
        px(
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
    ctx.globalAlpha = clamp(eng.flash / 26, 0, 0.4)
    px(ctx, 0, 0, VIEW_W, VIEW_H, '#fff8e8')
    ctx.globalAlpha = 1
  }
}
