/**
 * The five roaming minigames: the ones played on a field rather than from a
 * standing start.
 *
 * They share the frame in types.ts - a roster, one clock, one number per
 * player - so what is actually here is five different ways to earn that
 * number: be the last one bitten, outlast the rope, take the best photograph,
 * chip the most balls in, or reach the middle of the maze first.
 *
 * Everything is DOM-free so the smoke test can drive it from Node, and
 * anything random comes from the seeded generator so a test gets the same
 * maze, the same rocks and the same rope twice.
 */
import { BaseMinigame, FIELD, type MgPlayer, type MgRosterEntry } from './types'

const W = FIELD.x1 - FIELD.x0
const H = FIELD.y1 - FIELD.y0

export interface Vec {
  x: number
  y: number
}

/** A rock or crate in the way. Blocks players and zombies alike. */
export interface Obstacle {
  x: number
  y: number
  rx: number
  ry: number
}

function clampField(p: Vec, pad = 8): void {
  p.x = Math.max(FIELD.x0 + pad, Math.min(FIELD.x1 - pad, p.x))
  p.y = Math.max(FIELD.y0 + pad, Math.min(FIELD.y1 - pad, p.y))
}

function hitsAny(obs: Obstacle[], x: number, y: number, r: number): boolean {
  for (const o of obs) {
    const dx = (x - o.x) / (o.rx + r)
    const dy = (y - o.y) / (o.ry + r)
    if (dx * dx + dy * dy < 1) return true
  }
  return false
}

/**
 * Moves one axis at a time so running into a rock slides along it rather than
 * sticking to it - the same trick the maze uses against its hedges.
 */
function slide(obs: Obstacle[], at: Vec, dx: number, dy: number, r: number): void {
  if (dx && !hitsAny(obs, at.x + dx, at.y, r)) at.x += dx
  if (dy && !hitsAny(obs, at.x, at.y + dy, r)) at.y += dy
}

/** Shoving: hold push and lean on somebody to move them. */
function shove(
  players: MgPlayer[],
  pos: Map<number, Vec>,
  pushing: (slot: number) => boolean,
  active: (p: MgPlayer) => boolean,
  reach = 15,
): void {
  for (const a of players) {
    if (!active(a) || !pushing(a.slot)) continue
    const at = pos.get(a.slot)
    if (!at) continue
    for (const b of players) {
      if (b.slot === a.slot || !active(b)) continue
      const bt = pos.get(b.slot)
      if (!bt) continue
      const dx = bt.x - at.x
      const dy = bt.y - at.y
      const d = Math.hypot(dx, dy)
      if (d >= reach) continue
      const k = (reach - d) * 0.35
      const nx = d === 0 ? 1 : dx / d
      const ny = d === 0 ? 0 : dy / d
      bt.x += nx * k
      bt.y += ny * k
      clampField(bt)
    }
  }
}

// -------------------------------------------------------------- Zombie Tag

const ZOMBIE_LIMIT = 60 * 60
const ZOMBIE_REACH = 11
const HUMAN_SPEED = 2.15
/** Deliberately slow. They win by cornering you, not by outrunning you. */
const SHAMBLER_SPEED = 0.78
const TURNED_SPEED = 1.15
const ZOMBIE_R = 7

export class ZombieGame extends BaseMinigame {
  readonly id = 'zombie' as const
  pos = new Map<number, Vec>()
  /** Players who have been bitten. They keep playing, as one of them. */
  turned = new Set<number>()
  /** The ones it starts with. Not players, so nobody draws the short straw. */
  shamblers: Vec[] = []
  obstacles: Obstacle[] = []
  /** Where each shambler was a moment ago, to notice one that has wedged itself. */
  private lastAt: Vec[] = []
  private stuckFor: number[] = []
  left = ZOMBIE_LIMIT

