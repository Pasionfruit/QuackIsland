/**
 * The stand-ins.
 *
 * A stand-in shops: it heads for the nearest thing on its list that is still
 * out on a shelf or the floor - nearest by walking round the shelves, not as
 * the crow flies - picks it up, and when it has all three makes for the nearest
 * till. If everything it still needs is in somebody else's trolley, it goes
 * after them and rams them for it.
 *
 * On the way it rams whoever is close in front of it now and then, far more
 * readily if they are carrying something it needs. It walks a little slower than
 * a full sprint, some more than others, and stops to look at each thing it
 * picks up, so a person who knows where they are going can beat it.
 *
 * Its own randomness comes from the seed. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { LANES, cellMiddle, downhill, freeCell, walkField } from './store'
import { BODY, CART, canAct, click, isShopping, ram, ramLeft, reachable, steer, stillNeeds, type Game, type Player } from './rules'

export const BOT = {
  /** Its pace as a share of a full sprint, slowest and quickest stand-in. */
  pace: [0.62, 0.82] as readonly [number, number],
  /** How long it stands looking at what it just put in its trolley, shortest and longest, seconds. */
  browse: [0.4, 1.1] as readonly [number, number],
  /** How often it rethinks where it is going, seconds. */
  think: 0.3,
  /** The chance of a ram when somebody is close in front, gentlest and roughest - three times it if they carry what it needs. */
  temper: [0.1, 0.3] as readonly [number, number],
  /** How close in front somebody has to be for a ram, metres. */
  ramReach: 2,
} as const

interface Mind {
  random: () => number
  pace: number
  temper: number
  goal: { x: number; z: number } | null
  /** The walking distance to its goal from everywhere, worked out when it chose it. */
  field: Float64Array | null
  /** The item it is after, if it is after one. */
  item: number
  thoughtAt: number
  /** Until when it is standing looking at what it just picked up. */
  browsing: number
  at: number
}

const minds = new Map<string, Mind>()

function mindFor(game: Game, bot: Player): Mind {
  const key = `${game.id}:${game.seed}:${bot.id}`
  let mind = minds.get(key)
  if (!mind || game.elapsed < mind.at) {
    const random = createRng(hashSeed(game.seed, `needs-a-walmart:bot:${bot.id}`))
    mind = {
      random,
      pace: BOT.pace[0] + random() * (BOT.pace[1] - BOT.pace[0]),
      temper: BOT.temper[0] + random() * (BOT.temper[1] - BOT.temper[0]),
      goal: null,
      field: null,
      item: -1,
      thoughtAt: -Infinity,
      browsing: -Infinity,
      at: game.elapsed,
    }
    minds.set(key, mind)
    if (minds.size > 64) minds.delete(minds.keys().next().value!)
  }
  mind.at = game.elapsed
  return mind
}

const fields = new Map<number, Float64Array>()

/** The walking distance to `cell` from everywhere, remembered. */
export function fieldTo(cell: number): Float64Array {
  let field = fields.get(cell)
  if (!field) {
    field = walkField(cell, BODY.radius)
    fields.set(cell, field)
    if (fields.size > 128) fields.delete(fields.keys().next().value!)
  }
  return field
}

/**
 * Where a stand-in is heading: the item it wants, the till, or a shopper to rob
 * - and which item, if an item. Nearest by walking, from one walk out from
 * where it stands (from the nearest free cell, if it is pressed against a shelf).
 */
