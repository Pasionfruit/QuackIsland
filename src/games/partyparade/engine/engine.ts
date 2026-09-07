/**
 * Party Parade's match state: whose turn it is, the die, the walk, and what
 * the space you landed on does about it.
 *
 * The course is turn-based, so nothing here simulates physics - but a die that
 * tumbles and a pawn that walks its spaces both take time, so the host runs
 * `step()` once a frame to drive them. Everything a player can do goes through
 * a method that checks it is actually their turn first, the same shape Case
 * Closed uses, so a stale or malicious message from a guest is a no-op.
 *
 * Two rules exist to keep a runaway leader in reach of the pack: the three
 * checkpoints only obstruct whoever is in front, and the causeway is a genuine
 * gamble rather than a free saving.
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
import {
  BOARD_TILES,
  GATE_TEXT,
  START_INDEX,
  TREASURE_INDEX,
  distanceToGoal,
  gateAllows,
  walkBack,
  walkForward,
  type GateRule,
  type TileEffect,
} from './board'

export {
  BOARD_TILES,
  FORK_INDEX,
  GATE_INDICES,
  MAIN_COUNT,
  SHORT_COUNT,
  TILE_COUNT,
  TREASURE_INDEX,
  VIEW_H,
  VIEW_W,
  WORLD_H,
  WORLD_W,
} from './board'

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

export const ROLL_FRAMES = 46
export const STEP_FRAMES = 11
export const LAND_FRAMES = 42
export const BLOCK_FRAMES = 70
/** If nobody picks a route, the main road is taken for them rather than stalling the game. */
export const FORK_WAIT_FRAMES = 60 * 20

export type Phase = 'board' | 'minigame' | 'over'

export type TurnPhase = 'idle' | 'rolling' | 'moving' | 'fork' | 'landed' | 'blocked'

export interface PPPlayer {
  slot: number
  name: string
  castIndex: number
  color: string
  tileIndex: number
  /** Spaces actually walked, for the scoreboard. Not a position - the routes differ in length. */
  spacesMoved: number
  skipTurns: number
  tookShortcut: boolean
  finished: boolean
  rank: number
}

export interface MoveState {
  slot: number
  /** Every space being stepped through, starting with the one left behind. */
  route: number[]
  elapsed: number
  frames: number
  stopped: 'steps' | 'fork' | 'gate' | 'goal'
  remaining: number
  /** An effect's own shove, which must not trigger another one. */
  isEffect: boolean
}

export class PartyParadeEngine {
  players: PPPlayer[] = []
  phase: Phase = 'board'
  turnIndex = 0
  turnPhase: TurnPhase = 'idle'
  phaseTimer = 0
  round = 1
  lastRoll: number | null = null
  rollFace = 1
  move: MoveState | null = null
  /** A walk waiting on a route choice at the fork. */
  pending: { slot: number; remaining: number } | null = null
  /** Waiting to be applied when the pawn has finished arriving. */
  pendingEffect: TileEffect | null = null
  /** What just happened, for the banner. */
  message: string | null = null
  winner: number | null = null
  finishOrder: number[] = []
  version = 0

  get current(): PPPlayer | undefined {
    return this.players[this.turnIndex]
  }

