/**
 * Draws the Party Parade board.
 *
 * The loop is 180 spaces across a world far bigger than the view, so unlike
 * the other games here this one has a camera: it follows whoever is taking
 * their turn. A minimap in the corner keeps the whole circuit on screen so
 * following the action never costs you the shape of the board.
 *
 * Draw order is back to front: sea, islands, the bridges between them, the
 * loop on top of both, the cast standing on it, then the chrome on top in
 * screen space.
 */
import { drawAvatar } from '../../art/avatar'
import { PAL } from '../../art/palette'
import { bush, pine, rock } from '../../art/props'
import { flag, water } from '../../art/scenes'
import { domePoly, ellipse, facet, noise, shade, softShadow, withAlpha, type Pt } from '../../lib/draw'
import { HUD, hudPlate, hudText, nameTag } from '../../lib/hud'
import {
  BOARD_TILES,
  ISLANDS,
  VIEW_H,
  VIEW_W,
  WORLD_H,
  WORLD_W,
  bridgeSpans,
  type Island,
  type TileKind,
} from './engine/board'
import { PARADE_CAST, type PPPlayer, type PartyParadeEngine } from './engine/engine'

/** What each kind of space looks like. The panel repeats this as a legend. */
export const TILE_COLORS: Record<TileKind, string> = {
  start: PAL.cream,
  plain: '#7f9c62',
  good: '#e8c05f',
  bad: '#8d7aa0',
  hostile: PAL.fireDeep,
}

export const TILE_LABELS: Record<TileKind, string> = {
  start: 'Start',
  plain: 'Open road',
  good: 'Good news',
  bad: 'Bad news',
  hostile: 'Actively hostile',
}

const SAND = shade(PAL.dirt, 0.42)
const SPANS = bridgeSpans()

export interface Camera {
  x: number
  y: number
  zoom: number
}

// ---------------------------------------------------------------- geometry

function scalePoly(pts: Pt[], cx: number, cy: number, k: number): Pt[] {
  return pts.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }))
}

function shiftPoly(pts: Pt[], dx: number, dy: number): Pt[] {
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

function nearPath(x: number, y: number, pad: number): boolean {
  for (const t of BOARD_TILES) {
    if (Math.abs(t.x - x) < pad && Math.abs(t.y - y) < pad) return true
  }
  return false
}

/** Where a pawn is standing or walking, in world units. */
export function pawnSpot(eng: PartyParadeEngine, p: PPPlayer): { x: number; y: number; hop: number; facing: 1 | -1 } {
  const n = BOARD_TILES.length
  const abs = eng.displaySteps(p)
  const i0 = Math.floor(abs)
  const f = abs - i0
  const a = BOARD_TILES[((i0 % n) + n) % n]
  const b = BOARD_TILES[((((i0 + 1) % n) + n) % n)]
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    // A little arc over each space, so a walk reads as hopping rather than sliding.
    hop: eng.isWalking(p.slot) ? Math.sin(f * Math.PI) * 7 : 0,
    facing: b.x >= a.x ? 1 : -1,
  }
}

// ----------------------------------------------------------------- islands

function drawIsland(ctx: CanvasRenderingContext2D, isl: Island): void {
  const top = domePoly(isl.cx, isl.cy, isl.rx, isl.ry, 13, isl.seed)

  ctx.save()
  ctx.globalAlpha = 0.16
  ellipse(ctx, isl.cx, isl.cy + isl.ry * 0.44, isl.rx * 1.06, isl.ry * 0.86, '#24201a')
  ctx.restore()

  facet(ctx, shiftPoly(top, 0, isl.ry * 0.26), PAL.dirtShade, { dark: 0.3, light: 0.06, seed: isl.seed })
  facet(ctx, scalePoly(top, isl.cx, isl.cy, 1.06), SAND, { dark: 0.22, light: 0.12, seed: isl.seed + 7 })
  facet(ctx, top, PAL.grass, { dark: 0.2, light: 0.16, seed: isl.seed + 1 })

  drawIslandScatter(ctx, isl)
}

/**
 * Trees and rocks, placed from the island's seed rather than hand-listed -
 * stable between reloads and cheap to author for nine islands. The path runs
 * straight over each island, so anything that would land on it is skipped.
 */
