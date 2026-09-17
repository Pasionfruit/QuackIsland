/**
 * The rules of Musical Mayhem, as arithmetic.
 *
 * Musical chairs, with pushing. A ring of chairs in the middle of a round floor,
 * **one fewer than the players still in**. While the music plays, everybody runs
 * round; nobody can sit. **When it stops** - after a time nobody can know - find
 * an empty chair and sit. Anybody can push whoever is in front of them: knocked
 * back, stunned a moment, and off their chair if they were sitting.
 *
 * **Somebody who has sat for a second is safe**: they cannot be pushed off any
 * more. So a scramble settles - once every chair holds somebody safe, whoever is
 * standing is out - rather than going on as long as anybody keeps shoving. If it
 * has not settled after ten seconds, whoever is standing then is out. A chair
 * goes, and the music starts again, until only one player is left.
 *
 * Bodies bump each other apart, cannot walk through chairs, and stay on the
 * floor. A seated body does not move, except by being pushed off.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

export const FLOOR = {
  /**
   * The floor's radius: nobody leaves it.
   *
   * Sized to the ring rather than picked: the chairs have to stand close enough
   * together that nobody can slip between them, which makes for a small ring, and
   * a floor much wider than that leaves the game happening in a dot in the middle
   * of it. This is the tightest floor that still holds the widest ring, everybody
   * running round the outside of it, and a push from any of them.
   */
  radius: 5.5,
} as const

export const BODY = {
  radius: 0.45,
  /** Metres a second. */
  speed: 5.2,
} as const

export const CHAIR = {
  /** A chair as an obstacle: a circle this round. */
  radius: 0.42,
  /** How near its middle you must be to sit on it. */
  reach: 1.3,
  /**
   * The space round the ring each chair takes, metres.
   *
   * The ceiling is what makes the ring a ring: two neighbours must be nearer than
   * a body is wide (`CHAIR.radius * 2 + BODY.radius * 2`, 1.74 m) or somebody
   * could cut straight across instead of running round.
   */
  spacing: 1.6,
  /** The smallest ring: small enough that from three chairs up nobody slips between them. */
  ring: 0.95,
} as const

export const PUSH = {
  /** How far in front of you a push reaches, middle to middle. */
  reach: 1.55,
  /** How far either side of straight ahead, radians. */
  arc: 1.0,
  /** How hard, metres a second, and how quickly that dies away, per second. */
  impulse: 9,
  friction: 5,
  /** Seconds a pushed body is stunned. */
  stun: 0.6,
  /** Seconds between pushes. */
  cooldown: 0.8,
} as const

export const ROUND = {
  countdown: 3,
  /** How long the music plays, shortest and longest, seconds. */
  music: [4, 9] as readonly [number, number],
  /** The longest a scramble lasts. */
  scramble: 10,
  /** How long somebody must have sat to be safe - and so how long every chair must hold somebody to end a scramble. */
  settle: 1,
  /** Who went out, shown for this long. */
  result: 2.5,
} as const

export type Phase = 'countdown' | 'music' | 'scramble' | 'result' | 'over'

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  x: number
  z: number
  /** Knocked about: velocity from pushes, dying away. */
  vx: number
  vz: number
  /** The way the body faces, radians: 0 is +Z, towards the camera. */
  facing: number
  /** Which chair they are on, or null. */
  seat: number | null
  /** When they sat, in `elapsed`, or null. */
  seatedAt: number | null
  /** Seconds of stun left. */
  stunned: number
  /** When they last pushed, in `elapsed`. */
  pushAt: number
  /** The round they went out in, or null while still in. */
  out: number | null
  left: boolean
}

/** What a player's hands are doing: which way they want to go, -1 to 1 each way on the floor. */
export interface Hands {
  x: number
  z: number
}

