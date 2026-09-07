/**
 * Painting the four minigames.
 *
 * Same split as everywhere else here: the engines are DOM-free and these are
 * pure drawing. They share one backdrop and one scoreboard so a run of games
 * feels like one event rather than four unrelated screens.
 */
import { drawAvatar } from '../../../art/avatar'
import { PAL } from '../../../art/palette'
import { pine } from '../../../art/props'
import { DAY, NIGHT, ground, moon, sky, stars, water } from '../../../art/scenes'
import { clamp, ellipse, facet, noise, shade, softShadow, withAlpha } from '../../../lib/draw'
import { HUD, hudPlate, hudText } from '../../../lib/hud'
import { textWidth } from '../../../lib/text'
import { PARADE_CAST } from '../engine/engine'
import { NEVER, PRECISION_RANGE, type AnyMinigame } from './index'
import {
  CHIP_IN_RANGE,
  DODGE_JUMP_FRAMES,
  CHIP_PERFECT,
  CHIP_TARGET,
  JUMBO_AIR,
  LENS,
  MAZE_CH,
  MAZE_COLS,
  MAZE_CW,
  MAZE_ROWS,
} from './index'
import { FIELD, MG_VIEW_H, MG_VIEW_W, type MgPlayer } from './types'

const HORIZON = 92
const BEACH = MG_VIEW_H - 54
/** The clear strip between the scoreboard and the field, where the clock goes. */
const CLOCK_Y = 86

function backdrop(ctx: CanvasRenderingContext2D, frame: number): void {
  sky(ctx, MG_VIEW_W, HORIZON, DAY)
  water(ctx, MG_VIEW_W, HORIZON + 26, HORIZON, frame)
  // One long island, so every game is played on the same beach. Drawn as a
  // plain rect rather than a facet: facet rounds its corners in, which leaves
  // bare canvas showing at the edges of a shape meant to run off-screen.
  ground(ctx, MG_VIEW_W, MG_VIEW_H, HORIZON + 24)
  ctx.fillStyle = withAlpha(shade(PAL.dirt, 0.42), 0.75)
  ctx.fillRect(0, HORIZON + 24, MG_VIEW_W, 4)
  for (let i = 0; i < 7; i++) {
    const x = 20 + noise(i * 3.3) * (MG_VIEW_W - 40)
    pine(ctx, x, HORIZON + 34 + noise(i * 5.1) * 6, 20 + noise(i * 7.7) * 10)
  }
}

/** A wider ground for the games played on a field rather than along a beach. */
function fieldBackdrop(ctx: CanvasRenderingContext2D, frame: number): void {
  sky(ctx, MG_VIEW_W, 84, DAY)
  water(ctx, MG_VIEW_W, 96, 84, frame)
  ground(ctx, MG_VIEW_W, MG_VIEW_H, 88)
  ctx.fillStyle = withAlpha(shade(PAL.dirt, 0.42), 0.75)
  ctx.fillRect(0, 88, MG_VIEW_W, 3)
}

/** Zombie Tag plays after dark - the pack is easier to fear than to see. */
function nightBackdrop(ctx: CanvasRenderingContext2D, frame: number): void {
  sky(ctx, MG_VIEW_W, 84, NIGHT)
  stars(ctx, MG_VIEW_W, 84, frame)
  moon(ctx, MG_VIEW_W - 54, 26, 9)
  ground(ctx, MG_VIEW_W, MG_VIEW_H, 88, '#2f4033')
  ctx.fillStyle = withAlpha('#16201a', 0.7)
  ctx.fillRect(0, 88, MG_VIEW_W, 3)
}

