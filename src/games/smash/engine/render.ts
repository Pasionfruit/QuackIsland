/**
 * Draws a Smash match.
 *
 * The arena is a disc seen from above and slightly in front, so everything is
 * drawn back to front by its y position: a fighter standing lower on screen is
 * nearer the camera and covers one standing behind them. The floor itself is
 * baked once into an offscreen canvas, since nothing on it moves.
 */
import { PAL } from '../../../art/palette'
import { bush, pine, rock } from '../../../art/props'
import {
  clamp,
  ellipse,
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
import { drawChar } from './characters'
import type { Fighter, SmashEngine } from './engine'
import { SmashEngine as Engine } from './engine'
import { rimDistance, VIEW_H, VIEW_W, type Arena } from './stage'
import { drawSprite, spriteSet, type SpriteState } from '../sprites'
import type { Facing } from './types'

// ------------------------------------------------------------- background

let floorCache: { canvas: HTMLCanvasElement; scale: number; arena: string } | null = null

/** The disc, its slab and the scenery around the rim: none of it moves. */
function buildFloor(a: Arena, ss: number): HTMLCanvasElement {
  const { canvas, ctx } = makeScene(VIEW_W, VIEW_H, ss)

  // The void the arena floats in.
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H)
  sky.addColorStop(0, '#8fb0c2')
  sky.addColorStop(0.55, '#b6cbd0')
  sky.addColorStop(1, '#8ea59f')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)

  // A soft shadow the disc casts into the haze below it.
  ellipse(ctx, a.cx, a.cy + a.ry * 0.62, a.rx * 1.02, a.ry * 0.42, 'rgba(58, 72, 78, 0.22)')

  // The slab: the floor's silhouette pushed down and darkened.
  const slab: Pt[] = []
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI
    slab.push({ x: a.cx + Math.cos(t) * a.rx, y: a.cy + Math.sin(t) * a.ry })
  }
  for (let i = 40; i >= 0; i--) {
    const t = (i / 40) * Math.PI
    slab.push({ x: a.cx + Math.cos(t) * a.rx, y: a.cy + Math.sin(t) * a.ry + a.depth })
  }
  fillPoly(ctx, slab, PAL.dirt)
  // Rock strata, so the underside is not a flat band.
  for (let i = 0; i < 26; i++) {
    const t = noise(i * 3.1)
    const x = a.cx + (t * 2 - 1) * a.rx * 0.92
    const y = a.cy + Math.sin(Math.acos(clamp((x - a.cx) / a.rx, -1, 1))) * a.ry + a.depth * (0.3 + noise(i * 7.7) * 0.5)
    ellipse(ctx, x, y, a.rx * 0.04, a.depth * 0.12, withAlpha(PAL.dirtShade, 0.35))
  }

  // The grass surface.
  ellipse(ctx, a.cx, a.cy, a.rx, a.ry, PAL.grass)
  ellipse(ctx, a.cx, a.cy - a.ry * 0.08, a.rx * 0.9, a.ry * 0.82, PAL.grassLit)
  // A worn ring near the rim, which is also the visual warning track.
  ctx.strokeStyle = withAlpha(PAL.grassShade, 0.55)
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(a.cx, a.cy, a.rx * 0.82, a.ry * 0.82, 0, 0, Math.PI * 2)
  ctx.stroke()

  // Scenery, kept outside the play ring so it never hides a fighter.
  const props: { x: number; y: number; kind: number; s: number }[] = []
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2 + noise(i * 5.3) * 0.3
    const r = 1.0 + noise(i * 2.7) * 0.05
    props.push({
      x: a.cx + Math.cos(ang) * a.rx * r,
      y: a.cy + Math.sin(ang) * a.ry * r,
      kind: Math.floor(noise(i * 9.1) * 3),
      s: 0.7 + noise(i * 4.4) * 0.6,
    })
  }
  props.sort((p, q) => p.y - q.y)
  for (const p of props) {
    if (p.kind === 0) pine(ctx, p.x, p.y, 16 * p.s)
    else if (p.kind === 1) bush(ctx, p.x, p.y, 12 * p.s)
    else rock(ctx, p.x, p.y, 11 * p.s)
  }

  return canvas
}

