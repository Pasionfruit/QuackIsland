/**
 * Build & Betray: build a course together, then everyone has to survive it.
 *
 * Host-authoritative like every other game here - the host is the only one
 * that ever calls `step()` for real. A guest sends `place`/`remove`/`input`
 * and renders whatever snapshot last arrived; see BuildBetrayPanel for the
 * one addition this game makes on top of that pattern - a guest also runs
 * `stepRunner` locally, purely for its own on-screen character, so movement
 * over a real network connection still feels immediate. That local copy is
 * never authoritative; it just gets nudged back in line whenever it drifts
 * from the host's next snapshot.
 */
import {
  BUILD_COLS,
  canPlace,
  cellRect,
  countByPiece,
  fixedSolids,
  goalRect,
  hazardCount,
  LEDGE_ROW,
  MAX_HAZARDS_ON_BOARD,
  newLevel,
  place as placeOnLevel,
  reachable,
  removeOwn,
  solidAt,
  spawnPoint,
  trapArmed,
  VIEW_H,
  VIEW_W,
  walkableCollision,
  type Level,
  type PlacedPiece,
  type Rect,
} from './level'
import { draftHand, pieceById, type PieceDef } from './pieces'

export { VIEW_W, VIEW_H, BUILD_COLS, LEDGE_ROW, hazardCount, MAX_HAZARDS_ON_BOARD }

// ------------------------------------------------------------------ tuning

const GRAVITY = 0.36
const MAX_FALL = 8.2
const JUMP_V = -7.6
const DOUBLE_JUMP_V = -6.8
const MOVE_SPEED = 2.7
const ACCEL = 0.55
const AIR_CONTROL = 0.6
const FRICTION = 0.8
const MAX_JUMPS = 2
const RADIUS = 7
const RUNNER_HEIGHT = 26
const RESPAWN_FRAMES = 46
const RESPAWN_INVULN = 40
const KILL_Y = VIEW_H + 60

const INTRO_FRAMES = 100
const PREVIEW_FRAMES = 210
const RESULTS_FRAMES = 300
const EMERGENCY_BUILD_FRAMES = 8 * 60

export const PLAYER_COLORS = [
  '#e0794f',
  '#4f8fbf',
  '#7fb069',
  '#d9a05b',
  '#c85f96',
  '#7a4f8c',
  '#4fb0a5',
  '#c0653f',
]

// -------------------------------------------------------------------- types

export type Phase = 'intro' | 'build' | 'preview' | 'run' | 'results' | 'matchOver'
export type Mode = 'classic' | 'quick' | 'chaos'
export type VoteCategory = 'difficulty' | 'creative' | 'devious'

export interface MatchConfig {
  mode: Mode
  targetScore: number
  totalRounds: number
  buildSeconds: number
  runSeconds: number
}

export function defaultConfig(mode: Mode): MatchConfig {
  if (mode === 'quick') return { mode, targetScore: 0, totalRounds: 5, buildSeconds: 40, runSeconds: 55 }
  if (mode === 'chaos') return { mode, targetScore: 10, totalRounds: 0, buildSeconds: 25, runSeconds: 55 }
  return { mode, targetScore: 10, totalRounds: 0, buildSeconds: 45, runSeconds: 60 }
}

export interface RunnerInput {
  left: boolean
  right: boolean
  jump: boolean
}

function emptyInput(): RunnerInput {
  return { left: false, right: false, jump: false }
}

export interface RunnerState {
  slot: number
  name: string
  color: string
  x: number
  y: number
  /** y at the start of this frame, before gravity moved it - how landing tells "fell past" from "already below". */
  py: number
  vx: number
  vy: number
  facing: 1 | -1
  grounded: boolean
  ridingUid: number | null
  /** uid of the piece currently stood on, or 'fixed' for the ledges/bridge - null in the air. */
  standingOnId: number | 'fixed' | null
  jumps: number
  alive: boolean
  respawnTimer: number
  invuln: number
  finished: boolean
  finishRank: number
  finishFrame: number
  deaths: number
  deathCauses: number[]
  spawnX: number
  spawnY: number
  score: number
  roundScore: number
  prevJump: boolean
  ready: boolean
}

export type RunEvent =
  | { type: 'death'; slot: number; ownerSlot: number }
  | { type: 'finish'; slot: number; rank: number }
  | { type: 'checkpoint'; slot: number }