/** One row per player down the side: face, name, and whatever they have scored. */
function scoreboard(ctx: CanvasRenderingContext2D, game: AnyMinigame, viewerSlot: number | null): void {
  const rows = game.standings()
  // A full room of eight in one column reaches down over the playing field,
  // which matters most in the maze. Past four it goes into two columns and
  // stays up in the sky where nothing is happening.
  const cols = rows.length > 4 ? 2 : 1
  const per = Math.ceil(rows.length / cols)
  const colW = 118
  const w = colW * cols + 10
  const h = 14 + per * 15
  const x = MG_VIEW_W - w - 8
  const y = 8
  hudPlate(ctx, x, y, w, h, { radius: 6, fill: 'rgba(28, 26, 22, 0.82)' })
  rows.forEach((p, i) => {
    const col = Math.floor(i / per)
    const cx = x + 5 + col * colW
    const ry = y + 9 + (i % per) * 15
    const place = game.phase === 'done' ? `${p.rank}.` : `${i + 1}.`
    hudText(ctx, place, cx + 3, ry, { size: 8, color: HUD.dim })
    ellipse(ctx, cx + 19, ry + 4, 3.2, 3.2, p.color)
    hudText(ctx, p.name, cx + 26, ry, {
      size: 8,
      color: p.slot === viewerSlot ? HUD.warn : HUD.ink,
    })
    hudText(ctx, game.scoreLabel(p), cx + colW - 6, ry, {
      size: 8,
      align: 'right',
      color: p.out ? HUD.bad : HUD.dim,
    })
  })
}

function banner(ctx: CanvasRenderingContext2D, text: string, y = 30, size = 16): void {
  if (!text) return
  const w = textWidth(ctx, text, { size, weight: 700 }) + 26
  hudPlate(ctx, MG_VIEW_W / 2 - w / 2, y, w, size + 12, { radius: 7, fill: 'rgba(28, 26, 22, 0.72)' })
  hudText(ctx, text, MG_VIEW_W / 2, y + 6, { size, weight: 700, align: 'center', color: HUD.ink })
}

function pawn(ctx: CanvasRenderingContext2D, p: MgPlayer, x: number, y: number, frame: number, pose: 'idle' | 'walk' | 'hurt' | 'jump' | 'brace' = 'idle'): void {
  softShadow(ctx, x, y + 2, 7, 2.4, 0.24)
  ellipse(ctx, x, y + 1, 6.6, 2.6, withAlpha(p.color, 0.5))
  drawAvatar(ctx, PARADE_CAST[p.castIndex % PARADE_CAST.length].def, x, y, {
    facing: 1,
    height: 26,
    pose,
    phase: frame + p.slot * 17,
  })
}

// ---------------------------------------------------------------- per game

function drawReaction(ctx: CanvasRenderingContext2D, game: AnyMinigame, frame: number): void {
  if (game.id !== 'reaction') return
  const n = game.players.length
  game.players.forEach((p, i) => {
    const x = ((i + 1) / (n + 1)) * MG_VIEW_W
    pawn(ctx, p, x, BEACH, frame, p.out ? 'hurt' : 'idle')
    if (p.score > 0 && p.score < NEVER) {
      hudText(ctx, `${Math.round((p.score / 60) * 1000)}`, x, BEACH - 40, {
        size: 9,
        align: 'center',
        color: HUD.warn,
      })
    }
  })

  // The flag itself, so the cue is something you watch rather than read.
  const up = !game.armed
  const poleX = MG_VIEW_W / 2
  const poleTop = 60
  ctx.fillStyle = shade(PAL.wood, -0.2)
  ctx.fillRect(poleX - 1.4, poleTop, 2.8, BEACH - poleTop)
  const flagY = up ? poleTop + 6 : BEACH - 20
  facet(
    ctx,
    [
      { x: poleX + 2, y: flagY },
      { x: poleX + 30, y: flagY + 5 },
      { x: poleX + 2, y: flagY + 14 },
    ],
    up ? '#c9553a' : '#8fae6a',
    { dark: 0.2, light: 0.2 },
  )
  if (game.phase === 'play') banner(ctx, game.armed ? 'GO!' : 'Steady...', CLOCK_Y - 6, game.armed ? 22 : 14)
}

