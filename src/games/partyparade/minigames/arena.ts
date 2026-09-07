/**
 * The five roaming minigames: the ones played on a field rather than from a
 * standing start.
 *
 * They share the frame in types.ts - a roster, one clock, one number per
 * player - so what is actually here is five different ways to earn that
 * number: outlast the zombies, outlast the rope, outlast the rocks, chop the
 * most logs, or get out of the maze first.
 *
 * Everything is DOM-free so the smoke test can drive it from Node, and
 * anything random comes from the seeded generator so a test gets the same
 * maze and the same rocks twice.
 */
import { BaseMinigame, FIELD, type MgPlayer, type MgRosterEntry } from './types'

const W = FIELD.x1 - FIELD.x0
const H = FIELD.y1 - FIELD.y0

/** Everyone spread along the field, so nobody starts on top of anybody. */
function spread(players: MgPlayer[], y: number): Map<number, { x: number; y: number }> {
  const out = new Map<number, { x: number; y: number }>()
  const n = players.length
  players.forEach((p, i) => {
    out.set(p.slot, { x: FIELD.x0 + ((i + 1) / (n + 1)) * W, y })
  })
  return out
}

function clampField(p: { x: number; y: number }, pad = 8): void {
  p.x = Math.max(FIELD.x0 + pad, Math.min(FIELD.x1 - pad, p.x))
  p.y = Math.max(FIELD.y0 + pad, Math.min(FIELD.y1 - pad, p.y))
}

// -------------------------------------------------------------- Zombie Tag

const ZOMBIE_LIMIT = 30 * 60
const ZOMBIE_REACH = 11
const HUMAN_SPEED = 2.05
const ZOMBIE_SPEED = 1.9

export interface Shambler {
  x: number
  y: number
}

export class ZombieGame extends BaseMinigame {
  readonly id = 'zombie' as const
  pos = new Map<number, { x: number; y: number }>()
  /** Players who have been caught, and are now chasing everyone else. */
  turned = new Set<number>()
  /** The two it starts with. They are not players, so nobody draws the short straw. */
  shamblers: Shambler[] = []
  left = ZOMBIE_LIMIT

  protected begin(): void {
    this.left = ZOMBIE_LIMIT
    this.pos = spread(this.players, FIELD.y1 - 22)
    // Starting zombies are NPCs rather than an unlucky player - being picked
    // as the first zombie would otherwise mean scoring nothing through no
    // fault of your own.
    this.shamblers = [
      { x: FIELD.x0 + 24, y: FIELD.y0 + 20 },
      { x: FIELD.x1 - 24, y: FIELD.y0 + 20 },
    ]
    this.message = ''
  }

  private humans(): MgPlayer[] {
    return this.players.filter((p) => !this.turned.has(p.slot))
  }

  protected play(): void {
    this.left--

    for (const p of this.players) {
      const i = this.inputFor(p.slot)
      const at = this.pos.get(p.slot)
      if (!at) continue
      const speed = this.turned.has(p.slot) ? ZOMBIE_SPEED + 0.25 : HUMAN_SPEED
      at.x += ((i.right ? 1 : 0) - (i.left ? 1 : 0)) * speed
      at.y += ((i.down ? 1 : 0) - (i.up ? 1 : 0)) * speed
      clampField(at)
      if (!this.turned.has(p.slot)) p.score = this.frame
    }

    const prey = this.humans()

    // The shamblers head for whoever is nearest.
    for (const z of this.shamblers) {
      let best: { x: number; y: number } | null = null
      let bestD = Infinity
      for (const p of prey) {
        const at = this.pos.get(p.slot)
        if (!at) continue
        const d = Math.hypot(at.x - z.x, at.y - z.y)
        if (d < bestD) {
          bestD = d
          best = at
        }
      }
      if (!best) continue
      const d = Math.hypot(best.x - z.x, best.y - z.y) || 1
      z.x += ((best.x - z.x) / d) * ZOMBIE_SPEED
      z.y += ((best.y - z.y) / d) * ZOMBIE_SPEED
    }

    const hunters: { x: number; y: number }[] = [
      ...this.shamblers,
      ...[...this.turned].map((s) => this.pos.get(s)).filter((a): a is { x: number; y: number } => !!a),
    ]

    for (const p of prey) {
      const at = this.pos.get(p.slot)
      if (!at) continue
      for (const h of hunters) {
        if (Math.hypot(h.x - at.x, h.y - at.y) < ZOMBIE_REACH) {
          this.turned.add(p.slot)
          p.score = this.frame
          this.message = `${p.name} has been got`
          break
        }
      }
    }

    const left = this.humans()
    if (left.length <= (this.players.length > 1 ? 1 : 0) || this.left <= 0) {
      for (const p of left) p.score = this.frame
      this.finish(left.length === 1 ? `${left[0].name} never got caught` : '')
    }
  }

