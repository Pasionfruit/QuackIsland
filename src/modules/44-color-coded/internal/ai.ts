/**
 * The stand-ins.
 *
 * While the wheel spins a stand-in drifts about the middle of the arena, away
 * from the edge. When the colour comes up it takes a moment to see it, then
 * makes for the panel of that colour that is nearest and least crowded - aiming
 * for its middle - and stays there. **It runs when it has a long way to go and
 * walks the last of it**, because a runner cannot turn or stop on ice and a
 * stand-in that ran all the way in would slide off the far side.
 *
 * It steers the way anybody has to on ice: the speed it asks for is proportional
 * to how far it has to go, so it eases in and stops on the spot rather than
 * sliding through; and if the way ahead, where it would slide to, is nothing, it
 * asks for the opposite of the speed it has and stops.
 *
 * **It charges**: somebody close by, with a way down behind them, may be run at -
 * more likely once the colour is up, and by a rougher stand-in. A charge is a run at
 * them for a moment, which is all a collision needs, and **once it is up against
 * them it pushes** as well, now and then.
 *
 * Its own randomness comes from the seed. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { GRID, HALF, dealFor, panelAt, panelCentre, solid, when } from './arena'
import { BODY, PUSH, canAct, clock, isStanding, push, speedOf, steer, wrapAngle, yawTowards, type Game, type Player } from './rules'

export const BOT = {
  /** Seconds to take in the colour, quickest and slowest. */
  reaction: [0.25, 0.7] as readonly [number, number],
  /**
   * How much speed, metres a second, a stand-in asks for a metre from where it is
   * going: less than a body's grip, so it comes in without overshooting.
   */
  approach: 2.2,
  /** Its pace as a share of a walk while it wanders. */
  wander: 0.45,
  /** It runs when the goal is further than this, metres, and the colour is up. */
  runFrom: 3.5,
  /** How often it looks for somebody to charge, seconds. */
  think: 0.35,
  /** The chance of a charge when somebody is there, the gentlest stand-in and the roughest, before the colour and after. */
  temper: [0.15, 0.45] as readonly [number, number],
  riled: 2.2,
  /** How close to the middle of a panel it is content to stand. */
  settle: 0.3,
  /** How far off it will pick somebody to charge, metres, and how long the charge lasts, seconds. */
  charge: 3.6,
  chargeFor: 0.7,
  /** Once the colour is up, how close to its panel a stand-in has to be before it will spare a moment to charge, metres. */
  spare: 2,
  /** The chance, each step it is up against the one it is charging, that it pushes. */
  shove: 0.03,
  /** How far ahead, in seconds of the speed it has, it looks for nothing under it. */
  lookahead: 0.5,
} as const

