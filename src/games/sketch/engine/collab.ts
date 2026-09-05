/**
 * Collaborative Art: one shared canvas, no scoring, no losing. Casual mode
 * has no rules at all - everyone draws whenever they like. The optional
 * challenges add just enough structure to make it a game again: a turn timer
 * that limits who may draw, and a "chaos" effect that messes with colour on
 * a schedule everyone sees at the same time.
 */
export type ChaosKind = 'off' | 'random' | 'invert'

export interface CollabConfig {
  players: number
  /** Casual (false) lets everyone draw at once; on, only the current turn may. */
  timedTurns: boolean
  turnSeconds: number
  chaos: ChaosKind
  chaosSeconds: number
}

export const DEFAULT_COLLAB_CONFIG: CollabConfig = {
  players: 0,
  timedTurns: false,
  turnSeconds: 30,
  chaos: 'off',
  chaosSeconds: 20,
}

export interface CollabPlayer {
  slot: number
  name: string
}

const CHAOS_COLORS = ['#d9534f', '#e8a33c', '#e8c05f', '#7fb069', '#4f8fbf', '#7a4f8c', '#c85f96']

export class CollabEngine {
  config: CollabConfig
  players: CollabPlayer[] = []
  phase: 'lobby' | 'playing' = 'lobby'
  turnIndex = 0
  turnTimer = 0
  chaosTimer = 0
  /** Set only when chaos is 'random': everyone's brush is forced to this. */
  forcedColor: string | null = null
  /** Set only when chaos is 'invert': flips on for a stretch, then off. */
  inverted = false
  version = 0

  constructor(config: Partial<CollabConfig> = {}) {
    this.config = { ...DEFAULT_COLLAB_CONFIG, ...config }
  }

  addPlayer(slot: number, name: string): CollabPlayer {
    const found = this.players.find((p) => p.slot === slot)
    if (found) return found
    const p = { slot, name }
    this.players.push(p)
    this.players.sort((a, b) => a.slot - b.slot)
    this.version++
    return p
  }

  removePlayer(slot: number): void {
    this.players = this.players.filter((p) => p.slot !== slot)
    this.version++
  }

  get currentTurn(): CollabPlayer | undefined {
    return this.players[this.turnIndex % Math.max(1, this.players.length)]
  }

  canDraw(slot: number): boolean {
    if (this.phase !== 'playing') return false
    if (!this.config.timedTurns) return true
    return this.currentTurn?.slot === slot
  }

  start(): void {
    if (this.phase !== 'lobby') return
    this.turnIndex = 0
    this.turnTimer = this.config.turnSeconds * 60
    this.chaosTimer = this.config.chaosSeconds * 60
    this.forcedColor = this.config.chaos === 'random' ? CHAOS_COLORS[0] : null
    this.inverted = false
    this.phase = 'playing'
    this.version++
  }

  step(): void {
    if (this.phase !== 'playing') return
    if (this.config.timedTurns && this.players.length > 0) {
      if (--this.turnTimer <= 0) {
        this.turnIndex = (this.turnIndex + 1) % this.players.length
        this.turnTimer = this.config.turnSeconds * 60
        this.version++
      }
    }
    if (this.config.chaos !== 'off') {
      if (--this.chaosTimer <= 0) {
        this.chaosTimer = this.config.chaosSeconds * 60
        if (this.config.chaos === 'random') {
          this.forcedColor = CHAOS_COLORS[Math.floor(Math.random() * CHAOS_COLORS.length)]
        } else {
          this.inverted = !this.inverted
        }
        this.version++
      }
    }
  }

  // ---------------------------------------------------------------- netcode

  snapshot(): CollabSnapshot {
    return {
      m: [this.turnIndex, this.turnTimer, this.chaosTimer, this.inverted ? 1 : 0],
      forcedColor: this.forcedColor,
      players: this.players.map((p) => [p.slot, p.name] as [number, string]),
    }
  }

  applySnapshot(snap: CollabSnapshot): void {
    if (!snap?.m) return
    this.phase = 'playing'
    this.turnIndex = snap.m[0]
    this.turnTimer = snap.m[1]
    this.chaosTimer = snap.m[2]
    this.inverted = snap.m[3] === 1
    this.forcedColor = snap.forcedColor
    for (const [slot, name] of snap.players) this.addPlayer(slot, name)
    this.version++
  }
}

export interface CollabSnapshot {
  /** turn index, turn timer, chaos timer, inverted */
  m: [number, number, number, number]
  forcedColor: string | null
  players: [number, string][]
}