function aabbOverlap(r: RunnerState, rect: Rect): boolean {
  const top = r.y - RUNNER_HEIGHT
  return r.x + RADIUS > rect.x && r.x - RADIUS < rect.x + rect.w && r.y > rect.y && top < rect.y + rect.h
}

/** A moving platform's horizontal offset from its placed cell, purely a function of frame - no stored state, no desync risk. */
function movingOffset(p: PlacedPiece, def: PieceDef, frame: number): number {
  if (def.behavior !== 'moving') return 0
  const speed = def.params?.speed ?? 0.9
  const range = (def.params?.range ?? 3) * 20
  return Math.sin(frame * speed * 0.03) * range * p.dir
}

function fireFlared(frame: number, period: number): boolean {
  return frame % period < period * 0.55
}

/**
 * One runner's physics for one frame. Exported so a guest can run the exact
 * same step locally for its own character - see the file header.
 */
export function stepRunner(r: RunnerState, input: RunnerInput, level: Level, frame: number, onEvent?: (e: RunEvent) => void): void {
  if (!r.alive) {
    if (--r.respawnTimer <= 0) {
      r.alive = true
      r.x = r.spawnX
      r.y = r.spawnY
      r.vx = 0
      r.vy = 0
      r.invuln = RESPAWN_INVULN
    }
    return
  }
  if (r.invuln > 0) r.invuln--
  if (r.finished) return

  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const jumpPressed = input.jump && !r.prevJump
  r.prevJump = input.jump

  if (dx !== 0) {
    r.vx += dx * ACCEL * (r.grounded ? 1 : AIR_CONTROL)
    r.vx = Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, r.vx))
    r.facing = dx > 0 ? 1 : -1
  } else if (r.grounded) {
    r.vx *= FRICTION
    if (Math.abs(r.vx) < 0.02) r.vx = 0
  }

  if (jumpPressed && r.jumps > 0) {
    r.vy = r.jumps === MAX_JUMPS ? JUMP_V : DOUBLE_JUMP_V
    r.jumps--
    r.grounded = false
  }

  if (!r.grounded) {
    r.vy += GRAVITY
    if (r.vy > MAX_FALL) r.vy = MAX_FALL
  }

  let carry = 0
  if (r.grounded && r.ridingUid !== null) {
    const ridden = level.placed.find((p) => p.uid === r.ridingUid)
    if (ridden) {
      const def = pieceById(ridden.pieceId)
      if (def.behavior === 'moving') {
        carry = movingOffset(ridden, def, frame) - movingOffset(ridden, def, frame - 1)
      } else if (def.behavior === 'conveyor') {
        carry = (def.params?.speed ?? 1.5) * ridden.dir
      }
    }
  }

  r.py = r.y
  r.x += r.vx + carry
  r.y += r.vy

  resolveWalls(r, level, frame)
  const landed = resolveLanding(r, level, frame)
  r.standingOnId = landed === 'fixed' ? 'fixed' : landed ? landed.uid : null
  if (landed && landed !== 'fixed') {
    const def = pieceById(landed.pieceId)
    if (!landed.touchedBy.includes(r.slot)) landed.touchedBy.push(r.slot)
    if (def.behavior === 'fake' && landed.brokenAtFrame === undefined) landed.brokenAtFrame = frame
    if (def.behavior === 'breakable' && landed.brokenAtFrame === undefined) landed.brokenAtFrame = frame + (def.params?.delay ?? 20)
    if (def.behavior === 'triggerTrap' && landed.triggeredAtFrame === undefined) landed.triggeredAtFrame = frame
    if (def.behavior === 'bounce') {
      r.vy = -(def.params?.power ?? 9.5)
      r.grounded = false
      r.jumps = MAX_JUMPS
      r.ridingUid = null
    } else if (def.behavior === 'launch') {
      const power = def.params?.power ?? 8.6
      r.vy = -power * 0.72
      r.vx = power * 0.66 * landed.dir
      r.grounded = false
      r.jumps = MAX_JUMPS
      r.ridingUid = null
    }
  }

  // Hazards: full-body overlap, independent of the landing pass above.
  for (const p of level.placed) {
    const def = pieceById(p.pieceId)
    let lethal = false
    if (def.collision === 'lethal') lethal = def.behavior === 'fire' ? fireFlared(frame, def.params?.period ?? 90) : true
    else if (def.behavior === 'triggerTrap') lethal = trapArmed(p, frame, def.params?.delay ?? 16)
    if (!lethal) continue
    if (aabbOverlap(r, cellRect(p.gx, p.gy, p.w, p.h))) kill(r, p.ownerSlot, onEvent)
  }

  // Checkpoints: a plain overlap sets the respawn point, nothing more.
  for (const p of level.placed) {
    const def = pieceById(p.pieceId)
    if (def.behavior !== 'checkpoint') continue
    const rect = cellRect(p.gx, p.gy, p.w, p.h)
    if (aabbOverlap(r, rect) && (r.spawnX !== rect.x + rect.w / 2 || r.spawnY !== rect.y + rect.h)) {
      r.spawnX = rect.x + rect.w / 2
      r.spawnY = rect.y + rect.h
      onEvent?.({ type: 'checkpoint', slot: r.slot })
    }
  }

  if (!r.finished && aabbOverlap(r, goalRect())) {
    r.finished = true
    r.finishFrame = frame
    onEvent?.({ type: 'finish', slot: r.slot, rank: r.finishRank })
  }

  if (r.y > KILL_Y) kill(r, -1, onEvent)
}

