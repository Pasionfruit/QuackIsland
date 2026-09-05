/**
 * Scribble: a rotating drawer, a shared canvas, and hangman doing half the
 * guessing for you. Host runs this and broadcasts it; strokes bypass the host
 * entirely (see draw.ts) since the relay already fans a sender's message out
 * to everyone else in the room.
 */
import { buildPool, maskWord, normalizeGuess, pickRandom, revealOneMore } from '../words'

export type ScribblePhase = 'lobby' | 'choosing' | 'drawing' | 'roundEnd' | 'over'

const CHOOSE_SECONDS = 12
const REVEAL_EVERY = 6 * 60 // one more letter every six seconds
const ROUND_END_SECONDS = 4
/** Never reveal the last letter for free - a guess still has to happen. */
const MAX_FREE_REVEALS = (len: number) => Math.max(0, len - 1)

export interface ScribblePlayer {
  slot: number
  name: string
  score: number
}

export interface FeedEntry {
  slot: number
  /** Null once correct, so a right answer is never broadcast in the clear. */
  text: string | null
  correct: boolean
}

export interface ScribbleConfig {
  players: number
  packetIds: string[]
  roundSeconds: number
  totalRounds: number
}

export const DEFAULT_SCRIBBLE_CONFIG: ScribbleConfig = {
  players: 0,
  packetIds: ['camp', 'animals'],
  roundSeconds: 80,
  totalRounds: 6,
}

export class ScribbleEngine {
  config: ScribbleConfig
  players: ScribblePlayer[] = []
  phase: ScribblePhase = 'lobby'
  round = 0
  drawerIndex = 0
  choices: string[] = []
  word = ''
  revealed = new Set<number>()
  timer = 0
  feed: FeedEntry[] = []
  version = 0

  private pool: string[]
  private custom: string[] = []
  private used = new Set<string>()
  private guessedThisRound = new Set<number>()
  private revealClock = 0

  constructor(config: Partial<ScribbleConfig> = {}) {
    this.config = { ...DEFAULT_SCRIBBLE_CONFIG, ...config }
    this.pool = buildPool(this.config.packetIds, [])
  }

  addPlayer(slot: number, name: string): ScribblePlayer {
    const found = this.players.find((p) => p.slot === slot)
    if (found) return found
    const p = { slot, name, score: 0 }
    this.players.push(p)
    this.players.sort((a, b) => a.slot - b.slot)
    this.version++
    return p
  }

  removePlayer(slot: number): void {
    this.players = this.players.filter((p) => p.slot !== slot)
    this.version++
  }

  addCustomWord(word: string): void {
    const w = word.trim().toLowerCase()
    if (w && w.length <= 24 && !this.custom.includes(w)) {
      this.custom.push(w)
      this.pool.push(w)
      this.version++
    }
  }

  get drawer(): ScribblePlayer | undefined {
    return this.players[this.drawerIndex % this.players.length]
  }

  start(): void {
    if (this.phase !== 'lobby' || this.players.length === 0) return
    this.round = 0
    this.drawerIndex = 0
    for (const p of this.players) p.score = 0
    this.feed = []
    this.beginChoosing()
  }

  private beginChoosing(): void {
    this.choices = pickRandom(this.pool, 3, [...this.used])
    while (this.choices.length < 3 && this.used.size > 0) {
      // Ran low on fresh words: let the pool repeat rather than stalling out.
      this.used.clear()
      this.choices = pickRandom(this.pool, 3)
    }
    this.word = ''
    this.phase = 'choosing'
    this.timer = CHOOSE_SECONDS * 60
    this.version++
  }

  pickWord(slot: number, word: string): void {
    if (this.phase !== 'choosing' || slot !== this.drawer?.slot) return
    if (!this.choices.includes(word)) return
    this.commitWord(word)
  }

  private commitWord(word: string): void {
    this.word = word
    this.used.add(word)
    // The offered choices named the word that got picked; keeping them around
    // after commit would leak it straight back out through the snapshot.
    this.choices = []
    this.revealed = new Set()
    this.revealClock = 0
    this.guessedThisRound = new Set()
    this.feed = []
    this.phase = 'drawing'
    this.timer = this.config.roundSeconds * 60
    this.version++
  }