export interface Game {
  seed: number
  id: number
  elapsed: number
  over: boolean
  players: Player[]
  /** Held keys, by player index. */
  hands: Hands[]
  round: number
  phase: Exclude<Phase, 'over'>
  /** When this phase started, in `elapsed`. */
  phaseAt: number
  /** How many chairs this round. */
  chairs: number
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const round2 = (v: number) => Math.round(v * 100) / 100

/** Still in: not out, and not gone. */
export function isIn(p: Player): boolean {
  return p.out === null && !p.left
}

/** How long the music plays in round `round`. Only the host knows. */
export function musicFor(seed: number, round: number): number {
  const random = createRng(hashSeed(seed, `musical-mayhem:music:${round}`))
  return ROUND.music[0] + random() * (ROUND.music[1] - ROUND.music[0])
}

/** The ring's radius for this many chairs. */
export function ringRadius(chairs: number): number {
  return Math.max(CHAIR.ring, (chairs * CHAIR.spacing) / (Math.PI * 2))
}

/** Where chair `i` of `count` stands, and the way it faces: outwards. */
export function chairAt(count: number, i: number): { x: number; z: number; facing: number } {
  const angle = (i / Math.max(1, count)) * Math.PI * 2
  const r = count <= 1 ? 0 : ringRadius(count)
  return { x: Math.sin(angle) * r, z: Math.cos(angle) * r, facing: angle }
}

/** Where player `i` of `count` starts: round a ring outside the chairs, facing along it. */
export function startAt(count: number, i: number): { x: number; z: number; facing: number } {
  const angle = (i / Math.max(1, count)) * Math.PI * 2 + Math.PI / Math.max(1, count)
  const r = ringRadius(Math.max(1, count - 1)) + 2.4
  return { x: Math.sin(angle) * r, z: Math.cos(angle) * r, facing: angle + Math.PI / 2 }
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    players: entrants.map((e, i) => {
      const at = startAt(entrants.length, i)
      return { id: e.id, mine: e.mine ?? false, bot: e.bot ?? false, x: at.x, z: at.z, vx: 0, vz: 0, facing: at.facing, seat: null, seatedAt: null, stunned: 0, pushAt: -PUSH.cooldown, out: null, left: false }
    }),
    hands: entrants.map(() => ({ x: 0, z: 0 })),
    round: 0,
    phase: 'countdown',
    phaseAt: 0,
    chairs: Math.max(1, entrants.length - 1),
  }
}

export function phase(game: Game): Phase {
  return game.over ? 'over' : game.phase
}

/** Who is sitting on chair `i`, by index, or -1. */
export function sitter(game: Game, chair: number): number {
  return game.players.findIndex((p) => isIn(p) && p.seat === chair)
}

/** Whether a sitter has sat long enough to be safe from being pushed off. */
export function isSafe(game: Game, p: Player): boolean {
  return p.seat !== null && p.seatedAt !== null && game.elapsed - p.seatedAt >= ROUND.settle
}

/** Whether a player can move, sit or push just now. */
export function canAct(game: Game, p: Player): boolean {
  return !game.over && isIn(p) && p.stunned <= 0 && (game.phase === 'music' || game.phase === 'scramble')
}

