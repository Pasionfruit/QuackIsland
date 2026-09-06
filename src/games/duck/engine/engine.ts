/**
 * Duck szn's simulation.
 *
 * One host runs this and everybody else watches its snapshots, so nothing in
 * here touches the DOM, uses wall-clock time, or reads the mouse directly:
 * shooters are fed positions and trigger pulls from outside.
 *
 * The five stages differ only in what they spawn and how those targets move.
 * Scoring, the combo, the dog and the round timer are shared, which is what
 * keeps a stage's worth of code down to one spawn function and one update.
 */
import { clamp, rand } from '../../../lib/draw'
import {
  GROUND,
  HORIZON,
  STAGE_ORDER,
  VIEW_H,
  VIEW_W,
  type HitEvent,
  type Particle,
  type Phase,
  type Shooter,
  type Splash,
  type StageDef,
  type StageId,
  type Target,
  type TargetKind,
} from './types'

export const STAGES: StageDef[] = [
  {
    id: 'balloons',
    name: 'Balloons',
    brief: 'They float up from the reeds. Pop them before they clear the sky.',
    duration: 60 * 42,
    spawnEvery: 24,
    rampTo: 11,
  },
  {
    id: 'targets',
    name: 'Range Targets',
    brief: 'Gold is worth three. The painted faces are worth losing your combo.',
    duration: 60 * 42,
    spawnEvery: 28,
    rampTo: 13,
  },
  {
    id: 'clays',
    name: 'Clay Pigeons',
    brief: 'Launched from the corners. The further they get, the less they pay.',
    duration: 60 * 42,
    spawnEvery: 36,
    rampTo: 19,
  },
  {
    id: 'cans',
    name: 'Tin Cans',
    brief: 'Keep them in the air. Five hits and they burst; one bounce and they are gone.',
    duration: 60 * 45,
    spawnEvery: 50,
    rampTo: 30,
  },
  {
    id: 'ufos',
    name: 'Abduction',
    brief: 'They are here for the campers. Shoot one carrying somebody and you get them back.',
    duration: 60 * 48,
    spawnEvery: 64,
    rampTo: 38,
  },
]

export function stageById(id: StageId): StageDef {
  return STAGES.find((s) => s.id === id) ?? STAGES[0]
}

/** Points a target is worth before the multiplier is applied. */
const BASE_POINTS: Record<TargetKind, number> = {
  balloon: 1,
  bull: 1,
  gold: 3,
  mii: -3,
  clay: 1,
  can: 1,
  ufo: 5,
  walker: 0,
  duck: 10,
  }

const READY_FRAMES = 150
const STAGE_END_FRAMES = 200
/** A can that survives five hits bursts. */
const CAN_BURST = 5
/** Rescuing a captured camper is the biggest single payout in the game. */
const RESCUE_BONUS = 25

export interface DuckConfig {
  /** Which stages to play, in order. */
  stages: StageId[]
  /** Seat count; shooters are created lazily as people join. */
  players: number
}

export const DEFAULT_CONFIG: DuckConfig = { stages: STAGE_ORDER, players: 1 }

const SHOOTER_COLORS = [
  '#e0794f',
  '#4f8fbf',
  '#7fb069',
  '#d9a05b',
  '#c85f96',
  '#7a4f8c',
  '#4fb0a5',
  '#c0653f',
]

export class DuckEngine {
  config: DuckConfig
  shooters: Shooter[] = []
  targets: Target[] = []
  particles: Particle[] = []
  splashes: Splash[] = []
  /** Hits since the last miss, shared by everyone in the room. */
  combo = 0
  /** Frame the combo was last broken, so the HUD can say so briefly rather than forever. */
  comboBrokeFrame = -999
  bestCombo = 0
  score = 0
  stageIndex = 0
  phase: Phase = 'ready'
  phaseTimer = READY_FRAMES
  stageTimer = 0
  frame = 0
  shake = 0
  /** Set for one frame when the dog barks, so the panel can play the sound. */
  barked = false
  /** Bumped whenever the HUD needs redrawing. */
  version = 0

  private nextId = 1
  private spawnCooldown = 40
  private duckCooldown = 60 * 12
  private events: HitEvent[] = []

