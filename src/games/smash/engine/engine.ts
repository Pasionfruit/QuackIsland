/**
 * Polyland Smash: a two-fighter platform brawl, seen from the side.
 *
 * Gravity pulls everyone down onto the nearest platform underneath them; a
 * hit launches the other player, and the higher their percent, the further
 * they fly. Cross a blast zone edge - off either side, off the top, or down
 * through the gap under the stage - and you lose a stock. A tap of up is a
 * jump (a second one is available in the air); a tap of down on one of the
 * two floating platforms drops you through it. "Weight" is how little a hit
 * launches you, "recovery" is using your jumps and specials to get back to
 * a platform before the blast zone catches you.
 *
 * The engine is DOM-free so it can be driven headlessly by `npm run smoke`
 * and by the balance harness.
 */
import { clamp, rand } from '../../../lib/draw'
import { charById } from './characters'
import { clampToFloor, LAKESIDE_BLUFF, mainPlatform, outOfBounds, type Arena, type Platform } from './stage'
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
  /** What `life` started at, so the renderer has something to fade against. */
  maxLife: number
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
  animTimer: number
  squash: number
  spin: number
  lastHitFrame: number
  comboCount: number
  /** Standing on a platform this frame. */
  grounded: boolean
  /** Jumps left before landing again - a fresh double jump refills this. */
  jumps: number
  /** Counts down while falling through a platform on purpose, ignoring it for collision. */
  dropThrough: number
  /** Frames spent shielding this stretch - a hit landing before the parry window closes is parried instead of blocked. */
  shieldFrames: number
}

export interface MatchConfig {
  chars: [string, string]
  stocks: number
  cpu: boolean
  cpuLevel: 1 | 2 | 3
  /** Both fighters CPU-controlled rather than just slot 1 - offline balance testing only, never wired to a real match. */
  cpu2?: boolean
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

// ------------------------------------------------------------------ physics
const GRAVITY = 0.32
const FAST_FALL_GRAVITY = 0.62
const MAX_FALL_SPEED = 6.4
const JUMP_VELOCITY = -7.6
const MAX_JUMPS = 2 // a ground jump plus one in the air
const AIR_CONTROL = 0.55 // fraction of ground acceleration available mid-air
const DROP_THROUGH_FRAMES = 12

// -------------------------------------------------------------- shield/dodge
/** A hit landing this many frames into a fresh shield is parried, not just blocked. */
const PARRY_WINDOW = 6
const SPOT_DODGE_FRAMES = 24
const ROLL_FRAMES = 28
const ROLL_SPEED_MULT = 1.3
const AIR_DODGE_FRAMES = 26

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
  private cpu = [
    { cooldown: 0, decision: 0 },
    { cooldown: 0, decision: 0 },
  ]

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
      animTimer: 0,
      squash: 0,
      spin: 0,
      lastHitFrame: -999,
      comboCount: 0,
      grounded: true,
      jumps: MAX_JUMPS,
      dropThrough: 0,
      shieldFrames: 0,
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
    if (this.config.cpu) this.inputs[1] = this.cpuThink(1)
    if (this.config.cpu2) this.inputs[0] = this.cpuThink(0)

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
      for (const f of this.fighters) {
        if (f.state !== 'dead' && outOfBounds(this.arena, f.x, f.y)) this.ko(f)
      }
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
    if (f.dropThrough > 0) f.dropThrough--
    f.px = f.x
    f.py = f.y

    if (f.state === 'dead') {
      f.respawnTimer--
      if (f.respawnTimer <= 0) this.respawn(f)
      return
    }

    if (f.hitstun > 0) {
      f.hitstun--
      if (!f.grounded) {
        f.vy += input.down ? FAST_FALL_GRAVITY : GRAVITY
        if (f.vy > MAX_FALL_SPEED) f.vy = MAX_FALL_SPEED
      }
      f.x += f.vx
      f.y += f.vy
      f.vx *= f.def.slide
      f.spin *= 0.9
      this.applyPlatformCollision(f)
      if (f.hitstun <= 0) {
        f.state = f.grounded ? 'idle' : 'falling'
        f.spin = 0
      }
      return
    }

    if (f.state === 'shield') {
      f.shieldFrames++
      f.vx *= 0.7
      f.x += f.vx
      if (!live || !input.shield) {
        f.state = f.grounded ? 'idle' : 'falling'
        f.shieldFrames = 0
        return
      }
      // Shielding is grounded-only, but a direction or down while holding it
      // cancels into a dodge - a roll away, or a spot dodge in place.
      if (this.pressed(f.index, 'left')) return this.startDodge(f, -1)
      if (this.pressed(f.index, 'right')) return this.startDodge(f, 1)
      if (this.pressed(f.index, 'down')) return this.startDodge(f, 0)
      return
    }

