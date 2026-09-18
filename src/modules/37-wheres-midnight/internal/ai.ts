/**
 * What the stand-ins do.
 *
 * A search alone wants somebody to race. Each stand-in has a plan from the
 * seed: a couple of wrong clicks on junk, then a find at some moment between a
 * quarter of a minute and the end - and one in five never finds him at all.
 * Every click goes through `select` like anybody's, aimed at junk or at him
 * head, so a stand-in's find is a real find.
 */
import { createRng, hashSeed } from '../../00-core'
import { SEARCH, select, type Game } from './rules'
import type { Vec3 } from './view'
import { look, toward, yardFor } from './yard'

/** The earliest and latest a stand-in finds him, in round seconds. */
export const BOT_FIND = [18, 85] as const
/** How many stand-ins, in a hundred, never find him. */
export const BOT_NEVER = 0.2

export interface BotClick {
  at: number
  kind: 'miss' | 'find'
}

/** A stand-in's clicks for a round, in order. */
export function botPlan(seed: number, id: string): BotClick[] {
  const random = createRng(hashSeed(seed, `wheres-midnight:bot:${id}`))
  const findAt = random() < BOT_NEVER ? Infinity : BOT_FIND[0] + random() * (BOT_FIND[1] - BOT_FIND[0])
  const misses = Array.from({ length: Math.floor(random() * 3) }, () => 4 + random() * (Math.min(findAt, SEARCH.duration) - 6))
    .filter((at) => at > 0)
    .sort((a, b) => a - b)
  return [...misses.map((at): BotClick => ({ at, kind: 'miss' })), ...(findAt < Infinity ? [{ at: findAt, kind: 'find' as const }] : [])]
}

const SKY: Vec3 = { x: 0, y: 1, z: 0 }

/** Where a stand-in's wrong click goes: at a piece of junk, or at the sky if that piece happens to have him in front of it. */
function missAim(seed: number, step: number, id: string): Vec3 {
  const yard = yardFor(seed)
  const random = createRng(hashSeed(seed, `wheres-midnight:bot:${id}:miss:${step}`))
  const target = yard.boxes[Math.floor(random() * yard.boxes.length)]
  const dir = toward({ x: target.x, y: target.y, z: target.z })
  return look(yard, dir) === 'midnight' ? SKY : dir
}

/** Runs every stand-in's due clicks. A click the cooldown swallows is tried again next frame. */
export function botClicks(game: Game): void {
  if (game.over) return
  for (const [index, bot] of game.players.entries()) {
    if (!bot.bot || bot.foundAt !== null) continue
    const next = botPlan(game.seed, bot.id)[bot.botStep]
    if (!next || next.at > game.elapsed) continue
    const dir = next.kind === 'find' ? toward(yardFor(game.seed).midnight.points[0]) : missAim(game.seed, bot.botStep, bot.id)
    if (select(game, index, dir) !== 'ignored') bot.botStep += 1
  }
}
