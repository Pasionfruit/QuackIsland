/**
 * Draws a Smash match.
 *
 * The stage is three platforms seen from the side, so there is no depth
 * sorting to do the way an overhead view would need - fighters and effects
 * just draw in a fixed order, with only particles interleaved by height so a
 * spark can pass behind or in front of whoever is standing near it. The
 * platforms themselves are baked once into an offscreen canvas, since
 * nothing about them moves.
 */
import { PAL } from '../../../art/palette'
import { bush, pine, rock } from '../../../art/props'
import { clamp, ellipse, makeScene, rand, sceneScale, shade, withAlpha } from '../../../lib/draw'
import { drawText } from '../../../lib/text'
import { drawChar } from './characters'
import type { Fighter, SmashEngine } from './engine'
import { SmashEngine as Engine } from './engine'
import { VIEW_H, VIEW_W, type Arena, type Platform } from './stage'
import { drawSprite, spriteSet, type SpriteState } from '../sprites'
import type { Facing } from './types'

// ------------------------------------------------------------- background

let floorCache: { canvas: HTMLCanvasElement; scale: number; arena: string } | null = null

/** One platform, drawn as a flat-shaded slab with a grassy top. */
function drawPlatform(ctx: CanvasRenderingContext2D, p: Platform, thickness: number): void {
  const w = p.x1 - p.x0
  ctx.fillStyle = PAL.dirt
  ctx.fillRect(p.x0, p.y, w, thickness)
  ctx.fillStyle = withAlpha(PAL.dirtShade, 0.4)
  ctx.fillRect(p.x0, p.y + thickness - 3, w, 3)
  ctx.fillStyle = PAL.grass
  ctx.fillRect(p.x0, p.y - 3, w, 5)
  ctx.fillStyle = PAL.grassLit
  ctx.fillRect(p.x0, p.y - 3, w, 2)
  // Rounded caps so a platform reads as a solid block, not a bare rectangle.
  ctx.beginPath()
  ctx.arc(p.x0, p.y + thickness / 2, thickness / 2, 0, Math.PI * 2)
  ctx.arc(p.x1, p.y + thickness / 2, thickness / 2, 0, Math.PI * 2)
  ctx.fillStyle = PAL.dirt
  ctx.fill()
}

/** The sky, the three platforms, and scenery tucked around them: none of it moves. */
function buildStage(a: Arena, ss: number): HTMLCanvasElement {
  const { canvas, ctx } = makeScene(VIEW_W, VIEW_H, ss)

  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H)
  sky.addColorStop(0, '#8fb0c2')
  sky.addColorStop(0.55, '#b6cbd0')
  sky.addColorStop(1, '#8ea59f')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)

  // Distant hills, so the floating platforms read as being up in the air.
  ctx.fillStyle = withAlpha('#7f9c9c', 0.5)
  ctx.beginPath()
  ctx.moveTo(0, VIEW_H)
  for (let x = 0; x <= VIEW_W; x += 20) ctx.lineTo(x, 150 - Math.sin(x * 0.02) * 14)
  ctx.lineTo(VIEW_W, VIEW_H)
  ctx.closePath()
  ctx.fill()

  const [ground, ...floaters] = a.platforms

  // The ground goes all the way to the blast zone floor, so there is no gap
  // under it for the sky to show through.
  drawPlatform(ctx, { ...ground, y: ground.y }, a.blast.bottom - ground.y + 20)

  for (const p of floaters) {
    // A soft shadow on the ground below each floating platform.
    const midX = (p.x0 + p.x1) / 2
    ellipse(ctx, midX, ground.y + 4, (p.x1 - p.x0) * 0.4, 4, 'rgba(58, 72, 78, 0.16)')
    drawPlatform(ctx, p, 14)
  }

  // Scenery along the ground, kept off to the sides so nothing hides a fighter.
  pine(ctx, ground.x0 + 18, ground.y, 26)
  pine(ctx, ground.x0 + 40, ground.y, 18)
  bush(ctx, ground.x0 + 62, ground.y, 12)
  pine(ctx, ground.x1 - 18, ground.y, 24)
  bush(ctx, ground.x1 - 42, ground.y, 13)
  rock(ctx, ground.x1 - 60, ground.y, 11)

  return canvas
}

