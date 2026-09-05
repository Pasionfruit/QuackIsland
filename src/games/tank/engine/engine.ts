/**
 * Tank Trouble's simulation.
 *
 * One host runs this; everyone else sends movement, aim and trigger state and
 * watches snapshots, the same shape as Smash and Duck szn. The one thing that
 * does *not* ride the wire is the maze itself: every peer rebuilds level N
 * from the same fixed seed (see `seedForLevel` in maze.ts), so a snapshot only
 * has to say which level it is and which of that level's walls have since
 * been blown open.
 */
import { clamp, rand } from '../../../lib/draw'
import { buildMaze, levelConfig, lineOfSight, seedForLevel, type Maze } from './maze'
import {
  ARENA,
  MAX_BULLETS_PER_TANK,
  MAX_LEVEL,
  MAX_MINES_PER_TANK,
  VIEW_H,
  VIEW_W,
  type Bullet,
  type Mine,
  type Particle,
  type Phase,
  type Tank,
  type TankKind,
  type Wall,
} from './types'

export interface TankInput {
  /** -1..1 on each axis; not required to be normalised. */
  moveX: number
  moveY: number
  aimX: number
  aimY: number
  fire: boolean
  mine: boolean
}

function emptyInput(): TankInput {
  return { moveX: 0, moveY: 0, aimX: VIEW_W / 2, aimY: VIEW_H / 2, fire: false, mine: false }
}

const INTRO_FRAMES = 130
const CLEAR_FRAMES = 130
const BULLET_SPEED = 3.4
const BULLET_MAX_BOUNCES = 8
const BULLET_LIFE = 260
const MISSILE_SPEED = 2.3
const MISSILE_TURN = 0.055
const MINE_ARM = 50
const MINE_FUSE = 60 * 14
const MINE_BLAST = 26
const TANK_RADIUS = 8.5
const FIRE_COOLDOWN = 14
const MINE_COOLDOWN = 30
const MAX_ENEMIES = 16

/** Cosmetic only - the lobby swatch a human tank is built from. */
export const PLAYER_COLORS = [
  '#4f8fbf',
  '#e0794f',
  '#7fb069',
  '#d9a05b',
  '#c85f96',
  '#7a4f8c',
  '#4fb0a5',
  '#c0653f',
]

/** Every AI kind reads as its own colour, so the threat is obvious on sight. */
const ENEMY_COLORS: Record<Exclude<TankKind, 'player'>, string> = {
  sentry: '#8a3f3f',
  gunner: '#b8722f',
  chaser: '#3f7a6e',
  sapper: '#6b5a34',
}

export interface TankConfig {
  players: number
}

export class TankEngine {
  config: TankConfig
  tanks: Tank[] = []
  bullets: Bullet[] = []
  mines: Mine[] = []
  particles: Particle[] = []
  level = 1
  phase: Phase = 'lobby'
  phaseTimer = 0
  frame = 0
  shake = 0
  maze: Maze
  /** Indices into `maze.walls` for wood walls a mine has already blown open. */
  destroyedWalls = new Set<number>()
  version = 0

  private inputs = new Map<number, TankInput>()
  private prevFire = new Map<number, boolean>()
  private prevMine = new Map<number, boolean>()
  private fireCd = new Map<number, number>()
  private mineCd = new Map<number, number>()
  private nextId = 1
  private liveWalls: Wall[] = []
  private events: { kind: 'explode' | 'shot' | 'levelClear'; x: number; y: number }[] = []

  constructor(config: Partial<TankConfig> = {}) {
    this.config = { players: 0, ...config }
    this.maze = buildMaze(seedForLevel(1), levelConfig(1))
    this.liveWalls = this.maze.walls
  }

  drainEvents() {
    const out = this.events
    this.events = []
    return out
  }

  // -------------------------------------------------------------- players

