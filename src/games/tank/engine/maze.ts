/**
 * Seeded maze generation.
 *
 * The host never sends wall geometry over the wire: every peer derives the
 * same maze from the match seed and the level number, the same way a shared
 * PRNG keeps two peers' "random" decisions identical. That is also why this
 * uses its own tiny PRNG rather than `Math.random` - it has to be
 * reproducible from a seed, not just random.
 */
import { ARENA, MAX_LEVEL, type LevelConfig, type Wall } from './types'

/** mulberry32: small, fast, and deterministic from a 32-bit seed. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Grid size, enemy count, and enemy stats for a level, 1-20. */
/** Level N is always this map, in every match, forever - only who is in it changes. */
export function seedForLevel(level: number): number {
  return (level * 97 + 733) >>> 0
}

export function levelConfig(level: number): LevelConfig {
  const t = (Math.max(1, Math.min(MAX_LEVEL, level)) - 1) / (MAX_LEVEL - 1)
  return {
    level,
    cols: Math.round(lerp(5, 9, t)),
    rows: Math.round(lerp(3, 6, t)),
    // Fewer walls knocked out at high levels: the maze stays tighter.
    removeFrac: lerp(0.4, 0.06, t),
    enemyCount: Math.round(lerp(1, 9, t)),
    enemySpeed: lerp(0.55, 1.15, t),
    enemyFireEvery: Math.round(lerp(120, 42, t)),
    enemyAccuracy: lerp(0.45, 0.95, t),
  }
}

export interface Maze {
  walls: Wall[]
  cellW: number
  cellH: number
  /** Open cell centres, for spawning tanks clear of walls. */
  cells: { x: number; y: number }[]
}

/** The one seed a given level ever uses - see `seedForLevel` below. */

/**
 * A randomized-DFS perfect maze over `cols` x `rows` cells, then a fraction of
 * the interior walls are knocked out so bullets have lanes to ricochet down.
 * The outer boundary is never touched, so nothing can be shot out of the pit.
 */
export function buildMaze(seed: number, cfg: LevelConfig): Maze {
  const rng = makeRng(seed)
  const { cols, rows } = cfg
  const cellW = ARENA.w / cols
  const cellH = ARENA.h / rows

  // Wall state per cell: true = wall present on that edge.
  const right: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(true))
  const bottom: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(true))
  const seen: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false))

  const stack: [number, number][] = [[0, 0]]
  seen[0][0] = true
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1]
    type Dir = [number, number, 'r' | 'l' | 'b' | 't']
    const candidates: Dir[] = [
      [cx + 1, cy, 'r'],
      [cx - 1, cy, 'l'],
      [cx, cy + 1, 'b'],
      [cx, cy - 1, 't'],
    ]
    const dirs = candidates.filter(
      ([nx, ny]) => nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[ny][nx],
    )

    if (!dirs.length) {
      stack.pop()
      continue
    }
    const [nx, ny, dir] = dirs[Math.floor(rng() * dirs.length)]
    if (dir === 'r') right[cy][cx] = false
    else if (dir === 'l') right[cy][cx - 1] = false
    else if (dir === 'b') bottom[cy][cx] = false
    else bottom[cy - 1][cx] = false
    seen[ny][nx] = true
    stack.push([nx, ny])
  }

  // Open extra lanes: a perfect maze has exactly one path between any two
  // cells, which plays claustrophobic. Knocking out interior walls gives
  // bullets room to ricochet without touching the boundary.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols - 1; x++) {
      if (right[y][x] && rng() < cfg.removeFrac) right[y][x] = false
    }
  }
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < cols; x++) {
      if (bottom[y][x] && rng() < cfg.removeFrac) bottom[y][x] = false
    }
  }

  const THICK = 4
  // The outer wall is always stone: nothing should be able to blast open the
  // edge of the pit. Interior walls are a mix, drawn from the same seeded
  // stream so the split is reproducible - wood gets scarcer as the level
  // number climbs, which is one more way the maze tightens up over the run.
  const woodChance = lerp(0.62, 0.22, (cfg.level - 1) / (MAX_LEVEL - 1))
  const walls: Wall[] = [
    { x: ARENA.x, y: ARENA.y, w: ARENA.w, h: THICK, kind: 'stone' },
    { x: ARENA.x, y: ARENA.y + ARENA.h - THICK, w: ARENA.w, h: THICK, kind: 'stone' },
    { x: ARENA.x, y: ARENA.y, w: THICK, h: ARENA.h, kind: 'stone' },
    { x: ARENA.x + ARENA.w - THICK, y: ARENA.y, w: THICK, h: ARENA.h, kind: 'stone' },
  ]
  const pickKind = (): 'stone' | 'wood' => (rng() < woodChance ? 'wood' : 'stone')
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = ARENA.x + x * cellW
      const py = ARENA.y + y * cellH
      if (x < cols - 1 && right[y][x]) {
        walls.push({ x: px + cellW - THICK / 2, y: py, w: THICK, h: cellH, kind: pickKind() })
      }
      if (y < rows - 1 && bottom[y][x]) {
        walls.push({ x: px, y: py + cellH - THICK / 2, w: cellW, h: THICK, kind: pickKind() })
      }
    }
  }

  const cells: { x: number; y: number }[] = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      cells.push({ x: ARENA.x + (x + 0.5) * cellW, y: ARENA.y + (y + 0.5) * cellH })
    }
  }

  return { walls, cellW, cellH, cells }
}

/** Whether a straight line between two points passes through any wall. */
export function lineOfSight(walls: Wall[], x0: number, y0: number, x1: number, y1: number): boolean {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    for (const w of walls) {
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return false
    }
  }
  return true
}