function drawMasher(ctx: CanvasRenderingContext2D, game: AnyMinigame, frame: number): void {
  if (game.id !== 'masher') return
  const best = Math.max(1, ...game.players.map((p) => p.score))
  const n = game.players.length
  game.players.forEach((p, i) => {
    const x = ((i + 1) / (n + 1)) * MG_VIEW_W
    // A tree that visibly loses its coconuts as you shake it.
    const shake = p.score > 0 ? Math.sin(frame * 0.9 + i) * Math.min(2.4, p.score * 0.05) : 0
    pine(ctx, x + shake, BEACH - 2, 44)
    const fill = clamp(p.score / best, 0, 1)
    const barY = BEACH + 6
    hudPlate(ctx, x - 16, barY, 32, 8, { radius: 4, fill: 'rgba(28, 26, 22, 0.5)' })
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.roundRect(x - 15, barY + 1, 30 * fill, 6, 3)
    ctx.fill()
    hudText(ctx, `${p.score}`, x, barY + 11, { size: 8, align: 'center', color: HUD.ink })
    pawn(ctx, p, x - 22, BEACH, frame, p.score > 0 ? 'walk' : 'idle')
  })
  if (game.phase === 'play') banner(ctx, `${Math.ceil(game.left / 60)}`, CLOCK_Y, 18)
}

function drawDodge(ctx: CanvasRenderingContext2D, game: AnyMinigame, frame: number): void {
  if (game.id !== 'dodge') return
  for (const c of game.coconuts) {
    softShadow(ctx, c.x, BEACH + 2, 6 * clamp(c.y / BEACH, 0.2, 1), 2, 0.18)
    ellipse(ctx, c.x, c.y, 6, 6.6, '#6b4f3a')
    ellipse(ctx, c.x - 1.4, c.y - 1.6, 2.4, 2.4, shade('#6b4f3a', 0.28))
  }
  for (const p of game.players) {
    const x = game.pos.get(p.slot) ?? MG_VIEW_W / 2
    // The jump was working and simply never drawn, so it looked like the key
    // did nothing at all.
    const air = game.air.get(p.slot) ?? 0
    const lift = air > 0 ? Math.sin((1 - air / DODGE_JUMP_FRAMES) * Math.PI) * 20 : 0
    if (lift > 0) softShadow(ctx, x, BEACH + 2, 6, 2.2, 0.2)
    pawn(ctx, p, x, BEACH - lift, frame, p.out ? 'hurt' : air > 0 ? 'jump' : 'walk')
    if (p.out) hudText(ctx, 'out', x, BEACH - 40, { size: 8, align: 'center', color: HUD.bad })
  }
  if (game.phase === 'play') banner(ctx, `${Math.ceil(game.left / 60)}`, CLOCK_Y, 16)
}

function drawPrecision(ctx: CanvasRenderingContext2D, game: AnyMinigame, frame: number): void {
  if (game.id !== 'precision') return
  // Centred on the space beside the scoreboard, not the whole view, or the
  // right-hand end of the bar disappears underneath it.
  const cx = (MG_VIEW_W - 136) / 2
  const barY = 78
  const halfW = 148
  const toX = (v: number) => cx + (v / PRECISION_RANGE) * halfW

  hudPlate(ctx, cx - halfW - 8, barY - 10, halfW * 2 + 16, 26, { radius: 8, fill: 'rgba(28, 26, 22, 0.55)' })
  // The gap you are aiming for.
  ctx.fillStyle = withAlpha('#8fae6a', 0.55)
  ctx.fillRect(toX(-6), barY - 6, toX(6) - toX(-6), 18)
  ctx.fillStyle = withAlpha(PAL.cream, 0.9)
  ctx.fillRect(cx - 0.8, barY - 8, 1.6, 22)

  // Where everybody stopped it.
  for (const p of game.players) {
    const at = game.stops.get(p.slot)
    if (at === undefined) continue
    ctx.fillStyle = p.color
    ctx.fillRect(toX(at) - 1.2, barY - 6, 2.4, 18)
  }

  if (game.phase === 'play') {
    const mx = toX(game.marker)
    ctx.fillStyle = PAL.fireDeep
    ctx.beginPath()
    ctx.moveTo(mx, barY - 12)
    ctx.lineTo(mx + 5, barY - 20)
    ctx.lineTo(mx - 5, barY - 20)
    ctx.closePath()
    ctx.fill()
  }

  const n = game.players.length
  game.players.forEach((p, i) => {
    const x = ((i + 1) / (n + 1)) * MG_VIEW_W
    pawn(ctx, p, x, BEACH, frame, game.stops.has(p.slot) ? 'idle' : 'walk')
  })
  if (game.phase === 'play') banner(ctx, `${Math.ceil(game.left / 60)}`, CLOCK_Y, 16)
}