function kill(r: RunnerState, ownerSlot: number, onEvent?: (e: RunEvent) => void): void {
  if (!r.alive || r.invuln > 0) return
  r.alive = false
  r.deaths++
  r.deathCauses.push(ownerSlot)
  r.respawnTimer = RESPAWN_FRAMES
  r.vx = 0
  r.vy = 0
  onEvent?.({ type: 'death', slot: r.slot, ownerSlot })
}

function resolveWalls(r: RunnerState, level: Level, frame: number): void {
  const top = r.y - RUNNER_HEIGHT
  for (const p of level.placed) {
    const def = pieceById(p.pieceId)
    if (!def.blocksHorizontal || !solidAt(p, frame)) continue
    const rect = cellRect(p.gx, p.gy, p.w, p.h)
    if (top >= rect.y + rect.h - 2 || r.y <= rect.y + 2) continue
    const fromLeft = r.x + RADIUS - rect.x
    const fromRight = rect.x + rect.w - (r.x - RADIUS)
    if (fromLeft <= 0 || fromRight <= 0) continue
    if (fromLeft < fromRight) r.x -= fromLeft
    else r.x += fromRight
    r.vx = 0
  }
}

/** Returns the piece a runner ends up standing on this frame, `'fixed'` for the ledges/bridge, or null. */
function resolveLanding(r: RunnerState, level: Level, frame: number): PlacedPiece | 'fixed' | null {
  r.grounded = false
  r.ridingUid = null
  if (r.vy < 0) return null

  for (const s of fixedSolids()) {
    const rect = cellRect(s.gx, s.gy, s.w, s.h)
    if (r.py > rect.y + 0.1 || r.y < rect.y) continue
    if (r.x + RADIUS < rect.x || r.x - RADIUS > rect.x + rect.w) continue
    r.y = rect.y
    r.vy = 0
    r.grounded = true
    r.jumps = MAX_JUMPS
    return 'fixed'
  }

  for (const p of level.placed) {
    const def = pieceById(p.pieceId)
    if (!walkableCollision(def.collision) || !solidAt(p, frame)) continue
    const offset = movingOffset(p, def, frame)
    const rect = cellRect(p.gx, p.gy, p.w, p.h)
    if (r.py > rect.y + 0.1 || r.y < rect.y) continue
    if (r.x + RADIUS < rect.x + offset || r.x - RADIUS > rect.x + rect.w + offset) continue
    r.y = rect.y
    r.vy = 0
    r.grounded = true
    r.jumps = MAX_JUMPS
    if (def.behavior === 'moving' || def.behavior === 'conveyor') r.ridingUid = p.uid
    return p
  }
  return null
}

// -------------------------------------------------------------------- votes

interface Votes {
  difficulty: Record<number, number>
  creative: Record<number, number>
  devious: Record<number, number>
}

function emptyVotes(): Votes {
  return { difficulty: {}, creative: {}, devious: {} }
}

// ------------------------------------------------------------------ engine

export interface RoundResult {
  round: number
  scores: { slot: number; name: string; color: string; roundScore: number; total: number; finished: boolean; deaths: number }[]
}

