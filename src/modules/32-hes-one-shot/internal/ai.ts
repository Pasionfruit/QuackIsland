/**
 * The stand-ins.
 *
 * A stand-in wanders the arena from one open spot to the next, looking where it
 * is going, and lurks at each for a moment, looking about. When somebody standing comes into view - in front of it, near
 * enough, with nothing in between - it turns to them, no faster than a person
 * turns, and once it has had them in its sights for a moment it shoots. Not
 * perfectly: every shot goes a little off where it meant, and further off for a
 * sloppier stand-in, so it misses at a distance and seldom up close. Its aim
 * steadies the longer it keeps somebody in its sights, so getting behind cover
 * is worth more than it looks: whoever comes back out is a stranger again.
 *
 * It walks slower while it has somebody in its sights, so it can be caught
 * standing about. Eliminated, it carries on hunting exactly the same way.
 *
 * Its own randomness comes from the seed. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { arenaFor, lineClear, openPoint, type Point } from './arena'
import { BODY, aimDirection, canAct, canShoot, eyeOf, fire, isStanding, walk, wrapAngle, type Game, type Player } from './rules'

export const BOT = {
  /** How far a stand-in sees, metres. */
  sight: 16,
  /** How wide it sees, radians either side of where it looks. */
  field: 0.8,
  /** How fast it turns, radians a second. */
  turn: 4,
  /** How long it has somebody in its sights before it shoots, seconds, quickest and slowest. */
  reaction: [0.6, 1.2] as readonly [number, number],
  /** How far off a shot goes, radians, the steadiest stand-in and the sloppiest, on somebody just sighted. */
  spread: [0.25, 0.4] as readonly [number, number],
  /** How long it takes to steady its aim on somebody it keeps in its sights, seconds, and how steady it gets. */
  settle: 3,
  steadiest: 0.35,
  /** How close to on target it has to be to shoot, radians. */
  onTarget: 0.06,
  /** How long it lurks at each spot it reaches, seconds, shortest and longest. */
  lurk: [1, 3.5] as readonly [number, number],
  /** Its pace as a share of a full walk, wandering and with somebody in its sights. */
  pace: 0.8,
  aiming: 0.35,
  /** Where on a body it aims: the chest. */
  chest: 1.2,
} as const

interface Mind {
  random: () => number
  reaction: number
  spread: number
  goal: Point
  /** Lurking where it is until then, in `elapsed`. */
  lurkUntil: number
  /** The way it looks about while it lurks. */
  lurkYaw: number
  /** When it last checked it was getting somewhere, and where it was then. */
  checkedAt: number
  checkedFrom: Point
  target: string | null
  /** Since when it has had its target in its sights. */
  since: number
  /** The clock it last ran at: a clock behind that is another game. */
  at: number
}

/** Keyed by game and stand-in, not held on the game, which the screen copies every frame. */
const minds = new Map<string, Mind>()

function mindFor(game: Game, bot: Player): Mind {
  const key = `${game.id}:${game.seed}:${bot.id}`
  let mind = minds.get(key)
  if (!mind || game.elapsed < mind.at) {
    const random = createRng(hashSeed(game.seed, `hes-one-shot:bot:${bot.id}`))
    const reaction = BOT.reaction[0] + random() * (BOT.reaction[1] - BOT.reaction[0])
    const spread = BOT.spread[0] + random() * (BOT.spread[1] - BOT.spread[0])
    mind = { random, reaction, spread, goal: { x: 0, z: 0 }, lurkUntil: 0, lurkYaw: 0, checkedAt: game.elapsed, checkedFrom: { x: bot.x, z: bot.z }, target: null, since: 0, at: game.elapsed }
    mind.goal = openPoint(arenaFor(game.seed), random, BODY.radius)
    minds.set(key, mind)
    if (minds.size > 64) minds.delete(minds.keys().next().value!)
  }
  mind.at = game.elapsed
  return mind
}

/** The yaw that looks from `from` towards `to`. */
export function yawTowards(from: Point, to: Point): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

