/**
 * The rocks that are actually on this island.
 *
 * Kept apart from `rocks.ts` so the scatter maths stays pure and testable
 * against any ground you like, while this is the one place that knows about
 * the real island, the real seed, and holds the one answer.
 *
 * Built once and cached, because there must be exactly one answer to where the
 * rocks are: the mesh draws them and the collision stops you walking through
 * them. Two scatters with the same seed would agree today and are still two
 * sources of truth waiting to disagree.
 */
import { CONVENTIONS, createRng, hashSeed } from '../../00-core'
import { heightAt, slopeAt, worldBounds } from '../../01-terrain'
import { solidify, type SolidRock } from './collide'
import { scatterRocks, type Rock } from './rocks'

let rocks: Rock[] | null = null
let solids: SolidRock[] | null = null

export function getRocks(): readonly Rock[] {
  if (!rocks) {
    const bounds = worldBounds()
    rocks = scatterRocks(
      { heightAt, slopeAt },
      {
        reach: Math.min(bounds.maxX, bounds.maxZ),
        random: createRng(hashSeed(CONVENTIONS.worldSeed, 'rocks')),
      },
    )
  }
  return rocks
}

/**
 * The same rocks, with their collision shapes worked out.
 *
 * Also once: `halfExtents` is six trigonometric calls and three square roots
 * per rock, and doing that for four hundred rocks inside the movement step
 * would be the most expensive thing in the frame by a wide margin.
 */
export function getSolidRocks(): readonly SolidRock[] {
  if (!solids) solids = solidify(getRocks())
  return solids
}