  protected begin(): void {
    this.left = ZOMBIE_LIMIT
    this.obstacles = []
    // Rocks to be cornered against. Kept off the middle so nobody spawns inside one.
    for (let i = 0; i < 7; i++) {
      const rx = 16 + this.rand() * 16
      const ry = 11 + this.rand() * 9
      this.obstacles.push({
        x: FIELD.x0 + 40 + this.rand() * (W - 80),
        y: FIELD.y0 + 26 + this.rand() * (H - 52),
        rx,
        ry,
      })
    }

    const n = this.players.length
    this.players.forEach((p, i) => {
      const at = { x: FIELD.x0 + ((i + 1) / (n + 1)) * W, y: FIELD.y1 - 24 }
      // Nudge anyone who landed in a rock out of it.
      let guard = 0
      while (hitsAny(this.obstacles, at.x, at.y, 8) && guard++ < 30) at.y -= 6
      this.pos.set(p.slot, at)
    })

    // Three of them, spread out, so the field closes in from more than one side.
    this.shamblers = [
      { x: FIELD.x0 + 20, y: FIELD.y0 + 18 },
      { x: FIELD.x1 - 20, y: FIELD.y0 + 18 },
      { x: (FIELD.x0 + FIELD.x1) / 2, y: FIELD.y0 + 14 },
    ]
    this.lastAt = this.shamblers.map((z) => ({ ...z }))
    this.stuckFor = this.shamblers.map(() => 0)
    this.message = ''
  }

  private humans(): MgPlayer[] {
    return this.players.filter((p) => !this.turned.has(p.slot))
  }

  isZombie(slot: number): boolean {
    return this.turned.has(slot)
  }

  protected play(): void {
    this.left--

    for (const p of this.players) {
      const i = this.inputFor(p.slot)
      const at = this.pos.get(p.slot)
      if (!at) continue
      const speed = this.turned.has(p.slot) ? TURNED_SPEED : HUMAN_SPEED
      slide(
        this.obstacles,
        at,
        ((i.right ? 1 : 0) - (i.left ? 1 : 0)) * speed,
        ((i.down ? 1 : 0) - (i.up ? 1 : 0)) * speed,
        7,
      )
      clampField(at)
    }

    // Anyone can shove anyone here: it is the only way to buy yourself a
    // second when the corner closes, and the only way to make it worse for
    // somebody else.
    shove(
      this.players,
      this.pos,
      (s) => this.inputFor(s).push,
      () => true,
    )

    const prey = this.humans()

    for (const z of this.shamblers) {
      let best: Vec | null = null
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
      let vx = ((best.x - z.x) / d) * SHAMBLER_SPEED
      let vy = ((best.y - z.y) / d) * SHAMBLER_SPEED

      // They have no pathfinding, so one can wedge itself against a rock and
      // stay there - which would leave somebody uncatchable and the round
      // unable to end. If it has stopped getting anywhere, send it round.
      const zi = this.shamblers.indexOf(z)
      const was = this.lastAt[zi]
      if (was && Math.hypot(z.x - was.x, z.y - was.y) < SHAMBLER_SPEED * 0.4) this.stuckFor[zi]++
      else this.stuckFor[zi] = 0
      if (was) {
        was.x = z.x
        was.y = z.y
      }
      if (this.stuckFor[zi] > 30) {
        const turn = this.stuckFor[zi] > 120 ? -1 : 1
        const nx = -vy * turn
        const ny = vx * turn
        vx = nx
        vy = ny
      }

      slide(this.obstacles, z, vx, vy, ZOMBIE_R)
      clampField(z, 6)
    }

    const hunters: Vec[] = [
      ...this.shamblers,
      ...[...this.turned].map((s) => this.pos.get(s)).filter((a): a is Vec => !!a),
    ]

    for (const p of prey) {
      const at = this.pos.get(p.slot)
      if (!at) continue
      // Survivors bank the clock, so being bitten late beats being bitten early.
      p.score = this.frame
      for (const h of hunters) {
        if (Math.hypot(h.x - at.x, h.y - at.y) < ZOMBIE_REACH) {
          this.turned.add(p.slot)
          p.score = this.frame
          this.message = `${p.name} has been bitten`
          break
        }
      }
    }

    // It runs until everybody has been got: whoever lasted longest wins, which
    // is the same thing as being the last one bitten.
    const left = this.humans()
    if (left.length === 0 || this.left <= 0) {
      for (const p of left) p.score = this.frame
      const last = [...this.players].sort((a, b) => b.score - a.score)[0]
      this.finish(last ? `${last.name} was the last one bitten` : '')
    }
  }

  protected extraSnap() {
    return {
      left: this.left,
      turned: [...this.turned],
      pos: [...this.pos.entries()].map(([s, a]) => [s, Math.round(a.x), Math.round(a.y)] as const),
      shamblers: this.shamblers.map((z) => [Math.round(z.x), Math.round(z.y)] as const),
      obstacles: this.obstacles.map((o) => [Math.round(o.x), Math.round(o.y), o.rx, o.ry] as const),
    }
  }

