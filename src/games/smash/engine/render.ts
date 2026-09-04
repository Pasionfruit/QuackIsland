import { drawText } from '../../../lib/font'
import {
  clamp,
  fillPoly,
  makePixelCanvas,
  px,
  rand,
  regularPoly,
  shapePoly,
  transformPts,
  type Pt,
} from '../../../lib/pixel'
import type { Fighter, SmashEngine } from './engine'
import { SmashEngine as Engine } from './engine'
import { VIEW_H, VIEW_W, type Stage } from './stage'
import type { CharDef } from './types'

const SKY = ['#0c0a22', '#181040', '#2f1552', '#54205f', '#87285d', '#c04a63', '#f0855a']
const FAR_HILL = '#41194f'
const NEAR_HILL = '#26102f'
const STAGE_TOP = '#d7e6f5'
const STAGE_LIP = '#8fa6c7'
const STAGE_BODY = '#414f74'
const STAGE_DARK = '#242c46'
const CRYSTAL = '#9b7bff'

export function skyColorAt(y: number): string {
  const i = clamp(Math.floor((y / VIEW_H) * SKY.length), 0, SKY.length - 1)
  return SKY[i]
}

/** Deterministic noise so the star field does not shimmer between reloads. */
function noise(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function ditherRow(
  ctx: CanvasRenderingContext2D,
  y: number,
  color: string,
  density: 1 | 2 | 3,
): void {
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

  // Banded sky with dithered seams.
  const bandH = VIEW_H / SKY.length
  for (let i = 0; i < SKY.length; i++) {
    const y0 = Math.round(i * bandH)
    const y1 = Math.round((i + 1) * bandH)
    px(ctx, 0, y0, VIEW_W, y1 - y0, SKY[i])
  }
  for (let i = 0; i < SKY.length - 1; i++) {
    const seam = Math.round((i + 1) * bandH)
    ditherRow(ctx, seam - 3, SKY[i + 1], 1)
    ditherRow(ctx, seam - 2, SKY[i + 1], 2)
    ditherRow(ctx, seam - 1, SKY[i + 1], 3)
    ditherRow(ctx, seam, SKY[i], 3)
    ditherRow(ctx, seam + 1, SKY[i], 2)
    ditherRow(ctx, seam + 2, SKY[i], 1)
  }

  // Stars, thinning out toward the horizon.
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(noise(i) * VIEW_W)
    const y = Math.floor(noise(i + 900) ** 2 * 150)
    const bright = noise(i + 400)
    px(ctx, x, y, 1, 1, bright > 0.85 ? '#ffffff' : bright > 0.5 ? '#cfc4ff' : '#8f86c9')
  }

  // Retro sun with slit cuts.
  const sunY = 152
  const sun = transformPts(regularPoly(18, Math.PI / 18), { x: 240, y: sunY, sx: 40, sy: 40 })
  fillPoly(ctx, sun, '#ffb469')
  const inner = transformPts(regularPoly(18, Math.PI / 18), { x: 240, y: sunY, sx: 33, sy: 33 })
  fillPoly(ctx, inner, '#ffd98a')
  for (let y = sunY - 4; y < sunY + 42; y += 5) {
    const gap = Math.max(1, Math.floor((y - sunY + 6) / 9))
    px(ctx, 190, y, 100, gap, skyColorAt(y))
  }

  // Two ridges of polygon mountains.
  const ridge = (baseY: number, height: number, step: number, color: string, seed: number) => {
    const pts: Pt[] = [{ x: -10, y: VIEW_H + 10 }]
    for (let x = -10; x <= VIEW_W + 10; x += step) {
      const n = noise(x * 0.37 + seed)
      const n2 = noise(x * 0.11 + seed + 50)
      pts.push({ x, y: baseY - n * height - n2 * height * 0.5 })
    }
    pts.push({ x: VIEW_W + 10, y: VIEW_H + 10 })
    fillPoly(ctx, pts, color)
  }
  ridge(196, 44, 26, FAR_HILL, 3)
  ridge(214, 30, 18, NEAR_HILL, 77)

  // A faint haze line where the ridges meet the sky.
  ditherRow(ctx, 186, '#6b2a63', 1)
  ditherRow(ctx, 187, '#6b2a63', 2)

  return canvas
}

