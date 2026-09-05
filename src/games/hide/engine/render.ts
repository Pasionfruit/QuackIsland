/**
 * Hide & Seek's first-person view: a small ray-casted renderer in the
 * Wolfenstein mould, chosen over a 3D library because the whole engine is
 * already "canvas plus a bit of trig" and this keeps it that way.
 *
 * One ray per screen column marches through the grid with the standard DDA
 * step - cheap enough in JS to run at 480 columns and 60fps without a second
 * thought - and every other player, and the star, are drawn afterward as
 * billboards: flat sprites that face the camera and are only as tall as their
 * distance says they should be.
 */
import { clamp, ellipse } from '../../../lib/draw'
import { drawText } from '../../../lib/text'
import type { HideEngine } from './engine'
import { FEET_PER_CELL, VIEW_H, VIEW_W, type HidePlayer } from './types'
import { MAP_SIZE } from './maps'

const FOV = Math.PI / 2.6
const MAX_DIST = 24
const PROJ = VIEW_W / 2 / Math.tan(FOV / 2)
const COLS = 160
const COL_W = VIEW_W / COLS

interface Hit {
  dist: number
  side: 0 | 1
  mapX: number
  mapY: number
}

/** Classic grid DDA: steps cell-by-cell along the ray until it hits a wall. */
function castRay(rows: string[], px: number, py: number, angle: number): Hit {
  const dirX = Math.cos(angle)
  const dirY = Math.sin(angle)
  let mapX = Math.floor(px)
  let mapY = Math.floor(py)
  const deltaDistX = dirX === 0 ? 1e30 : Math.abs(1 / dirX)
  const deltaDistY = dirY === 0 ? 1e30 : Math.abs(1 / dirY)
  let stepX: number
  let stepY: number
  let sideDistX: number
  let sideDistY: number
  if (dirX < 0) {
    stepX = -1
    sideDistX = (px - mapX) * deltaDistX
  } else {
    stepX = 1
    sideDistX = (mapX + 1 - px) * deltaDistX
  }
  if (dirY < 0) {
    stepY = -1
    sideDistY = (py - mapY) * deltaDistY
  } else {
    stepY = 1
    sideDistY = (mapY + 1 - py) * deltaDistY
  }
  let side: 0 | 1 = 0
  for (let i = 0; i < 128; i++) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX
      mapX += stepX
      side = 0
    } else {
      sideDistY += deltaDistY
      mapY += stepY
      side = 1
    }
    if (mapX < 0 || mapY < 0 || mapY >= rows.length || mapX >= rows[mapY].length) {
      return { dist: MAX_DIST, side, mapX, mapY }
    }
    if (rows[mapY][mapX] === '#') {
      const dist = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY
      return { dist: Math.min(dist, MAX_DIST), side, mapX, mapY }
    }
  }
  return { dist: MAX_DIST, side, mapX, mapY }
}

/** Which section a cell belongs to, for its wall/floor/ceiling colours. */
function sectionAt(eng: HideEngine, x: number, y: number) {
  return (
    eng.map.sections.find((s) => x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1) ?? eng.map.sections[0]
  )
}

function shadeHex(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * factor)
  const g = Math.round(((n >> 8) & 255) * factor)
  const b = Math.round((n & 255) * factor)
  return `rgb(${r},${g},${b})`
}

const depthBuf = new Float64Array(COLS)