function floorFor(ctx: CanvasRenderingContext2D, a: Arena): HTMLCanvasElement {
  const ss = Math.max(1, Math.min(4, Math.round(sceneScale(ctx))))
  if (!floorCache || floorCache.scale !== ss || floorCache.arena !== a.id) {
    floorCache = { canvas: buildFloor(a, ss), scale: ss, arena: a.id }
  }
  return floorCache.canvas
}

// ---------------------------------------------------------------- fighters

/** Sprite frame for a fighter's current state. */
function spriteStateFor(f: Fighter): SpriteState {
  const dirName: Record<Facing, string> = {
    up: 'Up',
    down: 'Down',
    left: 'Left',
    right: 'Right',
  }
  const plain: Record<Facing, SpriteState> = {
    up: 'back',
    down: 'front',
    left: 'left',
    right: 'right',
  }
  if (f.state === 'hitstun') return 'takeHit'
  if (f.state === 'falling') return 'recoverUp'
  if (f.state === 'attack' && f.move) {
    const kind = f.move.id.startsWith('special') ? 'special' : 'attack'
    switch (f.move.id) {
      case 'attackUp':
      case 'specialUp':
        return `${kind}Up` as SpriteState
      case 'attackDown':
      case 'specialDown':
        return `${kind}Down` as SpriteState
      case 'attackSide':
      case 'specialSide':
        return `${kind}${dirName[f.facing]}` as SpriteState
      default:
        return `${kind}Neutral` as SpriteState
    }
  }
  return plain[f.facing]
}

/** The procedural rig's view for a facing, used when a fighter has no sheet. */
function viewFor(f: Facing): { view: 'side' | 'front' | 'back'; facing: 1 | -1 } {
  if (f === 'left') return { view: 'side', facing: -1 }
  if (f === 'right') return { view: 'side', facing: 1 }
  return { view: f === 'up' ? 'back' : 'front', facing: 1 }
}

function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, frame: number): void {
  if (f.state === 'dead') return
  const blinking = f.invuln > 0 && Math.floor(frame / 4) % 2 === 0
  const jitter = f.hitlag > 0 ? rand(-1.4, 1.4) : 0
  const bob = f.state === 'idle' ? Math.sin(f.animTimer * 0.07) * 0.5 : 0

  // Going over the edge: shrink away and fade as the fall plays out.
  const fall = f.state === 'falling' ? f.fallTimer / 34 : 0
  const scale = 1 - fall * 0.65
  const alpha = (blinking ? 0.35 : 1) * (1 - fall * 0.85)
  const drop = fall * 26

  if (f.state !== 'falling') {
    ellipse(ctx, f.x, f.y + 1, f.def.radius * 1.15, f.def.radius * 0.45, 'rgba(58, 60, 48, 0.26)')
  }

  const tint = f.hitlag > 0 ? '#fff3d6' : null
  const set = spriteSet(f.def.id)
  const drawn =
    set !== null &&
    drawSprite(ctx, set, spriteStateFor(f), f.x + jitter, f.y + bob + drop, {
      height: f.def.height * scale,
      squash: f.squash,
      spin: f.spin,
      tint,
      alpha,
    })

  if (!drawn) {
    const v = viewFor(f.facing)
    drawChar(ctx, f.def, f.x + jitter, f.y + bob + drop, {
      facing: v.facing,
      view: v.view,
      pose: proceduralPose(f),
      phase: f.animTimer,
      squash: f.squash,
      spin: f.spin,
      scale,
      tint,
      alpha,
    })
  }

  if (f.state === 'attack') drawMoveFx(ctx, f)
}