  protected extraSnap() {
    return {
      left: this.left,
      turned: [...this.turned],
      pos: [...this.pos.entries()].map(([s, a]) => [s, Math.round(a.x), Math.round(a.y)] as const),
      shamblers: this.shamblers.map((z) => [Math.round(z.x), Math.round(z.y)] as const),
    }
  }

  protected applyExtra(extra: unknown): void {
    const e = extra as {
      left?: number
      turned?: number[]
      pos?: [number, number, number][]
      shamblers?: [number, number][]
    } | null
    if (!e) return
    if (e.left !== undefined) this.left = e.left
    if (e.turned) this.turned = new Set(e.turned)
    if (e.pos) this.pos = new Map(e.pos.map(([s, x, y]) => [s, { x, y }]))
    if (e.shamblers) this.shamblers = e.shamblers.map(([x, y]) => ({ x, y }))
  }
}

// -------------------------------------------------------------- Jumbo Jump

const JUMBO_LIMIT = 40 * 60
export const JUMBO_AIR = 24
const JUMBO_COOL = 34
const JUMBO_REACH = 10

export class JumboGame extends BaseMinigame {
  readonly id = 'jumbo' as const
  /** Where the rope is across the beach. */
  ropeX = FIELD.x0
  speed = 2.4
  passes = 0
  air = new Map<number, number>()
  cool = new Map<number, number>()
  spot = new Map<number, number>()
  left = JUMBO_LIMIT

  protected begin(): void {
    this.left = JUMBO_LIMIT
    const n = this.players.length
    this.players.forEach((p, i) => this.spot.set(p.slot, FIELD.x0 + ((i + 1) / (n + 1)) * W))
    this.ropeX = FIELD.x0 - 20
    this.speed = 2.4
    this.message = ''
  }

  protected play(): void {
    this.left--

    this.ropeX += this.speed
    if (this.ropeX > FIELD.x1 + 20) {
      // Each pass is quicker than the last, so standing still stops working.
      this.ropeX = FIELD.x0 - 20
      this.passes++
      this.speed = Math.min(9, 2.4 + this.passes * 0.55)
    }

    for (const p of this.players) {
      if (p.out) continue
      const i = this.inputFor(p.slot)
      const air = this.air.get(p.slot) ?? 0
      const cool = this.cool.get(p.slot) ?? 0
      if (air > 0) this.air.set(p.slot, air - 1)
      else if (i.press && cool <= 0) {
        this.air.set(p.slot, JUMBO_AIR)
        this.cool.set(p.slot, JUMBO_COOL)
      }
      if (cool > 0) this.cool.set(p.slot, cool - 1)

      const x = this.spot.get(p.slot) ?? 0
      if ((this.air.get(p.slot) ?? 0) <= 0 && Math.abs(this.ropeX - x) < JUMBO_REACH) {
        p.out = true
        p.score = this.frame
        this.message = `${p.name} caught the rope`
        continue
      }
      p.score = this.frame
    }

    const alive = this.players.filter((p) => !p.out)
    if (alive.length <= (this.players.length > 1 ? 1 : 0) || this.left <= 0) {
      for (const p of alive) p.score = this.frame
      this.finish(alive.length === 1 ? `${alive[0].name} outlasted the rope` : '')
    }
  }

  protected extraSnap() {
    return {
      left: this.left,
      ropeX: Math.round(this.ropeX),
      speed: this.speed,
      air: [...this.air.entries()],
      spot: [...this.spot.entries()],
    }
  }

