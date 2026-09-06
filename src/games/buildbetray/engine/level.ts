/**
 * The build canvas: a spawn ledge and a goal ledge with a gap between them,
 * laid out on a coarse grid so placement is a click, not a drag-and-nudge
 * editor. A boring, easy default bridge already crosses the gap before
 * anyone builds anything - the fun is players adding faster routes,
 * shortcuts and hazards on top of (or instead of) that safety net, not
 * proving a path exists in the first place. See `reachable()` below for the
 * one thing that still gets validated: that the goal has not been sealed off
 * entirely.
 */
import { CELL_H, CELL_W, pieceById, type Collision } from './pieces'

export const VIEW_W = 480
export const VIEW_H = 270
export const COLS = VIEW_W / CELL_W // 24
export const ROWS = VIEW_H / CELL_H // 15

/** The row the spawn and goal ledges sit on. */
export const LEDGE_ROW = 12
export const SPAWN_COLS: [number, number] = [0, 3] // inclusive
export const GOAL_COLS: [number, number] = [20, 23]
/** Columns players may actually build in. */
export const BUILD_COLS: [number, number] = [4, 19]
/** Rows players may build in - 0 is the top of the level. */
export const BUILD_ROWS: [number, number] = [0, 11]

/** The easy default bridge, present before anyone places a single piece. */
const BASE_BRIDGE = { gx: 6, gy: 11, w: 12, h: 1 }

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function cellRect(gx: number, gy: number, w: number, h: number): Rect {
  return { x: gx * CELL_W, y: gy * CELL_H, w: w * CELL_W, h: h * CELL_H }
}

function overlaps(a: { gx: number; gy: number; w: number; h: number }, b: { gx: number; gy: number; w: number; h: number }): boolean {
  return a.gx < b.gx + b.w && a.gx + a.w > b.gx && a.gy < b.gy + b.h && a.gy + a.h > b.gy
}

export interface PlacedPiece {
  uid: number
  pieceId: string
  gx: number
  gy: number
  w: number
  h: number
  ownerSlot: number
  /** Left/right orientation, for the handful of pieces `rotatable` lets a player flip. */
  dir: 1 | -1
  /** Frame a fake/breakable piece stopped being solid, once triggered. */
  brokenAtFrame?: number
  /** Frame a triggered trap was stepped on; it turns lethal `delay` frames later. */
  triggeredAtFrame?: number
  /** Every slot that has ever stood on this piece - for the "useful build" bonus. */
  touchedBy: number[]
}

export interface Level {
  placed: PlacedPiece[]
  nextUid: number
}

export function newLevel(): Level {
  return { placed: [], nextUid: 1 }
}

/** Fixed ground: the two ledges and the default bridge. Never removable. */
export function fixedSolids(): { gx: number; gy: number; w: number; h: number }[] {
  return [
    { gx: SPAWN_COLS[0], gy: LEDGE_ROW, w: SPAWN_COLS[1] - SPAWN_COLS[0] + 1, h: ROWS - LEDGE_ROW },
    { gx: GOAL_COLS[0], gy: LEDGE_ROW, w: GOAL_COLS[1] - GOAL_COLS[0] + 1, h: ROWS - LEDGE_ROW },
    BASE_BRIDGE,
  ]
}

export function spawnPoint(seat: number, seats: number): { x: number; y: number } {
  const [c0, c1] = SPAWN_COLS
  const span = (c1 - c0 + 1) * CELL_W
  const x = c0 * CELL_W + span * ((seat + 1) / (seats + 1))
  return { x, y: LEDGE_ROW * CELL_H }
}

export function goalRect(): Rect {
  return cellRect(GOAL_COLS[0], LEDGE_ROW - 3, GOAL_COLS[1] - GOAL_COLS[0] + 1, 3)
}

/** Is this cell footprint still solid at `frame` - false once broken. */
export function solidAt(p: PlacedPiece, frame: number): boolean {
  return p.brokenAtFrame === undefined || frame < p.brokenAtFrame
}

/** Is this trap's spike phase active yet. */
export function trapArmed(p: PlacedPiece, frame: number, delay: number): boolean {
  return p.triggeredAtFrame !== undefined && frame >= p.triggeredAtFrame + delay
}

// -------------------------------------------------------------- placement

export interface PlaceCheck {
  ok: boolean
  reason?: string
}

