import { clamp, rand } from '../../../lib/pixel'
import { charById } from './characters'
import { LAKESIDE_CAMP, MAIN_PLATFORM, type Platform, type Stage } from './stage'
import type { CharDef, FighterState, MoveDef, MoveId, Phase, RawInput } from './types'
import { emptyInput } from './types'
import {
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
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
  gravity: number
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
  facing: 1 | -1
  grounded: boolean
  jumpsLeft: number
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
  dropTimer: number
  landingLag: number
  fastFalling: boolean
  animTimer: number
  squash: number
  spin: number
  /** Frames since the last time this fighter was hit, for combo flavour. */
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
  chars: ['basil', 'juniper'],
  stocks: 3,
  cpu: true,
  cpuLevel: 2,
}

const PLAYER_COLORS = ['#4f8fbf', '#e0794f']
const INTRO_FRAMES = 190
const KO_FREEZE = 44
const RESPAWN_FRAMES = 54
const RESPAWN_INVULN = 110

export class SmashEngine {
  readonly stage: Stage = LAKESIDE_CAMP
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
  private cpu = { cooldown: 0, decision: 0, wantJump: 0 }

  constructor(config: Partial<MatchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.fighters = [this.makeFighter(0), this.makeFighter(1)]
  }

  static playerColor(i: number): string {
    return PLAYER_COLORS[i] ?? '#ffffff'
  }

  private makeFighter(index: 0 | 1): Fighter {
    const def = charById(this.config.chars[index])
    const spawn = this.stage.spawns[index]
    return {
      index,
      def,
      x: spawn.x,
      y: spawn.y,
      px: spawn.x,
      py: spawn.y,
      vx: 0,
      vy: 0,
      facing: index === 0 ? 1 : -1,
      grounded: true,
      jumpsLeft: def.jumps,
      state: 'idle',
      move: null,
      moveFrame: 0,
      hitTargets: new Set(),
      percent: 0,
      stocks: this.config.stocks,
      hitstun: 0,
      hitlag: 0,
      invuln: 0,
      respawnTimer: 0,
      dropTimer: 0,
      landingLag: 0,
      fastFalling: false,
      animTimer: 0,
      squash: 0,
      spin: 0,
      lastHitFrame: -999,
      comboCount: 0,
    }
  }

  reset(config: Partial<MatchConfig> = {}): void {
    this.config = { ...this.config, ...config }
    this.fighters = [this.makeFighter(0), this.makeFighter(1)]
    this.particles.length = 0
    this.texts.length = 0
    this.phase = 'intro'
    this.phaseTimer = INTRO_FRAMES
    this.frame = 0
    this.shake = 0
    this.flash = 0
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
      if (this.phase === 'ko' || this.phase === 'over') {
        this.idleDrift(f)
        continue
      }
      this.updateFighter(f, live ? this.inputs[f.index] : emptyInput(), live)
    }

    if (live) {
      this.resolveHits(this.fighters[0], this.fighters[1])
      this.resolveHits(this.fighters[1], this.fighters[0])
      for (const f of this.fighters) this.checkBlastZones(f)
    }