/** The empty chair nearest a player, within reach, or -1. */
export function chairInReach(game: Game, player: number): number {
  const p = game.players[player]
  let best = -1
  let bestD: number = CHAIR.reach
  for (let i = 0; i < game.chairs; i++) {
    if (sitter(game, i) >= 0) continue
    const c = chairAt(game.chairs, i)
    const d = Math.hypot(c.x - p.x, c.z - p.z)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** A player sits in the nearest empty chair in reach - only once the music has stopped. Returns the chair, or -1. */
export function sit(game: Game, player: number): number {
  const p = game.players[player]
  if (!p || !canAct(game, p) || game.phase !== 'scramble' || p.seat !== null) return -1
  const chair = chairInReach(game, player)
  if (chair < 0) return -1
  const c = chairAt(game.chairs, chair)
  Object.assign(p, { seat: chair, seatedAt: game.elapsed, x: c.x, z: c.z, vx: 0, vz: 0, facing: c.facing })
  return chair
}

/**
 * A player pushes whoever is in front of them: every other player still in,
 * within reach, no further round than `PUSH.arc`. Each is knocked back along the
 * push, stunned, and off their chair if they were on one - unless they have sat
 * long enough to be safe, when the push does nothing to them. Returns who was hit.
 */
export function push(game: Game, player: number): number[] {
  const p = game.players[player]
  if (!p || !canAct(game, p) || p.seat !== null || game.elapsed - p.pushAt < PUSH.cooldown) return []
  p.pushAt = game.elapsed
  const hit: number[] = []
  const fx = Math.sin(p.facing)
  const fz = Math.cos(p.facing)
  game.players.forEach((q, i) => {
    if (i === player || !isIn(q) || isSafe(game, q)) return
    const dx = q.x - p.x
    const dz = q.z - p.z
    const d = Math.hypot(dx, dz)
    if (d > PUSH.reach || d < 1e-6) return
    if (Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)) > PUSH.arc) return
    if (q.seat !== null) {
      // Off the chair, and out in front of it.
      const c = chairAt(game.chairs, q.seat)
      q.seat = null
      q.seatedAt = null
      q.x = c.x + Math.sin(c.facing) * 0.5
      q.z = c.z + Math.cos(c.facing) * 0.5
    }
    q.vx += (dx / d) * PUSH.impulse
    q.vz += (dz / d) * PUSH.impulse
    q.stunned = PUSH.stun
    hit.push(i)
  })
  return hit
}

/** Moves every body a step: walking, being knocked about, and bumping into the chairs, the edge and each other. */
function move(game: Game, dt: number): void {
  const active = game.players.map((p, i) => ({ p, i })).filter(({ p }) => isIn(p))
  for (const { p, i } of active) {
    if (p.seat !== null) {
      const c = chairAt(game.chairs, p.seat)
      Object.assign(p, { x: c.x, z: c.z, vx: 0, vz: 0, facing: c.facing })
      continue
    }
    let wx = 0
    let wz = 0
    const hands = game.hands[i] ?? { x: 0, z: 0 }
    if (canAct(game, p)) {
      const length = Math.hypot(hands.x, hands.z)
      if (length > 1e-6) {
        const k = Math.min(1, length) / length
        wx = hands.x * k * BODY.speed
        wz = hands.z * k * BODY.speed
        p.facing = Math.atan2(hands.x, hands.z)
      }
    }
    p.x += (wx + p.vx) * dt
    p.z += (wz + p.vz) * dt
    const decay = Math.exp(-PUSH.friction * dt)
    p.vx *= decay
    p.vz *= decay
  }
  // A few passes of pushing apart: chairs and seated bodies do not give; standing bodies share it.
  for (let pass = 0; pass < 3; pass++) {
    for (const { p } of active) {
      if (p.seat !== null) continue
      for (let c = 0; c < game.chairs; c++) {
        const chair = chairAt(game.chairs, c)
        if (sitter(game, c) >= 0) continue
        const dx = p.x - chair.x
        const dz = p.z - chair.z
        const d = Math.hypot(dx, dz)
        const min = BODY.radius + CHAIR.radius
        if (d < min) {
          const k = d < 1e-6 ? 1 : 1 / d
          p.x = chair.x + (d < 1e-6 ? min : dx * k * min)
          p.z = chair.z + (d < 1e-6 ? 0 : dz * k * min)
        }
      }
    }
    for (let a = 0; a < active.length; a++) {
      for (let b = a + 1; b < active.length; b++) {
        const p = active[a].p
        const q = active[b].p
        if (p.seat !== null && q.seat !== null) continue
        const dx = q.x - p.x
        const dz = q.z - p.z
        const d = Math.hypot(dx, dz)
        const min = BODY.radius * 2
        if (d >= min) continue
        const nx = d < 1e-6 ? 1 : dx / d
        const nz = d < 1e-6 ? 0 : dz / d
        const overlap = min - d
        const pShare = p.seat !== null ? 0 : q.seat !== null ? 1 : 0.5
        p.x -= nx * overlap * pShare
        p.z -= nz * overlap * pShare
        q.x += nx * overlap * (1 - pShare)
        q.z += nz * overlap * (1 - pShare)
      }
    }
    for (const { p } of active) {
      const d = Math.hypot(p.x, p.z)
      const max = FLOOR.radius - BODY.radius
      if (d > max) {
        p.x *= max / d
        p.z *= max / d
      }
    }
  }
}

