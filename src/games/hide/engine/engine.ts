/**
 * Hide & Seek's simulation.
 *
 * One host runs this; everyone else sends a turn direction and a move
 * direction and watches snapshots - the same authority split as Smash, Duck
 * szn and Tank Trouble. Positions are in grid cells (see types.ts), which is
 * what lets collision, the raycaster and the chaser's "how many feet" readout
 * all share one number with no conversion between them.
 */
import { clamp } from '../../../lib/draw'
import { hideMapById, MAP_SIZE } from './maps'
import {
  FEET_PER_CELL,
  type HideMap,
  type HidePlayer,
  type Phase,
  type Role,
  type Star,
  type Winner,
} from './types'

export const ROUND_SECONDS = 210 // 3:30
export const STAR_SPAWN_AT = 150 // remaining seconds: 2:30
const STAR_DESPAWN_AT = 85 // remaining seconds: 1:25
const INVINCIBLE_FRAMES = 40 * 60

const PLAYER_RADIUS = 0.3
const CATCH_RADIUS = 0.55
const PICKUP_RADIUS = 0.6
const BASE_SPEED = 0.062 // cells per frame
const BOOST_SPEED = 0.135
const BOOST_FRAMES = 26
const TURN_SPEED = 0.052 // radians per frame
const TELEPORT_COOLDOWN = 45
const BUMP_SPEED = 0.4
const BUMP_DECAY = 0.88
const BUMP_STUN = 12

export interface HideInput {
  turn: number // -1, 0, 1
  move: number // -1, 0, 1
}

function emptyInput(): HideInput {
  return { turn: 0, move: 0 }
}

export interface HideConfig {
  players: number
  mapId: string
}

const START_NAMES = ['office', 'cave', 'warehouse', 'city', 'theme-park']

export const DEFAULT_HIDE_CONFIG: HideConfig = { players: 0, mapId: START_NAMES[0] }

export class HideEngine {
  config: HideConfig
  map: HideMap
  players: HidePlayer[] = []
  star: Star
  phase: Phase = 'lobby'
  phaseTimer = 0
  /** Frames left in the round; 3:30 at 60fps. */
  clock = ROUND_SECONDS * 60
  winner: Winner = null
  frame = 0
  version = 0

  private inputs = new Map<number, HideInput>()
  private stunned = new Map<number, number>()
  private events: { kind: 'bump' | 'star' | 'caught'; x: number; y: number }[] = []

  constructor(config: Partial<HideConfig> = {}) {
    this.config = { ...DEFAULT_HIDE_CONFIG, ...config }
    this.map = hideMapById(this.config.mapId)
    this.star = this.starSpot()
  }

  private starSpot(): Star {
    const c = MAP_SIZE / 2
    return { x: c, y: c, active: false, spent: false }
  }

  drainEvents() {
    const out = this.events
    this.events = []
    return out
  }

  // -------------------------------------------------------------- players

  /** Where a slot's spawn digit sits on the current map, or the centre-ish fallback. */
  private spawnFor(index: number): { x: number; y: number } {
    const digit = String((index % 8) + 1)
    for (let y = 0; y < this.map.rows.length; y++) {
      const x = this.map.rows[y].indexOf(digit)
      if (x >= 0) return { x: x + 0.5, y: y + 0.5 }
    }
    return { x: MAP_SIZE / 2 + 1.5, y: MAP_SIZE / 2 }
  }

  addPlayer(slot: number, name: string, role: Role = 'chaser'): HidePlayer {
    const found = this.players.find((p) => p.slot === slot)
    if (found) return found
    const spot = this.spawnFor(this.players.length)
    const p: HidePlayer = {
      slot,
      name,
      role,
      x: spot.x,
      y: spot.y,
      angle: Math.atan2(MAP_SIZE / 2 - spot.y, MAP_SIZE / 2 - spot.x),
      vx: 0,
      vy: 0,
      boostFrames: 0,
      teleportCooldown: 0,
      invincibleFrames: 0,
    }
    this.players.push(p)
    this.players.sort((a, b) => a.slot - b.slot)
    this.version++
    return p
  }

  removePlayer(slot: number): void {
    this.players = this.players.filter((p) => p.slot !== slot)
    this.inputs.delete(slot)
    this.version++
  }

  setRunner(slot: number): void {
    for (const p of this.players) p.role = p.slot === slot ? 'runner' : 'chaser'
    this.version++
  }

  setInput(slot: number, input: HideInput): void {
    this.inputs.set(slot, input)
  }

