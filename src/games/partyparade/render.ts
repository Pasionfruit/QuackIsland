/**
 * Draws the Party Parade board.
 *
 * The whole loop fits the viewport at a fixed scale - no camera to tune, the
 * same choice Build & Betray makes - so up to eight pawns stay readable from
 * a name tag, an accent colour and a bit of spacing rather than from zoom.
 *
 * Draw order is back to front: sky, water, islands, the bridges between
 * them, the tile loop on top of both, then the cast standing on it.
 */
import { drawAvatar } from '../../art/avatar'
import { PAL } from '../../art/palette'
import { bush, pine, rock } from '../../art/props'
import { DAY, bunting, flag, sky, water } from '../../art/scenes'
import { domePoly, ellipse, facet, noise, shade, softShadow, withAlpha, type Pt } from '../../lib/draw'
import { nameTag } from '../../lib/hud'
import {
  BOARD_TILES,
  BRIDGES,
  HORIZON_Y,
  ISLANDS,
  VIEW_H,
  VIEW_W,
  type Bridge,
  type Island,
  type TileKind,
} from './engine/board'
import { PARADE_CAST, type PPPlayer } from './engine/engine'

/** What each kind of space looks like. The legend in the panel repeats these. */
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

// ---------------------------------------------------------------- geometry

function scalePoly(pts: Pt[], cx: number, cy: number, k: number): Pt[] {
  return pts.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }))
}