export function renderFirstPerson(ctx: CanvasRenderingContext2D, eng: HideEngine, viewer: HidePlayer): void {
  // Floor and ceiling read from whichever section the viewer is standing in -
  // full floor-casting is not worth the frame budget at this resolution, and
  // the section colour alone still sells "this room feels different."
  const here = sectionAt(eng, viewer.x, viewer.y)
  ctx.fillStyle = here.ceiling
  ctx.fillRect(0, 0, VIEW_W, VIEW_H / 2)
  ctx.fillStyle = here.floor
  ctx.fillRect(0, VIEW_H / 2, VIEW_W, VIEW_H / 2)

  for (let col = 0; col < COLS; col++) {
    const rayAngle = viewer.angle - FOV / 2 + (col / COLS) * FOV
    const hit = castRay(eng.map.rows, viewer.x, viewer.y, rayAngle)
    const corrected = hit.dist * Math.cos(rayAngle - viewer.angle)
    depthBuf[col] = corrected
    const wallH = clamp(PROJ / Math.max(0.05, corrected), 1, VIEW_H * 3)
    const sec = sectionAt(eng, hit.mapX, hit.mapY)
    const shade = clamp(1 - corrected / MAX_DIST, 0.18, 1) * (hit.side === 1 ? 0.75 : 1)
    ctx.fillStyle = shadeHex(sec.wall, shade)
    ctx.fillRect(col * COL_W, (VIEW_H - wallH) / 2, COL_W + 0.6, wallH)
  }

  // Billboards: the star, then every other player, farthest first.
  type Sprite = { x: number; y: number; draw: (dist: number, screenX: number, size: number) => void }
  const sprites: Sprite[] = []

  if (eng.star.active) {
    sprites.push({
      x: eng.star.x,
      y: eng.star.y,
      draw: (dist, sx, size) => {
        const bob = Math.sin(eng.frame * 0.12) * size * 0.08
        drawStar(ctx, sx, VIEW_H / 2 + bob, size * 0.5)
        void dist
      },
    })
  }

  for (const p of eng.players) {
    if (p === viewer) continue
    sprites.push({
      x: p.x,
      y: p.y,
      draw: (dist, sx, size) => {
        drawPlayerSprite(ctx, sx, VIEW_H / 2, size, p)
        void dist
      },
    })
  }

  const withDist = sprites
    .map((s) => {
      const dx = s.x - viewer.x
      const dy = s.y - viewer.y
      const dist = Math.hypot(dx, dy)
      const angleTo = Math.atan2(dy, dx) - viewer.angle
      const norm = Math.atan2(Math.sin(angleTo), Math.cos(angleTo))
      return { ...s, dist, norm }
    })
    .filter((s) => Math.abs(s.norm) < FOV * 0.75 && s.dist > 0.15)
    .sort((a, b) => b.dist - a.dist)

  for (const s of withDist) {
    const screenX = VIEW_W / 2 + Math.tan(s.norm) * PROJ
    const col = Math.floor(screenX / COL_W)
    if (col < -4 || col > COLS + 4) continue
    const behindWall = depthBuf[clamp(col, 0, COLS - 1)] < s.dist - 0.2
    if (behindWall) continue
    const size = clamp(PROJ / Math.max(0.3, s.dist) / 3.2, 4, VIEW_H)
    s.draw(s.dist, screenX, size)
  }
}

function drawPlayerSprite(ctx: CanvasRenderingContext2D, x: number, groundY: number, size: number, p: HidePlayer): void {
  const glow = p.invincibleFrames > 0 && Math.floor(p.invincibleFrames / 6) % 2 === 0
  const color = glow ? '#f6e07a' : p.role === 'runner' ? '#e0794f' : '#4f8fbf'
  const h = size
  const w = size * 0.6
  const top = groundY + size * 0.3 - h
  ctx.fillStyle = 'rgba(20,18,15,0.35)'
  ellipse(ctx, x, groundY + size * 0.32, w * 0.5, w * 0.16, 'rgba(20,18,15,0.35)')
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, top + h * 0.62, w / 2, h * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, top + h * 0.16, h * 0.16, 0, Math.PI * 2)
  ctx.fill()
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#ffe066'
  ctx.strokeStyle = '#a87c1f'
  ctx.lineWidth = Math.max(1, r * 0.08)
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const rr = i % 2 === 0 ? r : r * 0.42
    const px = Math.cos(a) * rr
    const py = Math.sin(a) * rr
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

// ------------------------------------------------------------------- HUD