function drawBackground(ctx: CanvasRenderingContext2D, frame: number): void {
  if (!bgCache) bgCache = buildBackground()
  ctx.drawImage(bgCache, 0, 0)

  // Drifting crystal shards for a little parallax life.
  for (let i = 0; i < 7; i++) {
    const speed = 0.08 + (i % 3) * 0.05
    const x = ((noise(i + 11) * VIEW_W + frame * speed) % (VIEW_W + 40)) - 20
    const y = 40 + noise(i + 21) * 120 + Math.sin(frame * 0.012 + i) * 4
    const r = 3 + noise(i + 31) * 4
    const pts = transformPts(regularPoly(3, frame * 0.006 + i), { x, y, sx: r, sy: r * 1.4 })
    shapePoly(ctx, pts, '#6a3a86', '#3d1e52', 1)
  }
}

function drawStage(ctx: CanvasRenderingContext2D, stage: Stage, frame: number): void {
  for (const p of stage.platforms) {
    const w = p.x2 - p.x1
    if (p.solid) {
      // Floating island: flat deck, then a tapered prism underside.
      px(ctx, p.x1, p.top, w, 3, STAGE_TOP)
      px(ctx, p.x1, p.top + 3, w, 3, STAGE_LIP)
      px(ctx, p.x1, p.top + 6, w, p.depth - 6, STAGE_BODY)
      const under: Pt[] = [
        { x: p.x1, y: p.top + p.depth },
        { x: p.x2, y: p.top + p.depth },
        { x: p.x2 - 46, y: p.top + p.depth + 26 },
        { x: p.x1 + 46, y: p.top + p.depth + 26 },
      ]
      fillPoly(ctx, under, STAGE_DARK)
      // Crystal facets embedded in the rock face.
      for (let i = 0; i < 5; i++) {
        const cx = p.x1 + 30 + i * 56
        const cy = p.top + 14 + (i % 2) * 6
        const glow = 0.6 + 0.4 * Math.sin(frame * 0.05 + i)
        const pts = transformPts(regularPoly(3, -Math.PI / 2), { x: cx, y: cy, sx: 5, sy: 7 })
        shapePoly(ctx, pts, glow > 0.85 ? '#c4b0ff' : CRYSTAL, '#3a2a63', 1)
      }
      px(ctx, p.x1, p.top + p.depth - 1, w, 1, STAGE_DARK)
    } else {
      px(ctx, p.x1, p.top, w, 2, STAGE_TOP)
      px(ctx, p.x1, p.top + 2, w, 2, CRYSTAL)
      px(ctx, p.x1, p.top + 4, w, p.depth - 4, STAGE_DARK)
      px(ctx, p.x1 - 1, p.top + 1, 1, 3, STAGE_LIP)
      px(ctx, p.x2, p.top + 1, 1, 3, STAGE_LIP)
    }
  }
}

export interface BodyOpts {
  facing?: 1 | -1
  scale?: number
  /** >0 squashes (landing), <0 stretches (jumping). */
  squash?: number
  spin?: number
  eyes?: 'open' | 'hurt' | 'focus'
  tint?: string | null
  outlineOverride?: string | null
}

/**
 * Draws a polygon fighter standing on (x, y). Shared by the match renderer and
 * the character select portraits.
 */
export function drawBody(
  ctx: CanvasRenderingContext2D,
  def: CharDef,
  x: number,
  y: number,
  o: BodyOpts = {},
): void {
  const facing = o.facing ?? 1
  const scale = o.scale ?? 1
  const squash = o.squash ?? 0
  const spin = o.spin ?? 0
  const r = def.radius * scale
  const sx = r * (1 + squash * 0.2)
  const sy = r * (1 - squash * 0.24)

  const base = regularPoly(def.sides, def.rotation)
  let maxY = -Infinity
  for (const p of base) maxY = Math.max(maxY, p.y * sy)
  const cy = y - (spin !== 0 ? Math.max(sx, sy) : maxY)
  const pts = transformPts(base, { x, y: cy, sx, sy, rot: spin })

  shapePoly(ctx, pts, o.tint ?? def.colors.body, o.outlineOverride ?? def.colors.outline, 1.7 * scale)

  // Shading wedge on the trailing side.
  const shade = pts.map((p) => ({ x: p.x, y: p.y }))
  const shadePts: Pt[] = [
    { x: x - facing * sx * 0.1, y: cy - sy },
    { x: x - facing * sx * 1.1, y: cy },
    { x: x - facing * sx * 0.1, y: cy + sy },
  ]
  ctx.save()
  ctx.beginPath()
  ctx.globalAlpha = 0.35
  fillPoly(ctx, clipToPoly(shadePts, shade), def.colors.shade)
  ctx.globalAlpha = 1
  ctx.restore()

  // Face.
  const eyeY = cy + def.face.dy * scale
  const spread = def.face.spread * scale
  const size = Math.max(1, Math.round(def.face.size * scale))
  const ox = x + facing * 1.5 * scale
  if (o.eyes === 'hurt') {
    for (const side of [-1, 1]) {
      const ex = ox + side * spread
      px(ctx, ex - size, eyeY - size, size * 2, size, def.colors.eye)
      px(ctx, ex - size, eyeY + 1, size * 2, size, def.colors.eye)
    }
  } else {
    for (const side of [-1, 1]) {
      const ex = ox + side * spread
      const h = o.eyes === 'focus' ? size : size * 1.6
      px(ctx, ex - size / 2, eyeY - h / 2, size, h, def.colors.eye)
      px(ctx, ex - size / 2, eyeY - h / 2, Math.max(1, size / 2), Math.max(1, h / 3), '#ffffff')
    }
  }
}