  constructor(config: Partial<DuckConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    // Zero is legitimate: an online round adds its shooters as people arrive.
    for (let i = 0; i < this.config.players; i++) this.addShooter(i, `Player ${i + 1}`)
  }

  get stage(): StageDef {
    return stageById(this.config.stages[this.stageIndex] ?? STAGE_ORDER[0])
  }

  /** Score multiplier from the shared combo, capped so it stays readable. */
  get multiplier(): number {
    return Math.min(1 + Math.floor(this.combo / 4), 8)
  }

  addShooter(slot: number, name: string): Shooter {
    const found = this.shooters.find((s) => s.slot === slot)
    if (found) return found
    const s: Shooter = {
      slot,
      name,
      color: SHOOTER_COLORS[slot % SHOOTER_COLORS.length],
      x: VIEW_W / 2,
      y: VIEW_H / 2,
      score: 0,
      hits: 0,
      shots: 0,
      recoil: 0,
    }
    this.shooters.push(s)
    this.shooters.sort((a, b) => a.slot - b.slot)
    this.version++
    return s
  }

  removeShooter(slot: number): void {
    this.shooters = this.shooters.filter((s) => s.slot !== slot)
    this.version++
  }

  aim(slot: number, x: number, y: number): void {
    const s = this.shooters.find((p) => p.slot === slot)
    if (!s) return
    s.x = clamp(x, 0, VIEW_W)
    s.y = clamp(y, 0, VIEW_H)
  }

  /** Drains the hit events collected since the last call, for sound and pips. */
  drainEvents(): HitEvent[] {
    const out = this.events
    this.events = []
    return out
  }

  // ------------------------------------------------------------------ rounds

  step(): void {
    this.frame++
    this.barked = false

    if (this.phase === 'ready') {
      this.phaseTimer--
      if (this.phaseTimer <= 0) {
        this.phase = 'playing'
        this.stageTimer = this.stage.duration
        this.version++
      }
    } else if (this.phase === 'stageEnd') {
      this.phaseTimer--
      if (this.phaseTimer <= 0) this.advanceStage()
    } else if (this.phase === 'playing') {
      this.stageTimer--
      this.spawnTick()
      this.duckTick()
      if (this.stageTimer <= 0) {
        this.phase = 'stageEnd'
        this.phaseTimer = STAGE_END_FRAMES
        this.version++
      }
    }

    for (const s of this.shooters) if (s.recoil > 0) s.recoil--
    this.updateTargets()
    this.updateParticles()
    this.updateSplashes()
    if (this.shake > 0) this.shake *= 0.86
  }

  private advanceStage(): void {
    if (this.stageIndex >= this.config.stages.length - 1) {
      this.phase = 'over'
      this.version++
      return
    }
    this.stageIndex++
    this.targets = []
    this.particles = []
    this.phase = 'ready'
    this.phaseTimer = READY_FRAMES
    this.spawnCooldown = 30
    this.version++
  }

  /** How far through the round we are, 0 to 1; spawn rate ramps with it. */
  private progress(): number {
    const d = this.stage.duration
    return clamp(1 - this.stageTimer / d, 0, 1)
  }

  private spawnTick(): void {
    if (this.spawnCooldown-- > 0) return
    const st = this.stage
    const gap = st.spawnEvery + (st.rampTo - st.spawnEvery) * this.progress()
    this.spawnCooldown = Math.max(10, Math.round(gap * rand(0.75, 1.25)))
    this.spawnForStage(st.id)
  }

  /**
   * The dog. From stage two on it barks at random and puts a duck across the
   * sky - the one target that pays a flat bonus no matter what the combo is.
   */
  private duckTick(): void {
    // Everywhere but the balloons, which is stage one of the standard set.
    if (this.stage.id === 'balloons') return
    if (this.duckCooldown-- > 0) return
    this.duckCooldown = Math.round(rand(60 * 9, 60 * 18))
    const fromLeft = Math.random() < 0.5
    this.targets.push({
      ...this.blank('duck'),
      x: fromLeft ? -20 : VIEW_W + 20,
      y: rand(40, HORIZON - 30),
      vx: (fromLeft ? 1 : -1) * rand(2.6, 3.6),
      vy: 0,
      r: 9,
      color: '#5f7a52',
      life: 60 * 8,
    })
    this.barked = true
    this.version++
  }