export function goalFor(game: Game, index: number): { x: number; z: number; item: number } | null {
  const bot = game.players[index]
  const from = walkField(freeCell(bot.x, bot.z, BODY.radius), BODY.radius)
  const needs = stillNeeds(game, bot)
  let best: { x: number; z: number; item: number } | null = null
  let bestD = Infinity
  const consider = (x: number, z: number, item: number) => {
    const d = from[freeCell(x, z, BODY.radius)]
    if (d < bestD) {
      bestD = d
      best = { x, z, item }
    }
  }
  if (needs.length === 0) {
    for (const lane of LANES) consider((lane.x0 + lane.x1) / 2, (lane.z0 + lane.z1) / 2, -1)
    return best
  }
  game.items.forEach((item, i) => {
    if (item.holder === null && needs.includes(item.kind)) consider(item.x, item.z, i)
  })
  if (best) return best
  // Everything it needs is in somebody's trolley: after them.
  game.players.forEach((p, i) => {
    if (i !== index && isShopping(p) && p.cart.some((it) => needs.includes(game.items[it].kind))) consider(p.x, p.z, -1)
  })
  return best
}

/** Moves every stand-in on: where to, picking up, putting back and ramming. */
export function botSteer(game: Game): void {
  game.players.forEach((bot, index) => {
    if (!bot.bot || !canAct(game, bot)) return
    const mind = mindFor(game, bot)
    const needs = stillNeeds(game, bot)

    // Something in the trolley it does not need, and no room: put it back.
    if (bot.cart.length >= CART.size && needs.length > 0) {
      click(game, index)
      return
    }
    // Looking at what it just picked up.
    if (game.elapsed < mind.browsing) {
      steer(game, index, 0, 0)
      return
    }
    // What it came for is in reach: take it, and have a look at it.
    if (mind.item >= 0 && game.items[mind.item].holder === null && reachable(game, index) === mind.item) {
      steer(game, index, 0, 0)
      click(game, index)
      mind.thoughtAt = -Infinity
      mind.browsing = game.elapsed + BOT.browse[0] + mind.random() * (BOT.browse[1] - BOT.browse[0])
      return
    }

    if (game.elapsed - mind.thoughtAt >= BOT.think || (mind.item >= 0 && game.items[mind.item].holder !== null)) {
      mind.thoughtAt = game.elapsed
      const goal = goalFor(game, index)
      mind.goal = goal ? { x: goal.x, z: goal.z } : null
      mind.field = goal ? fieldTo(freeCell(goal.x, goal.z, BODY.radius)) : null
      mind.item = goal ? goal.item : -1

      // A ram for whoever is close in front - likelier if they carry what it needs.
      if (ramLeft(game, bot) <= 0) {
        const ahead = { x: -Math.sin(bot.yaw), z: -Math.cos(bot.yaw) }
        for (const p of game.players) {
          if (p === bot || !isShopping(p) || p.cart.length === 0) continue
          const dx = p.x - bot.x
          const dz = p.z - bot.z
          const d = Math.hypot(dx, dz)
          if (d > BOT.ramReach || (dx * ahead.x + dz * ahead.z) / Math.max(d, 1e-6) < 0.8) continue
          const wanted = p.cart.some((it) => needs.includes(game.items[it].kind))
          if (mind.random() < mind.temper * (wanted ? 3 : 1)) {
            ram(game, index)
            break
          }
        }
      }
    }

    const goal = mind.goal
    if (!goal || !mind.field) {
      steer(game, index, 0, 0)
      return
    }
    const straight = Math.hypot(goal.x - bot.x, goal.z - bot.z)
    let way: { x: number; z: number } | null
    if (straight < 1.2) way = straight > 0.1 ? { x: (goal.x - bot.x) / straight, z: (goal.z - bot.z) / straight } : null
    else way = downhill(mind.field, freeCell(bot.x, bot.z, BODY.radius))
    // Off the grid's free cells - squeezed against a shelf - head for the nearest free one.
    if (!way) {
      const free = cellMiddle(freeCell(bot.x, bot.z, BODY.radius))
      const d = Math.hypot(free.x - bot.x, free.z - bot.z)
      way = d > 0.05 ? { x: (free.x - bot.x) / d, z: (free.z - bot.z) / d } : { x: 0, z: 0 }
    }
    steer(game, index, way.x * mind.pace, way.z * mind.pace)
  })
}
