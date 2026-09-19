/**
 * The stand-ins.
 *
 * On its turn a stand-in works out a throw: it tries every place along the
 * line, every angle and every moment to let go - with the same exact
 * arithmetic the rules use - and picks the one that hits the most. Then its
 * hand shakes: **it lets go a little off where it meant**, by an amount that
 * is its own - a steady stand-in by a hair, a shaky one by a lot - so it rarely
 * gets the throw it planned. It walks to its spot and swings its aim round in
 * plain sight, and rolls at the moment it chose.
 *
 * Its own randomness comes from the seed. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { BOX, columnFor, hits, type Throw } from './beach'
import { HOME, TURN, aimTo, phaseOf, roll, tau, thrower, type Game } from './rules'

export const BOT = {
  /** How far off its angle its hand shakes it, steadiest and shakiest, radians. */
  shake: [0.015, 0.09] as readonly [number, number],
  /** And its moment of letting go, seconds. */
  late: 0.35,
  /** How fast it walks along the line, metres a second, and turns its aim, radians a second. */
  walk: 5,
  turn: 1.2,
  /** The soonest it plans to let go: time to get to its spot. */
  ready: 3,
} as const

/** The best throw there is for a column, by trying every place, angle and moment - from `earliest` on - on a grid. */
export function bestThrow(seed: number, turn: number, earliest = 1.5): { throw: Throw; hit: number } {
  const column = columnFor(seed, turn)
  let best: Throw = { ...HOME, at: TURN.aim / 2 }
  let bestHit = -1
  for (let x = BOX.x0 + 1; x <= BOX.x1 - 1 + 1e-9; x += 1) {
    for (let angle = -0.7; angle <= 0.7 + 1e-9; angle += 0.02) {
      for (let at = earliest; at <= TURN.aim - 0.5 + 1e-9; at += 0.5) {
        const t = { x, z: HOME.z, angle, at }
        const n = hits(column, t).length
        if (n > bestHit) {
          bestHit = n
          best = t
        }
      }
    }
  }
  return { throw: best, hit: bestHit }
}

interface Plan {
  key: string
  throw: Throw
}

const plans = new Map<string, Plan>()

function planFor(game: Game, index: number): Plan {
  const bot = game.players[index]
  const key = `${game.id}:${game.seed}:${game.turn}:${bot.id}`
  let plan = plans.get(key)
  if (!plan) {
    const random = createRng(hashSeed(game.seed, `perfect-game:bot:${bot.id}:${game.turn}`))
    const steady = createRng(hashSeed(game.seed, `perfect-game:bot:${bot.id}`))()
    const shake = BOT.shake[0] + steady * (BOT.shake[1] - BOT.shake[0])
    // No earlier than it can walk anywhere on the line and turn to any angle.
    const wanted = bestThrow(game.seed, game.turn, BOT.ready).throw
    const wobble = (random() * 2 - 1) * shake
    const late = (random() * 2 - 1) * BOT.late
    plan = { key, throw: { ...wanted, angle: wanted.angle + wobble, at: Math.max(0.5, Math.min(TURN.aim - 0.1, wanted.at + late)) } }
    plans.set(key, plan)
    if (plans.size > 32) plans.delete(plans.keys().next().value!)
  }
  return plan
}

/** Moves a stand-in on, on its turn: to its spot, round to its angle, and rolling when it meant to. */
export function botAim(game: Game, dt: number): void {
  const who = thrower(game)
  if (who < 0 || !game.players[who].bot || phaseOf(game) !== 'aim') return
  const plan = planFor(game, who).throw
  const step = Math.min(Math.max(dt, 0), 0.1)
  const toward = (from: number, to: number, most: number) => from + Math.max(-most, Math.min(most, to - from))
  aimTo(game, who, toward(game.aim.x, plan.x, BOT.walk * step), toward(game.aim.z, plan.z, BOT.walk * step), toward(game.aim.angle, plan.angle, BOT.turn * step))
  if (tau(game) >= plan.at) roll(game, who)
}