  private blank(kind: TargetKind): Target {
    return {
      id: this.nextId++,
      kind,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      z: 1,
      vz: 0,
      r: 10,
      life: 0,
      hits: 0,
      color: '#ffffff',
      age: 0,
      dying: 0,
      linked: null,
      alt: 0,
      captured: false,
      dead: false,
    }
  }

  // ------------------------------------------------------------------ spawns

  private spawnForStage(id: StageId): void {
    switch (id) {
      case 'balloons':
        this.spawnBalloon()
        break
      case 'targets':
        this.spawnRangeTarget()
        break
      case 'clays':
        this.spawnClay()
        break
      case 'cans':
        this.spawnCan()
        break
      case 'ufos':
        this.spawnUfo()
        break
    }
  }

  private spawnBalloon(): void {
    const colors = ['#d9534f', '#4f8fbf', '#e8c05f', '#7fb069', '#c85f96', '#e0794f']
    this.targets.push({
      ...this.blank('balloon'),
      x: rand(24, VIEW_W - 24),
      y: GROUND + 16,
      vy: -rand(0.75, 1.7),
      vx: rand(-0.22, 0.22),
      r: 11,
      color: colors[Math.floor(Math.random() * colors.length)],
    })
  }

  private spawnRangeTarget(): void {
    const roll = Math.random()
    const kind: TargetKind = roll < 0.18 ? 'gold' : roll < 0.34 ? 'mii' : 'bull'
    this.targets.push({
      ...this.blank(kind),
      x: rand(38, VIEW_W - 38),
      y: rand(HORIZON - 54, GROUND - 26),
      r: kind === 'gold' ? 11 : 13,
      // Pops up, sits for a beat, drops away again.
      life: Math.round(rand(70, 130)),
      color: kind === 'gold' ? '#e8c05f' : kind === 'mii' ? '#f2ece0' : '#d9534f',
    })
  }

  private spawnClay(): void {
    const fromLeft = Math.random() < 0.5
    this.targets.push({
      ...this.blank('clay'),
      x: fromLeft ? 24 : VIEW_W - 24,
      y: GROUND - 6,
      vx: (fromLeft ? 1 : -1) * rand(0.9, 1.7),
      vy: -rand(1.5, 2.1),
      // Sailing away from the camera is what shrinks them.
      z: 1,
      vz: -rand(0.0075, 0.0115),
      r: 14,
      color: '#d9713f',
      life: 60 * 7,
    })
  }

  private spawnCan(): void {
    this.targets.push({
      ...this.blank('can'),
      x: rand(70, VIEW_W - 70),
      y: GROUND - 4,
      vx: rand(-0.7, 0.7),
      vy: -rand(4.2, 5.4),
      r: 10,
      color: '#b9bfc4',
    })
  }

  private spawnUfo(): void {
    // Somebody has to be down there to abduct.
    while (this.targets.filter((t) => t.kind === 'walker' && !t.dead).length < 4) this.spawnWalker()
    this.targets.push({
      ...this.blank('ufo'),
      x: rand(50, VIEW_W - 50),
      y: -18,
      vy: rand(0.4, 0.7),
      vx: rand(-0.5, 0.5) || 0.4,
      // Its own altitude to patrol, so a wave of saucers spreads out over the
      // camp instead of stacking into one column above the nearest camper.
      alt: rand(38, 116),
      r: 15,
      color: '#8fa8b8',
    })
  }

  private spawnWalker(): void {
    this.targets.push({
      ...this.blank('walker'),
      x: rand(40, VIEW_W - 40),
      y: GROUND,
      vx: rand(-0.35, 0.35) || 0.3,
      r: 8,
      color: '#e8dfd0',
    })
  }

  // ------------------------------------------------------------------ update