/** Runner-only: everyone's position, seen from above. Nobody else gets this. */
export function drawMinimap(ctx: CanvasRenderingContext2D, eng: HideEngine): void {
  const size = 108
  const x0 = VIEW_W - size - 10
  const y0 = 10
  const scale = size / MAP_SIZE

  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, y0, size, size)
  ctx.clip()
  ctx.fillStyle = 'rgba(20, 18, 15, 0.78)'
  ctx.fillRect(x0, y0, size, size)

  for (const sec of eng.map.sections) {
    ctx.fillStyle = sec.wallDark
    for (let y = sec.y0; y <= sec.y1; y++) {
      for (let x = sec.x0; x <= sec.x1; x++) {
        if (eng.map.rows[y][x] === '#') {
          ctx.fillRect(x0 + x * scale, y0 + y * scale, scale + 0.5, scale + 0.5)
        }
      }
    }
  }

  if (eng.star.active) {
    ctx.fillStyle = '#ffe066'
    ctx.beginPath()
    ctx.arc(x0 + eng.star.x * scale, y0 + eng.star.y * scale, 2.4, 0, Math.PI * 2)
    ctx.fill()
  }

  for (const p of eng.players) {
    const color = p.role === 'runner' ? '#e0794f' : '#4f8fbf'
    const px = x0 + p.x * scale
    const py = y0 + p.y * scale
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(px, py, p.role === 'runner' ? 3 : 2.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(px + Math.cos(p.angle) * 4, py + Math.sin(p.angle) * 4)
    ctx.stroke()
  }
  ctx.restore()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.strokeRect(x0, y0, size, size)
}

function fmtClock(frames: number): string {
  const secs = Math.max(0, Math.ceil(frames / 60))
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function drawHud(ctx: CanvasRenderingContext2D, eng: HideEngine, viewer: HidePlayer): void {
  drawText(ctx, fmtClock(eng.clock), VIEW_W / 2, 6, '#fff6e2', {
    size: 16,
    align: 'center',
    weight: 800,
  })
  drawText(ctx, viewer.role === 'runner' ? 'YOU ARE THE RUNNER' : 'CHASE THE RUNNER', 10, 8, '#fff6e2', {
    size: 8,
    weight: 700,
  })

  if (viewer.invincibleFrames > 0) {
    drawText(ctx, `STAR POWER ${Math.ceil(viewer.invincibleFrames / 60)}s`, VIEW_W / 2, 24, '#ffe066', {
      size: 9,
      align: 'center',
      weight: 800,
    })
  } else if (!eng.star.spent) {
    const secsToSpawn = Math.max(0, Math.ceil(eng.clock / 60) - 150)
    if (!eng.star.active && secsToSpawn > 0 && secsToSpawn <= 180) {
      // Only worth mentioning once it is not ages away.
    } else if (eng.star.active) {
      drawText(ctx, 'A STAR HAS APPEARED', VIEW_W / 2, 24, '#ffe066', {
        size: 9,
        align: 'center',
        weight: 800,
      })
    }
  }

  if (viewer.role === 'runner') {
    drawMinimap(ctx, eng)
    return
  }

  const feet = eng.feetToRunner(viewer.slot)
  if (feet === null) return
  const barW = 160
  const barX = (VIEW_W - barW) / 2
  const barY = VIEW_H - 22
  const maxFeet = MAP_SIZE * FEET_PER_CELL
  const closeness = clamp(1 - feet / maxFeet, 0, 1)
  ctx.fillStyle = 'rgba(20,18,15,0.55)'
  ctx.fillRect(barX, barY, barW, 10)
  const fillColor = closeness > 0.75 ? '#d9534f' : closeness > 0.45 ? '#e8c05f' : '#7fb069'
  ctx.fillStyle = fillColor
  ctx.fillRect(barX, barY, barW * closeness, 10)
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.strokeRect(barX, barY, barW, 10)
  drawText(ctx, `${feet} ft to runner`, VIEW_W / 2, barY - 12, '#fff6e2', {
    size: 9,
    align: 'center',
    weight: 700,
  })
}

export function drawEndCard(ctx: CanvasRenderingContext2D, eng: HideEngine, viewer: HidePlayer): void {
  ctx.fillStyle = 'rgba(20, 18, 15, 0.68)'
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  const won = (eng.winner === 'runner') === (viewer.role === 'runner')
  const title = eng.winner === 'runner' ? 'THE RUNNER MADE IT' : 'THE RUNNER WAS CAUGHT'
  drawText(ctx, title, VIEW_W / 2, 108, '#fff6e2', { size: 22, align: 'center', weight: 800 })
  drawText(ctx, won ? 'You win.' : 'Better luck next chase.', VIEW_W / 2, 138, '#cfc6b4', {
    size: 12,
    align: 'center',
  })
}
