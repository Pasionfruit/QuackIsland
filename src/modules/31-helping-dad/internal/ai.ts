/**
 * The stand-ins.
 *
 * A stand-in is in the dark too, so it does not walk straight out. It has a
 * sense of direction - it follows the way out - but at a turning, some of the
 * time, it tries the wrong branch first: a few cells in, and back when it finds
 * nothing. It goes from the middle of one cell to the middle of the next, so it
 * never cuts a corner, at its own careful pace; and now and then it is careless:
 * some seconds, by the seed, it touches a wall and is stunned like anybody else.
 *
 * It is in the turning maze like everybody else, and its walk is in the maze's
 * own frame, so the turn is nothing to it. **Dad's junk it does see**: rather
 * than walk into a piece it stands still, `JUNK.clear` short, and waits for it to
 * slide past - which is the same rule everybody plays by: a piece going past a
 * torch that is holding still does not bump it.
 *
 * Its walk is worked out once per game, from the seed, so the same game plays
 * out the same way. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { GRID, JUNK, cellCentre, isOpen, mazeFor, nextCell, stepsToFinish, type Cell, type Maze } from './maze'
import { arrive, canMove, clock, hit, inJunk, type Game, type Torch } from './rules'

/**
 * A stand-in's pace, slowest and fastest, metres a second. Quicker than a
 * careful walk looks, because the maze is a square one now and the way out is
 * long - a stand-in that dawdled would still be in it at two minutes.
 */
export const BOT_PACE: readonly [number, number] = [1.6, 2.3]
/** How long a stand-in takes to pick its torch up, at the start. */
export const BOT_REACTION: readonly [number, number] = [0.4, 1.2]
/**
 * The chance, each second, that a stand-in touches a wall. Lower than it was:
 * waiting for Dad's junk to slide past already costs them time, and a stand-in
 * that was both careless and held up would still be in the maze at two minutes.
 */
export const BOT_CARELESS = 0.04
/** The chance a stand-in tries a wrong branch at a turning, and how far in it goes, at most. */
export const BOT_WANDER = { chance: 0.2, depth: 3 } as const

const STEPS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/**
 * A stand-in's whole walk, cell by cell, from the start to the finish: the way
 * out, with a detour into a wrong branch at some turnings - in and back out.
 */
export function botWalk(maze: Maze, seed: number, id: string): Cell[] {
  const random = createRng(hashSeed(seed, `helping-dad:walk:${id}`))
  const walk: Cell[] = [maze.start]
  let here = maze.start
  for (let guard = 0; guard < GRID.cols * GRID.rows; guard++) {
    const onward = nextCell(maze, here)
    if (!onward) break
    const here_ = here
    const wrong = STEPS.filter(([dc, dr]) => isOpen(maze, here_, dc, dr))
      .map(([dc, dr]) => ({ col: here_.col + dc, row: here_.row + dr }))
      .filter((c) => stepsToFinish(maze, c) > stepsToFinish(maze, here_))
    for (const branch of wrong) {
      if (random() >= BOT_WANDER.chance) continue
      // In, as far as it goes or the stand-in's patience lasts, then back the same way.
      const depth = 1 + Math.floor(random() * BOT_WANDER.depth)
      const path: Cell[] = [branch]
      for (let d = 1; d < depth; d++) {
        const last = path[path.length - 1]
        const before = path.length > 1 ? path[path.length - 2] : here_
        const further = STEPS.filter(([dc, dr]) => isOpen(maze, last, dc, dr))
          .map(([dc, dr]) => ({ col: last.col + dc, row: last.row + dr }))
          .filter((c) => c.col !== before.col || c.row !== before.row)
        if (further.length === 0) break
        path.push(further[Math.floor(random() * further.length)])
      }
      walk.push(...path, ...path.slice(0, -1).reverse(), here_)
    }
    walk.push(onward)
    here = onward
  }
  return walk
}

/** Where each stand-in is along its walk: keyed by game and stand-in, not held on the game, which the screen copies every frame. */
const progress = new Map<string, { walk: Cell[]; next: number; at: number }>()

function planFor(game: Game, bot: Torch) {
  const key = `${game.id}:${game.seed}:${bot.id}`
  let plan = progress.get(key)
  // A clock behind the last one seen is another game that happens to share the key: start the walk again.
  if (!plan || game.elapsed < plan.at) {
    plan = { walk: botWalk(mazeFor(game.seed), game.seed, bot.id), next: 1, at: game.elapsed }
    progress.set(key, plan)
    if (progress.size > 64) progress.delete(progress.keys().next().value!)
  }
  plan.at = game.elapsed
  return plan
}

/** Moves every stand-in on by `dt`. */
export function botSteer(game: Game, dt: number): void {
  const t = clock(game)
  const step = Math.min(Math.max(dt, 0), 0.25)
  for (const bot of game.players) {
    if (!bot.bot || !canMove(game, bot)) continue
    const own = createRng(hashSeed(game.seed, `helping-dad:bot:${bot.id}`))
    const pace = BOT_PACE[0] + own() * (BOT_PACE[1] - BOT_PACE[0])
    const reaction = BOT_REACTION[0] + own() * (BOT_REACTION[1] - BOT_REACTION[0])
    if (t < reaction) continue
    bot.held = true

    // Careless, some seconds: decided as each whole second starts.
    const second = Math.floor(t)
    if (second >= 1 && Math.floor(t - step) < second) {
      const luck = createRng(hashSeed(game.seed, `helping-dad:careless:${bot.id}:${second}`))
      if (luck() < BOT_CARELESS) {
        hit(bot)
        continue
      }
    }

    const plan = planFor(game, bot)
    let left = pace * step
    while (left > 1e-9 && plan.next < plan.walk.length) {
      const cell = plan.walk[plan.next]
      const target = cellCentre(cell.col, cell.row)
      const dx = target.x - bot.x
      const dz = target.z - bot.z
      const d = Math.hypot(dx, dz)
      const go = Math.min(d, left)
      const next = { x: bot.x + (dx / d) * go, z: bot.z + (dz / d) * go }
      // A piece of junk in front of it - and only in front, so one that has just
      // gone by does not keep it standing there: stand still and let it pass.
      const look = { x: next.x + (dx / d) * JUNK.clear, z: next.z + (dz / d) * JUNK.clear }
      if (inJunk(game, look)) break
      if (d <= left) {
        bot.x = target.x
        bot.z = target.z
        left -= d
        plan.next += 1
      } else {
        bot.x = next.x
        bot.z = next.z
        left = 0
      }
    }
    arrive(game, bot)
  }
}