  addPlayer(slot: number, name: string, color?: string): Tank {
    const found = this.tanks.find((t) => t.slot === slot)
    if (found) return found
    const t: Tank = {
      id: this.nextId++,
      slot,
      name,
      color: color ?? PLAYER_COLORS[((slot % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length],
      kind: 'player',
      x: VIEW_W / 2,
      y: VIEW_H / 2,
      vx: 0,
      vy: 0,
      angle: 0,
      aimX: VIEW_W / 2,
      aimY: VIEW_H / 2,
      alive: this.phase !== 'playing',
      radius: TANK_RADIUS,
      speed: 1.35,
      wanderX: 0,
      wanderY: 0,
      fireCooldown: 0,
      accuracy: 1,
      flash: 0,
    }
    this.tanks.push(t)
    this.tanks.sort((a, b) => a.slot - b.slot)
    this.version++
    return t
  }

  removePlayer(slot: number): void {
    this.tanks = this.tanks.filter((t) => t.slot !== slot)
    this.inputs.delete(slot)
    this.version++
  }

  setInput(slot: number, input: TankInput): void {
    this.inputs.set(slot, input)
  }

  get players(): Tank[] {
    return this.tanks.filter((t) => t.slot >= 0)
  }

  get enemies(): Tank[] {
    return this.tanks.filter((t) => t.slot < 0)
  }

  // ---------------------------------------------------------------- rounds

  /** Called once to kick a lobby into level one. */
  start(): void {
    if (this.phase !== 'lobby') return
    this.beginLevel(1)
  }

  /**
   * Which kind of sentry a level hands out. Plain sentries dominate early;
   * gunners, chasers and sappers are folded in gradually so the maze keeps
   * teaching you a new problem instead of just adding more of the old one.
   */
  private pickEnemyKind(level: number): Exclude<TankKind, 'player'> {
    const r = Math.random()
    if (level < 3) return 'sentry'
    if (level < 6) return r < 0.7 ? 'sentry' : 'gunner'
    if (level < 10) return r < 0.5 ? 'sentry' : r < 0.8 ? 'gunner' : 'chaser'
    if (level < 15) return r < 0.35 ? 'sentry' : r < 0.62 ? 'gunner' : r < 0.85 ? 'chaser' : 'sapper'
    return r < 0.25 ? 'sentry' : r < 0.5 ? 'gunner' : r < 0.78 ? 'chaser' : 'sapper'
  }

  private beginLevel(level: number): void {
    this.level = level
    const cfg = levelConfig(level)
    this.maze = buildMaze(seedForLevel(level), cfg)
    this.destroyedWalls = new Set()
    this.liveWalls = this.maze.walls
    this.bullets = []
    this.mines = []
    this.particles = []

    const spots = [...this.maze.cells].sort(() => Math.random() - 0.5)
    let cursor = 0
    for (const t of this.tanks) {
      const spot = spots[cursor++ % spots.length]
      t.x = spot.x
      t.y = spot.y
      t.vx = 0
      t.vy = 0
      t.alive = true
      t.flash = 0
    }
    // Enemies are private, level-scoped tanks: wiped and rebuilt every level.
    this.tanks = this.tanks.filter((t) => t.slot >= 0)

    // More tanks in the room, more sentries in the maze - the same shape of
    // scaling a bigger party gets in the rest of Polyland.
    const playerCount = Math.max(1, this.players.length)
    const count = Math.min(MAX_ENEMIES, Math.round(cfg.enemyCount * (1 + 0.35 * (playerCount - 1))))
    for (let i = 0; i < count; i++) {
      const spot = spots[cursor++ % spots.length]
      const kind = this.pickEnemyKind(level)
      const e: Tank = {
        id: this.nextId++,
        slot: -1 - i,
        name: kind[0].toUpperCase() + kind.slice(1),
        color: ENEMY_COLORS[kind],
        kind,
        x: spot.x,
        y: spot.y,
        vx: 0,
        vy: 0,
        angle: rand(0, Math.PI * 2),
        aimX: spot.x,
        aimY: spot.y,
        alive: true,
        radius: TANK_RADIUS,
        speed: cfg.enemySpeed * (kind === 'sapper' ? 1.15 : kind === 'gunner' ? 0.92 : 1),
        wanderX: spot.x,
        wanderY: spot.y,
        fireCooldown: Math.round(rand(0, cfg.enemyFireEvery)),
        accuracy: cfg.enemyAccuracy,
        flash: 0,
      }
      this.tanks.push(e)
    }

    this.phase = 'intro'
    this.phaseTimer = INTRO_FRAMES
    this.version++
  }

  step(): void {
    this.frame++
    if (this.phase === 'intro') {
      if (--this.phaseTimer <= 0) {
        this.phase = 'playing'
        this.version++
      }
      return
    }
    if (this.phase === 'levelClear') {
      if (--this.phaseTimer <= 0) {
        if (this.level >= MAX_LEVEL) {
          this.phase = 'victory'
          this.version++
        } else {
          this.beginLevel(this.level + 1)
        }
      }
      return
    }
    if (this.phase !== 'playing') return

    // Recomputed once a frame: a wall a mine just opened should stop blocking
    // movement, shots and line-of-sight everywhere at once, not piecemeal.
    this.liveWalls =
      this.destroyedWalls.size === 0
        ? this.maze.walls
        : this.maze.walls.filter((_, i) => !this.destroyedWalls.has(i))

    for (const t of this.tanks) this.updateTank(t)
    this.updateBullets()
    this.updateMines()
    this.updateParticles()
    if (this.shake > 0) this.shake *= 0.85

    const anyPlayerAlive = this.players.some((t) => t.alive)
    const anyEnemyAlive = this.enemies.some((t) => t.alive)
    if (!anyPlayerAlive && this.players.length > 0) {
      this.phase = 'over'
      this.version++
    } else if (!anyEnemyAlive) {
      this.phase = 'levelClear'
      this.phaseTimer = CLEAR_FRAMES
      this.events.push({ kind: 'levelClear', x: VIEW_W / 2, y: VIEW_H / 2 })
      this.version++
    }
  }

  // ---------------------------------------------------------------- tanks

  private updateTank(t: Tank): void {
    if (t.flash > 0) t.flash--
    if (!t.alive) return

    if (t.slot >= 0) this.updateHuman(t)
    else this.updateAi(t)

    t.x += t.vx
    t.y += t.vy
    this.resolveWalls(t)
    t.x = clamp(t.x, ARENA.x + t.radius, ARENA.x + ARENA.w - t.radius)
    t.y = clamp(t.y, ARENA.y + t.radius, ARENA.y + ARENA.h - t.radius)
  }

  private updateHuman(t: Tank): void {
    const input = this.inputs.get(t.slot) ?? emptyInput()
    const len = Math.hypot(input.moveX, input.moveY) || 1
    const mx = len > 1 ? input.moveX / len : input.moveX
    const my = len > 1 ? input.moveY / len : input.moveY
    t.vx = mx * t.speed
    t.vy = my * t.speed
    t.angle = Math.atan2(input.aimY - t.y, input.aimX - t.x)
    t.aimX = input.aimX
    t.aimY = input.aimY

    const fc = (this.fireCd.get(t.slot) ?? 0) - 1
    this.fireCd.set(t.slot, Math.max(0, fc))
    const mc = (this.mineCd.get(t.slot) ?? 0) - 1
    this.mineCd.set(t.slot, Math.max(0, mc))

    const firePressed = input.fire && !this.prevFire.get(t.slot)
    const minePressed = input.mine && !this.prevMine.get(t.slot)
    this.prevFire.set(t.slot, input.fire)
    this.prevMine.set(t.slot, input.mine)

    if (firePressed && fc <= 0) this.tryFire(t)
    if (minePressed && mc <= 0) this.tryPlaceMine(t)
  }

  private updateAi(t: Tank): void {
    const cfg = levelConfig(this.level)
    // Wander toward a picked point; repick when close or stuck.
    if (Math.hypot(t.wanderX - t.x, t.wanderY - t.y) < 10 || Math.random() < 0.004) {
      const spot = this.maze.cells[Math.floor(Math.random() * this.maze.cells.length)]
      t.wanderX = spot.x
      t.wanderY = spot.y
    }
    const dx = t.wanderX - t.x
    const dy = t.wanderY - t.y
    const d = Math.hypot(dx, dy) || 1
    t.vx = (dx / d) * t.speed
    t.vy = (dy / d) * t.speed
    t.angle = Math.atan2(dy, dx)

    t.fireCooldown--
    if (t.kind === 'sapper') {
      // No gun at all: just leaves mines behind as it wanders.
      if (t.fireCooldown <= 0) {
        t.fireCooldown = Math.round(cfg.enemyFireEvery * 1.4)
        this.placeMineFor(t)
      }
      return
    }

    const target = this.players
      .filter((p) => p.alive)
      .sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0]
    if (!target) return

    if (t.kind === 'chaser') {
      // Missiles home in flight, so a chaser does not need a clean shot -
      // just a cooldown and a rough heading to launch on.
      if (t.fireCooldown <= 0 && Math.hypot(target.x - t.x, target.y - t.y) < 220) {
        t.fireCooldown = cfg.enemyFireEvery * 1.3
        this.tryFireMissile(t, target)
      }
      return
    }

    if (lineOfSight(this.liveWalls, t.x, t.y, target.x, target.y)) {
      const spread = (1 - t.accuracy) * 0.5
      t.angle = Math.atan2(target.y - t.y, target.x - t.x) + rand(-spread, spread)
      if (t.fireCooldown <= 0) {
        const fast = t.kind === 'gunner'
        t.fireCooldown = fast ? Math.round(cfg.enemyFireEvery * 0.6) : cfg.enemyFireEvery
        this.tryFire(t, fast ? BULLET_SPEED * 1.45 : BULLET_SPEED)
      }
    }
  }

  private resolveWalls(t: Tank): void {
    for (const w of this.liveWalls) this.pushOutOfWall(t, w)
  }

  private pushOutOfWall(c: { x: number; y: number; radius: number }, w: Wall): void {
    const cx = clamp(c.x, w.x, w.x + w.w)
    const cy = clamp(c.y, w.y, w.y + w.h)
    const dx = c.x - cx
    const dy = c.y - cy
    const dist = Math.hypot(dx, dy)
    if (dist >= c.radius || dist === 0) {
      if (dist === 0) {
        // Dead centre of a wall (spawn overlap): shove along the shorter axis.
        c.y -= c.radius
      }
      return
    }
    const push = c.radius - dist
    c.x += (dx / dist) * push
    c.y += (dy / dist) * push
  }

  /** Closest-point distance from a wall's rectangle to a point. */
  private wallDistance(w: Wall, x: number, y: number): number {
    const cx = clamp(x, w.x, w.x + w.w)
    const cy = clamp(y, w.y, w.y + w.h)
    return Math.hypot(x - cx, y - cy)
  }

  // -------------------------------------------------------------- firing

  private tryFire(t: Tank, speed = BULLET_SPEED): void {
    const live = this.bullets.filter((b) => b.ownerId === t.id).length
    if (live >= MAX_BULLETS_PER_TANK) return
    if (t.slot >= 0) this.fireCd.set(t.slot, FIRE_COOLDOWN)
    const nx = Math.cos(t.angle)
    const ny = Math.sin(t.angle)
    this.bullets.push({
      id: this.nextId++,
      ownerId: t.id,
      x: t.x + nx * (t.radius + 3),
      y: t.y + ny * (t.radius + 3),
      vx: nx * speed,
      vy: ny * speed,
      bounces: 0,
      life: BULLET_LIFE,
      armIn: 6,
      homing: false,
    })
    this.events.push({ kind: 'shot', x: t.x, y: t.y })
    this.version++
  }

  private tryFireMissile(t: Tank, target: Tank): void {
    const live = this.bullets.filter((b) => b.ownerId === t.id).length
    if (live >= MAX_BULLETS_PER_TANK) return
    const a = Math.atan2(target.y - t.y, target.x - t.x)
    this.bullets.push({
      id: this.nextId++,
      ownerId: t.id,
      x: t.x + Math.cos(a) * (t.radius + 3),
      y: t.y + Math.sin(a) * (t.radius + 3),
      vx: Math.cos(a) * MISSILE_SPEED,
      vy: Math.sin(a) * MISSILE_SPEED,
      bounces: 0,
      life: BULLET_LIFE + 60,
      armIn: 6,
      homing: true,
    })
    this.events.push({ kind: 'shot', x: t.x, y: t.y })
    this.version++
  }

  private tryPlaceMine(t: Tank): void {
    const live = this.mines.filter((m) => m.ownerId === t.id).length
    if (live >= MAX_MINES_PER_TANK) return
    if (t.slot >= 0) this.mineCd.set(t.slot, MINE_COOLDOWN)
    this.placeMineFor(t)
  }

  private placeMineFor(t: Tank): void {
    const live = this.mines.filter((m) => m.ownerId === t.id).length
    if (live >= MAX_MINES_PER_TANK) return
    this.mines.push({ id: this.nextId++, ownerId: t.id, x: t.x, y: t.y, armIn: MINE_ARM, fuse: MINE_FUSE })
    this.version++
  }

  // -------------------------------------------------------------- bullets

  private updateBullets(): void {
    for (const b of this.bullets) {
      if (b.armIn > 0) b.armIn--

      if (b.homing) {
        // Steer toward whoever is nearest right now rather than a fixed
        // target, so a missile still means something once its first mark dies.
        const target = this.players
          .filter((p) => p.alive)
          .sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[0]
        if (target) {
          const want = Math.atan2(target.y - b.y, target.x - b.x)
          const cur = Math.atan2(b.vy, b.vx)
          let diff = want - cur
          while (diff > Math.PI) diff -= Math.PI * 2
          while (diff < -Math.PI) diff += Math.PI * 2
          const turned = cur + clamp(diff, -MISSILE_TURN, MISSILE_TURN)
          b.vx = Math.cos(turned) * MISSILE_SPEED
          b.vy = Math.sin(turned) * MISSILE_SPEED
        }
      }

      b.x += b.vx
      b.y += b.vy
      b.life--

      for (const w of this.liveWalls) {
        if (b.x + 2 < w.x || b.x - 2 > w.x + w.w || b.y + 2 < w.y || b.y - 2 > w.y + w.h) continue
        if (b.homing) {
          // Missiles do not bounce - they fly true until something stops them.
          b.life = 0
          break
        }
        // Reflect off whichever face is closer: the wall is thin, so comparing
        // penetration on each axis picks the right one almost always.
        const overlapX = Math.min(b.x + 2 - w.x, w.x + w.w - (b.x - 2))
        const overlapY = Math.min(b.y + 2 - w.y, w.y + w.h - (b.y - 2))
        if (overlapX < overlapY) b.vx = -b.vx
        else b.vy = -b.vy
        b.x += b.vx
        b.y += b.vy
        b.bounces++
        break
      }
    }

    // A plain shot shoots down a missile - the one thing in the pit a
    // "tracking" round has to fear.
    for (const b of this.bullets) {
      if (!b.homing || b.life <= 0) continue
      for (const other of this.bullets) {
        if (other === b || other.homing || other.life <= 0) continue
        if (other.ownerId === b.ownerId) continue
        if (Math.hypot(b.x - other.x, b.y - other.y) < 4.5) {
          b.life = 0
          this.burst(b.x, b.y, '#cfc6b4')
          break
        }
      }
    }

    for (const b of this.bullets) {
      if (b.life <= 0 || b.bounces > BULLET_MAX_BOUNCES) continue
      for (const m of this.mines) {
        if (Math.hypot(b.x - m.x, b.y - m.y) < 6) {
          this.detonateMine(m)
          b.life = 0
        }
      }
      if (b.life <= 0) continue
      for (const t of this.tanks) {
        if (!t.alive) continue
        if (b.armIn > 0 && t.id === b.ownerId) continue
        if (Math.hypot(b.x - t.x, b.y - t.y) < t.radius + 2) {
          this.killTank(t)
          b.life = 0
          break
        }
      }
    }

    this.bullets = this.bullets.filter((b) => b.life > 0 && b.bounces <= BULLET_MAX_BOUNCES)
  }

  // ---------------------------------------------------------------- mines

  private updateMines(): void {
    for (const m of this.mines) {
      if (m.armIn > 0) m.armIn--
      m.fuse--
    }
    const toExplode = this.mines.filter((m) => {
      if (m.fuse <= 0) return true
      if (m.armIn > 0) return false
      return this.tanks.some((t) => t.alive && Math.hypot(t.x - m.x, t.y - m.y) < t.radius + 10)
    })
    for (const m of toExplode) this.detonateMine(m)
  }

  private detonateMine(m: Mine): void {
    if (!this.mines.includes(m)) return
    this.mines = this.mines.filter((x) => x !== m)
    this.events.push({ kind: 'explode', x: m.x, y: m.y })
    this.shake = Math.max(this.shake, 6)
    this.burst(m.x, m.y, '#e8c05f')
    for (const t of this.tanks) {
      if (t.alive && Math.hypot(t.x - m.x, t.y - m.y) < MINE_BLAST) this.killTank(t)
    }
    // Wood splinters; stone does not even chip.
    this.maze.walls.forEach((w, i) => {
      if (w.kind !== 'wood' || this.destroyedWalls.has(i)) return
      if (this.wallDistance(w, m.x, m.y) < MINE_BLAST) {
        this.destroyedWalls.add(i)
        this.burst(w.x + w.w / 2, w.y + w.h / 2, '#a9835a')
      }
    })
    // Chain reaction: a mine caught in the blast goes up too.
    for (const other of [...this.mines]) {
      if (Math.hypot(other.x - m.x, other.y - m.y) < MINE_BLAST) this.detonateMine(other)
    }
  }

  private killTank(t: Tank): void {
    if (!t.alive) return
    t.alive = false
    t.flash = 14
    this.burst(t.x, t.y, t.color)
    this.events.push({ kind: 'explode', x: t.x, y: t.y })
    this.shake = Math.max(this.shake, 5)
    this.version++
  }

  private burst(x: number, y: number, color: string): void {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const sp = rand(0.8, 2.6)
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(16, 30),
        maxLife: 30,
        size: rand(1, 2.4),
        color: i % 3 === 0 ? '#fff3d6' : color,
      })
    }
  }

  private updateParticles(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx
      p.y += p.vy
      p.vx *= 0.95
      p.vy *= 0.95
      p.life--
      if (p.life <= 0) this.particles.splice(i, 1)
    }
  }

  // ---------------------------------------------------------------- netcode

  snapshot(): TankSnapshot {
    return {
      m: [this.frame, this.level, PHASE_LIST.indexOf(this.phase), this.phaseTimer],
      t: this.tanks.map((t) => [
        t.id,
        t.slot,
        Math.round(t.x * 10) / 10,
        Math.round(t.y * 10) / 10,
        Math.round(t.angle * 100) / 100,
        t.alive ? 1 : 0,
        t.flash,
        KIND_LIST.indexOf(t.kind),
        t.kind === 'player' ? Math.max(0, PLAYER_COLORS.indexOf(t.color)) : 0,
      ]),
      b: this.bullets.map((b) => [
        b.id,
        b.ownerId,
        Math.round(b.x * 10) / 10,
        Math.round(b.y * 10) / 10,
        b.homing ? 1 : 0,
      ]),
      mi: this.mines.map((m) => [m.id, Math.round(m.x), Math.round(m.y), m.armIn > 0 ? 0 : 1]),
      dw: [...this.destroyedWalls],
    }
  }

  applySnapshot(snap: TankSnapshot): void {
    if (!snap?.m) return
    this.frame = snap.m[0]
    if (snap.m[1] !== this.level) {
      this.level = snap.m[1]
      this.maze = buildMaze(seedForLevel(this.level), levelConfig(this.level))
    }
    this.phase = PHASE_LIST[snap.m[2]] ?? this.phase
    this.phaseTimer = snap.m[3]
    this.destroyedWalls = new Set(snap.dw ?? [])

    const seenIds = new Set<number>()
    for (const row of snap.t) {
      const [id, slot, x, y, angle, alive, flash, kindIdx, colorIdx] = row
      seenIds.add(id)
      const kind = KIND_LIST[kindIdx] ?? 'sentry'
      let t = this.tanks.find((q) => q.id === id)
      if (!t) {
        t = this.addPlayer(slot, kind === 'player' ? `Player ${slot + 1}` : 'Sentry')
        t.id = id
      }
      t.x = x
      t.y = y
      t.angle = angle
      t.alive = alive === 1
      t.flash = flash
      t.kind = kind
      t.color = kind === 'player' ? PLAYER_COLORS[colorIdx] ?? t.color : ENEMY_COLORS[kind]
    }
    this.tanks = this.tanks.filter((t) => seenIds.has(t.id) || t.slot >= 0)

    this.bullets = snap.b.map(([id, ownerId, x, y, homing]) => ({
      id,
      ownerId,
      x,
      y,
      vx: 0,
      vy: 0,
      bounces: 0,
      life: 999,
      armIn: 0,
      homing: homing === 1,
    }))
    this.mines = snap.mi.map(([id, x, y, armed]) => ({
      id,
      ownerId: -1,
      x,
      y,
      armIn: armed ? 0 : 1,
      fuse: 999,
    }))
    this.version++
  }
}

export interface TankSnapshot {
  /** frame, level, phase index, phase timer */
  m: [number, number, number, number]
  /** id, slot, x, y, angle, alive, flash, kind index, colour index (players only) */
  t: number[][]
  /** id, ownerId, x, y, homing */
  b: number[][]
  /** id, x, y, armed */
  mi: number[][]
  /** indices into this level's wall list that a mine has already opened */
  dw: number[]
}

const PHASE_LIST: Phase[] = ['lobby', 'intro', 'playing', 'levelClear', 'over', 'victory']
const KIND_LIST: TankKind[] = ['player', 'sentry', 'gunner', 'chaser', 'sapper']