export class BuildBetrayEngine {
  config: MatchConfig
  phase: Phase = 'intro'
  phaseTimer = INTRO_FRAMES
  runTimer = 0
  frame = 0
  round = 0
  runners: RunnerState[] = []
  level: Level = newLevel()
  hands: Record<number, string[]> = {}
  votes: Votes = emptyVotes()
  emergencyExtensionUsed = false
  winner: number | null = null
  lastResult: RoundResult | null = null
  version = 0

  constructor(config: MatchConfig) {
    this.config = config
  }

  addPlayer(slot: number, name: string): void {
    if (this.runners.some((r) => r.slot === slot)) return
    const sp = spawnPoint(slot, Math.max(1, this.runners.length + 1))
    this.runners.push({
      slot,
      name,
      color: PLAYER_COLORS[slot % PLAYER_COLORS.length],
      x: sp.x,
      y: sp.y,
      py: sp.y,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: true,
      ridingUid: null,
      standingOnId: 'fixed',
      jumps: MAX_JUMPS,
      alive: true,
      respawnTimer: 0,
      invuln: 0,
      finished: false,
      finishRank: 0,
      finishFrame: 0,
      deaths: 0,
      deathCauses: [],
      spawnX: sp.x,
      spawnY: sp.y,
      score: 0,
      roundScore: 0,
      prevJump: false,
      ready: false,
    })
  }

  private respaceSpawns(): void {
    this.runners.forEach((r, i) => {
      const sp = spawnPoint(i, this.runners.length)
      r.spawnX = sp.x
      r.spawnY = sp.y
    })
  }

  startMatch(rand: () => number = Math.random): void {
    this.respaceSpawns()
    this.round = 0
    this.winner = null
    this.startRound(rand)
  }

  startRound(rand: () => number = Math.random): void {
    this.round++
    this.level = newLevel()
    this.hands = {}
    for (const r of this.runners) this.hands[r.slot] = draftHand(rand, this.config.mode === 'chaos' ? 7 : 6, this.config.mode === 'chaos')
    this.votes = emptyVotes()
    this.emergencyExtensionUsed = false
    for (const r of this.runners) {
      const sp = spawnPoint(this.runners.indexOf(r), this.runners.length)
      Object.assign(r, {
        x: sp.x,
        y: sp.y,
        py: sp.y,
        vx: 0,
        vy: 0,
        grounded: true,
        ridingUid: null,
        standingOnId: 'fixed',
        jumps: MAX_JUMPS,
        alive: true,
        respawnTimer: 0,
        invuln: 0,
        finished: false,
        finishRank: 0,
        finishFrame: 0,
        deaths: 0,
        deathCauses: [],
        spawnX: sp.x,
        spawnY: sp.y,
        roundScore: 0,
        prevJump: false,
        ready: false,
      })
    }
    this.phase = 'intro'
    this.phaseTimer = INTRO_FRAMES
    this.version++
  }

  // ------------------------------------------------------------- build phase

  requestPlace(slot: number, pieceId: string, gx: number, gy: number, dir: 1 | -1): { ok: boolean; reason?: string } {
    if (this.phase !== 'build') return { ok: false, reason: 'Not build time' }
    if (!this.hands[slot]?.includes(pieceId)) return { ok: false, reason: 'Not in your hand' }
    const already = countByPiece(this.level, slot, pieceId)
    const check = canPlace(this.level, pieceId, gx, gy, already)
    if (!check.ok) return check
    placeOnLevel(this.level, pieceId, gx, gy, slot, dir)
    this.version++
    return { ok: true }
  }

  requestRemove(slot: number, uid: number): boolean {
    if (this.phase !== 'build') return false
    const ok = removeOwn(this.level, uid, slot)
    if (ok) this.version++
    return ok
  }

  setReady(slot: number, ready: boolean): void {
    const r = this.runners.find((r) => r.slot === slot)
    if (r) r.ready = ready
  }

  castVote(slot: number, category: VoteCategory, choice: number): void {
    if (this.phase !== 'preview') return
    this.votes[category][slot] = choice
  }

  setInput(slot: number, input: RunnerInput): void {
    this.pendingInputs[slot] = input
  }

  private pendingInputs: Record<number, RunnerInput> = {}

  // ------------------------------------------------------------------- step

