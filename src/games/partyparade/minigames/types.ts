/**
 * The shape every Party Parade minigame shares.
 *
 * A minigame is deliberately tiny: a roster, one clock, and a single number
 * per player that decides the placings. That is enough for the whole Wii Party
 * shape - a free-for-all, a short scramble, and a scoreboard - and it means a
 * new one is a step() and a painter rather than a new subsystem.
 *
 * Engines here stay DOM-free like every other engine in this repo, so the
 * smoke test can drive them straight from Node.
 */

export const MG_VIEW_W = 480
export const MG_VIEW_H = 270

/** The countdown before every game, and the pause on the scoreboard after it. */
export const INTRO_FRAMES = 150

export type MinigameId =
  | 'reaction'
  | 'masher'
  | 'dodge'
  | 'precision'
  | 'zombie'
  | 'jumbo'
  | 'saucer'
  | 'chipper'
  | 'maze'

export type MgPhase = 'intro' | 'play' | 'done'

export interface MgInput {
  press: boolean
  left: boolean
  right: boolean
  up: boolean
  down: boolean
}

export const IDLE_INPUT: MgInput = { press: false, left: false, right: false, up: false, down: false }

/** The playing field the roaming games use - clear of the sky and the scoreboard. */
export const FIELD = { x0: 12, y0: 112, x1: MG_VIEW_W - 12, y1: MG_VIEW_H - 10 }

export interface MgPlayer {
  slot: number
  name: string
  color: string
  castIndex: number
  /** Whatever this game counts. Read against the game's `higherWins`. */
  score: number
  /** Knocked out, or disqualified for jumping the gun. */
  out: boolean
  /** 1-based placing, filled in when the game finishes. */
  rank: number
}

export interface MgRosterEntry {
  slot: number
  name: string
  color: string
  castIndex: number
}

export interface MinigameDef {
  id: MinigameId
  name: string
  brief: string
  /** What the player actually does, in one line. */
  how: string
  higherWins: boolean
  /** How the score reads on the scoreboard. */
  unit: (score: number) => string
}

export interface MgSnapshot {
  phase: MgPhase
  frame: number
  timer: number
  message: string
  players: MgPlayer[]
  extra: unknown
}

/**
 * A small seeded generator, so a game that scatters obstacles does it the same
 * way twice when a test asks it to.
 */
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

/**
 * The bones of a minigame: the roster, the clock, edge-detected presses and
 * the placings. Each game fills in `begin`, `play` and its own bit of state.
 */
export abstract class BaseMinigame {
  abstract readonly id: MinigameId
  players: MgPlayer[] = []
  phase: MgPhase = 'intro'
  frame = 0
  timer = INTRO_FRAMES
  message = ''
  version = 0

  protected input = new Map<number, MgInput>()
  protected held = new Map<number, boolean>()
  protected rand: () => number

  constructor(roster: MgRosterEntry[], seed = 1) {
    this.rand = makeRandom(seed)
    for (const r of roster) {
      this.players.push({ ...r, score: 0, out: false, rank: 0 })
    }
    this.players.sort((a, b) => a.slot - b.slot)
  }

  get def(): MinigameDef {
    return MINIGAMES[this.id]
  }

  setInput(slot: number, i: MgInput): void {
    this.input.set(slot, i)
  }

  protected inputFor(slot: number): MgInput {
    return this.input.get(slot) ?? IDLE_INPUT
  }

  /** True on the frame a player's button goes down, not while they lean on it. */
  protected pressed(slot: number): boolean {
    const down = this.inputFor(slot).press
    const was = this.held.get(slot) ?? false
    this.held.set(slot, down)
    return down && !was
  }

  playerAt(slot: number): MgPlayer | undefined {
    return this.players.find((p) => p.slot === slot)
  }

  step(): void {
    this.frame++
    if (this.phase === 'intro') {
      this.timer--
      if (this.timer <= 0) {
        this.phase = 'play'
        this.timer = 0
        this.begin()
      }
      this.version++
      return
    }
    if (this.phase === 'play') {
      this.play()
      this.version++
    }
  }

  /** Called once when the countdown ends. */
  protected abstract begin(): void
  /** Called every frame while the game is running. */
  protected abstract play(): void

  /** Sorts everyone into placings and stops the game. */
  finish(message = ''): void {
    if (this.phase === 'done') return
    const higher = this.def.higherWins
    const order = [...this.players].sort((a, b) => {
      if (a.out !== b.out) return a.out ? 1 : -1
      return higher ? b.score - a.score : a.score - b.score
    })
    order.forEach((p, i) => {
      const prev = order[i - 1]
      // Genuinely equal scores share a placing, rather than being split by
      // whatever order the roster happened to be in.
      p.rank = prev && prev.out === p.out && prev.score === p.score ? prev.rank : i + 1
    })
    this.phase = 'done'
    this.message = message || `${order[0]?.name ?? 'Nobody'} wins it`
    this.version++
  }