/** The clock, stuns and bodies, on every screen that simulates. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  const step = Math.min(Math.max(dt, 0), 0.1)
  game.elapsed += step
  for (const p of game.players) p.stunned = Math.max(0, p.stunned - step)
  move(game, step)
}

/** A new round: a chair fewer, everybody up, the music on. */
function nextRound(game: Game): void {
  const standing = game.players.filter(isIn)
  if (standing.length <= 1) {
    game.over = true
    return
  }
  game.round += 1
  game.chairs = standing.length - 1
  for (const p of game.players) Object.assign(p, { seat: null, seatedAt: null })
  Object.assign(game, { phase: 'music', phaseAt: game.elapsed })
}

/**
 * The phases, for the host or alone: the countdown into the music, the music
 * stopping, the scramble ending, and the next round or the end.
 */
export function advance(game: Game): void {
  if (game.over) return
  const since = game.elapsed - game.phaseAt
  if (game.phase === 'countdown') {
    if (since >= ROUND.countdown) Object.assign(game, { phase: 'music', phaseAt: game.elapsed, round: 1 })
    return
  }
  if (game.phase === 'music') {
    if (since >= musicFor(game.seed, game.round)) Object.assign(game, { phase: 'scramble', phaseAt: game.elapsed })
    return
  }
  if (game.phase === 'scramble') {
    // Settled: every chair holds somebody who is safe.
    const settled = Array.from({ length: game.chairs }, (_, c) => sitter(game, c)).every((i) => i >= 0 && isSafe(game, game.players[i]))
    if (!settled && since < ROUND.scramble) return
    const standing = game.players.filter((p) => isIn(p) && p.seat === null)
    const inStill = game.players.filter(isIn)
    if (standing.length > 0 && standing.length < inStill.length) {
      for (const p of standing) p.out = game.round
    }
    Object.assign(game, { phase: 'result', phaseAt: game.elapsed })
    return
  }
  if (since >= ROUND.result) {
    // Nobody went out - nobody sat at all - means the same round again.
    const inStill = game.players.filter(isIn).length
    if (inStill - 1 === game.chairs || inStill <= 1) {
      if (inStill <= 1) game.over = true
      else {
        for (const p of game.players) Object.assign(p, { seat: null, seatedAt: null })
        Object.assign(game, { phase: 'music', phaseAt: game.elapsed })
      }
    } else nextRound(game)
  }
}

/** One step: the clock and bodies, then the phases. For the host, or alone. */
export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
  advance(game)
  if (!game.over && game.players.length > 0 && game.players.filter(isIn).length <= 1 && game.phase !== 'result') game.over = true
  return game
}

/** A player who has left the lobby. A chair they were on is free. */
export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (!p || game.over) return
  p.left = true
  p.seat = null
  p.seatedAt = null
  if (p.out === null) p.out = game.round
}

/** Seconds since the start of this phase. */
export function phaseTime(game: Game): number {
  return round2(game.elapsed - game.phaseAt)
}

/** Everybody, best first: the last one in first, then by the round they went out, latest first. Out in the same round shares a place. */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const key = (p: Player) => (p.out === null && !p.left ? Infinity : (p.out ?? 0))
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => key(b.player) - key(a.player) || a.index - b.index)
  return ranked.map((entry) => ({ ...entry, place: 1 + ranked.filter((other) => key(other.player) > key(entry.player)).length }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const
