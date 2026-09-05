/**
 * Collaborative Art: everyone privately adds to a picture, then passes it on.
 *
 * The rotation is exactly Phone's - N players, N chains, chain assignment
 * shifts by one player every round - except every round is a draw step and
 * nobody guesses anything. Round 0 starts a picture from a blank canvas;
 * every round after that hands a player someone else's picture to build on
 * top of, privately, until every chain has been touched by everyone. Only
 * then does the album open, playing back each chain's picture stage by stage.
 * No scores, no losing - the reveal is the point.
 */
import type { Stroke } from '../draw'

export type ChaosKind = 'off' | 'random' | 'invert'
export type CollabPhase = 'lobby' | 'working' | 'reveal'

export interface CollabPlayer {
  slot: number
  name: string
}

/** One player's contribution to a chain: the picture as they left it. */
export interface CollabEntry {
  author: number
  strokes: Stroke[]
}

export interface CollabConfig {
  players: number
  /** Seconds given for each round before it auto-advances. */
  roundSeconds: number
  chaos: ChaosKind
  chaosSeconds: number
}

export const DEFAULT_COLLAB_CONFIG: CollabConfig = {
  players: 0,
  roundSeconds: 45,
  chaos: 'off',
  chaosSeconds: 20,
}

const CHAOS_COLORS = ['#d9534f', '#e8a33c', '#e8c05f', '#7fb069', '#4f8fbf', '#7a4f8c', '#c85f96']

export class CollabEngine {
  config: CollabConfig
  players: CollabPlayer[] = []
  phase: CollabPhase = 'lobby'
  round = 0
  timer = 0
  chaosTimer = 0
  /** Set only when chaos is 'random': everyone's brush is forced to this while they draw. */
  forcedColor: string | null = null
  /** Set only when chaos is 'invert': flips on for a stretch, then off. */
  inverted = false
  /**
   * chains[c] is chain c's ordered history, one entry per round so far. This
   * rides the wire in full throughout (see snapshot()) so every peer can
   * compute their own handoff; the UI is what keeps a chain that is not the
   * viewer's own hidden until the reveal.
   */
  chains: CollabEntry[][] = []
  version = 0

  private submitted = new Set<number>()

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

  get n(): number {
    return this.players.length
  }

  /** Which chain a player works on this round: shifts by one player per round, same math as Phone. */
  chainFor(round: number, slot: number): number {
    const i = this.players.findIndex((p) => p.slot === slot)
    if (i < 0) return -1
    return (((i - round) % this.n) + this.n) % this.n
  }

  /** What a player is handed to build on this round: nothing on round 0. */
  handoff(slot: number): CollabEntry | null {
    const chain = this.chainFor(this.round, slot)
    if (chain < 0) return null
    const history = this.chains[chain]
    return history.length ? history[history.length - 1] : null
  }

  start(): void {
    if (this.phase !== 'lobby' || this.n < 2) return
    this.chains = this.players.map(() => [])
    this.round = 0
    this.submitted = new Set()
    this.phase = 'working'
    this.timer = this.config.roundSeconds * 60
    this.chaosTimer = this.config.chaosSeconds * 60
    this.forcedColor = this.config.chaos === 'random' ? CHAOS_COLORS[0] : null
    this.inverted = false
    this.version++
  }

  /** A player turns in the picture as they leave it - handed strokes plus whatever they added. */
  submit(slot: number, strokes: Stroke[]): void {
    if (this.phase !== 'working' || this.submitted.has(slot)) return
    const chain = this.chainFor(this.round, slot)
    if (chain < 0) return
    this.chains[chain].push({ author: slot, strokes })
    this.submitted.add(slot)
    this.version++
    if (this.submitted.size >= this.n) this.advance()
  }

  private advance(): void {
    this.round++
    this.submitted = new Set()
    if (this.round >= this.n) {
      this.phase = 'reveal'
      this.version++
      return
    }
    this.timer = this.config.roundSeconds * 60
    this.version++
  }

  step(): void {
    if (this.phase !== 'working') return
    if (--this.timer <= 0) {
      // Fill in anyone who ran out of time with the picture exactly as it was
      // handed to them, rather than stalling the table on one slow artist.
      for (const p of this.players) {
        if (!this.submitted.has(p.slot)) this.submit(p.slot, this.handoff(p.slot)?.strokes ?? [])
      }
      return
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

  /** How many players are still working on the current round. */
  waitingOn(): number {
    return this.n - this.submitted.size
  }

  hasSubmitted(slot: number): boolean {
    return this.submitted.has(slot)
  }

  // ---------------------------------------------------------------- netcode

  snapshot(): CollabSnapshot {
    return {
      m: [PHASE_LIST.indexOf(this.phase), this.round, this.timer, this.chaosTimer, this.inverted ? 1 : 0],
      forcedColor: this.forcedColor,
      waiting: this.waitingOn(),
      // Every peer needs the full chain history to compute their own current
      // handoff (chainFor is symmetric, but the picture data itself has to
      // come from somewhere) - same host-authoritative broadcast every other
      // Polyland game uses. Privacy here is enforced by the UI, which never
      // renders a chain that is not the viewer's own until the album opens.
      chains: this.chains,
      players: this.players.map((p) => [p.slot, p.name] as [number, string]),
    }
  }

  applySnapshot(snap: CollabSnapshot): void {
    if (!snap?.m) return
    this.phase = PHASE_LIST[snap.m[0]] ?? this.phase
    this.round = snap.m[1]
    this.timer = snap.m[2]
    this.chaosTimer = snap.m[3]
    this.inverted = snap.m[4] === 1
    this.forcedColor = snap.forcedColor
    this.chains = snap.chains
    for (const [slot, name] of snap.players) this.addPlayer(slot, name)
    this.version++
  }
}

const PHASE_LIST: CollabPhase[] = ['lobby', 'working', 'reveal']

export interface CollabSnapshot {
  /** phase index, round, timer, chaos timer, inverted */
  m: [number, number, number, number, number]
  forcedColor: string | null
  waiting: number
  /** Empty until the reveal - see snapshot(). */
  chains: CollabEntry[][]
  players: [number, string][]
}
