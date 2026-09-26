/**
 * The stand-ins - Hiders only. **A bot never plays the Hunter**: alone, the
 * human is the 1 and the stand-ins are what they are hunting.
 *
 * Reuses Messy Maze's genuinely-applicable BFS distance-field approach
 * (`stepsTo`/greedy-descent) to pick a hiding cell and walk to it, but the
 * shape of what happens after arriving is the opposite of a racer: **a
 * settled bot holds still** - silent, genuinely hidden - rather than always
 * advancing toward a fixed goal the way Jackal's runners or Messy Maze's own
 * racers do. It only moves again if the Hunter gets close enough to be worth
 * fleeing, and accepts the footstep noise that entails.
 *
 * Its own randomness comes from the seed. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { cellAt, cellCentre, deadEnds, exits, mazeFor, stepsFrom, stepsTo, type Cell, type Maze, type Point } from './maze'
import { canAct, walkHider, type Round } from './rules'

export const BOT = {
  /** How close the goal cell's own middle has to be before a bot counts as settled. */
  arrived: 0.5,
  /**
   * How close the Hunter has to come before a settled bot gives up its spot
   * and flees - the same distance the Hunter's own hearing carries, since a
   * bot that cannot itself hear the Hunter until they are already inside
   * that radius has no way to react any sooner than a person would.
   */
  threat: 13,
  /** Once fled, how long before the same bot is willing to flee again - stops it flinching every single frame the Hunter lingers nearby. */
  fleeCooldown: 2,
} as const

interface Mind {
  random: () => number
  goal: Cell
  settled: boolean
  fledAt: number
}

const minds = new Map<string, Mind>()

/** A cell far from `avoid` to hide in: a dead end where possible, and never the same one twice running. */
function pickHidingCell(maze: Maze, avoid: Point, random: () => number): Cell {
  const ends = deadEnds(maze)
  const from = cellAt(avoid)
  const pool = ends.length > 0 ? ends : Array.from({ length: maze.size * maze.size }, (_, i) => ({ x: i % maze.size, y: Math.floor(i / maze.size) }))
  const field = stepsTo(maze, [from])
  const ranked = [...pool].sort((a, b) => stepsFrom(field, b) - stepsFrom(field, a))
  // Among the furthest quarter of candidates, a random one - far, but not
  // deterministically always the single furthest cell in the maze.
  const spread = Math.max(1, Math.ceil(ranked.length / 4))
  return ranked[Math.floor(random() * spread)]
}

function mindFor(round: Round, bot: { id: string; x: number; z: number }): Mind {
  const key = `${round.id}:${round.seed}:${bot.id}`
  let mind = minds.get(key)
  if (!mind) {
    const random = createRng(hashSeed(round.seed, `bbn:bot:${bot.id}`))
    const maze = mazeFor(round.seed)
    mind = { random, goal: pickHidingCell(maze, bot, random), settled: false, fledAt: -Infinity }
    minds.set(key, mind)
    if (minds.size > 64) minds.delete(minds.keys().next().value!)
  }
  return mind
}

const fields = new Map<string, number[]>()

function fieldFor(round: Round, goal: Cell): number[] {
  const name = `${round.seed}:${goal.x}:${goal.y}`
  let field = fields.get(name)
  if (!field) {
    field = stepsTo(mazeFor(round.seed), [goal])
    if (fields.size > 64) fields.clear()
    fields.set(name, field)
  }
  return field
}

/** The yaw that looks from `from` towards `to`. */
function yawTowards(from: Point, to: Point): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

/** How far off the line down the middle of a corridor still counts as on it. */
const ON_LINE = 0.35

/** Which way a bot wants to go this frame, downhill on its own goal's distance field - lining up with a corridor before turning into it, the same subtlety Messy Maze's own bots use. */
function botDirection(maze: Maze, field: number[], at: Point): Point {
  const here = cellAt(at)
  const middle = cellCentre(here)
  if (stepsFrom(field, here) === 0) return toward(at, middle)
  const next = exits(maze, here).reduce<Cell | null>((best, c) => (best === null || stepsFrom(field, c) < stepsFrom(field, best) ? c : best), null)
  if (!next) return { x: 0, z: 0 }
  const across = next.x !== here.x
  const offLine = across ? Math.abs(at.z - middle.z) : Math.abs(at.x - middle.x)
  if (offLine > ON_LINE) return toward(at, middle)
  return toward(at, cellCentre(next))
}

function toward(from: Point, to: Point): Point {
  const x = to.x - from.x
  const z = to.z - from.z
  const length = Math.hypot(x, z)
  if (length < 0.05) return { x: 0, z: 0 }
  return { x: x / length, z: z / length }
}

/** Moves every stand-in Hider on by `dt`: heads for a hiding cell, holds still once there, and flees if the Hunter closes in. */
export function botSteer(round: Round, hunter: { x: number; z: number } | undefined, dt: number): void {
  const step = Math.min(Math.max(dt, 0), 0.25)
  const maze = mazeFor(round.seed)
  round.players.forEach((bot, index) => {
    if (!bot.bot || bot.role !== 'hider' || !canAct(round, bot)) return
    const mind = mindFor(round, bot)

    const threatened = !!hunter && Math.hypot(hunter.x - bot.x, hunter.z - bot.z) <= BOT.threat
    if (threatened && mind.settled && round.elapsed - mind.fledAt > BOT.fleeCooldown) {
      mind.goal = pickHidingCell(maze, hunter!, mind.random)
      mind.settled = false
      mind.fledAt = round.elapsed
    }

    const middle = cellCentre(mind.goal)
    if (Math.hypot(middle.x - bot.x, middle.z - bot.z) < BOT.arrived) {
      mind.settled = true
      walkHider(round, index, { forward: 0, right: 0 }, step)
      return
    }

    const field = fieldFor(round, mind.goal)
    const dir = botDirection(maze, field, bot)
    if (dir.x === 0 && dir.z === 0) {
      walkHider(round, index, { forward: 0, right: 0 }, step)
      return
    }
    const wantYaw = yawTowards(bot, { x: bot.x + dir.x, z: bot.z + dir.z })
    bot.yaw = wantYaw
    // Facing exactly the way it walks, so forward/right resolve to a clean (1, 0).
    walkHider(round, index, { forward: 1, right: 0 }, step)
  })
}