  protected applyExtra(extra: unknown): void {
    const e = extra as {
      left?: number
      ropeX?: number
      speed?: number
      air?: [number, number][]
      spot?: [number, number][]
    } | null
    if (!e) return
    if (e.left !== undefined) this.left = e.left
    if (e.ropeX !== undefined) this.ropeX = e.ropeX
    if (e.speed !== undefined) this.speed = e.speed
    if (e.air) this.air = new Map(e.air)
    if (e.spot) this.spot = new Map(e.spot)
  }
}

// ------------------------------------------------------------ Space Saucer

const SAUCER_LIMIT = 30 * 60
const SAUCER_SPEED = 2.15

export interface Rock {
  id: number
  x: number
  y: number
  vx: number
  r: number
}

export class SaucerGame extends BaseMinigame {
  readonly id = 'saucer' as const
  pos = new Map<number, { x: number; y: number }>()
  rocks: Rock[] = []
  left = SAUCER_LIMIT
  private nextId = 1
  private cool = 0

  protected begin(): void {
    this.left = SAUCER_LIMIT
    const n = this.players.length
    this.pos = new Map(
      this.players.map((p, i) => [
        p.slot,
        { x: FIELD.x0 + 30, y: FIELD.y0 + ((i + 1) / (n + 1)) * H },
      ]),
    )
    this.message = ''
  }

  protected play(): void {
    this.left--

    for (const p of this.players) {
      if (p.out) continue
      const i = this.inputFor(p.slot)
      const at = this.pos.get(p.slot)
      if (!at) continue
      at.x += ((i.right ? 1 : 0) - (i.left ? 1 : 0)) * SAUCER_SPEED
      at.y += ((i.down ? 1 : 0) - (i.up ? 1 : 0)) * SAUCER_SPEED
      clampField(at, 9)
      p.score = this.frame
    }

    this.cool--
    if (this.cool <= 0) {
      const elapsed = SAUCER_LIMIT - this.left
      this.cool = Math.max(9, 30 - Math.floor(elapsed / 100) * 4)
      const r = 5 + this.rand() * 5
      this.rocks.push({
        id: this.nextId++,
        x: FIELD.x1 + 20,
        y: FIELD.y0 + 8 + this.rand() * (H - 16),
        vx: -(1.8 + this.rand() * 1.6),
        r,
      })
    }

    for (const r of this.rocks) r.x += r.vx
    this.rocks = this.rocks.filter((r) => r.x > FIELD.x0 - 40)

    for (const p of this.players) {
      if (p.out) continue
      const at = this.pos.get(p.slot)
      if (!at) continue
      for (const r of this.rocks) {
        if (Math.hypot(r.x - at.x, r.y - at.y) < r.r + 7) {
          p.out = true
          p.score = this.frame
          this.message = `${p.name} flew into one`
          break
        }
      }
    }

    const alive = this.players.filter((p) => !p.out)
    if (alive.length <= (this.players.length > 1 ? 1 : 0) || this.left <= 0) {
      for (const p of alive) p.score = this.frame
      this.finish(alive.length === 1 ? `${alive[0].name} flew it clean` : '')
    }
  }

  protected extraSnap() {
    return {
      left: this.left,
      pos: [...this.pos.entries()].map(([s, a]) => [s, Math.round(a.x), Math.round(a.y)] as const),
      rocks: this.rocks.map((r) => [r.id, Math.round(r.x), Math.round(r.y), r.vx, r.r] as const),
    }
  }

  protected applyExtra(extra: unknown): void {
    const e = extra as {
      left?: number
      pos?: [number, number, number][]
      rocks?: [number, number, number, number, number][]
    } | null
    if (!e) return
    if (e.left !== undefined) this.left = e.left
    if (e.pos) this.pos = new Map(e.pos.map(([s, x, y]) => [s, { x, y }]))
    if (e.rocks) this.rocks = e.rocks.map(([id, x, y, vx, r]) => ({ id, x, y, vx, r }))
  }
}

// --------------------------------------------------------- Quicker Chipper

const CHIPPER_LIMIT = 22 * 60
/** The window where a log is actually on the mark, as a fraction of the chute. */
export const CHIP_BAND: [number, number] = [0.84, 1.0]
const CHIP_STALL = 20