  protected applyExtra(extra: unknown): void {
    const e = extra as {
      left?: number
      turned?: number[]
      pos?: [number, number, number][]
      shamblers?: [number, number][]
      obstacles?: [number, number, number, number][]
    } | null
    if (!e) return
    if (e.left !== undefined) this.left = e.left
    if (e.turned) this.turned = new Set(e.turned)
    if (e.pos) this.pos = new Map(e.pos.map(([s, x, y]) => [s, { x, y }]))
    if (e.shamblers) this.shamblers = e.shamblers.map(([x, y]) => ({ x, y }))
    if (e.obstacles) this.obstacles = e.obstacles.map(([x, y, rx, ry]) => ({ x, y, rx, ry }))
  }
}

// -------------------------------------------------------------- Jumbo Jump

const JUMBO_LIMIT = 45 * 60
export const JUMBO_AIR = 26
const JUMBO_COOL = 34
const JUMBO_REACH = 9
const JUMBO_SPEED = 2.6
/** Every pass picks one of these. Not a ramp - the point is that you cannot settle into a rhythm. */
const ROPE_SPEEDS = [1.5, 2.4, 3.6, 5.4, 2.0, 4.4]

export type RopeAxis = 'x' | 'y'

export class JumboGame extends BaseMinigame {
  readonly id = 'jumbo' as const
  pos = new Map<number, Vec>()
  air = new Map<number, number>()
  cool = new Map<number, number>()
  /** Which way the rope runs and where along that axis it currently is. */
  axis: RopeAxis = 'x'
  dir: 1 | -1 = 1
  ropeAt = 0
  speed = 2.4
  passes = 0
  left = JUMBO_LIMIT

  protected begin(): void {
    this.left = JUMBO_LIMIT
    const n = this.players.length
    this.players.forEach((p, i) => {
      this.pos.set(p.slot, {
        x: FIELD.x0 + ((i + 1) / (n + 1)) * W,
        y: FIELD.y0 + H * (0.4 + (i % 2) * 0.3),
      })
    })
    this.nextPass()
    this.message = ''
  }

  private nextPass(): void {
    // Any of the four sides, at any of the speeds.
    const roll = Math.floor(this.rand() * 4)
    this.axis = roll < 2 ? 'x' : 'y'
    this.dir = roll % 2 === 0 ? 1 : -1
    this.speed = ROPE_SPEEDS[Math.floor(this.rand() * ROPE_SPEEDS.length)]
    const lo = this.axis === 'x' ? FIELD.x0 : FIELD.y0
    const hi = this.axis === 'x' ? FIELD.x1 : FIELD.y1
    this.ropeAt = this.dir === 1 ? lo - 24 : hi + 24
  }

  protected play(): void {
    this.left--

    this.ropeAt += this.speed * this.dir
    const lo = this.axis === 'x' ? FIELD.x0 : FIELD.y0
    const hi = this.axis === 'x' ? FIELD.x1 : FIELD.y1
    if ((this.dir === 1 && this.ropeAt > hi + 24) || (this.dir === -1 && this.ropeAt < lo - 24)) {
      this.passes++
      this.nextPass()
    }

    for (const p of this.players) {
      if (p.out) continue
      const i = this.inputFor(p.slot)
      const at = this.pos.get(p.slot)
      if (!at) continue

      // You can run around while it comes at you, which is half the game.
      at.x += ((i.right ? 1 : 0) - (i.left ? 1 : 0)) * JUMBO_SPEED
      at.y += ((i.down ? 1 : 0) - (i.up ? 1 : 0)) * JUMBO_SPEED
      clampField(at)

      const air = this.air.get(p.slot) ?? 0
      const cool = this.cool.get(p.slot) ?? 0
      if (air > 0) this.air.set(p.slot, air - 1)
      else if (i.press && cool <= 0) {
        this.air.set(p.slot, JUMBO_AIR)
        this.cool.set(p.slot, JUMBO_COOL)
      }
      if (cool > 0) this.cool.set(p.slot, cool - 1)

      const along = this.axis === 'x' ? at.x : at.y
      if ((this.air.get(p.slot) ?? 0) <= 0 && Math.abs(this.ropeAt - along) < JUMBO_REACH) {
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
      axis: this.axis,
      dir: this.dir,
      ropeAt: Math.round(this.ropeAt),
      speed: this.speed,
      air: [...this.air.entries()],
      pos: [...this.pos.entries()].map(([s, a]) => [s, Math.round(a.x), Math.round(a.y)] as const),
    }
  }

  protected applyExtra(extra: unknown): void {
    const e = extra as {
      left?: number
      axis?: RopeAxis
      dir?: 1 | -1
      ropeAt?: number
      speed?: number
      air?: [number, number][]
      pos?: [number, number, number][]
    } | null
    if (!e) return
    if (e.left !== undefined) this.left = e.left
    if (e.axis) this.axis = e.axis
    if (e.dir) this.dir = e.dir
    if (e.ropeAt !== undefined) this.ropeAt = e.ropeAt
    if (e.speed !== undefined) this.speed = e.speed
    if (e.air) this.air = new Map(e.air)
    if (e.pos) this.pos = new Map(e.pos.map(([s, x, y]) => [s, { x, y }]))
  }
}

// ------------------------------------------------------------ Space Saucer

const SAUCER_LIMIT = 16 * 60
/** Where the lens is pointed. A photograph is scored on how far the saucer was from here. */
export const LENS = { x: (FIELD.x0 + FIELD.x1) / 2, y: FIELD.y0 + H * 0.42 }
export const SAUCER_NEVER = 9999

export class SaucerGame extends BaseMinigame {
  readonly id = 'saucer' as const
  /** Where the saucer is, and where it came in from. */
  saucer: Vec = { x: 0, y: 0 }
  private vx = 2.6
  private wobble = 0
  private phase0 = 0
  /** Each player's photograph: where the saucer was when they pressed. */
  shots = new Map<number, Vec>()
  left = SAUCER_LIMIT

