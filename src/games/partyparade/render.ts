/**
 * Draws the Party Parade course.
 *
 * The run is 180 spaces across a world far bigger than the view, so unlike the
 * other games here this one has a camera: it follows whoever is taking their
 * turn unless you take hold of it yourself. A minimap in the corner keeps the
 * whole course on screen so following the action never costs you the shape of
 * it.
 *
 * Draw order is back to front: sea, islands, bridges, the two routes, whatever
 * people have scribbled on the map, the cast standing on it, then chrome on
 * top in screen space.
 */
import { drawAvatar } from '../../art/avatar'
import { PAL } from '../../art/palette'
import { bush, pine, rock } from '../../art/props'
import { flag, water } from '../../art/scenes'
import { domePoly, ellipse, facet, noise, shade, softShadow, withAlpha, type Pt } from '../../lib/draw'
import { HUD, hudPlate, hudText, nameTag } from '../../lib/hud'
import { textWidth } from '../../lib/text'
import {
  BOARD_TILES,
  FORK_INDEX,
  ISLANDS,
  MAIN_COUNT,
  REJOIN_INDEX,
  SHORT_COUNT,
  SHORT_START,
  TREASURE_INDEX,
  VIEW_H,
  VIEW_W,
  WORLD_H,
  WORLD_W,
  bridgeSpans,
  type Island,
  type TileKind,
} from './engine/board'
import { PARADE_CAST, type PPPlayer, type PartyParadeEngine } from './engine/engine'

export const TILE_COLORS: Record<TileKind, string> = {
  start: PAL.cream,
  plain: '#7f9c62',
  good: '#e8c05f',
  bad: '#8d7aa0',
  hostile: PAL.fireDeep,
  gate: '#6fa8c4',
  treasure: '#f0c449',
}

export const TILE_LABELS: Record<TileKind, string> = {
  start: 'Start line',
  plain: 'Open road',
  good: 'Good news',
  bad: 'Bad news',
  hostile: 'Actively hostile',
  gate: 'Checkpoint',
  treasure: 'The treasure',
}

const SAND = shade(PAL.dirt, 0.42)
const SPANS = bridgeSpans()
const MAIN_LINE = Array.from({ length: MAIN_COUNT }, (_, i) => i)
const SHORT_LINE = [FORK_INDEX, ...Array.from({ length: SHORT_COUNT }, (_, k) => SHORT_START + k), REJOIN_INDEX]

export interface Camera {
  x: number
  y: number
  zoom: number
}

