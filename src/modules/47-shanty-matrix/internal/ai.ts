/**
 * The stand-ins.
 *
 * A stand-in notices a ball a moment after it is fired - its lane lighting up -
 * and a few times a second weighs a dozen ways to walk and standing still:
 * where would each put it over the next second, against where every ball it has
 * noticed will be? It takes the way that keeps it clearest, keeping off the
 * rails where it can. With nothing coming it drifts about the deck. It does not
 * always think it through: now and then it carries on the way it was going.
 *
 * **It shoves** whoever is close in front of it now and then, and far more
 * readily when the shove would put them in a ball's lane.
 *
 * Its own randomness comes from the seed. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { DECK, activeShots, ballAt, type Shot } from './deck'
import { BODY, PUSH, canAct, clock, cooldownLeft, face, hitRange, isStanding, push, steer, yawTowards, type Game, type Player } from './rules'

export const BOT = {
  /** Seconds after a ball is fired before it is noticed, quickest and slowest. */
  reaction: [0.15, 0.5] as readonly [number, number],
  /** The chance it thinks a move through properly rather than carrying on, worst and best. */
  skill: [0.55, 0.95] as readonly [number, number],
  /** How often it reconsiders its way, seconds. */
  think: 0.12,
  /** How often it looks for somebody to shove, seconds. */
  shoveThink: 0.4,
  /** The chance of a shove when somebody is there, the gentlest stand-in and the roughest - multiplied when it would put them in a lane. */
  temper: [0.08, 0.25] as readonly [number, number],
  /** Its pace with nothing coming, as a share of a full walk. */
  wander: 0.45,
  /** How much room it wants round a ball's reach, metres. */
  margin: 0.6,
  /** The moments ahead it looks at, seconds. */
  ahead: [0.15, 0.35, 0.6, 0.9] as readonly number[],
} as const

interface Mind {
  random: () => number
  reaction: number
  skill: number
  temper: number
  way: { x: number; z: number }
  goal: { x: number; z: number }
  thoughtAt: number
  shoveAt: number
  at: number
}

const minds = new Map<string, Mind>()

