/**
 * The stand-ins.
 *
 * While the wheel spins a stand-in drifts about the middle of the arena, away
 * from the edge. When the colour comes up it takes a moment to see it, then
 * heads for the panel of that colour that is nearest and least crowded -
 * aiming for its middle - and stays there. Anybody standing close in front of
 * it may get a shove, more likely when they are near a gap or the edge; a
 * stand-in shoves more readily once the colour is up.
 *
 * Its own randomness comes from the seed. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { GRID, HALF, dealFor, panelAt, panelCentre, solid, when } from './arena'
import { PUSH, canAct, clock, cooldownLeft, isStanding, push, steer, wrapAngle, yawTowards, type Game, type Player } from './rules'

export const BOT = {
  /** Seconds to take in the colour, quickest and slowest. */
  reaction: [0.25, 0.7] as readonly [number, number],
  /** Its pace as a share of a full walk, wandering and making for the colour. */
  wander: 0.45,
  rush: 1,
  /** How often it looks for somebody to shove, seconds. */
  think: 0.35,
  /** The chance of a shove when somebody is there, the gentlest stand-in and the roughest, before the colour and after. */
  temper: [0.15, 0.45] as readonly [number, number],
  riled: 2.2,
  /** How close to the middle of a panel it is content to stand. */
  settle: 0.35,
} as const

interface Mind {
  random: () => number
  reaction: number
  temper: number
  goal: { x: number; z: number }
  goalFor: string
  thoughtAt: number
  at: number
}

const minds = new Map<string, Mind>()

function mindFor(game: Game, bot: Player): Mind {
  const key = `${game.id}:${game.seed}:${bot.id}`
  let mind = minds.get(key)
  if (!mind || game.elapsed < mind.at) {
    const random = createRng(hashSeed(game.seed, `color-coded:bot:${bot.id}`))
    mind = {
      random,
      reaction: BOT.reaction[0] + random() * (BOT.reaction[1] - BOT.reaction[0]),
      temper: BOT.temper[0] + random() * (BOT.temper[1] - BOT.temper[0]),
      goal: { x: bot.x, z: bot.z },
      goalFor: '',
      thoughtAt: 0,
      at: game.elapsed,
    }
    minds.set(key, mind)
    if (minds.size > 64) minds.delete(minds.keys().next().value!)
  }
  mind.at = game.elapsed
  return mind
}

/** The panel of the round's colour a stand-in makes for: near, and not crowded. */
export function bestPanel(game: Game, index: number): number {
  const bot = game.players[index]
  const deal = dealFor(game.seed, when(clock(game)).round)
  let best = -1
  let bestScore = Infinity
  deal.panels.forEach((c, i) => {
    if (c !== deal.colour) return
    const m = panelCentre(i)
    const crowd = game.players.filter((p, k) => k !== index && isStanding(p) && panelAt(p.x, p.z) === i).length
    const score = Math.hypot(m.x - bot.x, m.z - bot.z) + crowd * 2.5
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}

/** Moves every stand-in on: where to, which way to face, and whether to shove. */
export function botSteer(game: Game): void {
  const w = when(clock(game))
  game.players.forEach((bot, index) => {
    if (!bot.bot || !canAct(game, bot)) return
    const mind = mindFor(game, bot)
    const seen = w.phase !== 'spin' && !(w.phase === 'reveal' && w.t < mind.reaction)
    let pace: number = BOT.wander

    if (seen) {
      // On the colour, as near its middle as it can get.
      const key = `${w.round}:panel`
      if (mind.goalFor !== key || game.elapsed - mind.thoughtAt > 0.6) {
        const panel = bestPanel(game, index)
        if (panel >= 0) {
          const m = panelCentre(panel)
          const spread = (GRID.cell / 2 - 0.6) * 0.6
          mind.goal = { x: m.x + (mind.random() * 2 - 1) * spread, z: m.z + (mind.random() * 2 - 1) * spread }
        }
        mind.goalFor = key
      }
      pace = BOT.rush
    } else if (mind.goalFor !== `${w.round}:wander` || Math.hypot(mind.goal.x - bot.x, mind.goal.z - bot.z) < 0.5) {
      // Drifting about the middle, well in from the edge.
      const reach = HALF * 0.55
      mind.goal = { x: (mind.random() * 2 - 1) * reach, z: (mind.random() * 2 - 1) * reach }
      mind.goalFor = `${w.round}:wander`
    }

    const dx = mind.goal.x - bot.x
    const dz = mind.goal.z - bot.z
    const d = Math.hypot(dx, dz)
    // Never a step onto nothing, once panels have gone.
    const next = { x: bot.x + (dx / Math.max(d, 1e-6)) * 0.5, z: bot.z + (dz / Math.max(d, 1e-6)) * 0.5 }
    const safe = solid(game.seed, clock(game), panelAt(next.x, next.z))
    const moving = d > BOT.settle && safe
    const scale = moving ? Math.min(1, d) * pace : 0
    let yaw = moving ? yawTowards(bot, mind.goal) : bot.yaw

    // A shove for whoever is close in front - more likely if they are near a way down.
    if (game.elapsed - mind.thoughtAt >= BOT.think && cooldownLeft(game, bot) <= 0) {
      mind.thoughtAt = game.elapsed
      let target: Player | null = null
      let targetD = Infinity
      for (const p of game.players) {
        if (p === bot || !isStanding(p)) continue
        const pd = Math.hypot(p.x - bot.x, p.z - bot.z)
        if (pd < PUSH.reach * 0.95 && pd < targetD) {
          target = p
          targetD = pd
        }
      }
      if (target) {
        const toward = yawTowards(bot, target)
        const beyond = { x: target.x + (target.x - bot.x) / targetD * 2.5, z: target.z + (target.z - bot.z) / targetD * 2.5 }
        const drop = !solid(game.seed, clock(game) + 1, panelAt(beyond.x, beyond.z)) || panelAt(beyond.x, beyond.z) < 0
        const chance = mind.temper * (seen ? BOT.riled : 1) * (drop ? 1.6 : 0.6)
        if (mind.random() < chance) {
          steer(game, index, 0, 0, toward)
          push(game, index)
          yaw = toward
        }
      }
    }
    steer(game, index, moving ? (dx / d) * scale : 0, moving ? (dz / d) * scale : 0, wrapAngle(yaw))
  })
}
