/**
 * The stand-ins.
 *
 * A stand-in does what you do. **It searches**: it only knows where one of its
 * pieces is once it has seen it - near enough, with nothing in the way - and
 * until then it wanders the office from one open spot to the next. It walks to
 * the nearest piece it knows of, picks it up, carries it home and puts it on its
 * desk, one at a time, finding its way round the furniture.
 *
 * Armed, **it hunts**: it heads for the nearest person standing, and once it has
 * them in the open it turns to them, no faster than a person turns, and fires
 * when it has had them in its sights for a moment. It will not fire at anybody
 * so near that the blast would take it too, and it backs off from them instead -
 * but its aim is not perfect, and a rocket that goes a little wide can still
 * clip the corner of a desk beside it.
 *
 * Its own randomness comes from the seed. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { lineClear, officeFor, openPoint, route, type Point } from './office'
import {
  BLAST,
  BODY,
  ROCKET,
  LOOSE,
  REACH,
  aimDirection,
  atDesk,
  canAct,
  canFire,
  deskOf,
  fire,
  isArmed,
  isStanding,
  pickUp,
  piecesOf,
  place,
  rocketTouch,
  walk,
  wrapAngle,
  yawTowards,
  type Game,
  type Player,
} from './rules'

export const BOT = {
  /** How far a stand-in sees one of its pieces, metres. */
  sight: 9,
  /** How far it will fire at somebody. */
  range: 18,
  /** How fast it turns, radians a second. */
  turn: 5,
  /** How long it has somebody in its sights before it fires, seconds, quickest and slowest. */
  reaction: [0.5, 1.1] as readonly [number, number],
  /** How far off a rocket goes, radians, the steadiest stand-in and the sloppiest. */
  spread: [0.05, 0.16] as readonly [number, number],
  /** How close to on target it has to be to fire, radians. */
  onTarget: 0.08,
  /** Its pace as a share of a full walk. */
  pace: 0.82,
  /** How near anybody it will stand, armed: the blast, and a step more. */
  wary: BLAST.radius + 1.2,
} as const

interface Mind {
  random: () => number
  reaction: number
  spread: number
  /** Its pieces it has seen, by index. */
  known: Set<number>
  /** Where it is going, and the way there. */
  goal: Point
  way: Point[]
  plannedAt: number
  plannedFor: Point
  /** Wandering: where to, when nothing better is known. */
  wander: Point
  checkedAt: number
  checkedFrom: Point
  target: string | null
  since: number
  at: number
}

/** Keyed by game and stand-in, not held on the game, which the screen copies every frame. */
const minds = new Map<string, Mind>()

function mindFor(game: Game, bot: Player): Mind {
  const key = `${game.id}:${game.seed}:${bot.id}`
  let mind = minds.get(key)
  if (!mind || game.elapsed < mind.at) {
    const random = createRng(hashSeed(game.seed, `i-just-work-here:bot:${bot.id}`))
    const office = officeFor(game.seed)
    mind = {
      random,
      reaction: BOT.reaction[0] + random() * (BOT.reaction[1] - BOT.reaction[0]),
      spread: BOT.spread[0] + random() * (BOT.spread[1] - BOT.spread[0]),
      known: new Set(),
      goal: { x: bot.x, z: bot.z },
      way: [],
      plannedAt: -Infinity,
      plannedFor: { x: Infinity, z: Infinity },
      wander: openPoint(office, random, BODY.radius),
      checkedAt: game.elapsed,
      checkedFrom: { x: bot.x, z: bot.z },
      target: null,
      since: 0,
      at: game.elapsed,
    }
    minds.set(key, mind)
    if (minds.size > 64) minds.delete(minds.keys().next().value!)
  }
  mind.at = game.elapsed
  return mind
}

/** Turns `from` towards `to` by at most `most`. */
function turnTowards(from: number, to: number, most: number): number {
  const d = wrapAngle(to - from)
  return wrapAngle(from + Math.max(-most, Math.min(most, d)))
}

/** Who an armed stand-in could fire at: the nearest person standing, in range, in the open. */
export function sightedBy(game: Game, index: number): number {
  const bot = game.players[index]
  const office = officeFor(game.seed)
  let best = -1
  let bestD = Infinity
  game.players.forEach((p, i) => {
    if (i === index || !isStanding(p)) return
    const d = Math.hypot(p.x - bot.x, p.z - bot.z)
    if (d > BOT.range || d >= bestD) return
    // A clear line as wide as a rocket, so what it has in its sights is what it would hit.
    if (!lineClear(office, bot, p, ROCKET.radius + 0.05)) return
    best = i
    bestD = d
  })
  return best
}

/** Whether a rocket fired from where a stand-in stands, this way, would burst too near it. */
export function wouldHitSelf(game: Game, index: number, yaw: number): boolean {
  const bot = game.players[index]
  const { t } = rocketTouch(game, index, bot, aimDirection(yaw), BLAST.radius + 0.6)
  return t < BLAST.radius + 0.6 - 1e-9
}

