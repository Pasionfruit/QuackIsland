/**
 * Party Parade's match state: whose turn it is, the die, and the walk.
 *
 * The board itself is turn-based, so nothing here simulates physics - but a
 * die that tumbles and a pawn that walks its spaces both take time, so the
 * host does run `step()` once a frame to drive those. Everything a player can
 * do goes through a method that checks it is actually their turn first, the
 * same shape Case Closed uses, so a stale or malicious message from a guest is
 * a no-op rather than a move.
 *
 * Tile effects and the minigames between rounds are still to come; `phase`
 * already carries the values they will switch on.
 */
import type { AvatarDef } from '../../../art/avatar'
import {
  CHEETAH,
  CONTRLZEE,
  DIVA,
  HONEYBEE,
  MRPASIONFRUIT,
  NIGHTSHIFT,
  NINJAPENGUIN,
  TENINCHTOENAIL,
  TUXEDOCAT,
} from '../../../art/cast'
import { BOARD_TILES, START_INDEX } from './board'

export { TILE_COUNT, VIEW_H, VIEW_W, WORLD_H, WORLD_W } from './board'

/** The parade's line-up: the shared Polyland cast, in roster order. */
export interface ParadeChar {
  id: string
  name: string
  blurb: string
  def: AvatarDef
}

export const PARADE_CAST: ParadeChar[] = [
  { id: 'contrlzee', name: 'ContrlZee', blurb: 'Raccoon, programmer', def: CONTRLZEE },
  { id: 'ninjapenguin', name: 'NinjaPenguin', blurb: 'Penguin, ninja', def: NINJAPENGUIN },
  { id: 'teninchtoenail', name: 'teninchtoenail', blurb: 'Lion, salesman', def: TENINCHTOENAIL },
  { id: 'diva', name: 'diva', blurb: 'Frog, fashionista', def: DIVA },
  { id: 'mrpasionfruit', name: 'MrPasionfruit', blurb: 'Black cat, athlete', def: MRPASIONFRUIT },
  { id: 'nightshift', name: 'NightShift', blurb: 'Leopard, night watch', def: NIGHTSHIFT },
  { id: 'honeybee', name: 'Wandering Honeybee', blurb: 'Explorer, hums', def: HONEYBEE },
  { id: 'cheetah', name: 'Frolicking Cheetah', blurb: 'Never walks anywhere', def: CHEETAH },
  { id: 'tuxedocat', name: 'Tuxedo Cat', blurb: 'A romantic soul', def: TUXEDOCAT },
]

/** Per-slot accent, for name tags, the turn banner and lobby dots. */
export const PLAYER_COLORS = [
  '#e0794f',
  '#5f92b8',
  '#8fae6a',
  '#e8c05f',
  '#c85f96',
  '#7a4f8c',
  '#4fb0a5',
  '#c0653f',
]

export const DIE_FACES = 6

/** How long the die tumbles, how long each space takes to walk, and the beat after landing. */
export const ROLL_FRAMES = 46
export const STEP_FRAMES = 11
export const LAND_FRAMES = 42

export type Phase = 'board' | 'minigame' | 'over'

/** Where the current turn is up to. */
export type TurnPhase = 'idle' | 'rolling' | 'moving' | 'landed'

export interface PPPlayer {
  slot: number
  name: string
  /** Index into PARADE_CAST - which animal this pawn is. */
  castIndex: number
  color: string
  /** Index into BOARD_TILES. */
  tileIndex: number
  /**
   * Spaces walked since the start, never wrapped. The renderer animates
   * against this rather than tileIndex so a pawn crossing the start line
   * walks forward over it instead of scrubbing backwards round the loop.
   */
  totalSteps: number
  laps: number
}

export interface MoveState {
  slot: number
  from: number
  to: number
  frames: number
  elapsed: number
}

export class PartyParadeEngine {
  players: PPPlayer[] = []
  phase: Phase = 'board'
  turnIndex = 0
  turnPhase: TurnPhase = 'idle'
  phaseTimer = 0
  round = 1
  /** The roll being resolved, kept on screen through the walk and the beat after it. */
  lastRoll: number | null = null
  /** The face showing while the die is still tumbling. */
  rollFace = 1
  move: MoveState | null = null
  version = 0

  get current(): PPPlayer | undefined {
    return this.players[this.turnIndex]
  }

  addPlayer(slot: number, name: string, castIndex?: number): void {
    if (this.players.some((p) => p.slot === slot)) return
    const taken = new Set(this.players.map((p) => p.castIndex))
    let pick = castIndex ?? slot % PARADE_CAST.length
    // Two players never share an animal - if the asked-for one is gone, take
    // the next free one rather than quietly doubling up.
    for (let i = 0; i < PARADE_CAST.length && taken.has(pick); i++) {
      pick = (pick + 1) % PARADE_CAST.length
    }
    this.players.push({
      slot,
      name: name || `Player ${slot + 1}`,
      castIndex: pick,
      color: PLAYER_COLORS[slot % PLAYER_COLORS.length],
      tileIndex: START_INDEX,
      totalSteps: 0,
      laps: 0,
    })
    this.players.sort((a, b) => a.slot - b.slot)
    this.version++
  }

  removePlayer(slot: number): void {
    this.players = this.players.filter((p) => p.slot !== slot)
    if (this.turnIndex >= this.players.length) this.turnIndex = 0
    this.version++
  }