  get runner(): HidePlayer | undefined {
    return this.players.find((p) => p.role === 'runner')
  }

  // ---------------------------------------------------------------- rounds

  start(): void {
    if (this.phase !== 'lobby') return
    // Nobody picked a runner: fall back to whoever is in slot 0 rather than
    // silently starting a chase with no one to chase.
    if (!this.runner && this.players.length) this.setRunner(this.players[0].slot)
    for (const p of this.players) {
      const spot = this.spawnFor(this.players.indexOf(p))
      p.x = spot.x
      p.y = spot.y
      p.vx = 0
      p.vy = 0
      p.boostFrames = 0
      p.invincibleFrames = 0
    }
    this.star = this.starSpot()
    this.clock = ROUND_SECONDS * 60
    this.winner = null
    this.phase = 'intro'
    this.phaseTimer = 90
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
    if (this.phase !== 'playing') return

    this.clock--
    const remaining = Math.ceil(this.clock / 60)

    if (!this.star.spent) {
      if (!this.star.active && remaining <= STAR_SPAWN_AT) {
        this.star.active = true
        this.version++
      } else if (this.star.active && remaining <= STAR_DESPAWN_AT) {
        this.star.active = false
        this.version++
      }
    }

    for (const p of this.players) this.updatePlayer(p)
    this.checkStar()
    this.checkCatch()

    if (this.clock <= 0) {
      this.phase = 'over'
      this.winner = 'runner'
      this.version++
    }
  }

  // ---------------------------------------------------------------- movement

  private updatePlayer(p: HidePlayer): void {
    if (p.invincibleFrames > 0) p.invincibleFrames--
    if (p.teleportCooldown > 0) p.teleportCooldown--
    const stun = this.stunned.get(p.slot) ?? 0
    if (stun > 0) this.stunned.set(p.slot, stun - 1)

    const input = this.inputs.get(p.slot) ?? emptyInput()
    if (stun <= 0) {
      p.angle += clamp(input.turn, -1, 1) * TURN_SPEED
      const speed = p.boostFrames > 0 ? BOOST_SPEED : BASE_SPEED
      const move = clamp(input.move, -1, 1)
      p.vx += Math.cos(p.angle) * move * speed * 0.4
      p.vy += Math.sin(p.angle) * move * speed * 0.4
    }
    if (p.boostFrames > 0) p.boostFrames--

    // Bump knockback and normal movement share one velocity, so a chaser sent
    // flying cannot simultaneously walk back into the runner.
    p.x += p.vx
    p.y += p.vy
    p.vx *= BUMP_DECAY
    p.vy *= BUMP_DECAY
    if (Math.hypot(p.vx, p.vy) < 0.002) {
      p.vx = 0
      p.vy = 0
    }

    this.resolveWalls(p)
    this.applyTile(p)
  }