/** Cheap polygon clip: keeps points of `pts` inside the convex hull `poly`. */
function clipToPoly(pts: Pt[], poly: Pt[]): Pt[] {
  let cx = 0
  let cy = 0
  for (const p of poly) {
    cx += p.x
    cy += p.y
  }
  cx /= poly.length
  cy /= poly.length
  return pts.map((p) => {
    let best = 1
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      const t = segRayT(cx, cy, p.x - cx, p.y - cy, a, b)
      if (t !== null && t < best) best = t
    }
    return { x: cx + (p.x - cx) * best, y: cy + (p.y - cy) * best }
  })
}

function segRayT(ox: number, oy: number, dx: number, dy: number, a: Pt, b: Pt): number | null {
  const ex = b.x - a.x
  const ey = b.y - a.y
  const den = dx * ey - dy * ex
  if (Math.abs(den) < 1e-6) return null
  const t = ((a.x - ox) * ey - (a.y - oy) * ex) / den
  const u = ((a.x - ox) * dy - (a.y - oy) * dx) / den
  if (t < 0 || u < 0 || u > 1) return null
  return t
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
  const w = Math.round((f.def.hurt.w - 4) * (1 - dist * 0.5))
  ctx.globalAlpha = 0.35 * (1 - dist * 0.7)
  px(ctx, f.x - w / 2, ground, w, 2, '#0b0a1c')
  ctx.globalAlpha = 1
}

function drawMoveFx(ctx: CanvasRenderingContext2D, f: Fighter): void {
  const mv = f.move
  if (!mv) return
  const def = f.def
  const dir: number = mv.symmetric ? 1 : f.facing
  const hx = f.x + mv.hit.x * dir
  const hy = f.y - mv.hit.y
  const active = f.moveFrame > mv.startup && f.moveFrame <= mv.startup + mv.active
  const t = active ? (f.moveFrame - mv.startup) / mv.active : 0

  if (!active) {
    if (f.moveFrame <= mv.startup) {
      // Wind-up: a tightening ring of sparks.
      const k = f.moveFrame / Math.max(1, mv.startup)
      const rr = 12 - k * 7
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + f.moveFrame * 0.3
        px(ctx, hx + Math.cos(a) * rr, hy + Math.sin(a) * rr, 2, 2, def.colors.accent)
      }
    }
    return
  }

  const core = '#ffffff'
  const glow = def.colors.accent
  switch (mv.art) {
    case 'jab': {
      const len = mv.hit.w
      px(ctx, hx - (len / 2) * dir, hy - 2, len * dir, 4, glow)
      px(ctx, hx - (len / 2) * dir, hy - 1, len * dir, 2, core)
      px(ctx, hx + (len / 2) * dir - 2, hy - 4, 3, 8, core)
      break
    }
    case 'swing': {
      const radius = Math.abs(mv.hit.x) + 4
      const from = -1.15
      const to = 0.75
      const a = from + (to - from) * t
      for (let i = 0; i < 5; i++) {
        const aa = a - i * 0.16
        const rr = radius - i * 1.2
        const sxp = f.x + Math.cos(aa) * rr * dir
        const syp = f.y - mv.hit.y + Math.sin(aa) * rr
        px(ctx, sxp - 2, syp - 2, 4, 4, i < 2 ? core : glow)
      }
      break
    }
    case 'rise': {
      const h = mv.hit.h
      px(ctx, hx - 3, hy - h / 2, 6, h, glow)
      px(ctx, hx - 1, hy - h / 2, 2, h, core)
      for (let i = 0; i < 4; i++) {
        px(ctx, hx - 8 + i * 5, hy - h / 2 - 3 - i, 2, 2, core)
      }
      break
    }
    case 'stomp': {
      const pts: Pt[] = [
        { x: f.x - mv.hit.w / 2, y: hy - 5 },
        { x: f.x + mv.hit.w / 2, y: hy - 5 },
        { x: f.x, y: hy + 8 },
      ]
      shapePoly(ctx, pts, glow, core, 1)
      break
    }
    case 'quake': {
      const spread = (mv.hit.w / 2) * (0.4 + t * 0.6)
      for (const s of [-1, 1]) {
        px(ctx, f.x + s * spread - 4, f.y - 6, 8, 6, glow)
        px(ctx, f.x + s * spread - 2, f.y - 10, 4, 5, core)
      }
      px(ctx, f.x - spread, f.y - 2, spread * 2, 2, core)
      break
    }
    case 'burst': {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + f.moveFrame * 0.16
        const rr = 6 + t * 12
        px(ctx, f.x + Math.cos(a) * rr - 1, hy + Math.sin(a) * rr - 1, 3, 3, i % 2 ? glow : core)
      }
      px(ctx, f.x - 2, f.y - 2, 4, 10, glow)
      break
    }
    case 'spin': {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + f.moveFrame * 0.55
        const rr = mv.hit.w / 2
        const pts = transformPts(regularPoly(3, a * 2), {
          x: f.x + Math.cos(a) * rr,
          y: hy + Math.sin(a) * rr * 0.7,
          sx: 4,
          sy: 4,
        })
        shapePoly(ctx, pts, glow, core, 1)
      }
      break
    }
  }
}

