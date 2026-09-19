/**
 * The stand-ins.
 *
 * A stand-in reads the number, works out which side is marked, and votes after
 * a moment's thought. It cannot see anybody else's vote, so it reasons as if
 * everybody else votes 1:
 *
 * - **Marked** - its own side goes if nothing changes - it votes 0, to turn the
 *   gear one side less.
 * - **Next in line** - the side a single 0 would bring round - it votes 1, and
 *   hopes.
 * - **Anybody else** mostly votes 1, and now and then 0 to stir things up.
 *
 * Its mind can change: a stand-in may vote once, then change it before the end.
 * It wanders its side while it thinks. All from the seed. Only runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { GEAR, PHASES, canVote, canWalk, clock, markedSide, mod, numberFor, onSide, place, sideOf, vote, voteEnds, when, type Game } from './rules'

export const BOT = {
  /** When it first votes, seconds into the vote, earliest and latest. */
  first: [0.8, 3.2] as readonly [number, number],
  /** The chance it changes its mind before the end. */
  change: 0.25,
  /** The chance a stand-in with nothing at stake votes 0 anyway. */
  stir: 0.2,
  /** How fast it wanders, metres a second. */
  pace: 1.6,
} as const

interface Mind {
  random: () => number
  round: number
  firstAt: number
  changeAt: number | null
  goal: { x: number; z: number } | null
  /** The clock it last ran at: a clock behind that is the same game dealt again. */
  at: number
}

const minds = new Map<string, Mind>()

function mindFor(game: Game, id: string): Mind {
  const key = `${game.id}:${game.seed}:${id}`
  let mind = minds.get(key)
  if (!mind || game.elapsed < mind.at) {
    mind = { random: createRng(hashSeed(game.seed, `binary-bs:bot:${id}`)), round: 0, firstAt: 0, changeAt: null, goal: null, at: game.elapsed }
    minds.set(key, mind)
    if (minds.size > 64) minds.delete(minds.keys().next().value!)
  }
  mind.at = game.elapsed
  return mind
}

/** What a stand-in on `side` of `sides` would vote for `number`, before any bluffing. */
export function wantedVote(number: number, sides: number, side: number): 0 | 1 {
  const marked = markedSide(number, sides)
  if (side === marked) return 0
  return 1
}

/** Every stand-in thinks, votes, and wanders its side. */
export function botSteer(game: Game, dt: number): void {
  const t = clock(game)
  const w = when(t)
  game.players.forEach((bot, index) => {
    if (!bot.bot) return
    const mind = mindFor(game, bot.id)
    const side = sideOf(game, index)
    if (side < 0) return
    const sides = game.seats.length
    if (mind.round !== game.round) {
      mind.round = game.round
      const start = voteEnds(game.round) - PHASES.vote
      mind.firstAt = start + BOT.first[0] + mind.random() * (BOT.first[1] - BOT.first[0])
      mind.changeAt = mind.random() < BOT.change ? mind.firstAt + 0.5 + mind.random() * (voteEnds(game.round) - mind.firstAt - 0.8) : null
      mind.goal = null
    }
    if (canVote(game, index)) {
      const number = numberFor(game.seed, game.round)
      const marked = markedSide(number, sides)
      const nextInLine = mod(marked - 1, sides)
      if (bot.vote === null && t >= mind.firstAt) {
        let v = wantedVote(number, sides, side)
        if (side !== marked && side !== nextInLine && mind.random() < BOT.stir) v = 0
        vote(game, index, v)
      } else if (bot.vote !== null && mind.changeAt !== null && t >= mind.changeAt) {
        // Second thoughts - only ever away from trouble, never into it.
        mind.changeAt = null
        if (side !== marked && side !== nextInLine) vote(game, index, bot.vote === 0 ? 1 : 0)
      }
    }
    if (canWalk(game, index) && w.phase === 'vote') {
      if (!mind.goal || Math.hypot(mind.goal.x - bot.x, mind.goal.z - bot.z) < 0.3) {
        const r = GEAR.hub + 0.8 + mind.random() * (GEAR.rim - GEAR.hub - 1.6)
        mind.goal = onSide(side, sides, r, (mind.random() * 2 - 1) * (Math.PI / sides) * 0.6)
      }
      const dx = mind.goal.x - bot.x
      const dz = mind.goal.z - bot.z
      const d = Math.hypot(dx, dz)
      const step = Math.min(d, BOT.pace * Math.min(Math.max(dt, 0), 0.1))
      if (d > 1e-6) place(game, index, { x: bot.x + (dx / d) * step, z: bot.z + (dz / d) * step })
    }
  })
}