function drawObstacles(ctx: CanvasRenderingContext2D, obs: { x: number; y: number; rx: number; ry: number }[]): void {
  for (const o of obs) {
    softShadow(ctx, o.x, o.y + o.ry * 0.6, o.rx, o.ry * 0.5, 0.3)
    facet(
      ctx,
      [
        { x: o.x - o.rx, y: o.y + o.ry },
        { x: o.x - o.rx * 0.62, y: o.y - o.ry * 0.75 },
        { x: o.x + o.rx * 0.2, y: o.y - o.ry },
        { x: o.x + o.rx, y: o.y + o.ry * 0.4 },
      ],
      PAL.rockShade,
      { dark: 0.3, light: 0.12 },
    )
  }
}

function drawZombie(ctx: CanvasRenderingContext2D, game: AnyMinigame, frame: number): void {
  if (game.id !== 'zombie') return
  drawObstacles(ctx, game.obstacles)

  for (const z of game.shamblers) {
    softShadow(ctx, z.x, z.y + 2, 8, 3, 0.3)
    facet(
      ctx,
      [
        { x: z.x - 7, y: z.y },
        { x: z.x - 5, y: z.y - 18 },
        { x: z.x + 5, y: z.y - 18 },
        { x: z.x + 7, y: z.y },
      ],
      '#5e7a46',
      { dark: 0.32, light: 0.1 },
    )
    ellipse(ctx, z.x - 2.4, z.y - 13, 1.5, 1.5, '#d8e86a')
    ellipse(ctx, z.x + 2.4, z.y - 13, 1.5, 1.5, '#d8e86a')
  }

  const order = [...game.players].sort((a, b) => (game.pos.get(a.slot)?.y ?? 0) - (game.pos.get(b.slot)?.y ?? 0))
  for (const p of order) {
    const at = game.pos.get(p.slot)
    if (!at) continue
    const turned = game.isZombie(p.slot)
    if (!turned) {
      // A lantern each, so the humans are the light in a dark field.
      const glow = ctx.createRadialGradient(at.x, at.y - 8, 2, at.x, at.y - 8, 46)
      glow.addColorStop(0, withAlpha('#ffe3a0', 0.35))
      glow.addColorStop(1, withAlpha('#ffe3a0', 0))
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(at.x, at.y - 8, 46, 0, Math.PI * 2)
      ctx.fill()
    }
    pawn(ctx, p, at.x, at.y, frame, turned ? 'hurt' : 'walk')
    if (turned) {
      ctx.save()
      ctx.globalAlpha = 0.42
      ellipse(ctx, at.x, at.y - 13, 10, 12, '#5e7a46')
      ctx.restore()
    }
  }
  if (game.phase === 'play') banner(ctx, `${Math.ceil(game.left / 60)}`, CLOCK_Y, 16)
}

