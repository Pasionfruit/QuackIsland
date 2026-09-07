/**
 * The four minigames.
 *
 * Each is a free-for-all: everyone plays at once, the game counts one number
 * per player, and the placings fall out of that. They are deliberately short
 * and deliberately different from each other - a reaction test, a masher, a
 * dodge and a precision stop - so a run of them does not feel like one game
 * wearing four hats.
 *
 * All of this is host-authoritative like everything else here: the host steps
 * the engine and broadcasts, guests send input and render what arrives.
 */
import {
  BaseMinigame,
  MG_VIEW_H,
  MG_VIEW_W,
  type MgPlayer,
} from './types'

/** A score that means "never managed it", so it always sorts last. */
export const NEVER = 9999

// ------------------------------------------------------------- Flag Drop

const REACTION_MIN_WAIT = 80
const REACTION_MAX_WAIT = 260
/** How long anyone still dithering has before the flag drop is called off. */
const REACTION_PATIENCE = 300

export class ReactionGame extends BaseMinigame {
  readonly id = 'reaction' as const
  /** The flag is down and presses now count. */
  armed = false
  goFrame = 0
  private wait = 0

  protected begin(): void {
    this.wait = Math.floor(REACTION_MIN_WAIT + this.rand() * (REACTION_MAX_WAIT - REACTION_MIN_WAIT))
    this.message = 'Steady...'
  }

  protected play(): void {
    if (!this.armed) {
      this.wait--
      if (this.wait <= 0) {
        this.armed = true
        this.goFrame = this.frame
        this.message = 'GO!'
      }
    }

    for (const p of this.players) {
      if (p.out || p.score > 0) continue
      if (!this.pressed(p.slot)) continue
      if (!this.armed) {
        // Jumping the gun is the whole tension of the game, so it has to cost
        // the round rather than just being ignored.
        p.out = true
        p.score = NEVER
        this.message = `${p.name} went too early`
      } else {
        p.score = this.frame - this.goFrame
      }
    }

    const waiting = this.players.filter((p) => !p.out && p.score === 0)
    if (this.armed && (waiting.length === 0 || this.frame - this.goFrame > REACTION_PATIENCE)) {
      for (const p of waiting) {
        p.score = NEVER
        p.out = true
      }
      this.finish()
    }
    // Everyone false-starting ends it there and then.
    if (this.players.every((p) => p.out)) this.finish('Everybody went too early')
  }

  protected hasScored(p: MgPlayer): boolean {
    return p.out || p.score > 0
  }

  protected extraSnap() {
    return { armed: this.armed, goFrame: this.goFrame }
  }

  protected applyExtra(extra: unknown): void {
    const e = extra as { armed?: boolean; goFrame?: number } | null
    if (!e) return
    this.armed = e.armed ?? this.armed
    this.goFrame = e.goFrame ?? this.goFrame
  }
}

// --------------------------------------------------------- Coconut Shake

const MASHER_FRAMES = 8 * 60

export class MasherGame extends BaseMinigame {
  readonly id = 'masher' as const
  left = MASHER_FRAMES

  protected begin(): void {
    this.left = MASHER_FRAMES
    // No prompt: the title plate already says what to do, and a banner here
    // would sit on top of the scores.
    this.message = ''
  }

  protected play(): void {
    this.left--
    for (const p of this.players) {
      if (this.pressed(p.slot)) p.score++
    }
    if (this.left <= 0) this.finish()
  }

  protected extraSnap() {
    return { left: this.left }
  }

  protected applyExtra(extra: unknown): void {
    const e = extra as { left?: number } | null
    if (e?.left !== undefined) this.left = e.left
  }
}

// ------------------------------------------------------- Falling Coconuts

export interface Coconut {
  id: number
  x: number
  y: number
  vy: number
}

const DODGE_LIMIT = 30 * 60
const DODGE_FLOOR = MG_VIEW_H - 54
const DODGE_SPEED = 1.9
const DODGE_HIT_X = 11
const DODGE_HIT_Y = 13
export const DODGE_JUMP_FRAMES = 22
const DODGE_PUSH_X = 15

export class DodgeGame extends BaseMinigame {
  readonly id = 'dodge' as const
  coconuts: Coconut[] = []
  /** Where each player is standing along the beach. */
  pos = new Map<number, number>()
  /** Frames left in the air, for anyone mid-jump. */
  air = new Map<number, number>()
  /** Frames until they can jump again, so it cannot be held down. */
  landed = new Map<number, number>()
  left = DODGE_LIMIT
  private nextId = 1
  private cool = 0

  protected begin(): void {
    this.left = DODGE_LIMIT
    this.message = ''
    const n = this.players.length
    this.players.forEach((p, i) => {
      // Spread the field along the beach so nobody starts underneath anybody.
      this.pos.set(p.slot, ((i + 1) / (n + 1)) * MG_VIEW_W)
    })
  }