/** A scribble somebody drew on the map, in world units. Flat x,y pairs to keep it small on the wire. */
export interface InkStroke {
  color: string
  pts: number[]
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

export function applyCamera(ctx: CanvasRenderingContext2D, cam: Camera): void {
  ctx.translate(VIEW_W / 2, VIEW_H / 2)
  ctx.scale(cam.zoom, cam.zoom)
  ctx.translate(-cam.x, -cam.y)
}

/** Screen point to world point, for drawing on the map. */
export function screenToWorld(sx: number, sy: number, cam: Camera): Pt {
  return { x: (sx - VIEW_W / 2) / cam.zoom + cam.x, y: (sy - VIEW_H / 2) / cam.zoom + cam.y }
}

/** Where a pawn is standing or walking, in world units. */
export function pawnSpot(eng: PartyParadeEngine, p: PPPlayer): { x: number; y: number; hop: number; facing: 1 | -1 } {
  const { a, b, f } = eng.liveTile(p)
  const ta = BOARD_TILES[a]
  const tb = BOARD_TILES[b] ?? ta
  return {
    x: ta.x + (tb.x - ta.x) * f,
    y: ta.y + (tb.y - ta.y) * f,
    hop: eng.isWalking(p.slot) ? Math.sin(f * Math.PI) * 7 : 0,
    facing: tb.x >= ta.x ? 1 : -1,
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

function drawBridge(ctx: CanvasRenderingContext2D, span: number[]): void {
  const first = BOARD_TILES[span[0]]
  const last = BOARD_TILES[span[span.length - 1]]
  const pts: Pt[] = [
    BOARD_TILES[first.prev >= 0 ? first.prev : span[0]],
    ...span.map((i) => BOARD_TILES[i]),
    BOARD_TILES[last.next >= 0 ? last.next : span[span.length - 1]],
  ]
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
  ctx.setLineDash([3, 7])
  ctx.stroke()
  ctx.setLineDash([])

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

// ----------------------------------------------------------- notable spaces

function drawTreasure(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number): void {
  const bob = Math.sin(frame * 0.06) * 1.4
  softShadow(ctx, x, y + 3, 14, 5, 0.3)
  // Chest: a body, a lid, and a band.
  facet(
    ctx,
    [
      { x: x - 12, y: y - 4 + bob },
      { x: x + 12, y: y - 4 + bob },
      { x: x + 10, y: y + 6 + bob },
      { x: x - 10, y: y + 6 + bob },
    ],
    PAL.wood,
    { dark: 0.26, light: 0.16 },
  )
  facet(
    ctx,
    [
      { x: x - 12, y: y - 5 + bob },
      { x: x - 7, y: y - 12 + bob },
      { x: x + 7, y: y - 12 + bob },
      { x: x + 12, y: y - 5 + bob },
    ],
    '#c9a24a',
    { dark: 0.24, light: 0.22 },
  )
  ellipse(ctx, x, y - 4 + bob, 2.6, 2.6, '#f6e3a8')
  // A couple of glints, so it reads as the prize from a distance.
  for (let i = 0; i < 3; i++) {
    const t = (frame * 0.03 + i * 0.7) % 1
    ctx.save()
    ctx.globalAlpha = Math.max(0, 1 - t) * 0.8
    ellipse(ctx, x - 9 + i * 9, y - 18 - t * 8 + bob, 1.4, 1.4, '#fff3c4')
    ctx.restore()
  }
}

function drawGate(ctx: CanvasRenderingContext2D, x: number, y: number, rule: string): void {
  // Two posts and a rope: a checkpoint you can see coming.
  for (const dx of [-11, 11]) {
    facet(
      ctx,
      [
        { x: x + dx - 2, y: y - 16 },
        { x: x + dx + 2, y: y - 16 },
        { x: x + dx + 2, y: y + 2 },
        { x: x + dx - 2, y: y + 2 },
      ],
      PAL.wood,
      { dark: 0.28, flat: true },
    )
  }
  ctx.save()
  ctx.strokeStyle = '#6fa8c4'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x - 11, y - 14)
  ctx.quadraticCurveTo(x, y - 9, x + 11, y - 14)
  ctx.stroke()
  ctx.restore()
  const mark = rule === 'odd' ? '1 3 5' : rule === 'even' ? '2 4 6' : '6'
  hudText(ctx, mark, x, y - 19, { size: 7, align: 'center', color: HUD.ink })
}

// ------------------------------------------------------------------ routes

function strokeRoute(ctx: CanvasRenderingContext2D, line: number[], color: string, width: number): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  line.forEach((i, k) => {
    const t = BOARD_TILES[i]
    if (k) ctx.lineTo(t.x, t.y)
    else ctx.moveTo(t.x, t.y)
  })
  ctx.stroke()
  ctx.restore()
}

function drawRoutes(ctx: CanvasRenderingContext2D, frame: number): void {
  strokeRoute(ctx, MAIN_LINE, withAlpha('#5a4c38', 0.24), 12)
  // The causeway reads as the rougher option even before you know what is on it.
  ctx.save()
  ctx.setLineDash([9, 6])
  strokeRoute(ctx, SHORT_LINE, withAlpha('#7a4a38', 0.3), 10)
  ctx.restore()

  for (let i = 0; i < BOARD_TILES.length; i++) {
    const t = BOARD_TILES[i]
    if (t.kind === 'treasure') continue
    const c = TILE_COLORS[t.kind]
    const big = t.kind === 'start' || t.kind === 'gate'
    const rx = big ? 8 : 6.2
    const ry = big ? 5.2 : 4
    ellipse(ctx, t.x, t.y + 1.8, rx, ry, shade(c, -0.34))
    ellipse(ctx, t.x, t.y, rx, ry, c)
    ellipse(ctx, t.x, t.y - 0.7, rx * 0.66, ry * 0.6, shade(c, 0.22))
  }

  for (const t of BOARD_TILES) if (t.gate) drawGate(ctx, t.x, t.y, t.gate)

  const s = BOARD_TILES[0]
  flag(ctx, s.x + 2, s.y - 3, 38, '#e8703a', frame)

  const g = BOARD_TILES[TREASURE_INDEX]
  drawTreasure(ctx, g.x, g.y, frame)
}

// -------------------------------------------------------------------- ink

export function drawInk(ctx: CanvasRenderingContext2D, strokes: InkStroke[], cam: Camera): void {
  if (!strokes.length) return
  ctx.save()
  applyCamera(ctx, cam)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3 / Math.max(0.4, cam.zoom)
  for (const s of strokes) {
    if (s.pts.length < 4) {
      if (s.pts.length === 2) ellipse(ctx, s.pts[0], s.pts[1], 1.8, 1.8, s.color)
      continue
    }
    ctx.strokeStyle = s.color
    ctx.beginPath()
    for (let i = 0; i < s.pts.length; i += 2) {
      if (i) ctx.lineTo(s.pts[i], s.pts[i + 1])
      else ctx.moveTo(s.pts[i], s.pts[i + 1])
    }
    ctx.stroke()
  }
  ctx.restore()
}

// ------------------------------------------------------------------- world

export function drawBoard(ctx: CanvasRenderingContext2D, frame: number, cam: Camera): void {
  // Open sea, painted in screen space - with the camera roaming a course this
  // wide there is no fixed horizon to anchor a sky to.
  water(ctx, VIEW_W, VIEW_H, 0, frame)

  ctx.save()
  applyCamera(ctx, cam)
  for (const isl of ISLANDS) drawIsland(ctx, isl)
  for (const span of SPANS) drawBridge(ctx, span)
  drawRoutes(ctx, frame)
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
  applyCamera(ctx, cam)

  const parked = new Map<number, PPPlayer[]>()
  for (const p of eng.players) {
    if (eng.isWalking(p.slot)) continue
    const list = parked.get(p.tileIndex)
    if (list) list.push(p)
    else parked.set(p.tileIndex, [p])
  }

  const placed: { p: PPPlayer; x: number; y: number; hop: number; facing: 1 | -1; crowd: number; rank: number }[] =
    []
  for (const p of eng.players) {
    const spot = pawnSpot(eng, p)
    const walking = eng.isWalking(p.slot)
    const group = parked.get(p.tileIndex)
    let off: Pt = { x: 0, y: 0 }
    let crowd = 1
    let rank = 0
    if (!walking && group) {
      crowd = group.length
      rank = group.indexOf(p)
      off = pawnOffset(rank, crowd)
    }
    placed.push({ p, x: spot.x + off.x, y: spot.y + off.y, hop: spot.hop, facing: spot.facing, crowd, rank })
  }

  placed.sort((a, b) => a.y - b.y)

  const active = eng.current?.slot
  for (const { p, x, y, hop, facing, crowd, rank } of placed) {
    const char = PARADE_CAST[p.castIndex % PARADE_CAST.length]
    const walking = eng.isWalking(p.slot)
    softShadow(ctx, x, y + 1.5, 6, 2.2, 0.24)
    ctx.save()
    ctx.globalAlpha = 0.85
    ellipse(ctx, x, y + 1, 6.4, 2.6, withAlpha(p.color, 0.55))
    ellipse(ctx, x, y + 1, 4.6, 1.7, withAlpha(p.color, 0.25))
    ctx.restore()

    if (p.slot === active && !walking && eng.phase === 'board') {
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
    // Two pawns on one space would otherwise print their names on top of each
    // other, so a shared space stacks its tags instead.
    if (self || crowd <= 3 || walking) {
      nameTag(ctx, p.name, x, y - hop - 30 - (crowd > 1 ? rank * 9 : 0), p.color, { self })
    }
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

function drawMinimap(ctx: CanvasRenderingContext2D, eng: PartyParadeEngine, cam: Camera): void {
  const w = 108
  const h = 68
  const x = VIEW_W - w - 8
  const y = VIEW_H - h - 8
  const k = Math.min(w / WORLD_W, h / WORLD_H) * 0.86
  const ox = x + w / 2 - (WORLD_W / 2) * k
  const oy = y + h / 2 - (WORLD_H / 2) * k

  // Nearly opaque: the shared HUD plate is see-through, and a pawn showing
  // through the map behind the course makes both harder to read.
  hudPlate(ctx, x, y, w, h, { radius: 6, fill: 'rgba(28, 26, 22, 0.86)' })

  ctx.save()
  const line = (idx: number[], color: string, dash: number[]) => {
    ctx.strokeStyle = color
    ctx.lineWidth = 1.3
    ctx.setLineDash(dash)
    ctx.beginPath()
    idx.forEach((i, n) => {
      const t = BOARD_TILES[i]
      if (n) ctx.lineTo(ox + t.x * k, oy + t.y * k)
      else ctx.moveTo(ox + t.x * k, oy + t.y * k)
    })
    ctx.stroke()
    ctx.setLineDash([])
  }
  line(MAIN_LINE, withAlpha(HUD.dim, 0.75), [])
  line(SHORT_LINE, withAlpha('#e8a06a', 0.8), [3, 2])

  ctx.strokeStyle = withAlpha(HUD.ink, 0.4)
  ctx.lineWidth = 0.8
  ctx.strokeRect(
    ox + (cam.x - VIEW_W / 2 / cam.zoom) * k,
    oy + (cam.y - VIEW_H / 2 / cam.zoom) * k,
    (VIEW_W / cam.zoom) * k,
    (VIEW_H / cam.zoom) * k,
  )

  for (const t of BOARD_TILES) {
    if (t.gate) ellipse(ctx, ox + t.x * k, oy + t.y * k, 1.6, 1.6, '#6fa8c4')
  }
  const goal = BOARD_TILES[TREASURE_INDEX]
  ellipse(ctx, ox + goal.x * k, oy + goal.y * k, 2.6, 2.6, '#f0c449')

  for (const p of eng.players) {
    const spot = pawnSpot(eng, p)
    ellipse(ctx, ox + spot.x * k, oy + spot.y * k, 2.4, 2.4, p.color)
  }
  ctx.restore()
}

/**
 * Two lines on a plate, sized to whatever is actually in them.
 *
 * drawText lays text out from the *top*, not the baseline, so the numbers here
 * are the top edge of each line - getting that wrong is what used to push the
 * second line out through the bottom of the plate.
 */
function statusPlate(ctx: CanvasRenderingContext2D, title: string, sub: string, accent?: string): void {
  const padX = 10
  const w = Math.max(textWidth(ctx, title, { size: 11, weight: 700 }), textWidth(ctx, sub, { size: 8, weight: 700 })) + padX * 2
  hudPlate(ctx, 8, 8, w, 32, { accent })
  hudText(ctx, title, 8 + padX, 13, { size: 11, weight: 700, color: HUD.ink })
  hudText(ctx, sub, 8 + padX, 26, { size: 8, color: HUD.dim })
}

export function drawChrome(
  ctx: CanvasRenderingContext2D,
  eng: PartyParadeEngine,
  viewerSlot: number | null,
  frame: number,
  cam: Camera,
): void {
  const cur = eng.current
  if (eng.phase === 'over' && eng.winner !== null) {
    const win = eng.playerAt(eng.winner)
    statusPlate(ctx, 'TREASURE FOUND', `${win?.name ?? 'Somebody'} wins the parade`, win?.color)
  } else if (cur) {
    const char = PARADE_CAST[cur.castIndex % PARADE_CAST.length]
    const yours = cur.slot === viewerSlot
    statusPlate(ctx, yours ? 'YOUR TURN' : cur.name, `Round ${eng.round} - ${char.name}`, cur.color)
  }

  if (eng.turnPhase !== 'idle' && eng.lastRoll !== null) {
    const rolling = eng.turnPhase === 'rolling'
    const face = rolling ? eng.rollFace : eng.lastRoll
    const tilt = rolling ? Math.sin(frame * 0.5) * 0.22 : 0
    drawDie(ctx, 26, 64, 26, face, tilt)
    if (!rolling) hudText(ctx, `${eng.lastRoll} spaces`, 44, 60, { size: 9, color: HUD.dim })
  }

  // Whatever just happened, so a setback is never silent.
  if (eng.message) {
    // Centred on the space beside the minimap, not the whole view, or a long
    // line runs underneath it.
    const free = VIEW_W - 124
    const tw = textWidth(ctx, eng.message, { size: 9, weight: 700 })
    const w = Math.min(free - 16, tw + 20)
    const h = 20
    const y = VIEW_H - 30
    hudPlate(ctx, free / 2 - w / 2, y, w, h, { radius: 6 })
    hudText(ctx, eng.message, free / 2, y + 6, { size: 9, align: 'center', color: HUD.ink })
  }

  drawMinimap(ctx, eng, cam)
}