  private isWall(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cy >= this.map.rows.length || cx >= this.map.rows[cy].length) return true
    return this.map.rows[cy][cx] === '#'
  }

  private resolveWalls(p: HidePlayer): void {
    const cx = Math.floor(p.x)
    const cy = Math.floor(p.y)
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        if (!this.isWall(gx, gy)) continue
        const nx = clamp(p.x, gx, gx + 1)
        const ny = clamp(p.y, gy, gy + 1)
        const dx = p.x - nx
        const dy = p.y - ny
        const dist = Math.hypot(dx, dy)
        if (dist >= PLAYER_RADIUS || dist === 0) continue
        const push = PLAYER_RADIUS - dist
        p.x += (dx / dist) * push
        p.y += (dy / dist) * push
      }
    }
    p.x = clamp(p.x, 0.1, MAP_SIZE - 0.1)
    p.y = clamp(p.y, 0.1, MAP_SIZE - 0.1)
  }

  private applyTile(p: HidePlayer): void {
    const cx = Math.floor(p.x)
    const cy = Math.floor(p.y)
    const c = this.map.rows[cy]?.[cx]
    if (c === 'B') {
      p.boostFrames = BOOST_FRAMES
    } else if ((c === 'T' || c === 'U') && p.teleportCooldown <= 0) {
      const target = c === 'T' ? 'U' : 'T'
      for (let y = 0; y < this.map.rows.length; y++) {
        const x = this.map.rows[y].indexOf(target)
        if (x >= 0) {
          p.x = x + 0.5
          p.y = y + 0.5
          p.teleportCooldown = TELEPORT_COOLDOWN
          break
        }
      }
    }
  }

  // ----------------------------------------------------------------- star

  private checkStar(): void {
    if (!this.star.active) return
    const runner = this.runner
    if (!runner) return
    if (Math.hypot(runner.x - this.star.x, runner.y - this.star.y) < PICKUP_RADIUS) {
      this.star.active = false
      this.star.spent = true
      runner.invincibleFrames = INVINCIBLE_FRAMES
      this.events.push({ kind: 'star', x: runner.x, y: runner.y })
      this.version++
    }
  }

  // ---------------------------------------------------------------- catch

  private checkCatch(): void {
    const runner = this.runner
    if (!runner) return
    for (const p of this.players) {
      if (p.role !== 'chaser') continue
      const dist = Math.hypot(p.x - runner.x, p.y - runner.y)
      if (dist >= CATCH_RADIUS) continue
      if (runner.invincibleFrames > 0) {
        // Invincible: the chaser bounces off instead of ending anything. A
        // direction straight from the runner is undefined when they are
        // standing exactly on top of each other, so that edge case falls
        // back to a direction derived from the chaser's own slot instead of
        // silently applying no push at all.
        const away =
          dist > 0.001
            ? { x: (p.x - runner.x) / dist, y: (p.y - runner.y) / dist }
            : { x: Math.cos(p.slot), y: Math.sin(p.slot) }
        p.vx = away.x * BUMP_SPEED
        p.vy = away.y * BUMP_SPEED
        this.stunned.set(p.slot, BUMP_STUN)
        this.events.push({ kind: 'bump', x: p.x, y: p.y })
        this.version++
      } else {
        this.phase = 'over'
        this.winner = 'chasers'
        this.events.push({ kind: 'caught', x: runner.x, y: runner.y })
        this.version++
        return
      }
    }
  }

  /** Straight-line distance from a chaser to the runner, in feet. */
  feetToRunner(slot: number): number | null {
    const runner = this.runner
    const me = this.players.find((p) => p.slot === slot)
    if (!runner || !me || me.role === 'runner') return null
    return Math.round(Math.hypot(me.x - runner.x, me.y - runner.y) * FEET_PER_CELL)
  }

  // ---------------------------------------------------------------- netcode

  snapshot(): HideSnapshot {
    return {
      m: [
        this.frame,
        PHASE_LIST.indexOf(this.phase),
        this.phaseTimer,
        this.clock,
        this.winner === null ? -1 : this.winner === 'runner' ? 0 : 1,
      ],
      s: [Math.round(this.star.x * 10) / 10, Math.round(this.star.y * 10) / 10, this.star.active ? 1 : 0, this.star.spent ? 1 : 0],
      p: this.players.map((p) => [
        p.slot,
        p.role === 'runner' ? 1 : 0,
        Math.round(p.x * 100) / 100,
        Math.round(p.y * 100) / 100,
        Math.round(p.angle * 100) / 100,
        p.invincibleFrames,
      ]),
    }
  }

  applySnapshot(snap: HideSnapshot): void {
    if (!snap?.m) return
    this.frame = snap.m[0]
    this.phase = PHASE_LIST[snap.m[1]] ?? this.phase
    this.phaseTimer = snap.m[2]
    this.clock = snap.m[3]
    this.winner = snap.m[4] < 0 ? null : snap.m[4] === 0 ? 'runner' : 'chasers'
    this.star = { x: snap.s[0], y: snap.s[1], active: snap.s[2] === 1, spent: snap.s[3] === 1 }

    const seen = new Set<number>()
    for (const row of snap.p) {
      const [slot, isRunner, x, y, angle, invincible] = row
      seen.add(slot)
      let p = this.players.find((q) => q.slot === slot)
      if (!p) p = this.addPlayer(slot, `Player ${slot + 1}`, isRunner ? 'runner' : 'chaser')
      p.role = isRunner ? 'runner' : 'chaser'
      p.x = x
      p.y = y
      p.angle = angle
      p.invincibleFrames = invincible
    }
    this.players = this.players.filter((p) => seen.has(p.slot))
    this.version++
  }
}

export interface HideSnapshot {
  /** frame, phase index, phase timer, clock, winner (-1 none, 0 runner, 1 chasers) */
  m: [number, number, number, number, number]
  /** star x, y, active, spent */
  s: [number, number, number, number]
  /** slot, is runner, x, y, angle, invincible frames */
  p: number[][]
}

const PHASE_LIST: Phase[] = ['lobby', 'intro', 'playing', 'over']
