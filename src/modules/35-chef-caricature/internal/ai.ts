/**
 * The stand-ins.
 *
 * A stand-in at the easel does what a careful person does: it studies the new
 * outline for a moment, puts the pen down somewhere on it and follows it round,
 * a little wobbly, at its own steady pace, until the duck takes it. Now and then
 * its hand slips and it lets go, and has to start that outline again.
 *
 * Everything it does is worked out from the seed. Only ever runs on the host,
 * through the same pen as everybody else.
 */
import { createRng, hashSeed } from '../../00-core'
import { pointAlong, type Outline } from './outlines'
import { currentOutline, drawer, penDown, penMove, penUp, phase, type Game } from './rules'

export const BOT = {
  /** How fast it traces, board units a second, the slowest stand-in and the quickest. */
  speed: [0.75, 1.1] as readonly [number, number],
  /** How long it looks at a new outline before it starts. */
  pause: [0.5, 1.1] as readonly [number, number],
  /** How far its hand wanders off the line, at most. */
  wobble: [0.012, 0.035] as readonly [number, number],
  /** The chance an attempt slips, somewhere in its first two thirds. */
  slip: 0.14,
} as const

/** How a stand-in goes about attempt `attempt` at outline `k`. */
export function botPlan(seed: number, id: string, k: number, attempt: number) {
  const own = createRng(hashSeed(seed, `chef-caricature:bot:${id}`))
  const speed = BOT.speed[0] + own() * (BOT.speed[1] - BOT.speed[0])
  const random = createRng(hashSeed(seed, `chef-caricature:bot:${id}:${k}:${attempt}`))
  return {
    speed,
    pause: BOT.pause[0] + random() * (BOT.pause[1] - BOT.pause[0]),
    wobble: BOT.wobble[0] + random() * (BOT.wobble[1] - BOT.wobble[0]),
    wave: 5 + random() * 6,
    shift: random() * Math.PI * 2,
    from: random(),
    way: random() < 0.5 ? 1 : -1,
    /** How far round it gets before it slips, as a share of the outline, or null. */
    slipAt: random() < BOT.slip ? 0.1 + random() * 0.55 : null,
  }
}

interface Mind {
  outline: number
  attempt: number
  readyAt: number
  drawn: number
  at: number
}

/** Keyed by game, turn and stand-in, not held on the game, which the screen copies every frame. */
const minds = new Map<string, Mind>()

/** Where the pen is, `drawn` round the outline from where the attempt started, wobble and all. */
function penAt(outline: Outline, plan: ReturnType<typeof botPlan>, drawn: number) {
  const d = plan.from * outline.length + plan.way * drawn
  const p = pointAlong(outline, d)
  const a = pointAlong(outline, d - 0.02)
  const b = pointAlong(outline, d + 0.02)
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const off = plan.wobble * Math.sin(drawn * plan.wave + plan.shift)
  return { x: p.x + (-(b.y - a.y) / len) * off, y: p.y + ((b.x - a.x) / len) * off }
}

/** The stand-in at the easel, if it is one, draws for `dt`. */
export function botDraw(game: Game, dt: number): void {
  const index = drawer(game)
  const bot = game.players[index]
  if (!bot?.bot || bot.left || phase(game) !== 'drawing') return
  const key = `${game.id}:${game.seed}:${game.turn}:${bot.id}`
  let mind = minds.get(key)
  if (!mind || game.elapsed < mind.at) {
    mind = { outline: -1, attempt: 0, readyAt: 0, drawn: 0, at: game.elapsed }
    minds.set(key, mind)
    if (minds.size > 64) minds.delete(minds.keys().next().value!)
  }
  mind.at = game.elapsed
  if (mind.outline !== game.outline) {
    // A new outline: lift the pen, and look at it for a moment.
    penUp(game, index)
    mind.outline = game.outline
    mind.attempt = 0
    mind.readyAt = game.elapsed + botPlan(game.seed, bot.id, game.outline, 0).pause
  }
  const outline = currentOutline(game)
  const plan = botPlan(game.seed, bot.id, game.outline, mind.attempt)
  if (!game.stroke) {
    if (game.elapsed < mind.readyAt) return
    mind.drawn = 0
    const start = penAt(outline, plan, 0)
    penDown(game, index, start.x, start.y)
    return
  }
  let left = plan.speed * Math.min(Math.max(dt, 0), 0.25)
  while (left > 1e-9) {
    const step = Math.min(left, 0.03)
    left -= step
    mind.drawn += step
    const p = penAt(outline, plan, mind.drawn)
    if (penMove(game, index, p.x, p.y) === 'accepted') return
    const slipped = plan.slipAt !== null && mind.drawn >= plan.slipAt * outline.length
    if (slipped || mind.drawn > outline.length * 1.3) {
      penUp(game, index)
      mind.attempt += 1
      mind.readyAt = game.elapsed + 0.6
      return
    }
  }
}