  protected begin(): void {
    this.left = SAUCER_LIMIT
    const leftToRight = this.rand() < 0.5
    this.vx = (2.1 + this.rand() * 1.7) * (leftToRight ? 1 : -1)
    // Gentle: the timing on the pass should decide it, not a lucky bob.
    this.wobble = 5 + this.rand() * 9
    this.phase0 = this.rand() * Math.PI * 2
    this.saucer = { x: leftToRight ? FIELD.x0 - 30 : FIELD.x1 + 30, y: LENS.y }
    this.message = ''
  }

  protected play(): void {
    this.left--
    this.saucer.x += this.vx
    this.saucer.y = LENS.y + Math.sin(this.frame * 0.03 + this.phase0) * this.wobble

    for (const p of this.players) {
      if (this.shots.has(p.slot)) continue
      if (!this.pressed(p.slot)) continue
      const shot = { x: this.saucer.x, y: this.saucer.y }
      this.shots.set(p.slot, shot)
      p.score = Math.round(Math.hypot(shot.x - LENS.x, shot.y - LENS.y))
    }

    const gone = this.vx > 0 ? this.saucer.x > FIELD.x1 + 40 : this.saucer.x < FIELD.x0 - 40
    const waiting = this.players.filter((p) => !this.shots.has(p.slot))
    if (waiting.length === 0 || gone || this.left <= 0) {
      for (const p of waiting) {
        p.score = SAUCER_NEVER
        p.out = true
      }
      this.finish()
    }
  }

  protected hasScored(p: MgPlayer): boolean {
    return p.out || this.shots.has(p.slot)
  }

  protected extraSnap() {
    return {
      left: this.left,
      saucer: [Math.round(this.saucer.x), Math.round(this.saucer.y)] as const,
      shots: [...this.shots.entries()].map(([s, a]) => [s, Math.round(a.x), Math.round(a.y)] as const),
    }
  }

  protected applyExtra(extra: unknown): void {
    const e = extra as { left?: number; saucer?: [number, number]; shots?: [number, number, number][] } | null
    if (!e) return
    if (e.left !== undefined) this.left = e.left
    if (e.saucer) this.saucer = { x: e.saucer[0], y: e.saucer[1] }
    if (e.shots) this.shots = new Map(e.shots.map(([s, x, y]) => [s, { x, y }]))
  }
}

// --------------------------------------------------------- Quicker Chipper

const CHIPPER_LIMIT = 30 * 60
/** Power climbs to 1 and stops there, so holding forever is a duff shot, not a free one. */
const CHARGE_RATE = 0.016
/** The hole sits here on the power scale; inside IN_RANGE drops, inside PERFECT drops well. */
export const CHIP_TARGET = 0.72
export const CHIP_IN_RANGE = 0.1
export const CHIP_PERFECT = 0.035
const BALL_FRAMES = 34

export interface Ball {
  power: number
  t: number
  result: 'perfect' | 'in' | 'miss'
}

export class ChipperGame extends BaseMinigame {
  readonly id = 'chipper' as const
  /** How far the wind-up has got, or null when nobody is winding up. */
  charge = new Map<number, number>()
  /** The shot in flight, if any. */
  balls = new Map<number, Ball>()
  holed = new Map<number, number>()
  left = CHIPPER_LIMIT