  playerAt(slot: number): PPPlayer | undefined {
    return this.players.find((p) => p.slot === slot)
  }

  /** Swap which animal you are. Cosmetic, so it is allowed any time - but never onto one somebody else has. */
  setCast(slot: number, castIndex: number): boolean {
    const p = this.playerAt(slot)
    if (!p || castIndex < 0 || castIndex >= PARADE_CAST.length) return false
    if (this.players.some((o) => o.slot !== slot && o.castIndex === castIndex)) return false
    p.castIndex = castIndex
    this.version++
    return true
  }

  // ------------------------------------------------------------------ turns

  /** Rolls for `slot`, if it is their turn and they have not already rolled. */
  roll(slot: number, rand: () => number = Math.random): number | null {
    if (this.phase !== 'board' || this.turnPhase !== 'idle') return null
    if (!this.current || this.current.slot !== slot) return null
    const face = 1 + Math.floor(rand() * DIE_FACES)
    this.lastRoll = face
    this.rollFace = face
    this.turnPhase = 'rolling'
    this.phaseTimer = ROLL_FRAMES
    this.version++
    return face
  }

  /**
   * Drives the die and the walk. Host only - a guest renders whatever
   * snapshot last arrived, the same as every other game here.
   */
  step(): void {
    if (this.phase !== 'board') return
    if (this.turnPhase === 'rolling') {
      this.phaseTimer--
      // Tumble: the face flickers, slowing down, then settles on the real roll.
      if (this.phaseTimer > 8) {
        if (this.phaseTimer % Math.max(2, Math.floor(this.phaseTimer / 6)) === 0) {
          this.rollFace = 1 + Math.floor(Math.random() * DIE_FACES)
        }
      } else {
        this.rollFace = this.lastRoll ?? 1
      }
      if (this.phaseTimer <= 0) this.beginWalk()
      this.version++
      return
    }
    if (this.turnPhase === 'moving' && this.move) {
      this.move.elapsed++
      if (this.move.elapsed >= this.move.frames) this.finishWalk()
      this.version++
      return
    }
    if (this.turnPhase === 'landed') {
      this.phaseTimer--
      if (this.phaseTimer <= 0) this.endTurn()
      this.version++
    }
  }

  /**
   * A guest's frame. Snapshots only arrive every few frames, so the walk is
   * carried forward locally between them - but only the animation, never the
   * turn or the roster, so nothing here can disagree with the host about
   * anything that matters. The next snapshot overwrites it either way.
   */
  stepVisual(): void {
    const mv = this.move
    if (this.turnPhase === 'moving' && mv && mv.elapsed < mv.frames) mv.elapsed++
  }

  private beginWalk(): void {
    const p = this.current
    const roll = this.lastRoll ?? 0
    if (!p || roll <= 0) {
      this.endTurn()
      return
    }
    this.move = {
      slot: p.slot,
      from: p.totalSteps,
      to: p.totalSteps + roll,
      frames: Math.max(1, roll * STEP_FRAMES),
      elapsed: 0,
    }
    this.turnPhase = 'moving'
  }

  private finishWalk(): void {
    const mv = this.move
    this.move = null
    this.turnPhase = 'landed'
    this.phaseTimer = LAND_FRAMES
    if (!mv) return
    const p = this.playerAt(mv.slot)
    if (!p) return
    p.totalSteps = mv.to
    p.tileIndex = ((mv.to % BOARD_TILES.length) + BOARD_TILES.length) % BOARD_TILES.length
    p.laps = Math.floor(mv.to / BOARD_TILES.length)
  }

  endTurn(): void {
    this.move = null
    this.lastRoll = null
    this.turnPhase = 'idle'
    this.phaseTimer = 0
    if (this.players.length === 0) return
    this.turnIndex = (this.turnIndex + 1) % this.players.length
    if (this.turnIndex === 0) this.round++
    this.version++
  }

  /**
   * Where a pawn is right now, in un-wrapped spaces - a whole number when
   * standing still, a fraction of the way between two spaces mid-walk.
   */
  displaySteps(p: PPPlayer): number {
    const mv = this.move
    if (mv && mv.slot === p.slot) {
      const t = Math.min(1, mv.elapsed / Math.max(1, mv.frames))
      return mv.from + (mv.to - mv.from) * t
    }
    return p.totalSteps
  }

  /** The space a pawn is walking onto, for the renderer's hop arc. */
  isWalking(slot: number): boolean {
    return this.turnPhase === 'moving' && this.move?.slot === slot
  }

  snapshot() {
    return {
      phase: this.phase,
      turnIndex: this.turnIndex,
      turnPhase: this.turnPhase,
      phaseTimer: this.phaseTimer,
      round: this.round,
      lastRoll: this.lastRoll,
      rollFace: this.rollFace,
      move: this.move ? { ...this.move } : null,
      players: this.players.map((p) => ({ ...p })),
    }
  }

  applySnapshot(s: ReturnType<PartyParadeEngine['snapshot']>): void {
    if (!s) return
    this.phase = s.phase ?? this.phase
    this.turnIndex = s.turnIndex ?? this.turnIndex
    this.turnPhase = s.turnPhase ?? this.turnPhase
    this.phaseTimer = s.phaseTimer ?? this.phaseTimer
    this.round = s.round ?? this.round
    this.lastRoll = s.lastRoll ?? null
    this.rollFace = s.rollFace ?? this.rollFace
    this.move = s.move ?? null
    this.players = s.players ?? this.players
    this.version++
  }
}