/** Who a stand-in can see to shoot: the nearest standing player in front of it, in range, in the open. */
export function sightedBy(game: Game, index: number, keep: string | null): number {
  const bot = game.players[index]
  const arena = arenaFor(game.seed)
  let best = -1
  let bestDistance = Infinity
  game.players.forEach((p, i) => {
    if (i === index || !isStanding(p)) return
    const d = Math.hypot(p.x - bot.x, p.z - bot.z)
    if (d > BOT.sight || d >= bestDistance) return
    // Somebody already in its sights stays there while it turns; anybody else has to be in front.
    if (p.id !== keep && Math.abs(wrapAngle(yawTowards(bot, p) - bot.yaw)) > BOT.field) return
    if (!lineClear(arena, eyeOf(bot), { x: p.x, y: BOT.chest, z: p.z })) return
    best = i
    bestDistance = d
  })
  return best
}

/** Turns `from` towards `to` by at most `most`. */
function turnTowards(from: number, to: number, most: number): number {
  const d = wrapAngle(to - from)
  return wrapAngle(from + Math.max(-most, Math.min(most, d)))
}

/** Moves every stand-in on by `dt`: looks, turns, shoots, walks. */
export function botSteer(game: Game, dt: number): void {
  const step = Math.min(Math.max(dt, 0), 0.25)
  const arena = arenaFor(game.seed)
  game.players.forEach((bot, index) => {
    if (!bot.bot || !canAct(game, bot)) return
    const mind = mindFor(game, bot)

    const seen = sightedBy(game, index, mind.target)
    const target = seen >= 0 ? game.players[seen] : null
    if ((target?.id ?? null) !== mind.target) {
      mind.target = target?.id ?? null
      mind.since = game.elapsed
    }

    // Where it is headed: once it is there, lurk a while, then somewhere new; or somewhere new once it has stopped getting anywhere.
    const lurking = game.elapsed < mind.lurkUntil
    if (!lurking && Math.hypot(mind.goal.x - bot.x, mind.goal.z - bot.z) < 1) {
      mind.goal = openPoint(arena, mind.random, BODY.radius)
      mind.lurkUntil = game.elapsed + BOT.lurk[0] + mind.random() * (BOT.lurk[1] - BOT.lurk[0])
      mind.lurkYaw = wrapAngle(bot.yaw + (mind.random() * 2 - 1) * 2.5)
      mind.checkedAt = mind.lurkUntil
    }
    if (!lurking && game.elapsed - mind.checkedAt > 1.2) {
      if (Math.hypot(bot.x - mind.checkedFrom.x, bot.z - mind.checkedFrom.z) < 0.6) mind.goal = openPoint(arena, mind.random, BODY.radius)
      mind.checkedAt = game.elapsed
      mind.checkedFrom = { x: bot.x, z: bot.z }
    }

    if (target) {
      const d = Math.hypot(target.x - bot.x, target.z - bot.z)
      const wantYaw = yawTowards(bot, target)
      const wantPitch = Math.atan2(BOT.chest - BODY.eye, d)
      bot.yaw = turnTowards(bot.yaw, wantYaw, BOT.turn * step)
      bot.pitch = wantPitch
      const onTarget = Math.abs(wrapAngle(wantYaw - bot.yaw)) < BOT.onTarget
      if (onTarget && game.elapsed - mind.since >= mind.reaction && canShoot(game, bot)) {
        const { yaw, pitch } = bot
        // A little off, more often a little than a lot - and less off the longer it has had them in its sights.
        const tracked = Math.min(1, (game.elapsed - mind.since) / BOT.settle)
        const spread = mind.spread * (1 - (1 - BOT.steadiest) * tracked)
        bot.yaw = wrapAngle(yaw + (mind.random() + mind.random() - 1) * spread * 2)
        bot.pitch = pitch + (mind.random() + mind.random() - 1) * spread
        fire(game, index, true)
        bot.yaw = yaw
        bot.pitch = pitch
      }
    } else {
      bot.yaw = turnTowards(bot.yaw, lurking ? mind.lurkYaw : yawTowards(bot, mind.goal), (lurking ? 0.4 : 1) * BOT.turn * step)
      bot.pitch = 0
    }

    // Walk towards the goal, relative to where it looks.
    const gx = mind.goal.x - bot.x
    const gz = mind.goal.z - bot.z
    const gd = Math.hypot(gx, gz)
    if (gd > 1e-6 && game.elapsed >= mind.lurkUntil) {
      const pace = target ? BOT.aiming : BOT.pace
      const ahead = aimDirection(bot.yaw, 0)
      const forward = ((gx * ahead.x + gz * ahead.z) / gd) * pace
      const right = ((gx * -ahead.z + gz * ahead.x) / gd) * pace
      walk(game, index, { forward, right }, step)
    }
  })
}