function drawIslandScatter(ctx: CanvasRenderingContext2D, isl: Island): void {
  const spots: Pt[] = []
  for (let i = 0; i < 16; i++) {
    const s = isl.seed * 13.1 + i * 2.7
    const a = noise(s) * Math.PI * 2
    const r = 0.25 + noise(s + 40) * 0.55
    const x = isl.cx + Math.cos(a) * isl.rx * r
    const y = isl.cy + Math.sin(a) * isl.ry * r
    if (nearPath(x, y, 20)) continue
    if (spots.some((q) => Math.abs(q.x - x) < 26 && Math.abs(q.y - y) < 16)) continue
    spots.push({ x, y })
    if (spots.length > 6) break
    const pick = noise(s + 100)
    if (pick < 0.45) pine(ctx, x, y, 22 + noise(s + 3) * 12)
    else if (pick < 0.74) rock(ctx, x, y, 11 + noise(s + 5) * 7)
    else bush(ctx, x, y, 14 + noise(s + 9) * 7)
  }
}

// ----------------------------------------------------------------- bridges

/** One bridge per run of spaces out over water, so a deck always lands on the path. */
function drawBridge(ctx: CanvasRenderingContext2D, span: number[]): void {
  const n = BOARD_TILES.length
  const first = span[0]
  const last = span[span.length - 1]
  // Reach one space onto the land at each end so the deck meets the shore.
  const pts: Pt[] = [BOARD_TILES[(first - 1 + n) % n], ...span.map((i) => BOARD_TILES[i]), BOARD_TILES[(last + 1) % n]]
  const width = 17

  ctx.save()
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'round'

  ctx.globalAlpha = 0.18
  ctx.strokeStyle = '#24201a'
  ctx.lineWidth = width + 3
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + 4) : ctx.moveTo(p.x, p.y + 4)))
  ctx.stroke()
  ctx.globalAlpha = 1

  ctx.strokeStyle = PAL.wood
  ctx.lineWidth = width
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.stroke()

  ctx.strokeStyle = withAlpha(PAL.woodShade, 0.5)
  ctx.lineWidth = width
  ctx.setLineDash([3, 7])
  ctx.stroke()
  ctx.setLineDash([])

  // Rails.
  ctx.strokeStyle = shade(PAL.wood, -0.24)
  ctx.lineWidth = 1.6
  for (const side of [-1, 1]) {
    ctx.beginPath()
    pts.forEach((p, i) => {
      const q = pts[Math.min(i + 1, pts.length - 1)]
      const r = pts[Math.max(i - 1, 0)]
      const dx = q.x - r.x
      const dy = q.y - r.y
      const d = Math.hypot(dx, dy) || 1
      const ox = (-dy / d) * (width / 2) * side
      const oy = (dx / d) * (width / 2) * side
      if (i) ctx.lineTo(p.x + ox, p.y + oy)
      else ctx.moveTo(p.x + ox, p.y + oy)
    })
    ctx.stroke()
  }
  ctx.restore()
}

// -------------------------------------------------------------------- path

function drawPath(ctx: CanvasRenderingContext2D, frame: number): void {
  ctx.save()
  ctx.strokeStyle = withAlpha('#5a4c38', 0.24)
  ctx.lineWidth = 12
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  BOARD_TILES.forEach((t, i) => (i ? ctx.lineTo(t.x, t.y) : ctx.moveTo(t.x, t.y)))
  ctx.closePath()
  ctx.stroke()
  ctx.restore()

  for (const t of BOARD_TILES) {
    const c = TILE_COLORS[t.kind]
    const big = t.kind === 'start'
    const rx = big ? 8 : 6.2
    const ry = big ? 5.2 : 4
    ellipse(ctx, t.x, t.y + 1.8, rx, ry, shade(c, -0.34))
    ellipse(ctx, t.x, t.y, rx, ry, c)
    ellipse(ctx, t.x, t.y - 0.7, rx * 0.66, ry * 0.6, shade(c, 0.22))
  }

  const s = BOARD_TILES[0]
  flag(ctx, s.x + 2, s.y - 3, 38, '#e8703a', frame)
}

