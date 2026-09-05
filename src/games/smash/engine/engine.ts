/**
 * Polyland Smash: a two-fighter arena brawl seen from above.
 *
 * There is no gravity here and nothing to jump onto. Fighters slide around a
 * floating disc, and a hit sends the other player skating toward the rim -
 * the higher their percent, the further they go. Go over the edge and you
 * lose a stock. Everything else follows from that: "recovery" is scrambling
 * back before the fall finishes, "weight" is how little you slide, and the
 * whole fight is a contest over who is standing nearer the middle.
 *
 * The engine is DOM-free so it can be driven headlessly by `npm run smoke`
 * and by the balance harness.
 */
import { clamp, rand } from '../../../lib/draw'
import { charById } from './characters'
import { LAKESIDE_BLUFF, clampToFloor, rimDistance, type Arena } from './stage'
import type { CharDef, Facing, FighterState, MoveDef, MoveId, Phase, RawInput } from './types'
import { emptyInput } from './types'
import {
  FACINGS,
  MOVES,
  PHASES,
  STATES,
  round2,
  type FighterSnap,
  type Snapshot,
} from '../../../net/protocol'

export const TICK = 1 / 60

export interface Particle {
  x: number
  y: number
  /** Height above the floor, so sparks can arc without leaving the plane. */
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  maxLife: number
  size: number
  color: string
}

export interface FloatText {
  x: number
  y: number
  vy: number
  life: number
  text: string
  color: string
  scale: number
}

export interface Fighter {
  index: 0 | 1
  def: CharDef
  x: number
  y: number
  px: number
  py: number
  vx: number
  vy: number
  facing: Facing
  state: FighterState
  move: MoveDef | null
  moveFrame: number
  hitTargets: Set<number>
  percent: number
  stocks: number
  hitstun: number
  hitlag: number
  invuln: number
  respawnTimer: number
  /** Counts up while going over the edge; a KO lands at the end of it. */
  fallTimer: number
  animTimer: number
  squash: number
  spin: number
  lastHitFrame: number
  comboCount: number
}

export interface MatchConfig {
  chars: [string, string]
  stocks: number
  cpu: boolean
  cpuLevel: 1 | 2 | 3
}

export const DEFAULT_CONFIG: MatchConfig = {
  chars: ['contrlzee', 'ninjapenguin'],
  stocks: 3,
  cpu: true,
  cpuLevel: 2,
}

const PLAYER_COLORS = ['#4f8fbf', '#e0794f']
const INTRO_FRAMES = 170
const KO_FREEZE = 44
const RESPAWN_FRAMES = 52
const RESPAWN_INVULN = 110
/** Frames of scrambling before a fighter over the rim is gone for good. */
const FALL_FRAMES = 34

