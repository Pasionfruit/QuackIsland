/**
 * The rules of Helping Dad, as arithmetic.
 *
 * A maze in the dark, and everybody holding a torch in their own colour. After a
 * 3, 2, 1 you pick your torch up - put the mouse on it - and it follows the mouse,
 * no faster than a careful walk. If the torch touches a wall, Dad yells: you drop
 * it and stand there stunned for a second and a half, and then you have to pick
 * it up again where it fell. Reach the finish to place, in the order you get
 * there. At two minutes, anybody still in the maze is placed by how far they had
 * left to go.
 *
 * **The torch moves, it does not jump.** However fast the mouse goes, the torch
 * goes towards it at most `TORCH.speed`, checked a few centimetres at a time, so
 * it can never pass through a wall: a wall in the way is a wall touched.
 *
 * Everything here is pure.
 */
import { GRID, cellCentre, distanceToFinish, mazeFor, touchesWall, type Point } from './maze'

export const TORCH = {
  /** The torch's radius: the ring that must not touch a wall. */
  radius: 0.2,
  /** How close the mouse must come to a dropped torch to pick it up. */
  grab: 0.45,
  /** The fastest a torch goes, metres a second. */
  speed: 3.5,
  /** Seconds stunned after touching a wall. */
  stun: 1.5,
  /** Within this of the finish's middle is there. */
  finish: 0.45,
  /** How far a torch moves between checks. */
  check: 0.04,
} as const

export const ROUND = {
  /** The game is over as soon as this many have reached the finish. */
  podium: 3,
  /**
   * Seconds of count before the round. None: the minigame screen's shared three-two-one runs before the game is
   * let go, so a count of its own would be a second one.
   */
  countdown: 0,
  /** Seconds from the start to the end, finished or not. */
  limit: 120,
} as const

export interface Torch {
  id: string
  mine: boolean
  bot: boolean
  x: number
  z: number
  /** Following the mouse. */
  held: boolean
  /** Seconds of stun left. */
  stunned: number
  /** Walls touched. */
  hits: number
  /** When they reached the finish, in seconds since the start, or null. */
  finished: number | null
  left: boolean
}

export interface Game {
  seed: number
  id: number
  /** Seconds since the game was dealt, countdown included. */
  elapsed: number
  over: boolean
  players: Torch[]
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

/** Where every torch starts: the middle of the start cell. */
export function startPoint(seed: number): Point {
  const maze = mazeFor(seed)
  return cellCentre(maze.start.col, maze.start.row)
}

/** Where the finish is. */
export function finishPoint(seed: number): Point {
  const maze = mazeFor(seed)
  return cellCentre(maze.finish.col, maze.finish.row)
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  const at = startPoint(seed)
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    players: entrants.map((e) => ({
      id: e.id,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
      x: at.x,
      z: at.z,
      held: false,
      stunned: 0,
      hits: 0,
      finished: null,
      left: false,
    })),
  }
}

/** Seconds since the start; negative during the countdown. */
export function clock(game: Game): number {
  return game.elapsed - ROUND.countdown
}

/** Whether a torch can move at all just now. */
export function canMove(game: Game, torch: Torch): boolean {
  return !game.over && clock(game) >= 0 && !torch.left && torch.finished === null && torch.stunned <= 0
}

/** A wall touched: Dad yells, the torch drops, and its holder is stunned. */
export function hit(torch: Torch): void {
  torch.hits += 1
  torch.stunned = TORCH.stun
  torch.held = false
}

export type SteerResult = 'grabbed' | 'moved' | 'hit' | 'finished' | null

/**
 * Whether the mouse is on a dropped torch: near enough, and with no wall between.
 * A mouse left resting in the wall the torch just touched is not on it - or the
 * torch would be picked straight back up into that wall when the stun wears off.
 */
function onTorch(game: Game, torch: Torch, target: Point): boolean {
  const d = Math.hypot(target.x - torch.x, target.z - torch.z)
  if (d > TORCH.grab) return false
  const maze = mazeFor(game.seed)
  const steps = Math.max(1, Math.ceil(d / TORCH.check))
  for (let i = 1; i <= steps; i++) {
    const at = { x: torch.x + ((target.x - torch.x) * i) / steps, z: torch.z + ((target.z - torch.z) * i) / steps }
    if (touchesWall(maze, at, 0.02)) return false
  }
  return true
}

/**
 * A player's mouse is at `target` for `dt` seconds. Picks the torch up if the
 * mouse is on it; moves a held torch towards the mouse, no faster than the torch
 * goes, stopping at - and stunned by - the first wall it touches.
 */