  private updateTargets(): void {
    for (const t of this.targets) {
      t.age++
      if (t.dying > 0) {
        t.dying--
        if (t.dying <= 0) t.dead = true
        continue
      }
      if (t.life > 0 && --t.life <= 0 && t.kind !== 'walker') {
        // Range targets drop back down rather than being "missed": only a shot
        // that hits nothing breaks the combo.
        t.dead = true
        continue
      }

      switch (t.kind) {
        case 'balloon':
          t.x += t.vx + Math.sin(t.age * 0.05) * 0.22
          t.y += t.vy
          if (t.y < -20) t.dead = true
          break
        case 'bull':
        case 'gold':
        case 'mii':
          break
        case 'clay':
          t.x += t.vx
          t.y += t.vy
          t.vy += 0.012
          t.z = Math.max(0.18, t.z + t.vz)
          if (t.y < 10 || t.x < -30 || t.x > VIEW_W + 30) t.dead = true
          break
        case 'can':
          t.x += t.vx
          t.y += t.vy
          t.vy += 0.17
          t.vx *= 0.995
          // A can that touches the ground is gone, no points, no penalty.
          if (t.y >= GROUND) t.dead = true
          if (t.x < -20 || t.x > VIEW_W + 20) t.dead = true
          break
        case 'duck':
          t.x += t.vx
          t.y += Math.sin(t.age * 0.09) * 0.7
          if (t.x < -40 || t.x > VIEW_W + 40) t.dead = true
          break
        case 'walker':
          if (t.captured) break
          t.x += t.vx
          if (t.x < 24 || t.x > VIEW_W - 24) t.vx *= -1
          t.y = GROUND
          break
        case 'ufo':
          this.updateUfo(t)
          break
      }
    }
    this.targets = this.targets.filter((t) => !t.dead)
  }

  private updateUfo(t: Target): void {
    const captive = t.linked === null ? null : this.targets.find((w) => w.id === t.linked)

    if (captive && !captive.dead) {
      // Carrying somebody: climb, and take them off the top of the screen.
      t.y -= 0.55
      captive.x = t.x
      captive.y = t.y + 22
      if (t.y < -40) {
        captive.dead = true
        t.dead = true
        this.splash(t.x, 30, 'TAKEN', '#d9534f')
      }
      return
    }

    // Somebody directly below and close enough to be worth diving for.
    const prey = this.targets
      .filter((w) => w.kind === 'walker' && !w.dead && !w.captured && Math.abs(w.x - t.x) < 46)
      .sort((a, b) => Math.abs(a.x - t.x) - Math.abs(b.x - t.x))[0]

    if (prey) {
      // Dive: line up and drop.
      t.vx += clamp((prey.x - t.x) * 0.01, -0.08, 0.08)
      t.vy = Math.abs(prey.x - t.x) < 16 ? 0.9 : 0.25
      if (t.y > GROUND - 34 && Math.abs(prey.x - t.x) < 12) {
        prey.captured = true
        prey.linked = t.id
        t.linked = prey.id
        this.splash(t.x, t.y - 14, 'GRABBED', '#e8c05f')
        this.version++
      }
    } else {
      // Patrol its own altitude, keeping clear of the other saucers.
      t.vy = clamp((t.alt - t.y) * 0.02, -0.9, 0.9)
      for (const other of this.targets) {
        if (other === t || other.kind !== 'ufo' || other.dead) continue
        const dx = t.x - other.x
        const dy = t.y - other.y
        if (Math.abs(dx) < 34 && Math.abs(dy) < 26) {
          t.vx += dx >= 0 ? 0.05 : -0.05
          t.alt += dy >= 0 ? 0.6 : -0.6
          t.alt = clamp(t.alt, 34, 124)
        }
      }
    }

    t.vx = clamp(t.vx, -1.1, 1.1)
    t.x += t.vx
    t.y += t.vy
    if (t.x < 30) {
      t.x = 30
      t.vx = Math.abs(t.vx)
    }
    if (t.x > VIEW_W - 30) {
      t.x = VIEW_W - 30
      t.vx = -Math.abs(t.vx)
    }
    if (t.y > GROUND - 26) t.y = GROUND - 26
  }

  // ----------------------------------------------------------------- shooting

  /**
   * Pulls a trigger. Returns the points scored, which is zero for a miss.
   *
   * Hit testing walks front to back so the thing nearest the glass is what a
   * shot lands on, and only one target dies per trigger pull.
   */
  shoot(slot: number, x: number, y: number): number {
    const shooter = this.shooters.find((s) => s.slot === slot)
    if (!shooter || this.phase !== 'playing') return 0
    shooter.shots++
    shooter.recoil = 6
    shooter.x = clamp(x, 0, VIEW_W)
    shooter.y = clamp(y, 0, VIEW_H)

    const hit = this.pick(x, y)
    if (!hit) {
      if (this.combo > 0) this.comboBrokeFrame = this.frame
      this.combo = 0
      this.events.push({ slot, x, y, points: 0, kind: 'miss' })
      this.version++
      return 0
    }

    return this.resolveHit(shooter, hit, x, y)
  }