/** Unit vector for each facing, in floor space. */
const DIR: Record<Facing, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export class SmashEngine {
  readonly arena: Arena = LAKESIDE_BLUFF
  config: MatchConfig
  fighters: [Fighter, Fighter]
  particles: Particle[] = []
  texts: FloatText[] = []
  phase: Phase = 'intro'
  phaseTimer = INTRO_FRAMES
  frame = 0
  shake = 0
  flash = 0
  winner: number | null = null
  banner = ''
  bannerTimer = 0
  /** Bumped whenever the HUD-relevant numbers change, so React can poll cheaply. */
  version = 0

  private inputs: [RawInput, RawInput] = [emptyInput(), emptyInput()]
  private prevInputs: [RawInput, RawInput] = [emptyInput(), emptyInput()]
  private cpu = { cooldown: 0, decision: 0, driftX: 0, driftY: 0 }

  constructor(config: Partial<MatchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.fighters = [this.makeFighter(0), this.makeFighter(1)]
  }

  static playerColor(i: number): string {
    return PLAYER_COLORS[i] ?? '#ffffff'
  }

  private makeFighter(index: 0 | 1): Fighter {
    const def = charById(this.config.chars[index])
    const spawn = this.arena.spawns[index]
    return {
      index,
      def,
      x: spawn.x,
      y: spawn.y,
      px: spawn.x,
      py: spawn.y,
      vx: 0,
      vy: 0,
      facing: index === 0 ? 'right' : 'left',
      state: 'idle',
      move: null,
      moveFrame: 0,
      hitTargets: new Set(),
      percent: 0,
      stocks: this.config.stocks,
      hitstun: 0,
      hitlag: 0,
      invuln: RESPAWN_INVULN,
      respawnTimer: 0,
      fallTimer: 0,
      animTimer: 0,
      squash: 0,
      spin: 0,
      lastHitFrame: -999,
      comboCount: 0,
    }
  }

  reset(): void {
    this.fighters = [this.makeFighter(0), this.makeFighter(1)]
    this.particles = []
    this.texts = []
    this.phase = 'intro'
    this.phaseTimer = INTRO_FRAMES
    this.frame = 0
    this.winner = null
    this.banner = ''
    this.bannerTimer = 0
    this.inputs = [emptyInput(), emptyInput()]
    this.prevInputs = [emptyInput(), emptyInput()]
    this.version++
  }

  setInput(index: 0 | 1, raw: RawInput): void {
    this.inputs[index] = raw
  }

  private pressed(index: 0 | 1, key: keyof RawInput): boolean {
    return this.inputs[index][key] && !this.prevInputs[index][key]
  }

  step(): void {
    this.frame++
    if (this.config.cpu) this.inputs[1] = this.cpuThink()

    if (this.phase === 'intro') {
      this.phaseTimer--
      if (this.phaseTimer <= 0) {
        this.phase = 'fight'
        this.setBanner('GO!', 50)
      }
    } else if (this.phase === 'ko') {
      this.phaseTimer--
      if (this.phaseTimer <= 0) this.phase = this.winner === null ? 'fight' : 'over'
    }

    const live = this.phase === 'fight'
    for (const f of this.fighters) {
      if (f.hitlag > 0) {
        f.hitlag--
        continue
      }
      this.updateFighter(f, live ? this.inputs[f.index] : emptyInput(), live)
    }

    if (live) {
      this.resolveHits(this.fighters[0], this.fighters[1])
      this.resolveHits(this.fighters[1], this.fighters[0])
      this.separate()
      for (const f of this.fighters) this.checkRim(f)
    }

    this.stepParticles()
    this.stepTexts()
    if (this.shake > 0) this.shake *= 0.86
    if (this.flash > 0) this.flash -= 1
    if (this.bannerTimer > 0) this.bannerTimer--
    this.prevInputs = [{ ...this.inputs[0] }, { ...this.inputs[1] }]
  }

  private setBanner(text: string, frames: number): void {
    this.banner = text
    this.bannerTimer = frames
    this.version++
  }

  // ----------------------------------------------------------------- fighter

  private updateFighter(f: Fighter, input: RawInput, live: boolean): void {
    f.animTimer++
    if (f.squash !== 0) f.squash *= 0.86
    if (f.invuln > 0) f.invuln--

    if (f.state === 'dead') {
      f.respawnTimer--
      if (f.respawnTimer <= 0) this.respawn(f)
      return
    }

    if (f.state === 'falling') {
      // Still sliding outward, but the floor is gone: a short scramble window
      // where a fighter can be seen dropping before the stock is taken.
      f.fallTimer++
      f.x += f.vx
      f.y += f.vy
      f.vx *= 0.94
      f.vy *= 0.94
      f.spin += 0.06
      if (f.fallTimer >= FALL_FRAMES) this.ko(f)
      return
    }

    if (f.hitstun > 0) {
      f.hitstun--
      f.x += f.vx
      f.y += f.vy
      f.vx *= f.def.slide
      f.vy *= f.def.slide
      f.spin *= 0.9
      if (f.hitstun <= 0) {
        f.state = 'idle'
        f.spin = 0
      }
      return
    }

    if (f.move) {
      this.tickMove(f)
      return
    }

    if (!live) return

    // ------------------------------------------------------------- movement
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0)
    const def = f.def

    if (dx !== 0 || dy !== 0) {
      // Normalise so diagonals are not faster than the axes.
      const len = Math.hypot(dx, dy)
      const ax = (dx / len) * def.accel
      const ay = (dy / len) * def.accel
      f.vx += ax
      f.vy += ay
      const sp = Math.hypot(f.vx, f.vy)
      if (sp > def.speed) {
        f.vx = (f.vx / sp) * def.speed
        f.vy = (f.vy / sp) * def.speed
      }
      f.facing = facingFor(dx, dy, f.facing)
      f.state = 'walk'
    } else {
      f.vx *= def.friction
      f.vy *= def.friction
      if (Math.abs(f.vx) < 0.02) f.vx = 0
      if (Math.abs(f.vy) < 0.02) f.vy = 0
      f.state = 'idle'
    }

    f.x += f.vx
    f.y += f.vy

    // -------------------------------------------------------------- attacks
    if (this.pressed(f.index, 'attack')) {
      this.startMove(f, moveFor('attack', input))
    } else if (this.pressed(f.index, 'special')) {
      this.startMove(f, moveFor('special', input))
    }
  }

  private startMove(f: Fighter, id: MoveId): void {
    const mv = f.def.moves[id]
    if (!mv) return
    f.move = mv
    f.moveFrame = 0
    f.state = 'attack'
    f.hitTargets.clear()
    if (mv.killsMomentum) {
      f.vx *= 0.2
      f.vy *= 0.2
    }
  }

  private tickMove(f: Fighter): void {
    const mv = f.move!
    f.moveFrame++
    const total = mv.startup + mv.active + mv.recovery

    if (f.moveFrame === mv.startup + 1 && mv.drive) {
      const d = DIR[f.facing]
      f.vx += d.x * mv.drive
      f.vy += d.y * mv.drive
    }

    // Committed: only a little drift, and the fighter keeps sliding.
    f.x += f.vx
    f.y += f.vy
    f.vx *= 0.9
    f.vy *= 0.9

    if (f.moveFrame >= total) {
      f.move = null
      f.moveFrame = 0
      f.state = 'idle'
    }
  }

  private moveIsActive(f: Fighter): boolean {
    if (!f.move || f.state !== 'attack') return false
    return f.moveFrame > f.move.startup && f.moveFrame <= f.move.startup + f.move.active
  }

  // ------------------------------------------------------------------ combat

  private resolveHits(attacker: Fighter, victim: Fighter): void {
    if (!this.moveIsActive(attacker)) return
    if (victim.state === 'dead' || victim.state === 'falling' || victim.invuln > 0) return
    if (attacker.hitTargets.has(victim.index)) return
    const mv = attacker.move!

    const dxv = victim.x - attacker.x
    const dyv = victim.y - attacker.y

    let inside: boolean
    if (mv.radial) {
      inside = Math.hypot(dxv, dyv) <= mv.hit.reach + victim.def.radius
    } else {
      // Rotate the offset into facing space, where the box is axis aligned.
      const d = DIR[attacker.facing]
      const along = dxv * d.x + dyv * d.y
      const across = dxv * -d.y + dyv * d.x
      inside =
        along > mv.hit.reach - mv.hit.depth / 2 - victim.def.radius &&
        along < mv.hit.reach + mv.hit.depth / 2 + victim.def.radius &&
        Math.abs(across) < mv.hit.width / 2 + victim.def.radius
    }
    if (!inside) return

    attacker.hitTargets.add(victim.index)
    this.applyHit(attacker, victim, mv)
  }

  private applyHit(attacker: Fighter, victim: Fighter, mv: MoveDef): void {
    victim.percent = Math.min(999, victim.percent + mv.damage)

    // Away from the attacker for radial moves, along the facing otherwise.
    let lx: number
    let ly: number
    if (mv.radial) {
      const d = Math.hypot(victim.x - attacker.x, victim.y - attacker.y) || 1
      lx = (victim.x - attacker.x) / d
      ly = (victim.y - attacker.y) / d
    } else {
      const d = DIR[attacker.facing]
      lx = d.x
      ly = d.y
    }

    const kb = ((mv.baseKb + victim.percent * mv.kbScale) * 0.05) / victim.def.weight
    victim.vx = lx * kb
    victim.vy = ly * kb
    victim.hitstun = clamp(Math.round(kb * 5.5), 8, 64)
    victim.state = 'hitstun'
    victim.move = null
    victim.squash = 1
    victim.spin = 0

    const lag = Math.round(3 + mv.damage * 0.5)
    victim.hitlag = lag
    attacker.hitlag = lag

    if (this.frame - victim.lastHitFrame < 48) victim.comboCount++
    else victim.comboCount = 1
    victim.lastHitFrame = this.frame

    this.shake = Math.max(this.shake, mv.shake ?? 2)
    this.flash = Math.max(this.flash, Math.min(6, 2 + mv.damage * 0.2))

    const hx = (attacker.x + victim.x) / 2
    const hy = (attacker.y + victim.y) / 2
    this.hitBurst(hx, hy, mv.damage, attacker.def.theme, lx, ly)

    this.texts.push({
      x: victim.x,
      y: victim.y - 18,
      vy: -0.55,
      life: 44,
      text: `${mv.damage}`,
      color: SmashEngine.playerColor(attacker.index),
      scale: 1,
    })
    if (victim.comboCount >= 3) {
      this.texts.push({
        x: victim.x,
        y: victim.y - 30,
        vy: -0.4,
        life: 40,
        text: `${victim.comboCount} HIT`,
        color: '#ffe066',
        scale: 1,
      })
    }
    this.version++
  }

  /** Two fighters cannot stand in the same place; push them apart gently. */
  private separate(): void {
    const [a, b] = this.fighters
    if (a.state === 'dead' || b.state === 'dead') return
    if (a.state === 'falling' || b.state === 'falling') return
    const dx = b.x - a.x
    const dy = b.y - a.y
    const d = Math.hypot(dx, dy)
    const min = a.def.radius + b.def.radius
    if (d >= min || d === 0) return
    const push = (min - d) / 2
    const nx = dx / d
    const ny = dy / d
    a.x -= nx * push
    a.y -= ny * push
    b.x += nx * push
    b.y += ny * push
  }

  private checkRim(f: Fighter): void {
    if (f.state === 'dead' || f.state === 'falling') return
    if (rimDistance(this.arena, f.x, f.y) <= 1) return
    // Over the edge: the fall plays out before the stock is taken, so there is
    // something to watch and a moment to realise what happened.
    f.state = 'falling'
    f.fallTimer = 0
    f.move = null
    f.hitstun = 0
    this.shake = Math.max(this.shake, 6)
  }

  private ko(f: Fighter): void {
    f.stocks--
    f.state = 'dead'
    f.respawnTimer = RESPAWN_FRAMES
    f.hitstun = 0
    f.hitlag = 0
    f.move = null
    f.vx = 0
    f.vy = 0
    f.spin = 0
    f.comboCount = 0
    this.shake = 14
    this.flash = 10
    this.koBurst(f.x, f.y, f.def.theme.primary)

    this.phase = 'ko'
    this.phaseTimer = KO_FREEZE

    const other = this.fighters[1 - f.index]
    if (f.stocks <= 0) {
      this.winner = other.index
      this.setBanner(`${other.def.name} wins`, 240)
    } else {
      this.setBanner('KO!', 60)
    }
    this.version++
  }

  private respawn(f: Fighter): void {
    const spawn = clampToFloor(this.arena, this.arena.spawns[f.index].x, this.arena.spawns[f.index].y)
    f.x = spawn.x
    f.y = spawn.y
    f.px = spawn.x
    f.py = spawn.y
    f.vx = 0
    f.vy = 0
    f.percent = 0
    f.state = 'idle'
    f.invuln = RESPAWN_INVULN
    f.fallTimer = 0
    f.spin = 0
    f.facing = f.index === 0 ? 'right' : 'left'
    this.version++
  }

  // --------------------------------------------------------------- particles

  private hitBurst(x: number, y: number, damage: number, theme: CharDef['theme'], lx: number, ly: number): void {
    const n = Math.min(18, 5 + Math.round(damage))
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x,
        y,
        z: 10,
        vx: lx * rand(0.6, 2.4) + rand(-0.8, 0.8),
        vy: ly * rand(0.6, 2.4) + rand(-0.8, 0.8),
        vz: rand(0.4, 1.8),
        life: rand(14, 26),
        maxLife: 26,
        size: rand(0.9, 2.2),
        color: i % 3 === 0 ? '#fff3d6' : theme.primary,
      })
    }
  }

  private koBurst(x: number, y: number, color: string): void {
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2
      this.particles.push({
        x,
        y,
        z: 8,
        vx: Math.cos(a) * rand(1.2, 3.4),
        vy: Math.sin(a) * rand(1.2, 3.4) * 0.6,
        vz: rand(0.5, 2.2),
        life: rand(22, 40),
        maxLife: 40,
        size: rand(1.2, 2.8),
        color: i % 2 ? color : '#fff3d6',
      })
    }
  }

  private stepParticles(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx
      p.y += p.vy
      p.z += p.vz
      p.vz -= 0.12
      p.vx *= 0.94
      p.vy *= 0.94
      if (p.z < 0) {
        p.z = 0
        p.vz *= -0.35
      }
      p.life--
      if (p.life <= 0) this.particles.splice(i, 1)
    }
  }

  private stepTexts(): void {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]
      t.y += t.vy
      t.vy *= 0.96
      t.life--
      if (t.life <= 0) this.texts.splice(i, 1)
    }
  }

  // ---------------------------------------------------------------- netcode

  /** A compact snapshot of everything that has to match between two peers. */
  snapshot(): Snapshot {
    return {
      m: [
        this.frame,
        PHASES.indexOf(this.phase),
        this.phaseTimer,
        this.bannerTimer,
        this.winner ?? -1,
      ],
      banner: this.banner,
      a: this.fighters.map(
        (f): FighterSnap => [
          round2(f.x),
          round2(f.y),
          round2(f.vx),
          round2(f.vy),
          FACINGS.indexOf(f.facing),
          STATES.indexOf(f.state),
          f.move ? MOVES.indexOf(f.move.id) : -1,
          f.moveFrame,
          f.percent,
          f.stocks,
          f.hitstun,
          f.hitlag,
          f.invuln,
          f.respawnTimer,
          f.fallTimer,
          round2(f.spin),
          round2(f.squash),
          f.animTimer,
        ],
      ),
    }
  }

  applySnapshot(s: Snapshot): void {
    if (!s || !s.a || s.a.length < 2) return
    this.frame = s.m[0]
    this.phase = PHASES[s.m[1]] ?? this.phase
    this.phaseTimer = s.m[2]
    this.bannerTimer = s.m[3]
    this.winner = s.m[4] < 0 ? null : s.m[4]
    this.banner = s.banner
    this.fighters.forEach((f, i) => {
      const d = s.a[i]
      if (!d) return
      f.x = d[0]
      f.y = d[1]
      f.vx = d[2]
      f.vy = d[3]
      f.facing = FACINGS[d[4]] ?? f.facing
      f.state = STATES[d[5]] ?? f.state
      f.move = d[6] < 0 ? null : f.def.moves[MOVES[d[6]]] ?? null
      f.moveFrame = d[7]
      f.percent = d[8]
      f.stocks = d[9]
      f.hitstun = d[10]
      f.hitlag = d[11]
      f.invuln = d[12]
      f.respawnTimer = d[13]
      f.fallTimer = d[14]
      f.spin = d[15]
      f.squash = d[16]
      f.animTimer = d[17]
    })
    this.version++
  }

  // -------------------------------------------------------------------- cpu

  private cpuThink(): RawInput {
    const out = emptyInput()
    const me = this.fighters[1]
    const foe = this.fighters[0]
    if (this.phase !== 'fight' || me.state === 'dead' || me.state === 'falling') return out
    if (me.hitstun > 0 || me.move) return out

    const level = this.config.cpuLevel
    if (this.cpu.cooldown > 0) this.cpu.cooldown--
    if (this.frame % 20 === 0) {
      this.cpu.decision = Math.random()
      this.cpu.driftX = rand(-1, 1)
      this.cpu.driftY = rand(-1, 1)
    }

    // Getting away from the rim beats anything else.
    const danger = rimDistance(this.arena, me.x, me.y)
    if (danger > 0.72) {
      if (me.x > this.arena.cx) out.left = true
      else out.right = true
      if (me.y > this.arena.cy) out.up = true
      else out.down = true
      return out
    }

    const dx = foe.x - me.x
    const dy = foe.y - me.y
    const dist = Math.hypot(dx, dy)
    const reach = me.def.moves.attack.hit.reach + me.def.radius + 4

    // Close the gap, but not so far that we walk through them.
    if (dist > reach) {
      if (dx > 3) out.right = true
      else if (dx < -3) out.left = true
      if (dy > 3) out.down = true
      else if (dy < -3) out.up = true
      if (level === 1 && this.cpu.decision < 0.3) {
        out.left = out.right = out.up = out.down = false
      }
    } else if (dist < reach * 0.45) {
      if (dx > 0) out.left = true
      else out.right = true
    }

    const base = level === 1 ? 40 : level === 2 ? 25 : 14
    if (this.cpu.cooldown <= 0 && dist < reach + (level >= 3 ? 10 : 4)) {
      // Jittered, because a fixed cooldown makes both fighters swing on the
      // same beat and whoever has fewer startup frames wins every exchange.
      this.cpu.cooldown = base + Math.floor(Math.random() * base * 0.7)
      const r = Math.random()
      // Face the target before swinging, so the hitbox points the right way.
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) out.right = true
        else out.left = true
      } else if (dy > 0) out.down = true
      else out.up = true

      if (r < 0.3 || level === 1) {
        // Neutral poke: let go of the direction so it comes out unaimed.
        out.left = out.right = out.up = out.down = false
        out.attack = true
      } else if (r < 0.72) {
        out.attack = true
      } else if (r < 0.88) {
        out.up = true
        out.left = out.right = out.down = false
        out.attack = true
      } else {
        out.special = true
      }
    }

    return out
  }
}

// ------------------------------------------------------------------- helpers

/** Which way to point, preferring the larger input and keeping the old one. */
function facingFor(dx: number, dy: number, current: Facing): Facing {
  if (dx === 0 && dy === 0) return current
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}

/**
 * Which move a button press produces.
 *
 * Up is a launcher and down is a ground slam regardless of which way the
 * fighter is pointed - they are different moves, not the same move aimed - so
 * they win over a sideways press.
 */
function moveFor(kind: 'attack' | 'special', input: RawInput): MoveId {
  if (input.up) return kind === 'attack' ? 'attackUp' : 'specialUp'
  if (input.down) return kind === 'attack' ? 'attackDown' : 'specialDown'
  if (input.left || input.right) return kind === 'attack' ? 'attackSide' : 'specialSide'
  return kind
}