/** Moves every stand-in on by `dt`: looks, picks up, carries, places, hunts, fires, walks. */
export function botSteer(game: Game, dt: number): void {
  const step = Math.min(Math.max(dt, 0), 0.25)
  const office = officeFor(game.seed)
  game.players.forEach((bot, index) => {
    if (!bot.bot || !canAct(game, bot)) return
    const mind = mindFor(game, bot)
    let face: number | null = null
    let pace = BOT.pace

    if (!isArmed(game, index)) {
      mind.target = null
      // What it can see of its own, it now knows about.
      for (const i of piecesOf(game, index)) {
        const piece = game.pieces[i]
        if (piece.state === LOOSE && Math.hypot(piece.x - bot.x, piece.z - bot.z) <= BOT.sight && lineClear(office, bot, piece)) mind.known.add(i)
      }
      if (bot.carrying >= 0) {
        if (atDesk(game, index)) place(game, index)
        mind.goal = deskOf(game, index).spot
      } else {
        let nearest = -1
        let nearestD = Infinity
        for (const i of mind.known) {
          const piece = game.pieces[i]
          if (piece.state !== LOOSE) continue
          const d = Math.hypot(piece.x - bot.x, piece.z - bot.z)
          if (d < nearestD) {
            nearest = i
            nearestD = d
          }
        }
        if (nearest >= 0 && nearestD <= REACH.piece) pickUp(game, index, nearest)
        else if (nearest >= 0) mind.goal = game.pieces[nearest]
        else {
          if (Math.hypot(mind.wander.x - bot.x, mind.wander.z - bot.z) < 1) mind.wander = openPoint(office, mind.random, BODY.radius)
          mind.goal = mind.wander
        }
      }
    } else {
      const seen = sightedBy(game, index)
      const target = seen >= 0 ? game.players[seen] : null
      if ((target?.id ?? null) !== mind.target) {
        mind.target = target?.id ?? null
        mind.since = game.elapsed
      }
      if (target) {
        const d = Math.hypot(target.x - bot.x, target.z - bot.z)
        const want = yawTowards(bot, target)
        face = want
        bot.yaw = turnTowards(bot.yaw, want, BOT.turn * step)
        if (d < BOT.wary) {
          // Too near to fire: back off, away from them.
          const away = aimDirection(want + Math.PI)
          mind.goal = { x: bot.x + away.x * 3, z: bot.z + away.z * 3 }
        } else {
          // Close in from afar; hold still to fire - but not for ever, if something keeps spoiling the shot.
          const waited = game.elapsed - mind.since > mind.reaction + 2.5
          mind.goal = d > 11 || waited ? { x: target.x, z: target.z } : { x: bot.x, z: bot.z }
          pace = BOT.pace * 0.6
          const onTarget = Math.abs(wrapAngle(want - bot.yaw)) < BOT.onTarget
          if (onTarget && game.elapsed - mind.since >= mind.reaction && canFire(game, index) && !wouldHitSelf(game, index, bot.yaw)) {
            const yaw = bot.yaw
            bot.yaw = wrapAngle(yaw + (mind.random() + mind.random() - 1) * mind.spread * 2)
            fire(game, index, true)
            bot.yaw = yaw
          }
        }
      } else {
        // Nobody in the open: towards whoever is nearest.
        let nearest: Player | null = null
        for (const p of game.players) {
          if (p === bot || !isStanding(p)) continue
          if (!nearest || Math.hypot(p.x - bot.x, p.z - bot.z) < Math.hypot(nearest.x - bot.x, nearest.z - bot.z)) nearest = p
        }
        if (nearest) mind.goal = { x: nearest.x, z: nearest.z }
      }
    }

    // Stuck: somewhere new to wander, and a new way.
    if (game.elapsed - mind.checkedAt > 1.5) {
      if (Math.hypot(bot.x - mind.checkedFrom.x, bot.z - mind.checkedFrom.z) < 0.4 && Math.hypot(mind.goal.x - bot.x, mind.goal.z - bot.z) > 1) {
        mind.wander = openPoint(office, mind.random, BODY.radius)
        mind.plannedAt = -Infinity
      }
      mind.checkedAt = game.elapsed
      mind.checkedFrom = { x: bot.x, z: bot.z }
    }

    // The way there, planned again when the goal moves or every so often.
    if (game.elapsed - mind.plannedAt > 0.8 || Math.hypot(mind.goal.x - mind.plannedFor.x, mind.goal.z - mind.plannedFor.z) > 1) {
      mind.way = route(office, bot, mind.goal, BODY.radius)
      mind.plannedAt = game.elapsed
      mind.plannedFor = { x: mind.goal.x, z: mind.goal.z }
    }
    while (mind.way.length > 1 && Math.hypot(mind.way[0].x - bot.x, mind.way[0].z - bot.z) < 0.35) mind.way.shift()
    const next = mind.way[0]
    if (next) {
      const dx = next.x - bot.x
      const dz = next.z - bot.z
      const d = Math.hypot(dx, dz)
      if (d > 0.15) {
        walk(game, index, { x: (dx / d) * pace, z: (dz / d) * pace }, step)
        if (face === null) face = Math.atan2(-dx, -dz)
      }
    }
    if (face !== null && mind.target === null) bot.yaw = turnTowards(bot.yaw, face, BOT.turn * step)
  })
}