  /** The frontmost shootable target under a point. */
  private pick(x: number, y: number): Target | null {
    let best: Target | null = null
    for (const t of this.targets) {
      if (t.dead || t.dying > 0) continue
      // Captured campers are cargo, not targets: shoot the saucer instead.
      if (t.kind === 'walker') continue
      const r = t.r * (0.35 + t.z * 0.65)
      const dx = x - t.x
      const dy = y - t.y
      if (dx * dx + dy * dy > r * r) continue
      if (!best || t.z > best.z) best = t
    }
    return best
  }

  private resolveHit(shooter: Shooter, t: Target, x: number, y: number): number {
    let points = 0
    let color = '#fff3d6'

    switch (t.kind) {
      case 'mii': {
        // The one target that punishes you: it costs points and the combo.
        points = BASE_POINTS.mii
        if (this.combo > 0) this.comboBrokeFrame = this.frame
        this.combo = 0
        color = '#d9534f'
        t.dying = 12
        this.burst(t.x, t.y, 10, '#f2ece0')
        break
      }
      case 'duck': {
        // Flat bonus: the duck ignores the multiplier entirely.
        points = BASE_POINTS.duck
        this.combo++
        color = '#e8c05f'
        t.dying = 10
        this.burst(t.x, t.y, 14, '#5f7a52')
        this.shake = Math.max(this.shake, 4)
        break
      }
      case 'can': {
        t.hits++
        this.combo++
        // Each dent is worth more than the last, and the fifth bursts it.
        points = t.hits * this.multiplier
        if (t.hits >= CAN_BURST) {
          points += 5 * this.multiplier
          t.dying = 8
          this.burst(t.x, t.y, 20, '#d9d4c8')
          this.shake = Math.max(this.shake, 5)
        } else {
          // Punt it back up: the whole stage is keeping cans in the air.
          t.vy = -rand(3.4, 4.4)
          t.vx += (t.x - x) * 0.06
          this.burst(t.x, t.y, 5, '#e6e2d8')
        }
        shooter.score += points
        shooter.hits++
        this.score += points
        this.bestCombo = Math.max(this.bestCombo, this.combo)
        this.splash(t.x, t.y - 12, `+${points}`, shooter.color)
        this.events.push({ slot: shooter.slot, x, y, points, kind: t.kind })
        this.version++
        return points
      }
      case 'ufo': {
        this.combo++
        const captive = t.linked === null ? null : this.targets.find((w) => w.id === t.linked)
        points = BASE_POINTS.ufo * this.multiplier
        if (captive && !captive.dead) {
          // Shooting a loaded saucer drops its captive safely.
          captive.captured = false
          captive.linked = null
          captive.y = GROUND
          points += RESCUE_BONUS * this.multiplier
          this.splash(captive.x, GROUND - 30, 'RESCUE!', '#7fb069')
        }
        t.dying = 12
        color = '#9fd3e0'
        this.burst(t.x, t.y, 18, '#9fd3e0')
        this.shake = Math.max(this.shake, 6)
        break
      }
      case 'clay': {
        this.combo++
        // Close to the glass is worth far more than a speck near the horizon.
        points = Math.max(1, Math.round(6 * t.z)) * this.multiplier
        t.dying = 8
        this.burst(t.x, t.y, 12, '#c98a6a')
        break
      }
      default: {
        this.combo++
        points = BASE_POINTS[t.kind] * this.multiplier
        t.dying = 8
        this.burst(t.x, t.y, t.kind === 'balloon' ? 14 : 10, t.color)
        break
      }
    }

    shooter.score += points
    if (points > 0) shooter.hits++
    this.score += points
    this.bestCombo = Math.max(this.bestCombo, this.combo)
    this.splash(t.x, t.y - 12, points >= 0 ? `+${points}` : `${points}`, color)
    this.events.push({ slot: shooter.slot, x, y, points, kind: t.kind })
    this.version++
    return points
  }