  protected begin(): void {
    this.left = CHIPPER_LIMIT
    this.message = ''
  }

  /** How a given power reads: dead on, close enough, or nowhere near. */
  static judge(power: number): 'perfect' | 'in' | 'miss' {
    const off = Math.abs(power - CHIP_TARGET)
    if (off <= CHIP_PERFECT) return 'perfect'
    if (off <= CHIP_IN_RANGE) return 'in'
    return 'miss'
  }

  protected play(): void {
    this.left--

    for (const p of this.players) {
      const ball = this.balls.get(p.slot)
      if (ball) {
        ball.t++
        if (ball.t >= BALL_FRAMES) this.balls.delete(p.slot)
        continue
      }

      const held = this.inputFor(p.slot).press
      const charging = this.charge.get(p.slot)

      if (held) {
        // Winds up while held, and caps rather than wrapping - overcooking it
        // has to be a real risk or there is no reason to let go on time.
        this.charge.set(p.slot, Math.min(1, (charging ?? 0) + CHARGE_RATE))
        continue
      }

      if (charging === undefined) continue
      // Let go: that is the swing.
      this.charge.delete(p.slot)
      const result = ChipperGame.judge(charging)
      this.balls.set(p.slot, { power: charging, t: 0, result })
      if (result === 'perfect') {
        p.score += 3
        this.holed.set(p.slot, (this.holed.get(p.slot) ?? 0) + 1)
        this.message = `${p.name} holed it dead on`
      } else if (result === 'in') {
        p.score += 1
        this.holed.set(p.slot, (this.holed.get(p.slot) ?? 0) + 1)
      }
    }

    if (this.left <= 0) this.finish()
  }

  protected extraSnap() {
    return {
      left: this.left,
      charge: [...this.charge.entries()].map(([s, v]) => [s, Math.round(v * 1000) / 1000] as const),
      balls: [...this.balls.entries()].map(([s, b]) => [s, b.power, b.t, b.result] as const),
    }
  }

  protected applyExtra(extra: unknown): void {
    const e = extra as {
      left?: number
      charge?: [number, number][]
      balls?: [number, number, number, 'perfect' | 'in' | 'miss'][]
    } | null
    if (!e) return
    if (e.left !== undefined) this.left = e.left
    if (e.charge) this.charge = new Map(e.charge)
    if (e.balls) this.balls = new Map(e.balls.map(([s, power, t, result]) => [s, { power, t, result }]))
  }
}

// ---------------------------------------------------------------- Maze Daze

// Both odd, and both an odd number of cells from the middle: the carve only
// ever opens odd cells, so an even centre would be a goal walled in forever.
export const MAZE_COLS = 27
export const MAZE_ROWS = 11
export const MAZE_CW = W / MAZE_COLS
export const MAZE_CH = H / MAZE_ROWS
const MAZE_LIMIT = 60 * 60
const MAZE_SPEED = 1.5
const MAZE_R = 3.2
export const MAZE_LOST = 9999

/** Quarter turns applied to a player's movement, courtesy of the pads. */
export type Spin = 0 | 1 | 2 | 3

export class MazeGame extends BaseMinigame {
  readonly id = 'maze' as const
  walls: boolean[] = []
  pos = new Map<number, Vec>()
  /** How far each player's controls have been turned. */
  spin = new Map<number, Spin>()
  /** Frame each player last stepped on a pad, so one step is not read as twenty. */
  private padAt = new Map<number, number>()
  /** Set when a player's controls just turned, for the renderer to flash. */
  spun = new Map<number, number>()
  home = new Set<number>()
  pads: { cx: number; cy: number }[] = []
  left = MAZE_LIMIT