  submitGuess(slot: number, text: string): void {
    if (this.phase !== 'drawing') return
    if (slot === this.drawer?.slot) return
    if (this.guessedThisRound.has(slot)) return
    const guesser = this.players.find((p) => p.slot === slot)
    if (!guesser) return

    const correct = normalizeGuess(text) === normalizeGuess(this.word)
    if (correct) {
      this.guessedThisRound.add(slot)
      const timeFrac = this.timer / (this.config.roundSeconds * 60)
      const points = Math.max(10, Math.round(100 * timeFrac))
      guesser.score += points
      if (this.drawer) this.drawer.score += 10
      this.pushFeed({ slot, text: null, correct: true })
      // Everyone but the drawer has it: no reason to keep drawing.
      if (this.guessedThisRound.size >= this.players.length - 1) {
        this.endRound()
      }
    } else {
      this.pushFeed({ slot, text, correct: false })
    }
    this.version++
  }

  private pushFeed(entry: FeedEntry): void {
    this.feed.push(entry)
    if (this.feed.length > 20) this.feed.shift()
  }

  private endRound(): void {
    this.phase = 'roundEnd'
    this.timer = ROUND_END_SECONDS * 60
    this.version++
  }

  step(): void {
    if (this.phase === 'choosing') {
      if (--this.timer <= 0) this.commitWord(this.choices[0])
      return
    }
    if (this.phase === 'drawing') {
      if (--this.timer <= 0) {
        this.endRound()
        return
      }
      if (++this.revealClock >= REVEAL_EVERY) {
        this.revealClock = 0
        if (this.revealed.size < MAX_FREE_REVEALS(this.word.length)) {
          this.revealed = revealOneMore(this.word, this.revealed)
          this.version++
        }
      }
      return
    }
    if (this.phase === 'roundEnd') {
      if (--this.timer > 0) return
      this.round++
      if (this.round >= this.config.totalRounds) {
        this.phase = 'over'
        this.version++
        return
      }
      this.drawerIndex = (this.drawerIndex + 1) % this.players.length
      this.beginChoosing()
    }
  }

  /** The guessable display string. The one thing every viewer is sent. */
  maskedWord(): string {
    if (!this.word) return ''
    return maskWord(this.word, this.revealed)
  }

  // ---------------------------------------------------------------- netcode

  /**
   * The true word never rides the snapshot while it is still guessable - only
   * `mask` does, which is all a guesser is meant to see. Once the round is
   * over (everyone got it, or time ran out) there is nothing left to protect,
   * so the real word goes out too - that is the only way a guest ever learns
   * what the answer was.
   */
  snapshot(): ScribbleSnapshot {
    const revealed = this.phase === 'roundEnd' || this.phase === 'over'
    return {
      m: [PHASE_LIST.indexOf(this.phase), this.round, this.drawerIndex, this.timer],
      mask: this.maskedWord(),
      word: revealed ? this.word : '',
      choices: this.choices,
      players: this.players.map((p) => [p.slot, p.score]),
      feed: this.feed,
    }
  }

  applySnapshot(snap: ScribbleSnapshot): void {
    if (!snap?.m) return
    this.phase = PHASE_LIST[snap.m[0]] ?? this.phase
    this.round = snap.m[1]
    this.drawerIndex = snap.m[2]
    this.timer = snap.m[3]
    this.choices = snap.choices
    this.feed = snap.feed
    this.guestMask = snap.mask
    this.word = snap.word
    for (const [slot, score] of snap.players) {
      const p = this.addPlayer(slot, `Player ${slot + 1}`)
      p.score = score
    }
    this.version++
  }

  /** Set by applySnapshot; a guest has no `word` to compute this from itself. */
  guestMask = ''
}

export interface ScribbleSnapshot {
  /** phase index, round, drawer index, timer */
  m: [number, number, number, number]
  mask: string
  /** Empty until the round is over - see snapshot(). */
  word: string
  choices: string[]
  players: [number, number][]
  feed: FeedEntry[]
}

const PHASE_LIST: ScribblePhase[] = ['lobby', 'choosing', 'drawing', 'roundEnd', 'over']