  addPlayer(slot: number, name: string, castIndex?: number): void {
    if (this.players.some((p) => p.slot === slot)) return
    const taken = new Set(this.players.map((p) => p.castIndex))
    let pick = castIndex ?? slot % PARADE_CAST.length
    for (let i = 0; i < PARADE_CAST.length && taken.has(pick); i++) pick = (pick + 1) % PARADE_CAST.length
    this.players.push({
      slot,
      name: name || `Player ${slot + 1}`,
      castIndex: pick,
      color: PLAYER_COLORS[slot % PLAYER_COLORS.length],
      tileIndex: START_INDEX,
      spacesMoved: 0,
      skipTurns: 0,
      tookShortcut: false,
      finished: false,
      rank: 0,
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

  /** Closest to the treasure. Ties all count as sharing first place. */
  isLeader(slot: number): boolean {
    const live = this.players.filter((p) => !p.finished)
    if (live.length < 2) return false
    const me = this.playerAt(slot)
    if (!me || me.finished) return false
    const best = Math.min(...live.map((p) => distanceToGoal(p.tileIndex)))
    return distanceToGoal(me.tileIndex) === best
  }

  /** The checkpoint holding this player up, if they are stood on one and in front. */
  gateFor(slot: number): { rule: GateRule; text: string } | null {
    const p = this.playerAt(slot)
    if (!p) return null
    const rule = BOARD_TILES[p.tileIndex]?.gate
    if (!rule || !this.isLeader(slot)) return null
    return { rule, text: GATE_TEXT[rule] }
  }

  // ------------------------------------------------------------------ turns

  roll(slot: number, rand: () => number = Math.random): number | null {
    if (this.phase !== 'board' || this.turnPhase !== 'idle') return null
    if (!this.current || this.current.slot !== slot) return null
    const p = this.current
    if (p.finished) return null
    const face = 1 + Math.floor(rand() * DIE_FACES)
    this.lastRoll = face
    this.rollFace = face
    this.turnPhase = 'rolling'
    this.phaseTimer = ROLL_FRAMES
    this.version++
    return face
  }

  /** Picks a route at the fork: the causeway, or carry on round the long way. */
  chooseRoute(slot: number, takeShortcut: boolean): boolean {
    if (this.turnPhase !== 'fork' || !this.pending || this.pending.slot !== slot) return false
    const p = this.playerAt(slot)
    if (!p) return false
    const remaining = this.pending.remaining
    this.pending = null
    if (takeShortcut) {
      p.tookShortcut = true
      this.message = `${p.name} chances the causeway`
    } else {
      this.message = `${p.name} keeps to the road`
    }
    this.startWalk(p, walkForward(p.tileIndex, remaining, takeShortcut), false)
    this.version++
    return true
  }

  step(): void {
    if (this.phase !== 'board') return
    if (this.turnPhase === 'rolling') {
      this.phaseTimer--
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
    if (this.turnPhase === 'fork') {
      this.phaseTimer--
      if (this.phaseTimer <= 0 && this.pending) this.chooseRoute(this.pending.slot, false)
      return
    }
    if (this.turnPhase === 'landed') {
      this.phaseTimer--
      if (this.phaseTimer <= 0) this.resolveLanding()
      this.version++
      return
    }
    if (this.turnPhase === 'blocked') {
      this.phaseTimer--
      if (this.phaseTimer <= 0) this.endTurn()
      this.version++
    }
  }

  /** A guest's frame: carries the walk forward between snapshots, and nothing else. */
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
    // A checkpoint only holds up whoever is in front - that is the whole point
    // of it, and why the pack behind walks straight through.
    const rule = BOARD_TILES[p.tileIndex]?.gate
    if (rule && this.isLeader(p.slot) && !gateAllows(rule, roll)) {
      this.turnPhase = 'blocked'
      this.phaseTimer = BLOCK_FRAMES
      this.message = `${p.name} is held at the checkpoint - needs to ${GATE_TEXT[rule]}`
      return
    }
    this.startWalk(p, walkForward(p.tileIndex, roll), false)
  }

  private startWalk(p: PPPlayer, res: ReturnType<typeof walkForward>, isEffect: boolean): void {
    const hops = res.route.length - 1
    if (hops <= 0) {
      this.turnPhase = 'landed'
      this.phaseTimer = LAND_FRAMES
      this.pendingEffect = null
      return
    }
    this.move = {
      slot: p.slot,
      route: res.route,
      elapsed: 0,
      frames: Math.max(1, hops * STEP_FRAMES),
      stopped: res.stopped,
      remaining: res.remaining,
      isEffect,
    }
    this.turnPhase = 'moving'
  }

  private finishWalk(): void {
    const mv = this.move
    this.move = null
    if (!mv) {
      this.endTurn()
      return
    }
    const p = this.playerAt(mv.slot)
    if (!p) {
      this.endTurn()
      return
    }
    const dest = mv.route[mv.route.length - 1]
    p.tileIndex = dest
    p.spacesMoved += mv.route.length - 1

    if (dest === TREASURE_INDEX) {
      this.finishPlayer(p)
      return
    }

    if (mv.isEffect) {
      // The shove has landed; the turn is over either way.
      this.turnPhase = 'landed'
      this.phaseTimer = Math.floor(LAND_FRAMES / 2)
      this.pendingEffect = null
      return
    }

    if (mv.stopped === 'fork') {
      this.turnPhase = 'fork'
      this.pending = { slot: p.slot, remaining: mv.remaining }
      this.phaseTimer = FORK_WAIT_FRAMES
      this.message = `${p.name} reaches the causeway`
      return
    }

    const tile = BOARD_TILES[dest]
    if (mv.stopped === 'gate' || tile.gate) {
      this.message = `${p.name} stops at the checkpoint`
      this.pendingEffect = null
    } else {
      this.pendingEffect = tile.effect
      if (tile.effect) this.message = `${p.name}: ${tile.effect.text}`
    }
    this.turnPhase = 'landed'
    this.phaseTimer = LAND_FRAMES
  }

  /** Applies whatever the space does, once the pawn has actually arrived on it. */
  private resolveLanding(): void {
    const eff = this.pendingEffect
    this.pendingEffect = null
    const p = this.current
    if (!eff || !p) {
      this.endTurn()
      return
    }
    if (eff.kind === 'skip') {
      p.skipTurns += eff.amount
      this.endTurn()
      return
    }
    if (eff.kind === 'forward') {
      this.startWalk(p, walkForward(p.tileIndex, eff.amount), true)
      return
    }
    const route = walkBack(p.tileIndex, eff.amount)
    if (route.length <= 1) {
      this.endTurn()
      return
    }
    this.startWalk(p, { route, stopped: 'steps', remaining: 0 }, true)
  }

  private finishPlayer(p: PPPlayer): void {
    p.finished = true
    p.rank = this.finishOrder.length + 1
    this.finishOrder.push(p.slot)
    this.move = null
    this.pendingEffect = null
    if (this.winner === null) {
      this.winner = p.slot
      this.message = `${p.name} reaches the treasure!`
      this.phase = 'over'
      this.turnPhase = 'idle'
      return
    }
    this.turnPhase = 'landed'
    this.phaseTimer = LAND_FRAMES
  }

  endTurn(): void {
    this.move = null
    this.pending = null
    this.pendingEffect = null
    this.lastRoll = null
    this.turnPhase = 'idle'
    this.phaseTimer = 0
    if (this.players.length === 0) return
    for (let guard = 0; guard < this.players.length + 1; guard++) {
      this.turnIndex = (this.turnIndex + 1) % this.players.length
      if (this.turnIndex === 0) this.round++
      const next = this.players[this.turnIndex]
      if (!next) break
      if (next.finished) continue
      if (next.skipTurns > 0) {
        next.skipTurns--
        this.message = `${next.name} is still stuck, and misses this go`
        continue
      }
      break
    }
    this.version++
  }

  /** Where a pawn is: between spaces `a` and `b`, a fraction `f` of the way across. */
  liveTile(p: PPPlayer): { a: number; b: number; f: number } {
    const mv = this.move
    if (mv && mv.slot === p.slot && mv.route.length > 1) {
      const t = Math.min(1, mv.elapsed / Math.max(1, mv.frames))
      const span = mv.route.length - 1
      const pos = t * span
      const i0 = Math.min(span - 1, Math.floor(pos))
      return { a: mv.route[i0], b: mv.route[i0 + 1], f: pos - i0 }
    }
    return { a: p.tileIndex, b: p.tileIndex, f: 0 }
  }

  isWalking(slot: number): boolean {
    return this.turnPhase === 'moving' && this.move?.slot === slot
  }

  /** Standings, nearest the treasure first. */
  standings(): PPPlayer[] {
    return [...this.players].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1
      if (a.finished && b.finished) return a.rank - b.rank
      return distanceToGoal(a.tileIndex) - distanceToGoal(b.tileIndex)
    })
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
      move: this.move ? { ...this.move, route: [...this.move.route] } : null,
      pending: this.pending ? { ...this.pending } : null,
      message: this.message,
      winner: this.winner,
      finishOrder: [...this.finishOrder],
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
    this.pending = s.pending ?? null
    this.message = s.message ?? null
    this.winner = s.winner ?? null
    this.finishOrder = s.finishOrder ?? this.finishOrder
    this.players = s.players ?? this.players
    this.version++
  }
}