  protected begin(): void {
    this.left = MAZE_LIMIT
    this.carve()
    // Everybody starts at the outside, spread around, all racing inward.
    const corners: [number, number][] = [
      [1, 1],
      [MAZE_COLS - 2, 1],
      [1, MAZE_ROWS - 2],
      [MAZE_COLS - 2, MAZE_ROWS - 2],
    ]
    this.players.forEach((p, i) => {
      const [cx, cy] = corners[i % corners.length]
      const c = this.cellCentre(cx, cy)
      const ring = Math.floor(i / corners.length)
      this.pos.set(p.slot, { x: c.x + ring * 3.2, y: c.y + ring * 2.4 })
      this.spin.set(p.slot, 0)
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

  cellCentre(cx: number, cy: number): Vec {
    return { x: FIELD.x0 + (cx + 0.5) * MAZE_CW, y: FIELD.y0 + (cy + 0.5) * MAZE_CH }
  }

  /** The middle of the maze - what everybody is racing for. */
  get goal(): { cx: number; cy: number } {
    return { cx: (MAZE_COLS - 1) / 2, cy: (MAZE_ROWS - 1) / 2 }
  }

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

    // Two pads, one either side of the middle, both on carved ground.
    const g = this.goal
    this.pads = [
      { cx: Math.max(1, g.cx - 8), cy: g.cy },
      { cx: Math.min(MAZE_COLS - 2, g.cx + 8), cy: g.cy },
    ].map((pad) => {
      let { cx, cy } = pad
      // Walk to the nearest open cell if the carve left this one solid.
      let guard = 0
      while (this.solidAt(cx, cy) && guard++ < 20) cx += cx < g.cx ? 1 : -1
      return { cx, cy }
    })
  }

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

  /**
   * Turns a player's intent by however many quarter turns their pads have
   * racked up. Nothing on the keyboard changes - what changes is where those
   * keys take you, which is the thing you have to work out.
   */
  private turned(slot: number, dx: number, dy: number): [number, number] {
    const spin = this.spin.get(slot) ?? 0
    let x = dx
    let y = dy
    for (let i = 0; i < spin; i++) {
      const nx = -y
      const ny = x
      x = nx
      y = ny
    }
    return [x, y]
  }

  protected play(): void {
    this.left--
    const goal = this.goal

    for (const p of this.players) {
      if (this.home.has(p.slot)) continue
      const i = this.inputFor(p.slot)
      const at = this.pos.get(p.slot)
      if (!at) continue
      const [dx, dy] = this.turned(
        p.slot,
        ((i.right ? 1 : 0) - (i.left ? 1 : 0)) * MAZE_SPEED,
        ((i.down ? 1 : 0) - (i.up ? 1 : 0)) * MAZE_SPEED,
      )
      if (dx && !this.blocked(at.x + dx, at.y)) at.x += dx
      if (dy && !this.blocked(at.x, at.y + dy)) at.y += dy

      const cx = Math.floor((at.x - FIELD.x0) / MAZE_CW)
      const cy = Math.floor((at.y - FIELD.y0) / MAZE_CH)

      for (const pad of this.pads) {
        if (cx !== pad.cx || cy !== pad.cy) continue
        // One step on a pad is one turn, not one per frame stood on it.
        if (this.frame - (this.padAt.get(p.slot) ?? -999) < 40) continue
        this.padAt.set(p.slot, this.frame)
        this.spin.set(p.slot, (((this.spin.get(p.slot) ?? 0) + 1) % 4) as Spin)
        this.spun.set(p.slot, this.frame)
        this.message = `${p.name} hit a pad`
      }

      if (cx === goal.cx && cy === goal.cy) {
        this.home.add(p.slot)
        p.score = this.frame
        this.message = `${p.name} made the middle`
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
      spin: [...this.spin.entries()],
      spun: [...this.spun.entries()],
      pads: this.pads.map((p) => [p.cx, p.cy] as const),
      pos: [...this.pos.entries()].map(([s, a]) => [s, Math.round(a.x * 2) / 2, Math.round(a.y * 2) / 2] as const),
    }
  }

  protected applyExtra(extra: unknown): void {
    const e = extra as {
      left?: number
      walls?: number[]
      home?: number[]
      spin?: [number, Spin][]
      spun?: [number, number][]
      pads?: [number, number][]
      pos?: [number, number, number][]
    } | null
    if (!e) return
    if (e.left !== undefined) this.left = e.left
    if (e.walls) this.walls = e.walls.map((w) => !!w)
    if (e.home) this.home = new Set(e.home)
    if (e.spin) this.spin = new Map(e.spin)
    if (e.spun) this.spun = new Map(e.spun)
    if (e.pads) this.pads = e.pads.map(([cx, cy]) => ({ cx, cy }))
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