function drawJumbo(ctx: CanvasRenderingContext2D, game: AnyMinigame, frame: number): void {
  if (game.id !== 'jumbo') return

  // The rope, drawn along whichever axis this pass is running on.
  ctx.save()
  ctx.strokeStyle = '#c9553a'
  ctx.lineWidth = 3.4
  ctx.beginPath()
  if (game.axis === 'x') {
    ctx.moveTo(game.ropeAt, FIELD.y0 - 4)
    ctx.quadraticCurveTo(game.ropeAt + 6, (FIELD.y0 + FIELD.y1) / 2, game.ropeAt, FIELD.y1 + 4)
  } else {
    ctx.moveTo(FIELD.x0 - 4, game.ropeAt)
    ctx.quadraticCurveTo((FIELD.x0 + FIELD.x1) / 2, game.ropeAt + 6, FIELD.x1 + 4, game.ropeAt)
  }
  ctx.stroke()
  ctx.restore()

  const order = [...game.players].sort((a, b) => (game.pos.get(a.slot)?.y ?? 0) - (game.pos.get(b.slot)?.y ?? 0))
  for (const p of order) {
    const at = game.pos.get(p.slot)
    if (!at) continue
    const air = game.air.get(p.slot) ?? 0
    const lift = air > 0 ? Math.sin((1 - air / JUMBO_AIR) * Math.PI) * 22 : 0
    if (lift > 0) softShadow(ctx, at.x, at.y + 2, 6, 2.2, 0.2)
    pawn(ctx, p, at.x, at.y - lift, frame, p.out ? 'hurt' : air > 0 ? 'jump' : 'walk')
    if (p.out) hudText(ctx, 'out', at.x, at.y - 40, { size: 8, align: 'center', color: HUD.bad })
  }
  if (game.phase === 'play') banner(ctx, `${Math.ceil(game.left / 60)}`, CLOCK_Y, 16)
}