    this.updateEffects()
    this.prevInputs = [{ ...this.inputs[0] }, { ...this.inputs[1] }]
  }

  // ---------------------------------------------------------------- fighters

  private idleDrift(f: Fighter): void {
    if (f.state === 'dead') return
    f.animTimer++
    f.squash *= 0.85
    if (!f.grounded) {
      f.vy = Math.min(f.vy + f.def.gravity * 0.6, f.def.fallMax)
      this.integrate(f)
    } else {
      f.vx *= 0.8
    }
  }

  private updateFighter(f: Fighter, input: RawInput, live: boolean): void {
    const def = f.def
    f.animTimer++
    f.squash *= 0.86
    if (f.invuln > 0) f.invuln--
    if (f.dropTimer > 0) f.dropTimer--
    if (f.landingLag > 0) f.landingLag--

    if (f.state === 'dead') {
      f.respawnTimer--
      if (f.respawnTimer <= 0) this.respawn(f)
      return
    }

    if (f.hitstun > 0) {
      f.hitstun--
      f.vy += def.gravity * 0.82
      f.vy = Math.min(f.vy, def.fallMax + 4)
      f.vx *= 0.965
      f.spin += f.vx * 0.06
      if (f.hitstun <= 0) f.state = f.grounded ? 'idle' : 'air'
      this.integrate(f)
      if (Math.abs(f.vx) + Math.abs(f.vy) > 5 && this.frame % 3 === 0) {
        this.spark(f.x, f.y - def.hurt.h / 2, 1, '#fdf6e6', 0.6)
      }
      return
    }

    if (f.state === 'attack' && f.move) {
      this.tickMove(f, input)
      this.integrate(f)
      return
    }

    if (f.state === 'helpless') {
      const drift = (input.right ? 1 : 0) - (input.left ? 1 : 0)
      f.vx = clamp(f.vx + drift * def.airAccel * 0.4, -def.airMax * 0.7, def.airMax * 0.7)
      f.vy = Math.min(f.vy + def.gravity, def.fallMax)
      f.spin += 0.22
      this.integrate(f)
      if (f.grounded) {
        f.state = 'landing'
        f.landingLag = 12
        f.spin = 0
        f.squash = 1
        this.dust(f.x, f.y, 6)
      }
      return
    }

    // --- normal control ------------------------------------------------
    if (live && f.landingLag <= 0) {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
      if (dir !== 0) {
        f.facing = dir > 0 ? 1 : -1
        if (f.grounded) {
          f.vx = clamp(f.vx + dir * def.groundAccel, -def.walk, def.walk)
          f.state = 'walk'
          if (f.animTimer % 9 === 0) this.dust(f.x, f.y, 1)
        } else {
          f.vx = clamp(f.vx + dir * def.airAccel, -def.airMax, def.airMax)
        }
      } else if (f.grounded) {
        f.vx *= def.friction
        if (Math.abs(f.vx) < 0.05) f.vx = 0
        f.state = 'idle'
      }

      if (this.pressed(f.index, 'up')) this.tryJump(f)

      if (input.down) {
        if (f.grounded && this.pressed(f.index, 'down') && this.onSoftPlatform(f)) {
          f.dropTimer = 9
          f.grounded = false
          f.y += 2
        } else if (!f.grounded && f.vy > -1) {
          f.fastFalling = true
        }
      }

      if (this.pressed(f.index, 'attack')) {
        const id: MoveId = input.up ? 'up' : input.down ? 'down' : input.left || input.right ? 'side' : 'jab'
        this.startMove(f, id)
      } else if (this.pressed(f.index, 'special')) {
        this.startMove(f, 'special')
      }
    } else if (f.grounded) {
      f.vx *= def.friction
    }

    if (!f.grounded) {
      const max = f.fastFalling ? def.fastFallMax : def.fallMax
      f.vy = Math.min(f.vy + def.gravity, max)
      if (f.state !== 'attack') f.state = 'air'
    }

    this.integrate(f)
  }

  private tryJump(f: Fighter): void {
    const def = f.def
    if (f.grounded) {
      f.vy = def.jump
      f.grounded = false
      f.jumpsLeft = def.jumps - 1
      f.squash = -1
      f.fastFalling = false
      this.dust(f.x, f.y, 5)
    } else if (f.jumpsLeft > 0) {
      f.vy = def.doubleJump
      f.jumpsLeft--
      f.squash = -1
      f.fastFalling = false
      for (let i = 0; i < 8; i++) {
        this.particles.push({
          x: f.x + rand(-7, 7),
          y: f.y - 2,
          vx: rand(-1.4, 1.4),
          vy: rand(-0.3, 1.3),
          life: 16,
          maxLife: 16,
          size: 1,
          color: def.theme.primary,
          gravity: 0.02,
        })
      }
    }
  }

  private startMove(f: Fighter, id: MoveId): void {
    const mv = f.def.moves[id]
    if (!mv) return
    if (mv.groundOnly && !f.grounded) return
    f.move = mv
    f.moveFrame = 0
    f.state = 'attack'
    f.hitTargets.clear()
    f.fastFalling = false
    if (mv.killsMomentum) {
      f.vx *= 0.25
      if (!f.grounded) f.vy = Math.min(f.vy, 0)
    }
  }

  private tickMove(f: Fighter, input: RawInput): void {
    const mv = f.move!
    const def = f.def
    f.moveFrame++
    const total = mv.startup + mv.active + mv.recovery

    if (f.moveFrame === mv.startup + 1 && mv.selfVel) {
      if (mv.selfVel.x !== undefined) f.vx = mv.selfVel.x * f.facing
      if (mv.selfVel.y !== undefined) {
        f.vy = mv.selfVel.y
        if (mv.selfVel.y < 0) {
          f.grounded = false
          for (let i = 0; i < 10; i++) {
            this.particles.push({
              x: f.x + rand(-6, 6),
              y: f.y - rand(0, 8),
              vx: rand(-1, 1),
              vy: rand(0.5, 2.2),
              life: 18,
              maxLife: 18,
              size: 1,
              color: i % 2 ? def.theme.primary : '#fdf6e6',
              gravity: 0.03,
            })
          }
        }
      }
    }

    // Small amount of drift and friction while committed to a move.
    if (f.grounded) {
      f.vx *= 0.86
    } else {
      const drift = (input.right ? 1 : 0) - (input.left ? 1 : 0)
      f.vx = clamp(f.vx + drift * def.airAccel * 0.35, -def.airMax * 1.4, def.airMax * 1.4)
      f.vy = Math.min(f.vy + def.gravity * 0.94, def.fallMax)
    }

    if (f.moveFrame >= total) {
      f.move = null
      f.moveFrame = 0
      if (mv.helplessAfter && !f.grounded) {
        f.state = 'helpless'
      } else {
        f.state = f.grounded ? 'idle' : 'air'
      }
    }
  }

  private moveIsActive(f: Fighter): boolean {
    if (f.state !== 'attack' || !f.move) return false
    return f.moveFrame > f.move.startup && f.moveFrame <= f.move.startup + f.move.active
  }

  // -------------------------------------------------------------- collision

  private integrate(f: Fighter): void {
    f.px = f.x
    f.py = f.y
    f.x += f.vx
    f.y += f.vy

    const wasGrounded = f.grounded
    f.grounded = false
    const hw = f.def.hurt.w / 2

    // One-way landings: pick the highest surface crossed this frame.
    if (f.vy >= 0) {
      let best: Platform | null = null
      for (const p of this.stage.platforms) {
        if (!p.solid && f.dropTimer > 0) continue
        if (f.x + hw < p.x1 || f.x - hw > p.x2) continue
        if (f.py <= p.top + 0.5 && f.y >= p.top) {
          if (!best || p.top < best.top) best = p
        }
      }
      if (best) {
        f.y = best.top
        f.vy = 0
        f.grounded = true
        f.jumpsLeft = f.def.jumps
        f.fastFalling = false
        f.dropTimer = 0
        if (!wasGrounded) {
          f.squash = 1
          this.dust(f.x, f.y, 4)
          if (f.state === 'air') f.state = 'idle'
        }
      }
    }

    // Solid stage bodies also push you out from the sides.
    if (!f.grounded) {
      for (const p of this.stage.platforms) {
        if (!p.solid) continue
        const top = f.y - f.def.hurt.h
        if (f.y <= p.top || top >= p.top + p.depth) continue
        if (f.x + hw <= p.x1 || f.x - hw >= p.x2) continue
        const fromLeft = Math.abs(f.x - p.x1)
        const fromRight = Math.abs(p.x2 - f.x)
        if (fromLeft < fromRight) {
          f.x = p.x1 - hw
        } else {
          f.x = p.x2 + hw
        }
        if (Math.abs(f.vx) > 0.2) f.vx *= -0.15
      }
    }
  }

  private onSoftPlatform(f: Fighter): boolean {
    const hw = f.def.hurt.w / 2
    return this.stage.platforms.some(
      (p) => !p.solid && Math.abs(f.y - p.top) < 1.5 && f.x + hw > p.x1 && f.x - hw < p.x2,
    )
  }

  // ------------------------------------------------------------------ combat

  private resolveHits(attacker: Fighter, victim: Fighter): void {
    if (!this.moveIsActive(attacker)) return
    if (victim.state === 'dead' || victim.invuln > 0) return
    if (attacker.hitTargets.has(victim.index)) return
    const mv = attacker.move!

    const dir = mv.symmetric ? 1 : attacker.facing
    const hx = attacker.x + mv.hit.x * dir
    const hy = attacker.y - mv.hit.y
    const hl = hx - mv.hit.w / 2
    const hr = hx + mv.hit.w / 2
    const ht = hy - mv.hit.h / 2
    const hb = hy + mv.hit.h / 2

    const vw = victim.def.hurt.w / 2
    const vl = victim.x - vw
    const vr = victim.x + vw
    const vt = victim.y - victim.def.hurt.h
    const vb = victim.y

    if (hr < vl || hl > vr || hb < vt || ht > vb) return

    attacker.hitTargets.add(victim.index)
    this.applyHit(attacker, victim, mv, (hl + hr) / 2, (ht + hb) / 2)
  }

  private applyHit(attacker: Fighter, victim: Fighter, mv: MoveDef, cx: number, cy: number): void {
    victim.percent = Math.min(999, victim.percent + mv.damage)

    const launchDir: number = mv.symmetric ? (victim.x >= attacker.x ? 1 : -1) : attacker.facing
    const kb = ((mv.baseKb + victim.percent * mv.kbScale) * 0.165) / victim.def.weight
    const rad = (mv.angle * Math.PI) / 180
    victim.vx = Math.cos(rad) * kb * launchDir
    victim.vy = -Math.sin(rad) * kb
    victim.hitstun = clamp(Math.round(kb * 5.2), 9, 62)
    victim.state = 'hitstun'
    victim.move = null
    victim.grounded = false
    victim.fastFalling = false
    victim.squash = 1
    victim.spin = 0

    const lag = Math.round(4 + mv.damage * 0.55)
    victim.hitlag = lag
    attacker.hitlag = lag

    if (this.frame - victim.lastHitFrame < 48) victim.comboCount++
    else victim.comboCount = 1
    victim.lastHitFrame = this.frame

    this.shake = Math.max(this.shake, mv.shake ?? 2)
    this.flash = Math.max(this.flash, Math.min(6, 2 + mv.damage * 0.2))

    this.hitBurst(cx, cy, mv.damage, attacker.def.theme, victim.vx, victim.vy)

    this.texts.push({
      x: cx,
      y: cy - 10,
      vy: -0.55,
      life: 44,
      text: `${mv.damage}`,
      color: SmashEngine.playerColor(attacker.index),
      scale: 1,
    })
    if (victim.comboCount >= 3) {
      this.texts.push({
        x: cx,
        y: cy - 22,
        vy: -0.4,
        life: 40,
        text: `${victim.comboCount} HIT`,
        color: '#ffe066',
        scale: 1,
      })
    }
    this.version++
  }

  private checkBlastZones(f: Fighter): void {
    if (f.state === 'dead') return
    const b = this.stage.blast
    if (f.x > b.left && f.x < b.right && f.y > b.top && f.y < b.bottom) return
    this.ko(f)
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
    f.comboCount = 0
    this.shake = 14
    this.flash = 10

    this.koBurst(f.x, f.y, f.def.theme.primary)

    this.phase = 'ko'
    this.phaseTimer = KO_FREEZE
    this.setBanner(f.stocks <= 0 ? 'GAME!' : 'K.O.!', KO_FREEZE)

    if (f.stocks <= 0) {
      this.winner = f.index === 0 ? 1 : 0
    }
    this.version++
  }

  private respawn(f: Fighter): void {
    f.x = this.stage.respawn.x + (f.index === 0 ? -22 : 22)
    f.y = this.stage.respawn.y
    f.px = f.x
    f.py = f.y
    f.vx = 0
    f.vy = 0
    f.percent = 0
    f.state = 'air'
    f.grounded = false
    f.jumpsLeft = f.def.jumps
    f.invuln = RESPAWN_INVULN
    f.facing = f.index === 0 ? 1 : -1
    f.spin = 0
    this.version++
  }

  // ----------------------------------------------------------------- effects

  private updateEffects(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx
      p.y += p.vy
      p.vy += p.gravity
      p.vx *= 0.98
      p.life--
      if (p.life <= 0) this.particles.splice(i, 1)
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]
      t.y += t.vy
      t.vy *= 0.94
      t.life--
      if (t.life <= 0) this.texts.splice(i, 1)
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 0.7)
    if (this.flash > 0) this.flash = Math.max(0, this.flash - 1)
    if (this.bannerTimer > 0) this.bannerTimer--
  }

  private setBanner(text: string, frames: number): void {
    this.banner = text
    this.bannerTimer = frames
  }

  private spark(x: number, y: number, n: number, color: string, speed = 1): void {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x,
        y,
        vx: rand(-1, 1) * speed,
        vy: rand(-1, 1) * speed,
        life: 12,
        maxLife: 12,
        size: 1,
        color,
        gravity: 0.02,
      })
    }
  }

  private dust(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + rand(-6, 6),
        y: y - 1,
        vx: rand(-1.2, 1.2),
        vy: rand(-0.9, -0.1),
        life: 14,
        maxLife: 14,
        size: 1,
        color: '#e8dcc4',
        gravity: 0.03,
      })
    }
  }

  // ---------------------------------------------------------- shared visuals

  /** Sparks, damage number and shake for one connected hit. */
  private hitBurst(
    cx: number,
    cy: number,
    damage: number,
    theme: { primary: string; dark: string },
    vx = 0,
    vy = 0,
  ): void {
    for (let i = 0; i < 8 + damage; i++) {
      this.particles.push({
        x: cx + rand(-4, 4),
        y: cy + rand(-4, 4),
        vx: rand(-2.6, 2.6) + vx * 0.22,
        vy: rand(-2.6, 2.6) + vy * 0.22,
        life: 14 + Math.random() * 12,
        maxLife: 26,
        size: Math.random() < 0.3 ? 2 : 1,
        color: i % 3 === 0 ? '#fdf6e6' : i % 3 === 1 ? theme.primary : theme.dark,
        gravity: 0.05,
      })
    }
  }

  private koBurst(x: number, y: number, color: string): void {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2
      this.particles.push({
        x: clamp(x, 8, 472),
        y: clamp(y - 10, 8, 262),
        vx: Math.cos(a) * rand(1, 4.5),
        vy: Math.sin(a) * rand(1, 4.5),
        life: 26 + Math.random() * 16,
        maxLife: 42,
        size: Math.random() < 0.4 ? 2 : 1,
        color: i % 4 === 0 ? '#fdf6e6' : color,
        gravity: 0.02,
      })
    }
  }

  // ------------------------------------------------------------- networking

  /** Everything a guest needs to draw this frame. */
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
          f.facing,
          STATES.indexOf(f.state),
          f.move ? MOVES.indexOf(f.move.id) : -1,
          f.moveFrame,
          f.percent,
          f.stocks,
          f.hitstun,
          f.hitlag,
          f.invuln,
          f.grounded ? 1 : 0,
          round2(f.spin),
          round2(f.squash),
          f.animTimer,
        ],
      ),
    }
  }

  /**
   * Guest side: adopt the host's state, then rebuild the local juice
   * (sparks, dust, screen shake) by diffing against the previous frame, so
   * both players see the same hit without sending particles over the wire.
   */
  applySnapshot(s: Snapshot): void {
    const [frame, phaseIdx, phaseTimer, bannerTimer, winner] = s.m
    this.frame = frame
    this.phase = PHASES[phaseIdx] ?? 'fight'
    this.phaseTimer = phaseTimer
    this.banner = s.banner
    this.bannerTimer = bannerTimer
    this.winner = winner < 0 ? null : winner

    for (let i = 0; i < this.fighters.length; i++) {
      const f = this.fighters[i]
      const d = s.a[i]
      if (!d) continue
      const wasPercent = f.percent
      const wasStocks = f.stocks
      const wasGrounded = f.grounded

      f.x = d[0]
      f.y = d[1]
      f.vx = d[2]
      f.vy = d[3]
      f.facing = d[4] >= 0 ? 1 : -1
      f.state = STATES[d[5]] ?? 'idle'
      f.move = d[6] >= 0 ? f.def.moves[MOVES[d[6]]] : null
      f.moveFrame = d[7]
      f.percent = d[8]
      f.stocks = d[9]
      f.hitstun = d[10]
      f.hitlag = d[11]
      f.invuln = d[12]
      f.grounded = d[13] === 1
      f.spin = d[14]
      f.squash = d[15]
      f.animTimer = d[16]

      if (f.percent > wasPercent) {
        const dmg = f.percent - wasPercent
        const other = this.fighters[i === 0 ? 1 : 0]
        this.hitBurst(f.x, f.y - f.def.hurt.h * 0.6, dmg, other.def.theme, f.vx, f.vy)
        this.texts.push({
          x: f.x,
          y: f.y - f.def.hurt.h * 0.6 - 10,
          vy: -0.55,
          life: 44,
          text: `${dmg}`,
          color: SmashEngine.playerColor(other.index),
          scale: 1,
        })
        this.shake = Math.max(this.shake, Math.min(6, 2 + dmg * 0.25))
        this.flash = Math.max(this.flash, Math.min(6, 2 + dmg * 0.2))
      }
      if (f.stocks < wasStocks) {
        this.koBurst(f.x, f.y, f.def.theme.primary)
        this.shake = 14
        this.flash = 10
      }
      if (!wasGrounded && f.grounded) this.dust(f.x, f.y, 4)
    }

    this.updateEffects()
    this.version++
  }

  // --------------------------------------------------------------------- CPU

  private cpuThink(): RawInput {
    const out = emptyInput()
    const me = this.fighters[1]
    const foe = this.fighters[0]
    if (this.phase !== 'fight' || me.state === 'dead' || me.state === 'hitstun') return out

    const level = this.config.cpuLevel
    const reach = me.def.moves.jab.hit.x + me.def.moves.jab.hit.w / 2 + 4
    const centre = (MAIN_PLATFORM.x1 + MAIN_PLATFORM.x2) / 2
    const offStage = me.x < MAIN_PLATFORM.x1 - 4 || me.x > MAIN_PLATFORM.x2 + 4
    const below = me.y > MAIN_PLATFORM.top + 12

    if (this.cpu.cooldown > 0) this.cpu.cooldown--

    // Getting home always wins over offence.
    if (offStage || below) {
      if (me.x < centre) out.right = true
      else out.left = true
      if (me.state !== 'helpless') {
        if (me.jumpsLeft > 0 && me.vy > 0.4) out.up = this.frame % 10 < 3
        else if (me.vy > 0.8 || below) out.special = this.frame % 14 < 3
      }
      return out
    }

    if (me.state === 'helpless' || me.state === 'attack') {
      if (me.x < centre) out.right = true
      else out.left = true
      return out
    }

    const dx = foe.x - me.x
    const dy = foe.y - me.y
    const adx = Math.abs(dx)

    // Re-roll a bit of jitter so it does not look like a tracking laser.
    if (this.frame % 24 === 0) this.cpu.decision = Math.random()

    const spacing = level === 1 ? reach + 14 : reach - 2
    if (adx > spacing) {
      if (dx > 0) out.right = true
      else out.left = true
      if (level === 1 && this.cpu.decision < 0.25) {
        out.right = false
        out.left = false
      }
    } else if (adx < reach * 0.45) {
      // Too close: back off slightly so it can swing.
      if (dx > 0) out.left = true
      else out.right = true
    }

    // Chase vertically.
    if (dy < -26 && me.grounded && this.cpu.decision < 0.5 + level * 0.15) {
      out.up = this.frame % 18 < 3
    }
    if (foe.y > me.y + 30 && !me.grounded && this.cpu.decision > 0.7) {
      out.down = true
    }

    const canSwing = this.cpu.cooldown <= 0 && adx < reach + (level >= 3 ? 10 : 4) && Math.abs(dy) < 30
    if (canSwing) {
      this.cpu.cooldown = level === 1 ? 42 : level === 2 ? 26 : 14
      const r = Math.random()
      if (dy < -16) {
        out.up = true
        out.attack = true
      } else if (dy > 16 && !me.grounded) {
        out.down = true
        out.attack = true
      } else if (r < 0.34 || level === 1) {
        out.attack = true
      } else if (r < 0.8) {
        out.attack = true
        if (dx > 0) out.right = true
        else out.left = true
      } else {
        out.attack = true
        out.up = true
      }
    }

    // Punish a far-away opponent at high percent by closing in harder.
    if (foe.percent > 90 && adx > 60 && level >= 2) {
      if (dx > 0) out.right = true
      else out.left = true
    }

    return out
  }
}