  // ---------------------------------------------------------------- flourish

  private splash(x: number, y: number, text: string, color: string): void {
    this.splashes.push({ x, y, life: 46, maxLife: 46, text, color })
  }

  private burst(x: number, y: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3)
      const sp = rand(0.8, 2.8)
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(16, 34),
        maxLife: 34,
        size: rand(1, 2.6),
        color: i % 3 === 0 ? '#fff3d6' : color,
        gravity: 0.08,
      })
    }
  }

  private updateParticles(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx
      p.y += p.vy
      p.vy += p.gravity
      p.vx *= 0.97
      p.life--
      if (p.life <= 0) this.particles.splice(i, 1)
    }
  }

  private updateSplashes(): void {
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i]
      s.y -= 0.42
      s.life--
      if (s.life <= 0) this.splashes.splice(i, 1)
    }
  }

  // ----------------------------------------------------------------- netcode

  /** Everything a guest needs to draw the same frame the host is drawing. */
  snapshot(): DuckSnapshot {
    return {
      m: [this.frame, this.stageIndex, PHASE_LIST.indexOf(this.phase), this.phaseTimer, this.stageTimer],
      s: [this.score, this.combo, this.bestCombo],
      t: this.targets.map((t) => [
        t.id,
        KIND_LIST.indexOf(t.kind),
        Math.round(t.x * 10) / 10,
        Math.round(t.y * 10) / 10,
        Math.round(t.z * 100) / 100,
        t.r,
        t.hits,
        t.dying,
        t.captured ? 1 : 0,
        t.age,
      ]),
      p: this.shooters.map((s) => [s.slot, Math.round(s.x), Math.round(s.y), s.score, s.hits, s.shots]),
    }
  }

  applySnapshot(snap: DuckSnapshot): void {
    if (!snap || !snap.m) return
    this.frame = snap.m[0]
    this.stageIndex = snap.m[1]
    this.phase = PHASE_LIST[snap.m[2]] ?? this.phase
    this.phaseTimer = snap.m[3]
    this.stageTimer = snap.m[4]
    this.score = snap.s[0]
    this.combo = snap.s[1]
    this.bestCombo = snap.s[2]

    const seen = new Set<number>()
    for (const row of snap.t) {
      const [id, kindIdx, x, y, z, r, hits, dying, captured, age] = row
      seen.add(id)
      let t = this.targets.find((q) => q.id === id)
      if (!t) {
        t = { ...this.blank(KIND_LIST[kindIdx] ?? 'balloon'), id }
        t.color = defaultColor(t.kind)
        this.targets.push(t)
      }
      t.x = x
      t.y = y
      t.z = z
      t.r = r
      t.hits = hits
      t.dying = dying
      t.captured = captured === 1
      t.age = age
    }
    this.targets = this.targets.filter((t) => seen.has(t.id))

    for (const row of snap.p) {
      const [slot, x, y, score, hits, shots] = row
      const s = this.addShooter(slot, `Player ${slot + 1}`)
      s.x = x
      s.y = y
      s.score = score
      s.hits = hits
      s.shots = shots
    }
    this.version++
  }
}

export interface DuckSnapshot {
  /** frame, stage index, phase index, phase timer, stage timer */
  m: [number, number, number, number, number]
  /** score, combo, best combo */
  s: [number, number, number]
  /** id, kind, x, y, z, r, hits, dying, captured, age */
  t: number[][]
  /** slot, x, y, score, hits, shots */
  p: number[][]
}

const PHASE_LIST: Phase[] = ['ready', 'playing', 'stageEnd', 'over']
const KIND_LIST: TargetKind[] = [
  'balloon',
  'bull',
  'gold',
  'mii',
  'clay',
  'can',
  'ufo',
  'walker',
  'duck',
]

function defaultColor(kind: TargetKind): string {
  switch (kind) {
    case 'gold':
      return '#e8c05f'
    case 'mii':
      return '#f2ece0'
    case 'clay':
      return '#c98a6a'
    case 'can':
      return '#b9bfc4'
    case 'ufo':
      return '#8fa8b8'
    case 'walker':
      return '#e8dfd0'
    case 'duck':
      return '#5f7a52'
    default:
      return '#d9534f'
  }
}