export class ChipperGame extends BaseMinigame {
  readonly id = 'chipper' as const
  /** How far down its chute each player's log has come, 0..1. */
  logs = new Map<number, number>()
  speeds = new Map<number, number>()
  /** Frames of stall after a wild swing. */
  stall = new Map<number, number>()
  /** Set on the frame a log is chopped, so the renderer can flash it. */
  chopped = new Map<number, number>()
  left = CHIPPER_LIMIT

  protected begin(): void {
    this.left = CHIPPER_LIMIT
    for (const p of this.players) {
      this.logs.set(p.slot, -this.rand() * 0.6)
      this.speeds.set(p.slot, 0.012 + this.rand() * 0.004)
    }
    this.message = ''
  }

  protected play(): void {
    this.left--

    for (const p of this.players) {
      const stall = this.stall.get(p.slot) ?? 0
      if (stall > 0) {
        this.stall.set(p.slot, stall - 1)
        // The log keeps coming while you are recovering, which is the cost.
      }
      const at = (this.logs.get(p.slot) ?? 0) + (this.speeds.get(p.slot) ?? 0.012)
      this.logs.set(p.slot, at)
      if (at > 1.2) {
        // Missed it entirely; next one is on its way.
        this.logs.set(p.slot, -0.15)
      }

      if (stall > 0) continue
      if (!this.pressed(p.slot)) continue
      if (at >= CHIP_BAND[0] && at <= CHIP_BAND[1]) {
        p.score++
        this.chopped.set(p.slot, this.frame)
        this.logs.set(p.slot, -0.12)
        this.speeds.set(p.slot, Math.min(0.035, (this.speeds.get(p.slot) ?? 0.012) + 0.0011))
      } else {
        this.stall.set(p.slot, CHIP_STALL)
      }
    }

    if (this.left <= 0) this.finish()
  }

  protected extraSnap() {
    return {
      left: this.left,
      logs: [...this.logs.entries()].map(([s, v]) => [s, Math.round(v * 1000) / 1000] as const),
      stall: [...this.stall.entries()],
      chopped: [...this.chopped.entries()],
    }
  }

  protected applyExtra(extra: unknown): void {
    const e = extra as {
      left?: number
      logs?: [number, number][]
      stall?: [number, number][]
      chopped?: [number, number][]
    } | null
    if (!e) return
    if (e.left !== undefined) this.left = e.left
    if (e.logs) this.logs = new Map(e.logs)
    if (e.stall) this.stall = new Map(e.stall)
    if (e.chopped) this.chopped = new Map(e.chopped)
  }
}

// ---------------------------------------------------------------- Maze Daze

export const MAZE_COLS = 27
export const MAZE_ROWS = 11
export const MAZE_CW = W / MAZE_COLS
export const MAZE_CH = H / MAZE_ROWS
const MAZE_LIMIT = 45 * 60
const MAZE_SPEED = 1.55
const MAZE_R = 3.4
/** Score for anyone still wandering when the clock runs out. */
export const MAZE_LOST = 9999

export class MazeGame extends BaseMinigame {
  readonly id = 'maze' as const
  /** Solid cells, row-major, MAZE_COLS x MAZE_ROWS. */
  walls: boolean[] = []
  pos = new Map<number, { x: number; y: number }>()
  home = new Set<number>()
  left = MAZE_LIMIT

  protected begin(): void {
    this.left = MAZE_LIMIT
    this.carve()
    // Everyone starts in the entrance cell, nudged apart a little.
    const c = this.cellCentre(1, 1)
    this.players.forEach((p, i) => {
      const a = (i / Math.max(1, this.players.length)) * Math.PI * 2
      this.pos.set(p.slot, { x: c.x + Math.cos(a) * 2.6, y: c.y + Math.sin(a) * 2.2 })
    })
    this.message = ''
  }

  private idx(cx: number, cy: number): number {
    return cy * MAZE_COLS + cx
  }