  protected play(): void {
    this.left--

    for (const p of this.players) {
      if (p.out) continue
      const i = this.inputFor(p.slot)
      const x = this.pos.get(p.slot) ?? MG_VIEW_W / 2
      const dx = (i.right ? 1 : 0) - (i.left ? 1 : 0)
      this.pos.set(p.slot, Math.max(14, Math.min(MG_VIEW_W - 14, x + dx * 2.4)))

      // A jump gets you over a coconut, but you cannot steer much while you
      // are in the air - that is the trade for the free dodge.
      const air = this.air.get(p.slot) ?? 0
      if (air > 0) this.air.set(p.slot, air - 1)
      else if (i.press && (this.landed.get(p.slot) ?? 0) <= 0) {
        this.air.set(p.slot, DODGE_JUMP_FRAMES)
        this.landed.set(p.slot, DODGE_JUMP_FRAMES + 12)
      }
      const cool = this.landed.get(p.slot) ?? 0
      if (cool > 0) this.landed.set(p.slot, cool - 1)

      // Surviving longer is the score, so it ticks up every frame you last.
      p.score = this.frame
    }

    // Shoving is its own key, so a jump is never an accidental shove.
    for (const a of this.players) {
      if (a.out || !this.inputFor(a.slot).push) continue
      for (const b of this.players) {
        if (b.out || b.slot === a.slot) continue
        const ax = this.pos.get(a.slot) ?? 0
        const bx = this.pos.get(b.slot) ?? 0
        const gap = bx - ax
        if (Math.abs(gap) >= DODGE_PUSH_X) continue
        const dir = gap === 0 ? (a.slot < b.slot ? 1 : -1) : Math.sign(gap)
        const shove = (DODGE_PUSH_X - Math.abs(gap)) * 0.22
        this.pos.set(b.slot, Math.max(14, Math.min(MG_VIEW_W - 14, bx + dir * shove)))
        this.pos.set(a.slot, Math.max(14, Math.min(MG_VIEW_W - 14, ax - dir * shove * 0.35)))
      }
    }

    // The rain gets heavier the longer it goes on, or a careful player could
    // stand still forever.
    this.cool--
    if (this.cool <= 0) {
      const elapsed = DODGE_LIMIT - this.left
      this.cool = Math.max(7, 26 - Math.floor(elapsed / 90) * 3)
      this.coconuts.push({
        id: this.nextId++,
        x: 16 + this.rand() * (MG_VIEW_W - 32),
        y: -10,
        vy: DODGE_SPEED + this.rand() * 1.1,
      })
    }

    for (const c of this.coconuts) c.y += c.vy
    this.coconuts = this.coconuts.filter((c) => c.y < MG_VIEW_H + 20)

    for (const p of this.players) {
      if (p.out) continue
      // In the air is out of the way.
      if ((this.air.get(p.slot) ?? 0) > 0) continue
      const px = this.pos.get(p.slot) ?? 0
      for (const c of this.coconuts) {
        if (Math.abs(c.x - px) < DODGE_HIT_X && Math.abs(c.y - DODGE_FLOOR) < DODGE_HIT_Y) {
          p.out = true
          p.score = this.frame
          this.message = `${p.name} took one on the head`
          break
        }
      }
    }

    const alive = this.players.filter((p) => !p.out)
    // One player left, or nobody, or the clock runs out.
    if (alive.length <= (this.players.length > 1 ? 1 : 0) || this.left <= 0) {
      for (const p of alive) p.score = this.frame
      this.finish(alive.length === 1 ? `${alive[0].name} is the last one standing` : '')
    }
  }

  protected extraSnap() {
    return {
      left: this.left,
      coconuts: this.coconuts.map((c) => [c.id, Math.round(c.x), Math.round(c.y), c.vy] as const),
      pos: [...this.pos.entries()],
      air: [...this.air.entries()],
    }
  }

  protected applyExtra(extra: unknown): void {
    const e = extra as
      | {
          left?: number
          coconuts?: [number, number, number, number][]
          pos?: [number, number][]
          air?: [number, number][]
        }
      | null
    if (!e) return
    if (e.left !== undefined) this.left = e.left
    if (e.coconuts) this.coconuts = e.coconuts.map(([id, x, y, vy]) => ({ id, x, y, vy }))
    if (e.pos) this.pos = new Map(e.pos)
    if (e.air) this.air = new Map(e.air)
  }
}

// ---------------------------------------------------------- Stop the Tide

const PRECISION_LIMIT = 12 * 60
/** How far the marker swings either side of the target, in score units. */
export const PRECISION_RANGE = 50

export class PrecisionGame extends BaseMinigame {
  readonly id = 'precision' as const
  /** Where the marker is right now, -PRECISION_RANGE..+PRECISION_RANGE. */
  marker = 0
  left = PRECISION_LIMIT
  /** Where each player stopped it, once they have. */
  stops = new Map<number, number>()
  private speed = 1.9

  protected begin(): void {
    this.left = PRECISION_LIMIT
    this.speed = 1.7 + this.rand() * 0.8
    this.message = ''
  }

  protected play(): void {
    this.left--
    // A steady swing rather than a bounce, so the timing is learnable.
    // Swing off elapsed time alone. This used to be `frame - elapsed`, which
    // both climb by one every step - so the angle never changed and the marker
    // sat dead still.
    const elapsed = PRECISION_LIMIT - this.left
    this.marker = Math.sin(elapsed * 0.028 * this.speed) * PRECISION_RANGE

    for (const p of this.players) {
      if (this.stops.has(p.slot)) continue
      if (!this.pressed(p.slot)) continue
      const off = Math.abs(this.marker)
      this.stops.set(p.slot, this.marker)
      p.score = Math.round(off * 10) / 10
    }

    const waiting = this.players.filter((p) => !this.stops.has(p.slot))
    if (waiting.length === 0 || this.left <= 0) {
      for (const p of waiting) {
        p.score = NEVER
        p.out = true
      }
      this.finish()
    }
  }

  protected hasScored(p: MgPlayer): boolean {
    return p.out || this.stops.has(p.slot)
  }

  protected extraSnap() {
    return { left: this.left, marker: this.marker, stops: [...this.stops.entries()] }
  }

  protected applyExtra(extra: unknown): void {
    const e = extra as { left?: number; marker?: number; stops?: [number, number][] } | null
    if (!e) return
    if (e.left !== undefined) this.left = e.left
    if (e.marker !== undefined) this.marker = e.marker
    if (e.stops) this.stops = new Map(e.stops)
  }
}