function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, frame: number): void {
  if (f.state === 'dead') return
  if (f.invuln > 0 && Math.floor(frame / 3) % 2 === 0) return

  const def = f.def
  const hurt = f.state === 'hitstun'
  const jitter = f.hitlag > 0 ? Math.round(rand(-1.5, 1.5)) : 0
  const bob = f.grounded && f.state === 'idle' ? Math.sin(f.animTimer * 0.08) * 0.6 : 0
  const lean = f.grounded && f.state === 'walk' ? Math.sin(f.animTimer * 0.25) * 0.12 : 0

  drawBody(ctx, def, f.x + jitter, f.y + bob, {
    facing: f.facing,
    squash: f.squash,
    spin: f.spin + lean + (f.state === 'helpless' ? f.animTimer * 0.2 : 0),
    eyes: hurt ? 'hurt' : f.state === 'attack' ? 'focus' : 'open',
    tint: f.hitlag > 0 ? '#ffffff' : f.invuln > 0 ? def.colors.shade : null,
  })

  if (f.state === 'attack') drawMoveFx(ctx, f)

  // Player marker above the head.
  const color = Engine.playerColor(f.index)
  const top = f.y - def.hurt.h - 9
  const pts: Pt[] = [
    { x: f.x - 4, y: top },
    { x: f.x + 4, y: top },
    { x: f.x, y: top + 5 },
  ]
  fillPoly(ctx, pts, color)
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
    drawText(ctx, t.text, t.x, t.y, t.color, {
      scale: t.scale,
      align: 'center',
      shadow: '#100c1e',
    })
  }
  ctx.globalAlpha = 1
}

function drawOffscreenMarkers(ctx: CanvasRenderingContext2D, eng: SmashEngine): void {
  for (const f of eng.fighters) {
    if (f.state === 'dead') continue
    const inside = f.x > 10 && f.x < VIEW_W - 10 && f.y > 14 && f.y < VIEW_H - 10
    if (inside) continue
    const cx = clamp(f.x, 14, VIEW_W - 14)
    const cy = clamp(f.y, 18, VIEW_H - 40)
    const color = Engine.playerColor(f.index)
    const ang = Math.atan2(f.y - cy, f.x - cx)
    const pts = transformPts(
      [
        { x: 7, y: 0 },
        { x: -5, y: -5 },
        { x: -5, y: 5 },
      ],
      { x: cx, y: cy, rot: ang },
    )
    shapePoly(ctx, pts, color, '#100c1e', 1)
    drawText(ctx, `${Math.round(f.percent)}`, cx, cy + 8, color, {
      align: 'center',
      shadow: '#100c1e',
    })
  }
}