  solidAt(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= MAZE_COLS || cy >= MAZE_ROWS) return true
    return this.walls[this.idx(cx, cy)]
  }

  cellCentre(cx: number, cy: number): { x: number; y: number } {
    return { x: FIELD.x0 + (cx + 0.5) * MAZE_CW, y: FIELD.y0 + (cy + 0.5) * MAZE_CH }
  }

  get goal(): { cx: number; cy: number } {
    return { cx: MAZE_COLS - 2, cy: MAZE_ROWS - 2 }
  }

  /** A plain seeded depth-first carve: every cell reachable, one route between any two. */
  private carve(): void {
    this.walls = new Array(MAZE_COLS * MAZE_ROWS).fill(true)
    const stack: [number, number][] = [[1, 1]]
    this.walls[this.idx(1, 1)] = false
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1]
      const dirs: [number, number][] = [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ]
      // Shuffle with the seeded generator so the same seed gives the same maze.
      for (let i = dirs.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1))
        ;[dirs[i], dirs[j]] = [dirs[j], dirs[i]]
      }
      let moved = false
      for (const [dx, dy] of dirs) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx <= 0 || ny <= 0 || nx >= MAZE_COLS - 1 || ny >= MAZE_ROWS - 1) continue
        if (!this.walls[this.idx(nx, ny)]) continue
        this.walls[this.idx(cx + dx / 2, cy + dy / 2)] = false
        this.walls[this.idx(nx, ny)] = false
        stack.push([nx, ny])
        moved = true
        break
      }
      if (!moved) stack.pop()
    }
  }

  /** True if a circle at (x,y) overlaps any solid cell. */
  private blocked(x: number, y: number): boolean {
    for (const [ox, oy] of [
      [-MAZE_R, -MAZE_R],
      [MAZE_R, -MAZE_R],
      [-MAZE_R, MAZE_R],
      [MAZE_R, MAZE_R],
    ]) {
      const cx = Math.floor((x + ox - FIELD.x0) / MAZE_CW)
      const cy = Math.floor((y + oy - FIELD.y0) / MAZE_CH)
      if (this.solidAt(cx, cy)) return true
    }
    return false
  }

  protected play(): void {
    this.left--
    const goal = this.goal

    for (const p of this.players) {
      if (this.home.has(p.slot)) continue
      const i = this.inputFor(p.slot)
      const at = this.pos.get(p.slot)
      if (!at) continue
      // One axis at a time, so running along a wall slides instead of sticking.
      const dx = ((i.right ? 1 : 0) - (i.left ? 1 : 0)) * MAZE_SPEED
      const dy = ((i.down ? 1 : 0) - (i.up ? 1 : 0)) * MAZE_SPEED
      if (dx && !this.blocked(at.x + dx, at.y)) at.x += dx
      if (dy && !this.blocked(at.x, at.y + dy)) at.y += dy

      const cx = Math.floor((at.x - FIELD.x0) / MAZE_CW)
      const cy = Math.floor((at.y - FIELD.y0) / MAZE_CH)
      if (cx === goal.cx && cy === goal.cy) {
        this.home.add(p.slot)
        p.score = this.frame
        this.message = `${p.name} is out`
      }
    }

    if (this.home.size >= this.players.length || this.left <= 0) {
      for (const p of this.players) {
        if (this.home.has(p.slot)) continue
        p.score = MAZE_LOST
        p.out = true
      }
      this.finish()
    }
  }

  protected hasScored(p: MgPlayer): boolean {
    return p.out || this.home.has(p.slot)
  }

  protected extraSnap() {
    return {
      left: this.left,
      walls: this.walls.map((w) => (w ? 1 : 0)),
      home: [...this.home],
      pos: [...this.pos.entries()].map(([s, a]) => [s, Math.round(a.x * 2) / 2, Math.round(a.y * 2) / 2] as const),
    }
  }

  protected applyExtra(extra: unknown): void {
    const e = extra as { left?: number; walls?: number[]; home?: number[]; pos?: [number, number, number][] } | null
    if (!e) return
    if (e.left !== undefined) this.left = e.left
    if (e.walls) this.walls = e.walls.map((w) => !!w)
    if (e.home) this.home = new Set(e.home)
    if (e.pos) this.pos = new Map(e.pos.map(([s, x, y]) => [s, { x, y }]))
  }
}

export function buildArena(id: string, roster: MgRosterEntry[], seed: number) {
  if (id === 'zombie') return new ZombieGame(roster, seed)
  if (id === 'jumbo') return new JumboGame(roster, seed)
  if (id === 'saucer') return new SaucerGame(roster, seed)
  if (id === 'chipper') return new ChipperGame(roster, seed)
  if (id === 'maze') return new MazeGame(roster, seed)
  return null
}