function drawSaucer(ctx: CanvasRenderingContext2D, game: AnyMinigame, frame: number): void {
  if (game.id !== 'saucer') return

  // The lens: crosshair and rings, so "centre" is somewhere you can aim at.
  ctx.save()
  ctx.strokeStyle = withAlpha(PAL.cream, 0.5)
  ctx.lineWidth = 1
  for (const r of [18, 36, 58]) {
    ctx.beginPath()
    ctx.arc(LENS.x, LENS.y, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(LENS.x - 68, LENS.y)
  ctx.lineTo(LENS.x + 68, LENS.y)
  ctx.moveTo(LENS.x, LENS.y - 68)
  ctx.lineTo(LENS.x, LENS.y + 68)
  ctx.stroke()
  ctx.restore()

  // Everybody's photograph, so you can see who framed it best.
  for (const p of game.players) {
    const shot = game.shots.get(p.slot)
    if (!shot) continue
    ctx.save()
    ctx.globalAlpha = 0.85
    ctx.strokeStyle = p.color
    ctx.lineWidth = 1.4
    ctx.strokeRect(shot.x - 9, shot.y - 6, 18, 12)
    ctx.restore()
  }

  const s = game.saucer
  softShadow(ctx, s.x, FIELD.y1 - 6, 14, 4, 0.16)
  ellipse(ctx, s.x, s.y + 2, 17, 5, '#7f8fa6')
  ellipse(ctx, s.x, s.y, 12, 6.5, '#aebccd')
  ellipse(ctx, s.x, s.y - 4, 7, 5, withAlpha('#d8ecf6', 0.95))
  for (let i = -1; i <= 1; i++) {
    ctx.save()
    ctx.globalAlpha = 0.5 + Math.sin(frame * 0.3 + i) * 0.3
    ellipse(ctx, s.x + i * 8, s.y + 5, 1.8, 1.8, '#ffe3a0')
    ctx.restore()
  }

  const n = game.players.length
  game.players.forEach((p, i) => {
    const x = FIELD.x0 + ((i + 1) / (n + 1)) * (FIELD.x1 - FIELD.x0)
    pawn(ctx, p, x, FIELD.y1 - 6, frame, game.shots.has(p.slot) ? 'idle' : 'walk')
  })
  if (game.phase === 'play') banner(ctx, `${Math.ceil(game.left / 60)}`, CLOCK_Y, 16)
}

function drawChipper(ctx: CanvasRenderingContext2D, game: AnyMinigame, frame: number): void {
  if (game.id !== 'chipper') return
  const n = game.players.length
  const laneW = (FIELD.x1 - FIELD.x0) / n
  const groundY = FIELD.y1 - 16
  const holeY = FIELD.y0 + 26

  game.players.forEach((p, i) => {
    const cx = FIELD.x0 + laneW * (i + 0.5)

    // The green, and the hole at the top of it.
    ellipse(ctx, cx, holeY, 9, 4, '#2f2a22')
    ellipse(ctx, cx, holeY - 1, 7.5, 3, '#1d1a15')

    // The power gauge, with the window that actually drops.
    const gx = cx - 7
    const gy = holeY + 16
    const gh = groundY - 26 - gy
    hudPlate(ctx, gx, gy, 14, gh, { radius: 4, fill: 'rgba(28, 26, 22, 0.5)' })
    const bandLo = gy + gh * (1 - (CHIP_TARGET + CHIP_IN_RANGE))
    const bandHi = gy + gh * (1 - (CHIP_TARGET - CHIP_IN_RANGE))
    ctx.fillStyle = withAlpha('#8fae6a', 0.6)
    ctx.fillRect(gx + 1, bandLo, 12, bandHi - bandLo)
    const perfLo = gy + gh * (1 - (CHIP_TARGET + CHIP_PERFECT))
    const perfHi = gy + gh * (1 - (CHIP_TARGET - CHIP_PERFECT))
    ctx.fillStyle = withAlpha('#f0c449', 0.95)
    ctx.fillRect(gx + 1, perfLo, 12, Math.max(1.6, perfHi - perfLo))

    const charge = game.charge.get(p.slot)
    if (charge !== undefined) {
      ctx.fillStyle = p.color
      ctx.fillRect(gx + 1, gy + gh * (1 - charge), 12, 2.4)
    }

    // A ball in flight, arcing toward the hole and either dropping or not.
    const ball = game.balls.get(p.slot)
    if (ball) {
      const t = Math.min(1, ball.t / 34)
      const reach = ball.result === 'miss' ? (ball.power > CHIP_TARGET ? 1.25 : 0.6) : 1
      const y = groundY - 30 + (holeY - (groundY - 30)) * t * reach
      const arc = Math.sin(t * Math.PI) * 16
      ellipse(ctx, cx, y - arc, 3, 3, PAL.white)
    }

    const winding = charge !== undefined
    pawn(ctx, p, cx, groundY, frame, winding ? 'brace' : 'idle')
    hudText(ctx, `${p.score}`, cx, groundY + 2, { size: 9, align: 'center', color: HUD.ink })
  })
  if (game.phase === 'play') banner(ctx, `${Math.ceil(game.left / 60)}`, CLOCK_Y, 16)
}

function drawMaze(ctx: CanvasRenderingContext2D, game: AnyMinigame, frame: number): void {
  if (game.id !== 'maze') return
  for (let cy = 0; cy < MAZE_ROWS; cy++) {
    for (let cx = 0; cx < MAZE_COLS; cx++) {
      if (!game.solidAt(cx, cy)) continue
      const x = FIELD.x0 + cx * MAZE_CW
      const y = FIELD.y0 + cy * MAZE_CH
      ctx.fillStyle = PAL.pineShade
      ctx.fillRect(x, y, MAZE_CW + 0.6, MAZE_CH + 0.6)
      ctx.fillStyle = withAlpha(PAL.pine, 0.85)
      ctx.fillRect(x, y, MAZE_CW + 0.6, MAZE_CH * 0.55)
    }
  }

  // The two pads that turn your controls.
  for (const pad of game.pads) {
    const c = game.cellCentre(pad.cx, pad.cy)
    ctx.save()
    ctx.globalAlpha = 0.55 + Math.sin(frame * 0.08) * 0.2
    ellipse(ctx, c.x, c.y, MAZE_CW * 0.44, MAZE_CH * 0.44, '#a678c8')
    ctx.restore()
    ctx.strokeStyle = withAlpha(PAL.cream, 0.8)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(c.x, c.y, MAZE_CW * 0.26, 0.4, 4.6)
    ctx.stroke()
  }

  const goal = game.goal
  const gc = game.cellCentre(goal.cx, goal.cy)
  ctx.save()
  ctx.globalAlpha = 0.55 + Math.sin(frame * 0.1) * 0.25
  ellipse(ctx, gc.x, gc.y, MAZE_CW * 0.46, MAZE_CH * 0.46, '#f0c449')
  ctx.restore()

  for (const p of game.players) {
    const at = game.pos.get(p.slot)
    if (!at) continue
    ctx.save()
    if (game.home.has(p.slot)) ctx.globalAlpha = 0.4
    ellipse(ctx, at.x, at.y, 4.2, 4.2, p.color)
    ellipse(ctx, at.x - 1, at.y - 1.2, 1.8, 1.8, shade(p.color, 0.34))
    ctx.restore()
    // A ring the moment a pad turns you, so you know why nothing works.
    const spunAt = game.spun.get(p.slot) ?? -999
    if (frame - spunAt < 45) {
      ctx.save()
      ctx.globalAlpha = 1 - (frame - spunAt) / 45
      ctx.strokeStyle = '#a678c8'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(at.x, at.y, 6 + (frame - spunAt) * 0.3, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }
  if (game.phase === 'play') banner(ctx, `${Math.ceil(game.left / 60)}`, CLOCK_Y, 16)
}

// ------------------------------------------------------------------- entry

const ROAMING = new Set(['zombie', 'jumbo', 'saucer', 'chipper', 'maze'])

export function renderMinigame(
  ctx: CanvasRenderingContext2D,
  game: AnyMinigame,
  frame: number,
  viewerSlot: number | null,
): void {
  if (game.id === 'zombie') nightBackdrop(ctx, frame)
  else if (ROAMING.has(game.id)) fieldBackdrop(ctx, frame)
  else backdrop(ctx, frame)

  if (game.id === 'reaction') drawReaction(ctx, game, frame)
  else if (game.id === 'masher') drawMasher(ctx, game, frame)
  else if (game.id === 'dodge') drawDodge(ctx, game, frame)
  else if (game.id === 'precision') drawPrecision(ctx, game, frame)
  else if (game.id === 'zombie') drawZombie(ctx, game, frame)
  else if (game.id === 'jumbo') drawJumbo(ctx, game, frame)
  else if (game.id === 'saucer') drawSaucer(ctx, game, frame)
  else if (game.id === 'chipper') drawChipper(ctx, game, frame)
  else drawMaze(ctx, game, frame)

  // Sized to whichever line is longer - the instructions are usually the wide
  // one, and sizing to the title alone leaves them hanging off the plate.
  const def = game.def
  const plateW =
    Math.max(textWidth(ctx, def.name, { size: 11, weight: 700 }), textWidth(ctx, def.how, { size: 7, weight: 700 })) + 20
  hudPlate(ctx, 8, 8, plateW, 32)
  hudText(ctx, def.name, 18, 13, { size: 11, weight: 700, color: HUD.ink })
  hudText(ctx, def.how, 18, 26, { size: 7, color: HUD.dim })

  scoreboard(ctx, game, viewerSlot)

  if (game.phase === 'intro') {
    const n = Math.ceil(game.timer / 50)
    banner(ctx, def.brief, MG_VIEW_H / 2 - 40, 11)
    banner(ctx, n > 0 ? `${n}` : 'GO', MG_VIEW_H / 2 - 12, 24)
  } else if (game.phase === 'done') {
    banner(ctx, game.message || 'Time', MG_VIEW_H / 2 - 20, 16)
  } else if (game.message && game.id !== 'reaction') {
    banner(ctx, game.message, MG_VIEW_H - 40, 10)
  }
}