    if (f.state === 'dodge') {
      f.x += f.vx
      f.vx *= 0.88
      if (!f.grounded) {
        f.vy += GRAVITY
        if (f.vy > MAX_FALL_SPEED) f.vy = MAX_FALL_SPEED
        f.y += f.vy
      }
      this.applyPlatformCollision(f)
      if (f.invuln <= 0) f.state = f.grounded ? 'idle' : 'falling'
      return
    }

    if (f.move) {
      this.tickMove(f)
      return
    }

    if (!live) return

    // ------------------------------------------------------------- movement
    const def = f.def
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0)

    // A fresh shield press: grounded raises a shield, airborne is an air
    // dodge - a burst of invulnerability, since there is no shield in the air.
    if (this.pressed(f.index, 'shield')) {
      if (f.grounded) {
        f.state = 'shield'
        f.shieldFrames = 0
        f.vx = 0
        return
      }
      this.startDodge(f, dx as -1 | 0 | 1, true)
      return
    }

    if (dx !== 0) {
      const accel = def.accel * (f.grounded ? 1 : AIR_CONTROL)
      f.vx += dx * accel
      if (f.vx > def.speed) f.vx = def.speed
      if (f.vx < -def.speed) f.vx = -def.speed
      f.facing = dx > 0 ? 'right' : 'left'
    } else if (f.grounded) {
      f.vx *= def.friction
      if (Math.abs(f.vx) < 0.02) f.vx = 0
    }

    // A tap of up jumps rather than moving - there is nothing to walk "up" to
    // on flat ground, and it is the same key players already reach for.
    if (this.pressed(f.index, 'up') && f.jumps > 0) {
      f.vy = JUMP_VELOCITY
      f.jumps--
      f.grounded = false
    }

    // A tap of down drops you through whichever soft platform you're on.
    if (f.grounded && this.pressed(f.index, 'down')) {
      const under = this.platformUnder(f)
      if (under && !under.solid) {
        f.dropThrough = DROP_THROUGH_FRAMES
        f.grounded = false
      }
    }

    if (!f.grounded) {
      f.vy += input.down ? FAST_FALL_GRAVITY : GRAVITY
      if (f.vy > MAX_FALL_SPEED) f.vy = MAX_FALL_SPEED
    }

    f.x += f.vx
    f.y += f.vy
    this.applyPlatformCollision(f)
    f.state = f.grounded ? (f.vx !== 0 ? 'walk' : 'idle') : 'falling'

    // -------------------------------------------------------------- attacks
    if (this.pressed(f.index, 'attack')) {
      this.startMove(f, moveFor('attack', input))
    } else if (this.pressed(f.index, 'special')) {
      this.startMove(f, moveFor('special', input))
    }
  }

  /**
   * A dodge: invulnerable for its whole duration, cannot act until it ends.
   * `dir` of 0 is a spot dodge in place; -1/1 is a roll away from the middle.
   * `aerial` is the air-dodge version, thrown from a fresh shield press with
   * no ground under the fighter to shield on.
   */
  private startDodge(f: Fighter, dir: -1 | 0 | 1, aerial = false): void {
    f.state = 'dodge'
    f.shieldFrames = 0
    f.move = null
    f.hitTargets.clear()
    f.invuln = aerial ? AIR_DODGE_FRAMES : dir === 0 ? SPOT_DODGE_FRAMES : ROLL_FRAMES
    f.vx = dir * f.def.speed * (aerial ? 0.9 : ROLL_SPEED_MULT)
  }

  /** The platform (if any) a fighter's feet are already resting on. */
  private platformUnder(f: Fighter): Platform | null {
    for (const p of this.arena.platforms) {
      if (f.x + f.def.radius < p.x0 || f.x - f.def.radius > p.x1) continue
      if (Math.abs(f.y - p.y) < 0.5) return p
    }
    return null
  }

  /**
   * Lands a fighter on the first platform their feet cross this frame.
   *
   * A platform only catches a fighter falling through its surface between
   * last frame's position and this one - rising through it (jumping up
   * through a soft platform) or already being below it never counts, so a
   * fast fall can't be caught by a platform after skipping past it in one tick.
   */
  private applyPlatformCollision(f: Fighter): void {
    f.grounded = false
    if (f.vy < 0) return
    for (const p of this.arena.platforms) {
      if (f.dropThrough > 0 && !p.solid) continue
      if (f.x + f.def.radius < p.x0 || f.x - f.def.radius > p.x1) continue
      if (f.py > p.y + 0.1 || f.y < p.y) continue
      f.y = p.y
      f.vy = 0
      f.grounded = true
      f.jumps = MAX_JUMPS
      f.dropThrough = 0
      return
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
      const d = moveDirection(f, mv)
      f.vx += d.x * mv.drive
      f.vy += d.y * mv.drive
    }

    if (!f.grounded) {
      f.vy += GRAVITY
      if (f.vy > MAX_FALL_SPEED) f.vy = MAX_FALL_SPEED
    }

    // Committed: only a little drift, and the fighter keeps sliding.
    f.x += f.vx
    f.y += f.vy
    f.vx *= 0.9
    this.applyPlatformCollision(f)

    if (f.moveFrame >= total) {
      f.move = null
      f.moveFrame = 0
      f.state = f.grounded ? 'idle' : 'falling'
    }
  }

  private moveIsActive(f: Fighter): boolean {
    if (!f.move || f.state !== 'attack') return false
    return f.moveFrame > f.move.startup && f.moveFrame <= f.move.startup + f.move.active
  }

  // ------------------------------------------------------------------ combat

  private resolveHits(attacker: Fighter, victim: Fighter): void {
    if (!this.moveIsActive(attacker)) return
    if (victim.state === 'dead' || victim.invuln > 0) return
    if (attacker.hitTargets.has(victim.index)) return
    const mv = attacker.move!

    const dxv = victim.x - attacker.x
    const dyv = victim.y - attacker.y

    let inside: boolean
    if (mv.radial) {
      inside = Math.hypot(dxv, dyv) <= mv.hit.reach + victim.def.radius
    } else {
      // Rotate the offset into facing space, where the box is axis aligned.
      const d = moveDirection(attacker, mv)
      const along = dxv * d.x + dyv * d.y
      const across = dxv * -d.y + dyv * d.x
      inside =
        along > mv.hit.reach - mv.hit.depth / 2 - victim.def.radius &&
        along < mv.hit.reach + mv.hit.depth / 2 + victim.def.radius &&
        Math.abs(across) < mv.hit.width / 2 + victim.def.radius
    }
    if (!inside) return

    attacker.hitTargets.add(victim.index)
    if (victim.state === 'shield') this.applyBlock(attacker, victim, mv)
    else this.applyHit(attacker, victim, mv)
  }

  /**
   * A hit that lands on a raised shield: parried if the shield only just went
   * up, blocked otherwise. Either way the victim takes no damage and no
   * knockback - shielding is a hard counter to a mistimed swing, the way it
   * is meant to be - but a plain block still locks the victim in place for a
   * beat, where a parry does not, so a parry is strictly the better outcome
   * for correctly reading the hit rather than just holding shield on cooldown.
   */
  private applyBlock(attacker: Fighter, victim: Fighter, mv: MoveDef): void {
    const parried = victim.shieldFrames <= PARRY_WINDOW
    const lag = Math.round(3 + mv.damage * 0.5)
    attacker.hitlag = lag + (parried ? 10 : 0)
    this.shake = Math.max(this.shake, parried ? 4 : 2)
    this.texts.push({
      x: victim.x,
      y: victim.y - 18,
      vy: -0.55,
      life: parried ? 40 : 30,
      maxLife: parried ? 40 : 30,
      text: parried ? 'PARRY!' : 'BLOCK',
      color: parried ? '#ffe066' : '#cfd8e0',
      scale: parried ? 1 : 0.85,
    })
    if (!parried) {
      victim.hitlag = lag
      victim.vx += (victim.x < attacker.x ? -1 : 1) * mv.damage * 0.12
    }
    this.version++
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
      const d = moveDirection(attacker, mv)
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
      maxLife: 44,
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
        maxLife: 40,
        text: `${victim.comboCount} HIT`,
        color: '#ffe066',
        scale: 1,
      })
    }
    this.version++
  }

  /** Two fighters cannot stand in the same place; push them apart gently. */
  /**
   * Pushes two overlapping fighters apart horizontally only. Gravity and
   * platform collision are the only things allowed to move a fighter
   * vertically - a push along the full line between two fighters could shove
   * one down past the surface they're standing on (say, someone landing on
   * top of another player), and the landing check only ever catches a fall
   * from above, so once that happened they would fall through for good.
   */
  private separate(): void {
    const [a, b] = this.fighters
    if (a.state === 'dead' || b.state === 'dead') return
    const dy = b.y - a.y
    const min = a.def.radius + b.def.radius
    if (Math.abs(dy) >= min) return
    const reach = Math.sqrt(min * min - dy * dy)
    const dx = b.x - a.x
    if (Math.abs(dx) >= reach) return
    const push = (reach - Math.abs(dx)) / 2
    const nx = dx === 0 ? (a.index < b.index ? -1 : 1) : dx / Math.abs(dx)
    a.x -= nx * push
    b.x += nx * push
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
    f.grounded = true
    f.jumps = MAX_JUMPS
    f.dropThrough = 0
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
          f.jumps,
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
      f.jumps = d[14]
      f.spin = d[15]
      f.squash = d[16]
      f.animTimer = d[17]
    })
    this.version++
  }

  // -------------------------------------------------------------------- cpu

  private cpuThink(meIndex: 0 | 1): RawInput {
    const out = emptyInput()
    const me = this.fighters[meIndex]
    const foe = this.fighters[meIndex === 0 ? 1 : 0]
    const cpu = this.cpu[meIndex]
    if (this.phase !== 'fight' || me.state === 'dead') return out
    if (me.hitstun > 0 || me.move) return out

    // Already shielding: hold it briefly, then let go rather than sitting
    // behind it forever, which is easy to punish with a grab (or a wait-out).
    if (me.state === 'shield') {
      out.shield = me.shieldFrames < 18
      return out
    }

    const level = this.config.cpuLevel
    if (cpu.cooldown > 0) cpu.cooldown--
    if (this.frame % 20 === 0) cpu.decision = Math.random()

    const ground = mainPlatform(this.arena)
    const edgeMargin = 40

    // Off the stage and falling beats anything else: get back over solid
    // ground and spend a jump climbing back up onto it.
    if (!me.grounded && me.y > ground.y - 10 && (me.x < ground.x0 || me.x > ground.x1)) {
      if (me.x < ground.x0) out.right = true
      else out.left = true
      if (me.jumps > 0) out.up = true
      return out
    }

    const dx = foe.x - me.x
    const dy = foe.y - me.y
    const dist = Math.hypot(dx, dy)
    const reach = me.def.moves.attack.hit.reach + me.def.radius + 4
    const nearEdge = me.grounded && (me.x < ground.x0 + edgeMargin || me.x > ground.x1 - edgeMargin)

    // A foe already swinging at close range is worth blocking sometimes,
    // more often on a harder CPU.
    if (me.grounded && foe.state === 'attack' && foe.move && dist < reach * 1.2 && level >= 2 && cpu.cooldown <= 0) {
      if (cpu.decision < (level >= 3 ? 0.5 : 0.22)) {
        cpu.cooldown = 30
        out.shield = true
        return out
      }
    }

    // Standing right at the edge of the ground beats chasing a hit.
    if (nearEdge) {
      if (me.x < ground.x0 + edgeMargin) out.right = true
      else out.left = true
    } else {
      // Close the gap, but not so far that we walk through them.
      if (dist > reach) {
        if (dx > 3) out.right = true
        else if (dx < -3) out.left = true
        if (level === 1 && cpu.decision < 0.3) out.left = out.right = false
      } else if (dist < reach * 0.45) {
        if (dx > 0) out.left = true
        else out.right = true
      }
      // A foe well above is worth a jump to chase.
      if (dy < -22 && me.jumps > 0 && cpu.cooldown <= 0) out.up = true
    }

    const base = level === 1 ? 40 : level === 2 ? 25 : 14
    if (cpu.cooldown <= 0 && dist < reach + (level >= 3 ? 10 : 4)) {
      // Jittered, because a fixed cooldown makes both fighters swing on the
      // same beat and whoever has fewer startup frames wins every exchange.
      cpu.cooldown = base + Math.floor(Math.random() * base * 0.7)
      const r = Math.random()
      // Face the target before swinging, so the hitbox points the right way.
      if (Math.abs(dy) > 16 && Math.abs(dy) > Math.abs(dx)) {
        if (dy > 0) out.down = true
        else out.up = true
      } else if (dx > 0) out.right = true
      else out.left = true

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

/**
 * Which way a move actually fires. A side attack and a neutral poke go the
 * way the fighter is facing, but up and down attacks hit straight up or
 * straight down regardless of which way that is - an up-air aimed at your
 * own facing would be a strange, useless move in a side view.
 */
function moveDirection(f: Fighter, mv: MoveDef): { x: number; y: number } {
  if (mv.id.endsWith('Up')) return DIR.up
  if (mv.id.endsWith('Down')) return DIR.down
  return DIR[f.facing]
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