/** Every rule that keeps 8 players from turning the level into nonsense. */
export function canPlace(level: Level, pieceId: string, gx: number, gy: number, placedByOwner: number): PlaceCheck {
  const def = pieceById(pieceId)
  const [bc0, bc1] = BUILD_COLS
  const [br0, br1] = BUILD_ROWS
  if (gx < bc0 || gx + def.w - 1 > bc1 || gy < br0 || gy + def.h - 1 > br1) {
    return { ok: false, reason: 'Outside the build area' }
  }
  if (placedByOwner >= def.maxPerPlayer) {
    return { ok: false, reason: `Only ${def.maxPerPlayer} ${def.name} allowed per player` }
  }
  const footprint = { gx, gy, w: def.w, h: def.h }
  for (const s of fixedSolids()) {
    if (overlaps(footprint, s)) return { ok: false, reason: 'Overlaps the ground' }
  }
  for (const p of level.placed) {
    if (overlaps(footprint, p)) return { ok: false, reason: 'Overlaps another piece' }
  }
  if (def.requiresSupportBelow) {
    const below = { gx, gy: gy + def.h, w: def.w, h: 1 }
    const supported =
      fixedSolids().some((s) => overlaps(below, s)) ||
      level.placed.some((p) => pieceById(p.pieceId).collision !== 'lethal' && pieceById(p.pieceId).collision !== 'trigger' && overlaps(below, p))
    if (!supported) return { ok: false, reason: 'Needs solid ground underneath' }
  }
  if ((def.collision === 'lethal' || def.behavior === 'triggerTrap') && hazardCount(level) >= MAX_HAZARDS_ON_BOARD) {
    return { ok: false, reason: 'Too many hazards on the board already' }
  }
  return { ok: true }
}

export function place(level: Level, pieceId: string, gx: number, gy: number, ownerSlot: number, dir: 1 | -1 = 1): PlacedPiece {
  const def = pieceById(pieceId)
  const piece: PlacedPiece = { uid: level.nextUid++, pieceId, gx, gy, w: def.w, h: def.h, ownerSlot, dir, touchedBy: [] }
  level.placed.push(piece)
  return piece
}

export function removeOwn(level: Level, uid: number, ownerSlot: number): boolean {
  const i = level.placed.findIndex((p) => p.uid === uid && p.ownerSlot === ownerSlot)
  if (i < 0) return false
  level.placed.splice(i, 1)
  return true
}

export function countByPiece(level: Level, ownerSlot: number, pieceId: string): number {
  return level.placed.filter((p) => p.ownerSlot === ownerSlot && p.pieceId === pieceId).length
}

/** Whatever occupies this cell, for a build-phase click that might mean "remove this". */
export function pieceAt(level: Level, gx: number, gy: number): PlacedPiece | undefined {
  return level.placed.find((p) => gx >= p.gx && gx < p.gx + p.w && gy >= p.gy && gy < p.gy + p.h)
}

// ------------------------------------------------------------- reachability

/**
 * A loose, deliberately generous jump-reach box - the validator's job is
 * catching an obviously sealed goal, not judging whether a jump is fair.
 */
const JUMP_DX = 130
const JUMP_UP = 95
const JUMP_DOWN = 260

export function walkableCollision(c: Collision): boolean {
  return c === 'solid' || c === 'oneway'
}

/** Can at least one player theoretically reach the goal from the spawn ledge. */
export function reachable(level: Level): boolean {
  const nodes: Rect[] = [cellRect(SPAWN_COLS[0], LEDGE_ROW, SPAWN_COLS[1] - SPAWN_COLS[0] + 1, 1)]
  for (const p of level.placed) {
    if (walkableCollision(pieceById(p.pieceId).collision)) nodes.push(cellRect(p.gx, p.gy, p.w, p.h))
  }
  const bridge = BASE_BRIDGE
  nodes.push(cellRect(bridge.gx, bridge.gy, bridge.w, bridge.h))
  const goal = cellRect(GOAL_COLS[0], LEDGE_ROW, GOAL_COLS[1] - GOAL_COLS[0] + 1, 1)
  nodes.push(goal)

  const seen = new Set<number>([0])
  const queue = [0]
  while (queue.length) {
    const i = queue.shift()!
    const a = nodes[i]
    for (let j = 0; j < nodes.length; j++) {
      if (seen.has(j)) continue
      const b = nodes[j]
      const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0)
      const rise = a.y - b.y // positive if b is higher than a
      const dyUp = Math.max(rise, 0)
      const dyDown = Math.max(-rise, 0)
      if (dx <= JUMP_DX && dyUp <= JUMP_UP && dyDown <= JUMP_DOWN) {
        seen.add(j)
        queue.push(j)
      }
    }
  }
  return seen.has(nodes.length - 1)
}

/** Anti-grief: no more than this many lethal/trap pieces on the board at once. */
export const MAX_HAZARDS_ON_BOARD = 6
export function hazardCount(level: Level): number {
  return level.placed.filter((p) => {
    const def = pieceById(p.pieceId)
    return def.collision === 'lethal' || def.behavior === 'triggerTrap'
  }).length
}