  step(onEvent?: (e: RunEvent) => void): void {
    this.frame++
    if (this.phase === 'run') {
      for (const r of this.runners) {
        stepRunner(r, this.pendingInputs[r.slot] ?? emptyInput(), this.level, this.frame, onEvent)
      }
      this.runTimer--
      const allDone = this.runners.length > 0 && this.runners.every((r) => r.finished)
      if (this.runTimer <= 0 || allDone) this.advance()
      return
    }

    if (this.phaseTimer > 0) {
      this.phaseTimer--
      if (this.phase === 'build') {
        const allReady = this.runners.length > 0 && this.runners.every((r) => r.ready)
        if (allReady) this.phaseTimer = 0
      }
    }
    if (this.phaseTimer <= 0) this.advance()
  }

  private advance(): void {
    this.version++
    switch (this.phase) {
      case 'intro':
        this.phase = 'build'
        this.phaseTimer = this.config.buildSeconds * 60
        return
      case 'build': {
        if (!reachable(this.level) && !this.emergencyExtensionUsed) {
          this.emergencyExtensionUsed = true
          this.phaseTimer = EMERGENCY_BUILD_FRAMES
          this.phase = 'build'
          return
        }
        this.phase = 'preview'
        this.phaseTimer = PREVIEW_FRAMES
        return
      }
      case 'preview': {
        this.phase = 'run'
        this.runTimer = this.config.runSeconds * 60
        for (const r of this.runners) {
          r.x = r.spawnX
          r.y = r.spawnY
          r.py = r.spawnY
          r.vx = 0
          r.vy = 0
          r.alive = true
          r.grounded = true
          r.jumps = MAX_JUMPS
        }
        return
      }
      case 'run':
        this.phase = 'results'
        this.phaseTimer = RESULTS_FRAMES
        this.lastResult = this.scoreRound()
        return
      case 'results': {
        const matchDone =
          this.config.mode === 'quick'
            ? this.round >= this.config.totalRounds
            : this.runners.some((r) => r.score >= this.config.targetScore)
        if (matchDone) {
          this.phase = 'matchOver'
          const top = Math.max(...this.runners.map((r) => r.score), 0)
          this.winner = this.runners.find((r) => r.score === top)?.slot ?? null
        } else {
          this.startRound()
        }
        return
      }
      default:
        return
    }
  }

  private scoreRound(): RoundResult {
    const finishers = [...this.runners].filter((r) => r.finished).sort((a, b) => a.finishFrame - b.finishFrame)
    finishers.forEach((r, i) => (r.finishRank = i + 1))
    const placeBonus = [0, 3, 2, 1]

    for (const r of this.runners) {
      let s = 0
      if (r.finished) {
        s += 2
        s += placeBonus[Math.min(r.finishRank, 3)] ?? 0
        if (r.deaths === 0) s += 1
      }
      let betrayals = 0
      for (const other of this.runners) {
        if (other.slot === r.slot) continue
        betrayals += other.deathCauses.filter((c) => c === r.slot).length
      }
      s += Math.min(3, betrayals)

      let contributions = 0
      for (const p of this.level.placed) {
        if (p.ownerSlot !== r.slot) continue
        if (p.touchedBy.some((slot) => slot !== r.slot)) contributions++
      }
      s += Math.min(2, contributions)

      r.roundScore = s
      r.score += s
    }

    return {
      round: this.round,
      scores: this.runners
        .map((r) => ({ slot: r.slot, name: r.name, color: r.color, roundScore: r.roundScore, total: r.score, finished: r.finished, deaths: r.deaths }))
        .sort((a, b) => b.roundScore - a.roundScore),
    }
  }

  // --------------------------------------------------------------- snapshot

  snapshot() {
    return {
      phase: this.phase,
      phaseTimer: this.phaseTimer,
      runTimer: this.runTimer,
      frame: this.frame,
      round: this.round,
      level: this.level,
      hands: this.hands,
      votes: this.votes,
      winner: this.winner,
      lastResult: this.lastResult,
      runners: this.runners,
    }
  }

  applySnapshot(s: ReturnType<BuildBetrayEngine['snapshot']>): void {
    this.phase = s.phase
    this.phaseTimer = s.phaseTimer
    this.runTimer = s.runTimer
    this.frame = s.frame
    this.round = s.round
    this.level = s.level
    this.hands = s.hands
    this.votes = s.votes
    this.winner = s.winner
    this.lastResult = s.lastResult
    this.runners = s.runners
  }
}