function shiftPoly(pts: Pt[], dx: number, dy: number): Pt[] {
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

/** True if a spot is close enough to the path that scenery would grow through it. */
function nearPath(x: number, y: number, pad: number): boolean {
  for (const t of BOARD_TILES) {
    if (Math.abs(t.x - x) < pad && Math.abs(t.y - y) < pad) return true
  }
  return false
}

// ----------------------------------------------------------------- islands

function drawIsland(ctx: CanvasRenderingContext2D, isl: Island): void {
  const top = domePoly(isl.cx, isl.cy, isl.rx, isl.ry, 11, isl.seed)

  // The island's own shadow spreading onto the water.
  ctx.save()
  ctx.globalAlpha = 0.16
  ellipse(ctx, isl.cx, isl.cy + isl.ry * 0.44, isl.rx * 1.06, isl.ry * 0.86, '#24201a')
  ctx.restore()

  // Rock underside, offset down so the island sits in the water rather than
  // looking painted onto it.
  facet(ctx, shiftPoly(top, 0, isl.ry * 0.3), PAL.dirtShade, { dark: 0.3, light: 0.06, seed: isl.seed })
  // A sand rim just proud of the grass, so there is a beach at the waterline.
  facet(ctx, scalePoly(top, isl.cx, isl.cy, 1.07), SAND, { dark: 0.22, light: 0.12, seed: isl.seed + 7 })
  facet(ctx, top, PAL.grass, { dark: 0.2, light: 0.16, seed: isl.seed + 1 })

  drawIslandScatter(ctx, isl)
}

/**
 * A few trees and rocks per island, placed from the island's seed rather than
 * hand-listed - stable between reloads, and cheap to author. Anything that
 * would land on the path is skipped rather than nudged, so nothing grows out
 * of a tile.
 */
function drawIslandScatter(ctx: CanvasRenderingContext2D, isl: Island): void {
  // The path runs around each island's rim, so scenery is aimed at the middle
  // - out at the edge nearly all of it would be culled and the islands would
  // come out bare.
  const spots: Pt[] = []
  for (let i = 0; i < 14; i++) {
    const s = isl.seed * 13.1 + i * 2.7
    const a = noise(s) * Math.PI * 2
    const r = noise(s + 40) * 0.56
    const x = isl.cx + Math.cos(a) * isl.rx * r
    const y = isl.cy + Math.sin(a) * isl.ry * r
    if (nearPath(x, y, 15)) continue
    // Keep them off each other as well, or the noise clumps two trees into one blob.
    if (spots.some((p) => Math.abs(p.x - x) < 14 && Math.abs(p.y - y) < 9)) continue
    spots.push({ x, y })
    const pick = noise(s + 100)
    if (pick < 0.45) pine(ctx, x, y, 15 + noise(s + 3) * 8)
    else if (pick < 0.74) rock(ctx, x, y, 8 + noise(s + 5) * 5)
    else bush(ctx, x, y, 10 + noise(s + 9) * 5)
  }
}

// ----------------------------------------------------------------- bridges

function drawBridge(ctx: CanvasRenderingContext2D, b: Bridge): void {
  const dx = b.bx - b.ax
  const dy = b.by - b.ay
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * (b.width / 2)
  const ny = (dx / len) * (b.width / 2)
  const deck: Pt[] = [
    { x: b.ax + nx, y: b.ay + ny },
    { x: b.bx + nx, y: b.by + ny },
    { x: b.bx - nx, y: b.by - ny },
    { x: b.ax - nx, y: b.ay - ny },
  ]

  ctx.save()
  ctx.globalAlpha = 0.18
  ellipse(ctx, (b.ax + b.bx) / 2, (b.ay + b.by) / 2 + 4, len / 2, b.width * 0.42, '#24201a')
  ctx.restore()

  facet(ctx, deck, PAL.wood, { dark: 0.26, light: 0.14, flat: true, round: 0.08 })

  // Planks across the span.
  ctx.strokeStyle = withAlpha(PAL.woodShade, 0.55)
  ctx.lineWidth = 1
  ctx.beginPath()
  const planks = Math.max(3, Math.round(len / 9))
  for (let i = 1; i < planks; i++) {
    const t = i / planks
    const mx = b.ax + dx * t
    const my = b.ay + dy * t
    ctx.moveTo(mx + nx, my + ny)
    ctx.lineTo(mx - nx, my - ny)
  }
  ctx.stroke()

  // A post at each end, so the bridge meets the sand instead of stopping dead.
  const ends: Pt[] = [
    { x: b.ax, y: b.ay },
    { x: b.bx, y: b.by },
  ]
  for (const e of ends) {
    ellipse(ctx, e.x + nx * 0.86, e.y + ny * 0.86, 2, 2.4, PAL.woodShade)
    ellipse(ctx, e.x - nx * 0.86, e.y - ny * 0.86, 2, 2.4, PAL.woodShade)
  }
}

// -------------------------------------------------------------------- path

function drawPath(ctx: CanvasRenderingContext2D, frame: number): void {
  // The worn track the tiles sit on, closed back around to the start.
  ctx.strokeStyle = withAlpha('#5a4c38', 0.26)
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  BOARD_TILES.forEach((t, i) => (i ? ctx.lineTo(t.x, t.y) : ctx.moveTo(t.x, t.y)))
  ctx.closePath()
  ctx.stroke()

  for (const t of BOARD_TILES) {
    const c = TILE_COLORS[t.kind]
    const big = t.kind === 'start'
    const rx = big ? 8 : 6.6
    const ry = big ? 5.2 : 4.3
    // A short side wall under each tile, so the spaces read as pucks.
    ellipse(ctx, t.x, t.y + 1.8, rx, ry, shade(c, -0.34))
    ellipse(ctx, t.x, t.y, rx, ry, c)
    ellipse(ctx, t.x, t.y - 0.7, rx * 0.66, ry * 0.6, shade(c, 0.22))
  }

  // The start line gets a flag, so a lap is legible at a glance. It is tall
  // on purpose: at the start of a match the whole field is stood on this tile,
  // and a short one would be completely hidden behind them.
  const s = BOARD_TILES[0]
  flag(ctx, s.x + 2, s.y - 3, 38, '#e8703a', frame)
}

// ------------------------------------------------------------------- board

export function drawBoard(ctx: CanvasRenderingContext2D, frame: number): void {
  sky(ctx, VIEW_W, HORIZON_Y, DAY)
  water(ctx, VIEW_W, VIEW_H, HORIZON_Y, frame)
  for (const isl of ISLANDS) drawIsland(ctx, isl)
  for (const b of BRIDGES) drawBridge(ctx, b)
  drawPath(ctx, frame)
  bunting(ctx, VIEW_W, 9, 5)
}

// ------------------------------------------------------------------- pawns

/**
 * Fans the pawns sharing a tile around its centre. The ring widens with the
 * crowd, because at the start of a match all eight are on one space and a
 * fixed radius stacks them into a single unreadable lump.
 */
function pawnOffset(i: number, total: number): Pt {
  if (total <= 1) return { x: 0, y: 0 }
  const spread = 7 + total * 2.1
  const a = (i / total) * Math.PI * 2 - Math.PI / 2
  return { x: Math.cos(a) * spread, y: Math.sin(a) * spread * 0.5 }
}

export function drawPawns(
  ctx: CanvasRenderingContext2D,
  players: PPPlayer[],
  frame: number,
  viewerSlot: number | null,
): void {
  const byTile = new Map<number, PPPlayer[]>()
  for (const p of players) {
    const list = byTile.get(p.tileIndex)
    if (list) list.push(p)
    else byTile.set(p.tileIndex, [p])
  }

  const placed: { p: PPPlayer; x: number; y: number; crowd: number }[] = []
  for (const [tileIndex, group] of byTile) {
    const tile = BOARD_TILES[tileIndex]
    if (!tile) continue
    group.forEach((p, i) => {
      const off = pawnOffset(i, group.length)
      placed.push({ p, x: tile.x + off.x, y: tile.y + off.y, crowd: group.length })
    })
  }

  // Back to front across the whole board, not just within a tile, so a pawn
  // standing lower always overlaps one standing higher.
  placed.sort((a, b) => a.y - b.y)

  for (const { p, x, y, crowd } of placed) {
    const char = PARADE_CAST[p.castIndex % PARADE_CAST.length]
    softShadow(ctx, x, y + 1.5, 6, 2.2, 0.24)
    // A ring in the player's colour under their feet: eight animals need more
    // than their silhouette to tell apart at this size.
    ctx.save()
    ctx.globalAlpha = 0.85
    ellipse(ctx, x, y + 1, 6.4, 2.6, withAlpha(p.color, 0.55))
    ellipse(ctx, x, y + 1, 4.6, 1.7, withAlpha(p.color, 0.25))
    ctx.restore()
    drawAvatar(ctx, char.def, x, y, {
      facing: 1,
      height: 23,
      pose: 'idle',
      // Offsets each animal's idle bob so a crowd does not breathe in unison.
      phase: frame + p.slot * 17,
    })
    // Tags are only readable while the space is not crowded. At the start of
    // a match everyone is stacked on one tile and eight of these land on top
    // of each other, so past a few only your own is drawn - the colour ring
    // underfoot and the roster panel cover the rest.
    const self = p.slot === viewerSlot
    if (self || crowd <= 3) nameTag(ctx, p.name, x, y - 30, p.color, { self })
  }
}