  /**
   * Whether this player's score means anything yet. In a game where lower
   * wins, somebody who has not gone yet is sitting on zero - which would put
   * them top of the board looking like a perfect round.
   */
  protected hasScored(_p: MgPlayer): boolean {
    return true
  }

  /** How a score reads on the board, with "not yet" spelled out rather than shown as zero. */
  scoreLabel(p: MgPlayer): string {
    return this.hasScored(p) ? this.def.unit(p.score) : '-'
  }

  standings(): MgPlayer[] {
    const higher = this.def.higherWins
    return [...this.players].sort((a, b) => {
      if (a.out !== b.out) return a.out ? 1 : -1
      if (this.phase === 'done') return a.rank - b.rank
      const as = this.hasScored(a)
      const bs = this.hasScored(b)
      if (as !== bs) return as ? -1 : 1
      return higher ? b.score - a.score : a.score - b.score
    })
  }

  /** Per-game state that has to ride along in a snapshot. */
  protected extraSnap(): unknown {
    return null
  }

  protected applyExtra(_extra: unknown): void {}

  snapshot(): MgSnapshot {
    return {
      phase: this.phase,
      frame: this.frame,
      timer: this.timer,
      message: this.message,
      players: this.players.map((p) => ({ ...p })),
      extra: this.extraSnap(),
    }
  }

  applySnapshot(s: MgSnapshot): void {
    if (!s) return
    this.phase = s.phase ?? this.phase
    this.frame = s.frame ?? this.frame
    this.timer = s.timer ?? this.timer
    this.message = s.message ?? this.message
    this.players = s.players ?? this.players
    this.applyExtra(s.extra)
    this.version++
  }
}

const ms = (frames: number) => `${Math.round((frames / 60) * 1000)}ms`

/** What each game is, in the order they appear in the lobby. */
export const MINIGAMES: Record<MinigameId, MinigameDef> = {
  reaction: {
    id: 'reaction',
    name: 'Flag Drop',
    brief: 'Wait for the flag, then go. Move early and you are out.',
    how: 'Press the action key the instant the flag drops.',
    higherWins: false,
    unit: (s) => (s >= 9000 ? 'jumped the gun' : ms(s)),
  },
  masher: {
    id: 'masher',
    name: 'Coconut Shake',
    brief: 'Eight seconds. Shake the tree as hard as you can.',
    how: 'Hammer the action key.',
    higherWins: true,
    unit: (s) => `${s} shakes`,
  },
  dodge: {
    id: 'dodge',
    name: 'Falling Coconuts',
    brief: 'Stay under nothing. Last one standing takes it.',
    how: 'Left and right to dodge, action to jump. Shove people under one.',
    higherWins: true,
    unit: (s) => `${(s / 60).toFixed(1)}s`,
  },
  precision: {
    id: 'precision',
    name: 'Stop the Tide',
    brief: 'One swinging marker, one narrow gap. Stop it dead centre.',
    how: 'Press the action key to stop the marker.',
    higherWins: false,
    unit: (s) => (s >= 9000 ? 'never stopped' : `${s.toFixed(1)} off`),
  },
  zombie: {
    id: 'zombie',
    name: 'Zombie Tag',
    brief: 'Two of them to start. Everyone they catch joins in.',
    how: 'Run with the arrows or WASD. Survive.',
    higherWins: true,
    unit: (s) => `${(s / 60).toFixed(1)}s`,
  },
  jumbo: {
    id: 'jumbo',
    name: 'Jumbo Jump',
    brief: 'A rope sweeping the beach, faster every pass.',
    how: 'Action to jump it. You cannot hold the jump.',
    higherWins: true,
    unit: (s) => `${(s / 60).toFixed(1)}s`,
  },
  saucer: {
    id: 'saucer',
    name: 'Space Saucer',
    brief: 'Fly the gap. The rocks do not stop coming.',
    how: 'Arrows or WASD to fly in any direction.',
    higherWins: true,
    unit: (s) => `${(s / 60).toFixed(1)}s`,
  },
  chipper: {
    id: 'chipper',
    name: 'Quicker Chipper',
    brief: 'Logs down the chute. Hit the mark, not the air.',
    how: 'Action as the log crosses the line. Swing early and you stall.',
    higherWins: true,
    unit: (s) => `${s} logs`,
  },
  maze: {
    id: 'maze',
    name: 'Maze Daze',
    brief: 'One hedge maze, everybody at once, one way out.',
    how: 'Arrows or WASD. First to the gap takes it.',
    higherWins: false,
    unit: (s) => (s >= 9000 ? 'lost in it' : `${(s / 60).toFixed(1)}s`),
  },
}

export const MINIGAME_ORDER: MinigameId[] = [
  'reaction',
  'masher',
  'dodge',
  'precision',
  'zombie',
  'jumbo',
  'saucer',
  'chipper',
  'maze',
]
