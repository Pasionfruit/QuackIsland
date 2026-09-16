/**
 * What the bodies nobody is driving decide to do.
 *
 * Two behaviours and no more: zombies go towards the nearest player, and loose
 * players go away from the nearest zombie. Both are one line of trigonometry
 * with one correction on top, because a chase game does not need clever
 * opponents - it needs opponents that are *there*, in numbers, closing.
 *
 * **The runners are a stand-in for other people.** Zombie Tag is a game for
 * two to eight, and pushing another player and outlasting them are half the
 * rules; with nobody else in the arena there is nothing to push and nothing to
 * outlast. Until a round is synced across a lobby, these fill the seats. The
 * rules in `round.ts` cannot tell them apart from a keyboard, which is exactly
 * how a real player will be dropped in later.
 */
import { ARENA, HALF_H, HALF_W, inObstacle, type Point } from './arena'
import { NO_INTENT, survivors, zombies, type Body, type Intent, type Round } from './round'

/** The nearest of a list, or null when the list is empty. */
function nearest(to: Point, among: readonly Body[]): Body | null {
  let best: Body | null = null
  let bestGap = Infinity
  for (const body of among) {
    const gap = Math.hypot(body.x - to.x, body.y - to.y)
    if (gap < bestGap) {
      bestGap = gap
      best = body
    }
  }
  return best
}

/**
 * Steers around whatever is directly in the way.
 *
 * Not pathfinding. It looks a short distance along where it wants to go, and
 * if that lands in a crate it tries the same heading turned a bit each way
 * until one is clear. A body that would otherwise stand grinding against the
 * side of a crate for the whole round instead slides along it and round the
 * end, which is the entire difference between a chase and a traffic jam.
 *
 * Deliberately shallow: with a dozen bodies and ten crates, anything that
 * searched properly would cost more than the rest of the game put together.
 */
function avoid(from: Point, heading: number): number {
  const look = ARENA.radius * 3
  const clear = (angle: number) => {
    const at = { x: from.x + Math.cos(angle) * look, y: from.y + Math.sin(angle) * look }
    if (inObstacle(at, ARENA.radius)) return false
    // The walls count too, or a body pinned in a corner keeps choosing it.
    return Math.abs(at.x) < HALF_W - ARENA.radius && Math.abs(at.y) < HALF_H - ARENA.radius
  }
  if (clear(heading)) return heading
  for (const turn of [0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4]) {
    if (clear(heading + turn)) return heading + turn
  }
  // Boxed in on every side: keep going and let the collisions sort it out.
  return heading
}

const toIntent = (heading: number): Intent => ({
  x: Math.cos(heading),
  y: Math.sin(heading),
  push: false,
})

/**
 * A zombie's mind: go at the closest player.
 *
 * No prediction and no lead - a zombie moves at half your pace, so a zombie
 * that aimed where you were going to be would be a zombie that caught you, and
 * the whole tension of the game is that one alone never can. Six of them
 * cornering you is what does it.
 */
export function zombieIntent(round: Round, body: Body): Intent {
  const prey = nearest(body, survivors(round))
  if (!prey) return NO_INTENT
  const heading = Math.atan2(prey.y - body.y, prey.x - body.x)
  return toIntent(avoid(body, heading))
}

/**
 * A loose runner's mind: get away from the closest zombie.
 *
 * Away from *one*, not away from all of them, which is a real weakness and a
 * deliberate one: a runner that balanced every threat would thread the middle
 * of the arena forever, and a runner that backs itself into a corner fleeing
 * the nearest thing is a runner a person can outlast. They are opponents, not
 * a benchmark.
 *
 * They never push. The push is a thing people do to each other, and a bot
 * spending it perfectly would make it feel like a tax rather than a tactic.
 */
export function runnerIntent(round: Round, body: Body): Intent {
  const threat = nearest(body, zombies(round))
  if (!threat) return NO_INTENT
  const heading = Math.atan2(body.y - threat.y, body.x - threat.x)
  return toIntent(avoid(body, heading))
}

/**
 * What every body that is not being driven wants, this frame.
 *
 * Skips whoever is `mine` - that one is the keyboard's - so the caller merges
 * its own intent in without this having to know anything about input.
 */
export function crowdIntents(round: Round): Map<string, Intent> {
  const out = new Map<string, Intent>()
  for (const body of round.bodies) {
    if (body.mine) continue
    out.set(body.id, body.side === 'zombie' ? zombieIntent(round, body) : runnerIntent(round, body))
  }
  return out
}