function percentColor(p: number): string {
  if (p < 45) return '#ffffff'
  if (p < 85) return '#ffe066'
  if (p < 125) return '#ff9d4d'
  return '#ff5f6d'
}

function drawHud(ctx: CanvasRenderingContext2D, eng: SmashEngine): void {
  for (let i = 0; i < 2; i++) {
    const f = eng.fighters[i]
    const bx = i === 0 ? 38 : 250
    const by = 232
    const w = 192
    const h = 34

    ctx.globalAlpha = 0.82
    px(ctx, bx, by, w, h, '#0b1020')
    ctx.globalAlpha = 1
    px(ctx, bx, by, w, 1, '#38456b')
    px(ctx, bx, by + h - 1, w, 1, '#38456b')
    px(ctx, bx, by, 1, h, '#38456b')
    px(ctx, bx + w - 1, by, 1, h, '#38456b')
    px(ctx, bx, by, 3, 3, Engine.playerColor(i))

    drawText(ctx, f.def.name, bx + 7, by + 6, Engine.playerColor(i), { shadow: '#04060f' })

    // Stock pips shaped like the fighter.
    for (let s = 0; s < f.stocks; s++) {
      const pts = transformPts(regularPoly(f.def.sides, f.def.rotation), {
        x: bx + 11 + s * 12,
        y: by + 24,
        sx: 4.5,
        sy: 4.5,
      })
      shapePoly(ctx, pts, f.def.colors.body, f.def.colors.outline, 1)
    }

    const pct = Math.round(f.percent)
    const col = f.state === 'dead' ? '#5a637f' : percentColor(pct)
    drawText(ctx, `${pct}`, bx + w - 18, by + 8, col, {
      scale: 3,
      align: 'right',
      shadow: '#04060f',
    })
    drawText(ctx, '%', bx + w - 15, by + 14, col, { scale: 2, shadow: '#04060f' })
  }
}

function drawBanner(ctx: CanvasRenderingContext2D, eng: SmashEngine): void {
  if (eng.phase === 'intro') {
    const t = eng.phaseTimer
    const label = t > 140 ? '3' : t > 95 ? '2' : t > 50 ? '1' : 'GO!'
    const pulse = 1 - ((t % 45) / 45) * 0.25
    drawText(ctx, label, VIEW_W / 2, 74, '#ffffff', {
      scale: Math.max(3, Math.round(6 * pulse)),
      align: 'center',
      shadow: '#22103a',
    })
    if (t > 50) {
      drawText(ctx, `${eng.fighters[0].def.name} VS ${eng.fighters[1].def.name}`, VIEW_W / 2, 46, '#ffe066', {
        align: 'center',
        shadow: '#22103a',
      })
    }
    return
  }

  if (eng.phase === 'over' && eng.winner !== null) {
    const win = eng.fighters[eng.winner]
    drawText(ctx, 'GAME!', VIEW_W / 2, 58, '#ffffff', {
      scale: 6,
      align: 'center',
      shadow: '#22103a',
    })
    drawText(ctx, `${win.def.name} WINS`, VIEW_W / 2, 104, Engine.playerColor(eng.winner), {
      scale: 2,
      align: 'center',
      shadow: '#22103a',
    })
    return
  }

  if (eng.bannerTimer > 0 && eng.banner) {
    const k = clamp(eng.bannerTimer / 20, 0, 1)
    ctx.globalAlpha = k
    drawText(ctx, eng.banner, VIEW_W / 2, 66, '#ffffff', {
      scale: 5,
      align: 'center',
      shadow: '#22103a',
    })
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
      ctx.globalAlpha = 0.4
      px(ctx, f.x - f.def.hurt.w / 2, f.y - f.def.hurt.h, f.def.hurt.w, f.def.hurt.h, '#00ff88')
      const mv = f.move
      if (mv && f.moveFrame > mv.startup && f.moveFrame <= mv.startup + mv.active) {
        const dir: number = mv.symmetric ? 1 : f.facing
        px(
          ctx,
          f.x + mv.hit.x * dir - mv.hit.w / 2,
          f.y - mv.hit.y - mv.hit.h / 2,
          mv.hit.w,
          mv.hit.h,
          '#ff0055',
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
    ctx.globalAlpha = clamp(eng.flash / 22, 0, 0.5)
    px(ctx, 0, 0, VIEW_W, VIEW_H, '#ffffff')
    ctx.globalAlpha = 1
  }
}