interface Mind {
  random: () => number
  reaction: number
  temper: number
  goal: { x: number; z: number }
  goalFor: string
  thoughtAt: number
  /** Who it is charging, and until when. */
  charging: { index: number; until: number } | null
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
      charging: null,
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

/** Moves every stand-in on: where to, how fast, which way to face, and whether to run at somebody. */
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
      // From the drop on, the panels that are gone stay gone: it stays where it is if that is one that is still there.
      const here = panelAt(bot.x, bot.z)
      const stay = (w.phase === 'drop' || w.phase === 'rebuild') && solid(game.seed, clock(game), here)
      if (mind.goalFor !== key || game.elapsed - mind.thoughtAt > 0.6) {
        const panel = stay ? here : bestPanel(game, index)
        if (panel >= 0) {
          const m = panelCentre(panel)
          const spread = (GRID.cell / 2 - 0.6) * 0.6
          mind.goal = { x: m.x + (mind.random() * 2 - 1) * spread, z: m.z + (mind.random() * 2 - 1) * spread }
        }
        mind.goalFor = key
      }
      pace = 1
    } else if (mind.goalFor !== `${w.round}:wander` || Math.hypot(mind.goal.x - bot.x, mind.goal.z - bot.z) < 0.5) {
      // Drifting about the middle, well in from the edge.
      const reach = HALF * 0.55
      mind.goal = { x: (mind.random() * 2 - 1) * reach, z: (mind.random() * 2 - 1) * reach }
      mind.goalFor = `${w.round}:wander`
    }

    // A charge at whoever is close by and near a way down - which is not the panel it is making for.
    if (mind.charging && (game.elapsed >= mind.charging.until || !isStanding(game.players[mind.charging.index]))) mind.charging = null
    // Only when it can spare the time: once the colour is up, a stand-in still on its way charges nobody.
    const settled = !seen || Math.hypot(mind.goal.x - bot.x, mind.goal.z - bot.z) < BOT.spare
    if (!mind.charging && game.elapsed - mind.thoughtAt >= BOT.think && settled) {
      mind.thoughtAt = game.elapsed
      let target = -1
      let targetD = Infinity
      game.players.forEach((p, i) => {
        if (p === bot || !isStanding(p)) return
        const pd = Math.hypot(p.x - bot.x, p.z - bot.z)
        if (pd < BOT.charge && pd < targetD) {
          target = i
          targetD = pd
        }
      })
      if (target >= 0) {
        const rival = game.players[target]
        const beyond = { x: rival.x + ((rival.x - bot.x) / targetD) * 2.5, z: rival.z + ((rival.z - bot.z) / targetD) * 2.5 }
        const drop = !solid(game.seed, clock(game) + 1, panelAt(beyond.x, beyond.z)) || panelAt(beyond.x, beyond.z) < 0
        const chance = mind.temper * (seen ? BOT.riled : 1) * (drop ? 1.6 : 0.6)
        if (mind.random() < chance) mind.charging = { index: target, until: game.elapsed + BOT.chargeFor }
      }
    }

    let goal = mind.goal
    let run = false
    if (mind.charging) {
      // Run at where they are about to be.
      const rival = game.players[mind.charging.index]
      goal = { x: rival.x + rival.vx * 0.15, z: rival.z + rival.vz * 0.15 }
      run = true
      pace = 1
    }

    const dx = goal.x - bot.x
    const dz = goal.z - bot.z
    const d = Math.hypot(dx, dz)
    if (!mind.charging && seen && d > BOT.runFrom) run = true
    const top = run ? BODY.run : BODY.walk
    // Never a slide onto nothing, once panels have gone: if it would end up over a gap or the edge, stop.
    const speed = speedOf(bot)
    const ahead = { x: bot.x + bot.vx * BOT.lookahead, z: bot.z + bot.vz * BOT.lookahead }
    const towards = { x: bot.x + (dx / Math.max(d, 1e-6)) * 0.6, z: bot.z + (dz / Math.max(d, 1e-6)) * 0.6 }
    // Along the whole slide, not just its end: two right panels that only touch at a corner are a way through for the end and not for the middle.
    const safe =
      solid(game.seed, clock(game), panelAt(towards.x, towards.z)) &&
      [0.25, 0.5, 0.75, 1].every((f) => solid(game.seed, clock(game), panelAt(bot.x + (ahead.x - bot.x) * f, bot.z + (ahead.z - bot.z) * f)))
    let mx = 0
    let mz = 0
    let yaw = bot.yaw
    if (!safe) {
      // Ask for the opposite of the speed it has, so it comes to a stop.
      mx = -bot.vx / BODY.walk
      mz = -bot.vz / BODY.walk
      run = false
    } else if (d > BOT.settle || mind.charging) {
      const want = Math.min(1, (BOT.approach * d) / top) * pace
      mx = (dx / Math.max(d, 1e-6)) * want
      mz = (dz / Math.max(d, 1e-6)) * want
      yaw = yawTowards(bot, goal)
    } else if (speed > 0.3) {
      // Arrived, and still sliding: brake.
      mx = -bot.vx / BODY.walk
      mz = -bot.vz / BODY.walk
    }
    steer(game, index, mx, mz, wrapAngle(yaw), run)
    // Up against the one it is charging: a push, now and then.
    if (mind.charging) {
      const rival = game.players[mind.charging.index]
      if (Math.hypot(rival.x - bot.x, rival.z - bot.z) < PUSH.reach - 0.3 && mind.random() < BOT.shove) push(game, index)
    }
  })
}