function mindFor(game: Game, bot: Player): Mind {
  const key = `${game.id}:${game.seed}:${bot.id}`
  let mind = minds.get(key)
  if (!mind || game.elapsed < mind.at) {
    const random = createRng(hashSeed(game.seed, `shanty-matrix:bot:${bot.id}`))
    mind = {
      random,
      reaction: BOT.reaction[0] + random() * (BOT.reaction[1] - BOT.reaction[0]),
      skill: BOT.skill[0] + random() * (BOT.skill[1] - BOT.skill[0]),
      temper: BOT.temper[0] + random() * (BOT.temper[1] - BOT.temper[0]),
      way: { x: 0, z: 0 },
      goal: { x: bot.x, z: bot.z },
      thoughtAt: -Infinity,
      shoveAt: 0,
      at: game.elapsed,
    }
    minds.set(key, mind)
    if (minds.size > 64) minds.delete(minds.keys().next().value!)
  }
  mind.at = game.elapsed
  return mind
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * How much trouble a point is in `tau` seconds from `t`, from the balls given:
 * for each one on the deck then, how far inside its reach - and a margin - the
 * point would be. Nought is clear.
 */
export function danger(shots: readonly Shot[], x: number, z: number, t: number): number {
  let sum = 0
  for (const shot of shots) {
    const ball = ballAt(shot, t)
    if (!ball || ball.stage === 'outgoing') continue
    // A ball still in the air is only trouble where it will land and roll.
    if (ball.stage === 'incoming' && ball.y > shot.radius + 1.5) continue
    const inside = hitRange(shot.radius) + BOT.margin - Math.hypot(x - ball.x, z - ball.z)
    if (inside > 0) sum += inside
  }
  return sum
}

/** How much trouble a walk is: where it would take you, at each moment `BOT.ahead`, against the balls. */
function walkDanger(shots: readonly Shot[], from: { x: number; z: number }, way: { x: number; z: number }, pace: number, t: number): number {
  const r = BODY.radius
  let sum = 0
  for (const tau of BOT.ahead) {
    const x = clamp(from.x + way.x * BODY.speed * pace * tau, -DECK.halfX + r, DECK.halfX - r)
    const z = clamp(from.z + way.z * BODY.speed * pace * tau, -DECK.halfZ + r, DECK.halfZ - r)
    sum += danger(shots, x, z, t + tau)
  }
  return sum
}

/** How near the rail a point is: pinned against one there is nowhere to dodge. */
function cornered(x: number, z: number): number {
  const room = Math.min(DECK.halfX - Math.abs(x), DECK.halfZ - Math.abs(z))
  return Math.max(0, 1.6 - room)
}

const WAYS = 12

/** The best way for a stand-in to walk just now, and whether anything is coming. */
export function bestWay(game: Game, index: number, noticedBy: number): { x: number; z: number; threat: boolean } {
  const bot = game.players[index]
  const t = clock(game)
  const shots = activeShots(game.seed, t).filter((s) => s.fire <= noticedBy)
  const still = walkDanger(shots, bot, { x: 0, z: 0 }, 0, t)
  const threat = shots.some((s) => walkDanger([s], bot, { x: 0, z: 0 }, 0, t) > 0 || danger([s], bot.x, bot.z, t + 1.2) > 0)
  if (!threat) return { x: 0, z: 0, threat: false }
  let best = { x: 0, z: 0 }
  let bestCost = still + cornered(bot.x, bot.z) * 0.15
  for (let k = 0; k < WAYS; k++) {
    const a = (k / WAYS) * Math.PI * 2
    const way = { x: Math.cos(a), z: Math.sin(a) }
    const end = { x: bot.x + way.x * BODY.speed * 0.9, z: bot.z + way.z * BODY.speed * 0.9 }
    const cost = walkDanger(shots, bot, way, 1, t) + cornered(clamp(end.x, -DECK.halfX, DECK.halfX), clamp(end.z, -DECK.halfZ, DECK.halfZ)) * 0.15
    if (cost < bestCost - 1e-9) {
      bestCost = cost
      best = way
    }
  }
  return { ...best, threat: true }
}

/** Moves every stand-in on: which way to walk, and whether to shove. */
export function botSteer(game: Game): void {
  const t = clock(game)
  game.players.forEach((bot, index) => {
    if (!bot.bot || !canAct(game, bot)) return
    const mind = mindFor(game, bot)

    if (game.elapsed - mind.thoughtAt >= BOT.think) {
      mind.thoughtAt = game.elapsed
      if (mind.random() < mind.skill) {
        const way = bestWay(game, index, t - mind.reaction)
        if (way.threat) mind.way = { x: way.x, z: way.z }
        else {
          // Nothing coming: drift about the deck, well in from the rails.
          if (Math.hypot(mind.goal.x - bot.x, mind.goal.z - bot.z) < 0.6 || mind.random() < 0.04) {
            mind.goal = { x: (mind.random() * 2 - 1) * DECK.halfX * 0.6, z: (mind.random() * 2 - 1) * DECK.halfZ * 0.6 }
          }
          const dx = mind.goal.x - bot.x
          const dz = mind.goal.z - bot.z
          const d = Math.hypot(dx, dz)
          mind.way = d > 0.3 ? { x: (dx / d) * BOT.wander, z: (dz / d) * BOT.wander } : { x: 0, z: 0 }
        }
      }
    }
    steer(game, index, mind.way.x, mind.way.z)

    // A shove for whoever is close in front - far likelier if it puts them in a lane.
    if (game.elapsed - mind.shoveAt >= BOT.shoveThink && cooldownLeft(game, bot) <= 0) {
      mind.shoveAt = game.elapsed
      let target: Player | null = null
      let targetD = Infinity
      for (const p of game.players) {
        if (p === bot || !isStanding(p)) continue
        const d = Math.hypot(p.x - bot.x, p.z - bot.z)
        if (d < PUSH.reach * 0.95 && d < targetD) {
          target = p
          targetD = d
        }
      }
      if (target) {
        const shots = activeShots(game.seed, t).filter((s) => s.fire <= t - mind.reaction)
        const lands = { x: target.x + ((target.x - bot.x) / targetD) * 2.2, z: target.z + ((target.z - bot.z) / targetD) * 2.2 }
        const deadly = danger(shots, lands.x, lands.z, t + 0.3) + danger(shots, lands.x, lands.z, t + 0.6) > 0
        if (mind.random() < mind.temper * (deadly ? 3 : 0.2)) {
          face(game, index, yawTowards(bot, target))
          push(game, index)
        }
      }
    }
  })
}