function floorFor(ctx: CanvasRenderingContext2D, a: Arena): HTMLCanvasElement {
  const ss = Math.max(1, Math.min(4, Math.round(sceneScale(ctx))))
  if (!floorCache || floorCache.scale !== ss || floorCache.arena !== a.id) {
    floorCache = { canvas: buildStage(a, ss), scale: ss, arena: a.id }
  }
  return floorCache.canvas
}

// ---------------------------------------------------------------- fighters

/** Sprite frame for a fighter's current state - only ever left/right facing now. */
function spriteStateFor(f: Fighter): SpriteState {
  if (f.state === 'hitstun') return 'takeHit'
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
        return `${kind}${f.facing === 'left' ? 'Left' : 'Right'}` as SpriteState
      default:
        return `${kind}Neutral` as SpriteState
    }
  }
  if (f.state === 'falling') return 'recoverUp'
  return f.facing === 'left' ? 'left' : 'right'
}

function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, frame: number): void {
  if (f.state === 'dead') return
  const blinking = f.invuln > 0 && Math.floor(frame / 4) % 2 === 0
  const jitter = f.hitlag > 0 ? rand(-1.4, 1.4) : 0
  const bob = f.state === 'idle' ? Math.sin(f.animTimer * 0.07) * 0.5 : 0
  const alpha = blinking ? 0.35 : 1

  if (f.grounded) {
    ellipse(ctx, f.x, f.y + 1, f.def.radius * 1.15, f.def.radius * 0.45, 'rgba(58, 60, 48, 0.26)')
  }

  const tint = f.hitlag > 0 ? '#fff3d6' : null
  const set = spriteSet(f.def.id)
  const drawn =
    set !== null &&
    drawSprite(ctx, set, spriteStateFor(f), f.x + jitter, f.y + bob, {
      height: f.def.height,
      squash: f.squash,
      spin: f.spin,
      tint,
      alpha,
    })

  if (!drawn) {
    drawChar(ctx, f.def, f.x + jitter, f.y + bob, {
      facing: f.facing === 'left' ? -1 : 1,
      view: 'side',
      pose: proceduralPose(f),
      phase: f.animTimer,
      squash: f.squash,
      spin: f.spin,
      tint,
      alpha,
    })
  }

  if (f.state === 'attack') drawMoveFx(ctx, f)

  if (f.state === 'shield') {
    // Shrinks the longer it has been up, the same way a real shield does -
    // and doubles as the parry tell: a big, bright bubble on the frame it
    // first goes up is the window a well-timed hit gets parried instead of
    // just blocked.
    const fresh = f.shieldFrames <= 6
    const r = f.def.radius * (fresh ? 1.5 : Math.max(1.05, 1.4 - f.shieldFrames * 0.01))
    ctx.beginPath()
    ctx.ellipse(f.x, f.y - f.def.height * 0.42, r, r * 0.92, 0, 0, Math.PI * 2)
    ctx.fillStyle = fresh ? 'rgba(255, 230, 102, 0.38)' : 'rgba(150, 205, 230, 0.3)'
    ctx.fill()
    ctx.strokeStyle = fresh ? 'rgba(255, 230, 102, 0.85)' : 'rgba(150, 205, 230, 0.7)'
    ctx.lineWidth = 1.4
    ctx.stroke()
  }
}

/** Nearest pose the procedural rig has for a fighter's state. */
function proceduralPose(f: Fighter): 'idle' | 'walk' | 'jump' | 'fall' | 'brace' | 'hurt' | 'swingFwd' | 'swingUp' | 'swingDown' {
  switch (f.state) {
    case 'walk':
      return 'walk'
    case 'hitstun':
      return 'hurt'
    case 'falling':
      return f.vy < 0 ? 'jump' : 'fall'
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
  const isUp = mv.id.endsWith('Up')
  const isDown = mv.id.endsWith('Down')
  const d = isUp ? DIRV.up : isDown ? DIRV.down : DIRV[f.facing]
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

  // Fighters draw in a fixed order; particles interleave by height so a
  // spark can pass behind or in front of whoever is standing near it.
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
      drawText(ctx, f.grounded ? `${f.jumps}j` : `air ${f.jumps}j`, f.x, f.y + 10, '#c0392b', {
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