export function steer(game: Game, player: number, target: Point | null, dt: number): SteerResult {
  const torch = game.players[player]
  if (!torch || !target || !canMove(game, torch)) return null
  if (!torch.held) {
    if (!onTorch(game, torch, target)) return null
    torch.held = true
    return 'grabbed'
  }
  const maze = mazeFor(game.seed)
  const dx = target.x - torch.x
  const dz = target.z - torch.z
  const want = Math.hypot(dx, dz)
  const go = Math.min(want, TORCH.speed * Math.min(Math.max(dt, 0), 0.25))
  if (go <= 1e-6) return null
  const steps = Math.max(1, Math.ceil(go / TORCH.check))
  for (let i = 1; i <= steps; i++) {
    const at = { x: torch.x + (dx / want) * (go / steps), z: torch.z + (dz / want) * (go / steps) }
    if (touchesWall(maze, at, TORCH.radius)) {
      hit(torch)
      return 'hit'
    }
    torch.x = at.x
    torch.z = at.z
  }
  return arrive(game, torch) ? 'finished' : 'moved'
}

/** Marks a torch that has reached the finish. */
export function arrive(game: Game, torch: Torch): boolean {
  if (torch.finished !== null) return true
  const end = finishPoint(game.seed)
  if (Math.hypot(torch.x - end.x, torch.z - end.z) > TORCH.finish) return false
  // To the hundredth, as it goes on the wire, so every screen places from the same times.
  torch.finished = Math.round(Math.max(0, clock(game)) * 100) / 100
  torch.held = false
  return true
}

/**
 * A guest says where its torch is, and how many walls it has touched. The host
 * takes the position if it is somewhere the torch could have got to since it
 * last heard - no further than it goes in that time, with some slack, and not
 * through a wall - and otherwise as far towards it as it could have. More walls
 * touched than the host knew of is a stun.
 */
export function report(game: Game, player: number, at: Point, hits: number, since: number): void {
  const torch = game.players[player]
  if (!torch || game.over || torch.left || torch.finished !== null || clock(game) < 0) return
  if (hits > torch.hits) {
    torch.hits = hits
    torch.stunned = TORCH.stun
    torch.held = false
  }
  const maze = mazeFor(game.seed)
  const dx = at.x - torch.x
  const dz = at.z - torch.z
  const want = Math.hypot(dx, dz)
  if (want <= 1e-6) return
  const allowed = Math.max(0, since) * TORCH.speed * 1.5 + 0.25
  const go = Math.min(want, allowed)
  const steps = Math.max(1, Math.ceil(go / TORCH.check))
  // Only the middle of the torch is checked: a guest's own screen judges a touch;
  // the host only refuses a way through a wall.
  for (let i = 1; i <= steps; i++) {
    const next = { x: torch.x + (dx / want) * (go / steps), z: torch.z + (dz / want) * (go / steps) }
    if (touchesWall(maze, next, 0.02)) break
    torch.x = next.x
    torch.z = next.z
  }
  arrive(game, torch)
}

/** The clock and the stuns, on every screen. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  const step = Math.min(Math.max(dt, 0), 0.25)
  game.elapsed += step
  for (const torch of game.players) torch.stunned = Math.max(0, torch.stunned - step)
}

/** Whether the game is over: three have finished, everybody still here has, or time is up. Only the host decides. */
export function judgeEnd(game: Game): boolean {
  if (game.over) return true
  const here = game.players.filter((p) => !p.left)
  const finished = game.players.filter((p) => p.finished !== null).length
  if (clock(game) >= ROUND.limit || finished >= ROUND.podium || here.every((p) => p.finished !== null)) game.over = true
  return game.over
}

/** One step of the clock, and the end - for the host, or alone. */
export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
  judgeEnd(game)
  return game
}

/** A player who has left the lobby. */
export function leave(game: Game, player: number): void {
  const torch = game.players[player]
  if (!torch || game.over) return
  torch.left = true
  torch.held = false
}

/** How far a torch has left to go, walking. */
export function remaining(game: Game, torch: Torch): number {
  return torch.finished !== null ? 0 : distanceToFinish(mazeFor(game.seed), torch)
}

/**
 * Everybody, best first, with their place: finishers by when they finished, then
 * anybody still in the maze by how far they had left to go, then anybody who left.
 */
export function placings(game: Game): { torch: Torch; index: number; place: number }[] {
  const key = (t: Torch): [number, number] =>
    t.finished !== null ? [0, t.finished] : t.left ? [2, remaining(game, t)] : [1, Math.round(remaining(game, t) * 100) / 100]
  const better = (a: Torch, b: Torch) => {
    const ka = key(a)
    const kb = key(b)
    return ka[0] !== kb[0] ? ka[0] < kb[0] : ka[1] < kb[1]
  }
  const same = (a: Torch, b: Torch) => {
    const ka = key(a)
    const kb = key(b)
    return ka[0] === kb[0] && Math.abs(ka[1] - kb[1]) < 1e-9
  }
  const ranked = game.players
    .map((torch, index) => ({ torch, index }))
    .sort((a, b) => (same(a.torch, b.torch) ? 0 : better(a.torch, b.torch) ? -1 : 1))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => !same(other.torch, entry.torch) && better(other.torch, entry.torch)).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. Bright, for torches in the dark. */
export const COLOURS = ['#ff5a64', '#4aa8ff', '#ffc53d', '#5fe06f', '#c77dff', '#ff9a3c', '#3ee0d6', '#ff8fc8'] as const

export { GRID }