// ------------------------------------------------------------------- world

export function drawBoard(ctx: CanvasRenderingContext2D, frame: number, cam: Camera): void {
  // Open sea, painted in screen space - with the camera roaming a board this
  // wide there is no fixed horizon to anchor a sky to.
  water(ctx, VIEW_W, VIEW_H, 0, frame)

  ctx.save()
  ctx.translate(VIEW_W / 2, VIEW_H / 2)
  ctx.scale(cam.zoom, cam.zoom)
  ctx.translate(-cam.x, -cam.y)

  for (const isl of ISLANDS) drawIsland(ctx, isl)
  for (const span of SPANS) drawBridge(ctx, span)
  drawPath(ctx, frame)

  ctx.restore()
}

// ------------------------------------------------------------------- pawns

function pawnOffset(i: number, total: number): Pt {
  if (total <= 1) return { x: 0, y: 0 }
  const spread = 7 + total * 2.1
  const a = (i / total) * Math.PI * 2 - Math.PI / 2
  return { x: Math.cos(a) * spread, y: Math.sin(a) * spread * 0.5 }
}

export function drawPawns(
  ctx: CanvasRenderingContext2D,
  eng: PartyParadeEngine,
  frame: number,
  viewerSlot: number | null,
  cam: Camera,
): void {
  ctx.save()
  ctx.translate(VIEW_W / 2, VIEW_H / 2)
  ctx.scale(cam.zoom, cam.zoom)
  ctx.translate(-cam.x, -cam.y)

  // Anyone standing still on the same space gets fanned out so nobody is
  // completely hidden; whoever is mid-walk stands on their own.
  const parked = new Map<number, PPPlayer[]>()
  for (const p of eng.players) {
    if (eng.isWalking(p.slot)) continue
    const list = parked.get(p.tileIndex)
    if (list) list.push(p)
    else parked.set(p.tileIndex, [p])
  }

  const placed: { p: PPPlayer; x: number; y: number; hop: number; facing: 1 | -1; crowd: number }[] = []
  for (const p of eng.players) {
    const spot = pawnSpot(eng, p)
    const group = parked.get(p.tileIndex)
    const walking = eng.isWalking(p.slot)
    let off: Pt = { x: 0, y: 0 }
    let crowd = 1
    if (!walking && group) {
      crowd = group.length
      off = pawnOffset(group.indexOf(p), crowd)
    }
    placed.push({ p, x: spot.x + off.x, y: spot.y + off.y, hop: spot.hop, facing: spot.facing, crowd })
  }

  placed.sort((a, b) => a.y - b.y)

  const active = eng.current?.slot
  for (const { p, x, y, hop, facing, crowd } of placed) {
    const char = PARADE_CAST[p.castIndex % PARADE_CAST.length]
    const walking = eng.isWalking(p.slot)
    softShadow(ctx, x, y + 1.5, 6, 2.2, 0.24)
    ctx.save()
    ctx.globalAlpha = 0.85
    ellipse(ctx, x, y + 1, 6.4, 2.6, withAlpha(p.color, 0.55))
    ellipse(ctx, x, y + 1, 4.6, 1.7, withAlpha(p.color, 0.25))
    ctx.restore()

    // A ring of light under whoever is up, so the turn is readable on the
    // board and not only in the banner.
    if (p.slot === active && !walking) {
      const pulse = 0.5 + Math.sin(frame * 0.12) * 0.2
      ctx.save()
      ctx.globalAlpha = pulse
      ctx.strokeStyle = p.color
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.ellipse(x, y + 1, 10, 4.2, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    drawAvatar(ctx, char.def, x, y - hop, {
      facing,
      height: 23,
      pose: walking ? 'walk' : 'idle',
      phase: frame + p.slot * 17,
    })

    const self = p.slot === viewerSlot
    if (self || crowd <= 3 || walking) nameTag(ctx, p.name, x, y - hop - 30, p.color, { self })
  }

  ctx.restore()
}

// --------------------------------------------------------------------- die

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
}

export function drawDie(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  face: number,
  tilt = 0,
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(tilt)
  const h = size / 2
  ctx.save()
  ctx.globalAlpha = 0.3
  ctx.beginPath()
  ctx.roundRect(-h + 1.5, -h + 3, size, size, size * 0.22)
  ctx.fillStyle = '#24201a'
  ctx.fill()
  ctx.restore()

  ctx.beginPath()
  ctx.roundRect(-h, -h, size, size, size * 0.22)
  ctx.fillStyle = PAL.white
  ctx.fill()
  ctx.strokeStyle = withAlpha(PAL.ink, 0.35)
  ctx.lineWidth = 1
  ctx.stroke()

  const step = size * 0.27
  for (const [px, py] of PIPS[face] ?? PIPS[1]) {
    ellipse(ctx, px * step, py * step, size * 0.085, size * 0.085, PAL.ink)
  }
  ctx.restore()
}

// ------------------------------------------------------------------- chrome

/** The whole loop, shrunk into a corner, so following the action never loses the board. */
function drawMinimap(ctx: CanvasRenderingContext2D, eng: PartyParadeEngine, cam: Camera): void {
  const w = 108
  const h = 68
  const x = VIEW_W - w - 8
  const y = VIEW_H - h - 8
  const k = Math.min(w / WORLD_W, h / WORLD_H) * 0.86
  const ox = x + w / 2 - (WORLD_W / 2) * k
  const oy = y + h / 2 - (WORLD_H / 2) * k

  // Nearly opaque: the shared HUD plate is see-through, and a pawn showing
  // through the map behind the loop makes both harder to read.
  hudPlate(ctx, x, y, w, h, { radius: 6, fill: 'rgba(28, 26, 22, 0.86)' })

  ctx.save()
  ctx.strokeStyle = withAlpha(HUD.dim, 0.75)
  ctx.lineWidth = 1.4
  ctx.beginPath()
  BOARD_TILES.forEach((t, i) =>
    i ? ctx.lineTo(ox + t.x * k, oy + t.y * k) : ctx.moveTo(ox + t.x * k, oy + t.y * k),
  )
  ctx.closePath()
  ctx.stroke()

  // What the camera is looking at.
  ctx.strokeStyle = withAlpha(HUD.ink, 0.4)
  ctx.lineWidth = 0.8
  ctx.strokeRect(
    ox + (cam.x - VIEW_W / 2 / cam.zoom) * k,
    oy + (cam.y - VIEW_H / 2 / cam.zoom) * k,
    (VIEW_W / cam.zoom) * k,
    (VIEW_H / cam.zoom) * k,
  )

  const start = BOARD_TILES[0]
  ellipse(ctx, ox + start.x * k, oy + start.y * k, 1.8, 1.8, PAL.cream)

  for (const p of eng.players) {
    const spot = pawnSpot(eng, p)
    ellipse(ctx, ox + spot.x * k, oy + spot.y * k, 2.4, 2.4, p.color)
  }
  ctx.restore()
}

export function drawChrome(
  ctx: CanvasRenderingContext2D,
  eng: PartyParadeEngine,
  viewerSlot: number | null,
  frame: number,
  cam: Camera,
): void {
  const cur = eng.current
  if (cur) {
    const char = PARADE_CAST[cur.castIndex % PARADE_CAST.length]
    const yours = cur.slot === viewerSlot
    hudPlate(ctx, 8, 8, 156, 30, { accent: cur.color })
    hudText(ctx, yours ? 'YOUR TURN' : cur.name, 16, 22, { size: 11, weight: 700, color: HUD.ink })
    hudText(ctx, `Round ${eng.round} - ${char.name}`, 16, 33, { size: 8, color: HUD.dim })
  }

  if (eng.turnPhase !== 'idle' && eng.lastRoll !== null) {
    const rolling = eng.turnPhase === 'rolling'
    const face = rolling ? eng.rollFace : eng.lastRoll
    const tilt = rolling ? Math.sin(frame * 0.5) * 0.22 : 0
    drawDie(ctx, 26, 62, 26, face, tilt)
    if (!rolling) hudText(ctx, `${eng.lastRoll} spaces`, 44, 66, { size: 9, color: HUD.dim })
  }

  drawMinimap(ctx, eng, cam)
}
