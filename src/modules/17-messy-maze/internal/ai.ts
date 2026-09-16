/**
 * What the stand-in racers decide.
 *
 * A race alone is a stopwatch, and placing first out of one is not a result.
 * So when there is nobody else, the empty corners are filled by racers that
 * know the way: the nearest platform they still need, then the middle.
 *
 * **They cannot be confused, so they pay in other ways.** A person loses
 * seconds to every spin, reading four new letters and pressing the wrong one.
 * A stand-in's controls are not letters, so instead it runs a little slower
 * and stands still for a moment after each spin - see `RACE.botPace` and
 * `RACE.botDaze`. Opponents, not a benchmark.
 */
import {
  cellAt,
  cellCentre,
  exits,
  mazeFor,
  stepsFrom,
  stepsTo,
  type Cell,
  type Point,
} from './maze'
import { GOAL, goalOpen, type Race, type Racer } from './race'

/**
 * Distance fields, kept per maze and per set of platforms already stood on.
 *
 * A stand-in asks sixty times a second, and the answer only changes when it
 * steps on something. A handful of mazes a session, eight platforms each.
 */
const fields = new Map<string, number[]>()

function fieldFor(race: Race, racer: Racer): number[] {
  const maze = mazeFor(race.seed)
  const wanted = goalOpen(racer)
  const name = `${race.seed}:${wanted ? 'goal' : racer.touched}`
  let field = fields.get(name)
  if (!field) {
    const targets: Cell[] = wanted
      ? [GOAL]
      : maze.platforms.filter((p) => (racer.touched & (1 << p.id)) === 0).map((p) => p.cell)
    field = stepsTo(maze, targets)
    if (fields.size > 256) fields.clear()
    fields.set(name, field)
  }
  return field
}

/** How far off the line down the middle of a corridor still counts as on it. */
const ON_LINE = 0.3

/**
 * Which way a stand-in wants to go this frame.
 *
 * One cell at a time, downhill on the distance field. The one subtlety is
 * corners: heading straight for the next cell's middle from wherever you
 * happen to be clips the corner of the wall between, so a racer that is not
 * yet lined up with its corridor lines up first and turns second.
 */
export function botDirection(race: Race, racer: Racer): Point {
  const maze = mazeFor(race.seed)
  const field = fieldFor(race, racer)
  const here = cellAt(racer)
  const middle = cellCentre(here)

  // In the cell it wants: walk onto the middle of it, where the platform or
  // the finish is.
  if (stepsFrom(field, here) === 0) return toward(racer, middle)

  const next = exits(maze, here).reduce<Cell | null>(
    (best, c) =>
      best === null || stepsFrom(field, c) < stepsFrom(field, best) ? c : best,
    null,
  )
  if (!next) return { x: 0, y: 0 }

  const across = next.x !== here.x
  const offLine = across ? Math.abs(racer.y - middle.y) : Math.abs(racer.x - middle.x)
  if (offLine > ON_LINE) return toward(racer, middle)
  return toward(racer, cellCentre(next))
}

function toward(from: Point, to: Point): Point {
  const x = to.x - from.x
  const y = to.y - from.y
  const length = Math.hypot(x, y)
  if (length < 0.05) return { x: 0, y: 0 }
  return { x: x / length, y: y / length }
}

/** Every stand-in still racing, and which way it wants to go. */
export function botDirections(race: Race): Map<string, Point> {
  const out = new Map<string, Point>()
  for (const racer of race.racers) {
    if (!racer.bot || racer.finishedAt !== null) continue
    out.set(racer.id, botDirection(race, racer))
  }
  return out
}