/** Nearest pose the procedural rig has for a fighter's state. */
function proceduralPose(f: Fighter): 'idle' | 'walk' | 'brace' | 'hurt' | 'swingFwd' | 'swingUp' | 'swingDown' {
  switch (f.state) {
    case 'walk':
      return 'walk'
    case 'hitstun':
      return 'hurt'
    case 'falling':
      return 'hurt'
    case 'attack': {
      const mv = f.move
      if (!mv) return 'idle'
      if (f.moveFrame <= mv.startup) return 'brace'
      if (mv.art === 'launch') return 'swingUp'
      if (mv.art === 'slam' || mv.art === 'ring') return 'swingDown'
      return 'swingFwd'
    }
    default:
      return 'idle'
  }
}

const DIRV: Record<Facing, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

/** The flourish on an active hitbox, matching the reference sheet's effects. */
function drawMoveFx(ctx: CanvasRenderingContext2D, f: Fighter): void {
  const mv = f.move!
  const t = f.moveFrame - mv.startup
  if (t <= 0 || t > mv.active + 2) return
  const fade = clamp(1 - t / (mv.active + 2), 0, 1)
  const d = DIRV[f.facing]
  const cx = f.x + d.x * mv.hit.reach * 0.8
  const cy = f.y - f.def.height * 0.4 + d.y * mv.hit.reach * 0.5

  ctx.save()
  ctx.globalAlpha = fade
  switch (mv.art) {
    case 'slash':
    case 'lunge': {
      ctx.strokeStyle = 'rgba(255, 252, 242, 0.92)'
      ctx.lineWidth = mv.hit.width * 0.16
      ctx.lineCap = 'round'
      ctx.beginPath()
      const a0 = Math.atan2(d.y, d.x) - 0.9
      ctx.arc(f.x, f.y - f.def.height * 0.4, mv.hit.reach * 0.9, a0, a0 + 1.8)
      ctx.stroke()
      break
    }
    case 'launch': {
      ctx.strokeStyle = 'rgba(255, 246, 214, 0.9)'
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.arc(cx, cy, mv.hit.reach * 0.7, Math.PI * 1.15, Math.PI * 1.85)
      ctx.stroke()
      break
    }
    case 'slam':
    case 'ring': {
      // A ring on the floor, so a radial move reads as area, not reach.
      const r = mv.hit.reach * (0.5 + 0.5 * (t / (mv.active + 2)))
      ctx.strokeStyle = mv.art === 'ring' ? 'rgba(150, 205, 230, 0.95)' : 'rgba(232, 224, 208, 0.95)'
      ctx.lineWidth = 2.6
      ctx.beginPath()
      ctx.ellipse(f.x, f.y, r, r * 0.45, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'burst':
    case 'bolt': {
      const cold = mv.art === 'bolt'
      for (let i = 0; i < 4; i++) {
        const off = (i - 1.5) * 5
        const px = cx + -d.y * off
        const py = cy + d.x * off
        const s = 3.4 - Math.abs(i - 1.5) * 0.7
        ctx.fillStyle = cold ? 'rgba(190, 230, 246, 0.95)' : 'rgba(255, 236, 198, 0.95)'
        ctx.beginPath()
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2 + i
          const rr = s * (k % 2 ? 0.5 : 1)
          const qx = px + Math.cos(ang) * rr
          const qy = py + Math.sin(ang) * rr * 0.9
          if (k === 0) ctx.moveTo(qx, qy)
          else ctx.lineTo(qx, qy)
        }
        ctx.closePath()
        ctx.fill()
      }
      break
    }
  }
  ctx.restore()
}

// ------------------------------------------------------------------- hud

function drawPlate(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  x: number,
  y: number,
  maxStocks: number,
): void {
  const w = 128
  const h = 40
  const color = Engine.playerColor(f.index)
  ctx.fillStyle = 'rgba(246, 242, 232, 0.92)'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, 3)

  drawText(ctx, f.def.name, x + 7, y + 8, '#3b372f', { size: 9 })
  const pct = Math.round(f.percent)
  drawText(ctx, `${pct}`, x + w - 24, y + 9, pct > 90 ? '#c0392b' : '#3b372f', {
    size: 17,
    align: 'right',
  })
  drawText(ctx, '%', x + w - 8, y + 16, '#7a7466', { size: 9, align: 'right' })

  // Stock pips: one per life the match started with, filled for lives left.
  for (let i = 0; i < Math.min(maxStocks, 5); i++) {
    ctx.fillStyle = i < f.stocks ? color : 'rgba(120, 116, 104, 0.28)'
    ctx.beginPath()
    ctx.arc(x + 8 + i * 9, y + h - 9, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ----------------------------------------------------------------- render

export function renderMatch(
  ctx: CanvasRenderingContext2D,
  eng: SmashEngine,
  opts: { debug?: boolean } = {},
): void {
  const a = eng.arena
  const shake = eng.shake
  const sx = shake > 0.4 ? rand(-shake, shake) : 0
  const sy = shake > 0.4 ? rand(-shake, shake) : 0

  ctx.save()
  ctx.translate(Math.round(sx), Math.round(sy))
  ctx.drawImage(floorFor(ctx, a), 0, 0, VIEW_W, VIEW_H)

  // Everything on the floor, back to front.
  const actors: { y: number; draw: () => void }[] = []
  for (const f of eng.fighters) {
    if (f.state === 'dead') continue
    actors.push({ y: f.y, draw: () => drawFighter(ctx, f, eng.frame) })
  }
  for (const p of eng.particles) {
    actors.push({
      y: p.y,
      draw: () => {
        const fade = clamp(p.life / p.maxLife, 0, 1)
        ellipse(ctx, p.x, p.y - p.z, p.size, p.size * 0.8, withAlpha(p.color, fade))
      },
    })
  }
  actors.sort((p, q) => p.y - q.y)
  for (const it of actors) it.draw()

  for (const t of eng.texts) {
    drawText(ctx, t.text, t.x, t.y, t.color, {
      size: 11 * t.scale,
      align: 'center',
      weight: 800,
    })
  }

  if (opts.debug) {
    ctx.strokeStyle = 'rgba(220, 60, 60, 0.8)'
    ctx.lineWidth = 0.6
    for (const f of eng.fighters) {
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.def.radius, 0, Math.PI * 2)
      ctx.stroke()
      drawText(ctx, `${rimDistance(a, f.x, f.y).toFixed(2)}`, f.x, f.y + 10, '#c0392b', {
        size: 7,
        align: 'center',
      })
    }
  }

  ctx.restore()

  drawPlate(ctx, eng.fighters[0], 14, VIEW_H - 52, eng.config.stocks)
  drawPlate(ctx, eng.fighters[1], VIEW_W - 142, VIEW_H - 52, eng.config.stocks)

  if (eng.phase === 'intro') {
    const secs = Math.ceil(eng.phaseTimer / 60)
    drawText(ctx, secs > 0 ? `${secs}` : 'GO!', VIEW_W / 2, 54, '#f6f2e8', {
      size: 34,
      align: 'center',
      weight: 800,
    })
    drawText(
      ctx,
      `${eng.fighters[0].def.name}  vs  ${eng.fighters[1].def.name}`,
      VIEW_W / 2,
      96,
      '#f6f2e8',
      { size: 13, align: 'center', weight: 700 },
    )
  } else if (eng.bannerTimer > 0 && eng.banner) {
    drawText(ctx, eng.banner, VIEW_W / 2, 44, '#fff6e2', {
      size: 24,
      align: 'center',
      weight: 800,
    })
  }

  if (eng.flash > 0) {
    ctx.fillStyle = withAlpha('#fff6e2', Math.min(0.5, eng.flash / 14))
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  }
}

export { shade }
