/**
 * Phone: everyone writes a starting prompt, then the chains rotate - draw
 * what you're handed, then someone else guesses what you drew, then someone
 * else draws that guess, and so on until every chain has passed through every
 * player exactly once. The reveal at the end plays each chain back start to
 * finish, which is the entire point of the game.
 *
 * With N players there are N chains and exactly N rounds: round 0 is every
 * chain's prompt, and round r (r >= 1) is a draw step on odd r, a guess step
 * on even r. At round r, player p works on chain `(p - r) mod N` - the chain
 * shifts by one player every round, so nobody ever works on their own chain
 * again until the final reveal.
 */
import type { Stroke } from '../draw'
import { pickRandom, WORD_PACKETS } from '../words'

export type PhonePhase = 'lobby' | 'working' | 'reveal'
export type StepKind = 'prompt' | 'draw' | 'guess'

export interface PhoneEntry {
  kind: StepKind
  author: number
  /** A guess or a prompt's text; empty for a drawing step. */
  text: string
  /**
   * The finished doodle, for a drawing step. Nobody watches a Phone drawing
   * happen live - every player is on a different chain each round - so this
   * is only sent once, complete, when the drawer submits it, rather than
   * streamed point by point the way Scribble's canvas has to be.
   */
  strokes: Stroke[]
}

export interface PhonePlayer {
  slot: number
  name: string
}

export interface PhoneConfig {
  players: number
  /** Seconds given for each round before it auto-advances. */
  roundSeconds: number
}

export const DEFAULT_PHONE_CONFIG: PhoneConfig = { players: 0, roundSeconds: 75 }

export class PhoneEngine {
  config: PhoneConfig
  players: PhonePlayer[] = []
  phase: PhonePhase = 'lobby'
  round = 0
  timer = 0
  /** chains[c] is the ordered history of chain c, one entry per round so far. */
  chains: PhoneEntry[][] = []
  version = 0

  private submitted = new Set<number>()

  constructor(config: Partial<PhoneConfig> = {}) {
    this.config = { ...DEFAULT_PHONE_CONFIG, ...config }
  }

  addPlayer(slot: number, name: string): PhonePlayer {
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

  /** Which chain a player works on this round: shifts by one player per round. */
  chainFor(round: number, slot: number): number {
    const i = this.players.findIndex((p) => p.slot === slot)
    if (i < 0) return -1
    return ((i - round) % this.n + this.n) % this.n
  }

  /** Prompt, draw, or guess - which one every player is doing this round. */
  stepKind(round: number): StepKind {
    if (round === 0) return 'prompt'
    return round % 2 === 1 ? 'draw' : 'guess'
  }

  /** What a player has to work from this round: nothing, or the previous entry. */
  handoff(slot: number): PhoneEntry | null {
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
    this.version++
  }

  /** A player turns in their prompt, finished drawing, or guess. */
  submit(slot: number, text: string, strokes: Stroke[] = []): void {
    if (this.phase !== 'working' || this.submitted.has(slot)) return
    const chain = this.chainFor(this.round, slot)
    if (chain < 0) return
    const kind = this.stepKind(this.round)
    const fallback = kind === 'prompt' ? pickRandom(WORD_PACKETS[0].words, 1)[0] : '(no answer)'
    const hasText = kind !== 'draw'
    this.chains[chain].push({
      kind,
      author: slot,
      text: hasText ? text.trim() || fallback : '',
      strokes: kind === 'draw' ? strokes : [],
    })
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
      // Fill in anyone who ran out of time so the game is never stuck on one
      // slow player, then move on regardless.
      for (const p of this.players) {
        if (!this.submitted.has(p.slot)) this.submit(p.slot, '')
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

  snapshot(): PhoneSnapshot {
    return {
      m: [PHASE_LIST.indexOf(this.phase), this.round, this.timer, this.waitingOn()],
      chains: this.chains,
      submitted: [...this.submitted],
    }
  }

  applySnapshot(snap: PhoneSnapshot): void {
    if (!snap?.m) return
    this.phase = PHASE_LIST[snap.m[0]] ?? this.phase
    this.round = snap.m[1]
    this.timer = snap.m[2]
    this.chains = snap.chains
    this.submitted = new Set(snap.submitted)
    this.version++
  }
}

export interface PhoneSnapshot {
  /** phase index, round, timer, waiting-on count */
  m: [number, number, number, number]
  chains: PhoneEntry[][]
  submitted: number[]
}

const PHASE_LIST: PhonePhase[] = ['lobby', 'working', 'reveal']
