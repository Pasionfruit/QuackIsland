/**
 * The stand-ins.
 *
 * A stand-in reads its rod much as a person does. Each has **its own greed** -
 * the smallest fish it will take early in the round - and gives it up as the
 * clock runs down, taking anything in the last few seconds. When a fish bites it
 * sizes it up from the bend - **not always right**: now and then it takes a fish
 * for one size bigger or smaller than it is - and, if that is big enough, pulls
 * after its own reaction time. Too slow, and the fish has gone: a pull on a
 * straight rod lands nothing. Once in a while it loses its nerve and pulls on
 * nothing at all.
 *
 * Its own randomness comes from the seed. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { FISH, LENGTH, bendAt, hooked } from './pond'
import { bitesOf, canPull, pull, type Game } from './rules'

export const BOT = {
  /** Seconds from a bite to its pull, quickest and slowest. */
  reaction: [0.25, 0.75] as readonly [number, number],
  /** The chance it takes a fish for the wrong size. */
  misjudge: 0.15,
  /** The chance, each quiet second, that it pulls on a straight rod. */
  nerves: 0.02,
} as const

interface Mind {
  random: () => number
  /** The smallest fish it will take at the start of the round. */
  greed: number
  /** What it made of each bite: whether it will take it, and when it will pull. */
  bites: Map<number, { take: boolean; at: number }>
  quietAt: number
  at: number
}

const minds = new Map<string, Mind>()

function mindFor(game: Game, index: number): Mind {
  const bot = game.players[index]
  const key = `${game.id}:${game.seed}:${bot.id}`
  let mind = minds.get(key)
  if (!mind || game.elapsed < mind.at) {
    const random = createRng(hashSeed(game.seed, `milf-fishing:bot:${bot.id}`))
    mind = { random, greed: 1 + Math.floor(random() * 4), bites: new Map(), quietAt: 0, at: game.elapsed }
    minds.set(key, mind)
    if (minds.size > 64) minds.delete(minds.keys().next().value!)
  }
  mind.at = game.elapsed
  return mind
}

/** The smallest fish a stand-in of this greed will take at `t`: its greed early on, anything by the end. */
export function wantsAt(greed: number, t: number): number {
  const left = LENGTH - t
  if (left < 5) return 0
  return Math.max(0, Math.min(greed, Math.floor((left - 5) / 5)))
}

/** Moves every stand-in on: watching its rod, and pulling. */
export function botPull(game: Game): void {
  const t = game.elapsed
  game.players.forEach((bot, index) => {
    if (!bot.bot || !canPull(game, index)) return
    const mind = mindFor(game, index)
    const bites = bitesOf(game, index)
    const now = bendAt(bites, bot.pulls, t)
    if (now.bite >= 0 && now.bend > 0) {
      const bite = bites[now.bite]
      let plan = mind.bites.get(bite.k)
      if (!plan) {
        const miss = mind.random() < BOT.misjudge ? (mind.random() < 0.5 ? -1 : 1) : 0
        const thinks = Math.max(0, Math.min(FISH.length - 1, bite.size + miss))
        const reaction = BOT.reaction[0] + mind.random() * (BOT.reaction[1] - BOT.reaction[0])
        plan = { take: thinks >= wantsAt(mind.greed, t), at: bite.start + reaction }
        mind.bites.set(bite.k, plan)
      }
      if (plan.take && t >= plan.at) pull(game, index)
      mind.quietAt = t
      return
    }
    // A quiet rod: once in a while, nerves.
    if (t - mind.quietAt >= 1) {
      mind.quietAt = t
      if (mind.random() < BOT.nerves && !bites.some((b) => hooked(b, t))) pull(game, index)
    }
  })
}
