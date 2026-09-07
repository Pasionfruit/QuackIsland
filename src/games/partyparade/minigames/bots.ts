/**
 * Stand-in players, so one person can see what a minigame actually feels like
 * with a full room of eight without rounding up seven friends first.
 *
 * They are not meant to be good. Each one plays its game plausibly - runs from
 * the zombies, jumps the rope, takes a photograph roughly on time - with
 * enough wobble between them that the scoreboard is not a tie every round.
 * This is a testing aid that happens to be fun to leave in.
 */
import type { AnyMinigame } from './index'
import { CHIP_TARGET, JUMBO_AIR, LENS } from './index'
import { FIELD, IDLE_INPUT, type MgInput } from './types'

/** Cheap per-bot wobble, so eight of them do not act as one. */
function jitter(slot: number, frame: number, period: number): boolean {
  return (frame + slot * 37) % period < period / 2
}

export function botInput(game: AnyMinigame, slot: number, frame: number): MgInput {
  const i: MgInput = { ...IDLE_INPUT }
  const skill = 0.55 + ((slot * 7) % 5) * 0.09

  switch (game.id) {
    case 'reaction': {
      // Presses a beat after the flag, later for the worse ones. Occasionally
      // jumps the gun, which is what makes watching them worthwhile.
      const early = slot % 5 === 3 && !game.armed && frame % 211 === 0
      const delay = 6 + Math.round((1 - skill) * 22)
      i.press = early || (game.armed && frame - game.goFrame > delay && frame - game.goFrame < delay + 4)
      break
    }
    case 'masher':
      i.press = frame % (2 + (slot % 3)) === 0
      break
    case 'dodge': {
      const x = game.pos.get(slot) ?? 240
      // Runs from whatever is directly overhead, and jumps when it is close.
      const threat = game.coconuts.find((c) => Math.abs(c.x - x) < 26 && c.y > 60)
      if (threat) {
        i.left = threat.x > x
        i.right = threat.x <= x
        i.press = threat.y > 150 && (game.air.get(slot) ?? 0) <= 0
      } else i.right = jitter(slot, frame, 90)
      break
    }
    case 'precision':
      i.press = Math.abs(game.marker) < 4 + (1 - skill) * 16 && !game.stops.has(slot)
      break
    case 'zombie': {
      const at = game.pos.get(slot)
      if (!at) break
      // Runs directly away from the nearest thing that wants to bite it.
      let bx = 0
      let by = 0
      let best = Infinity
      const hunters = [...game.shamblers, ...game.players.filter((p) => game.isZombie(p.slot)).map((p) => game.pos.get(p.slot))]
      for (const h of hunters) {
        if (!h) continue
        const d = Math.hypot(h.x - at.x, h.y - at.y)
        if (d < best) {
          best = d
          bx = at.x - h.x
          by = at.y - h.y
        }
      }
      if (best < 90) {
        i.left = bx < -2
        i.right = bx > 2
        i.up = by < -2
        i.down = by > 2
      } else {
        i.left = jitter(slot, frame, 140)
        i.up = jitter(slot, frame + 40, 190)
      }
      break
    }
    case 'jumbo': {
      const at = game.pos.get(slot)
      if (!at) break
      const along = game.axis === 'x' ? at.x : at.y
      const gap = game.ropeAt - along
      const close = Math.abs(gap) < 22 + (1 - skill) * 10
      i.press = close && (game.air.get(slot) ?? 0) <= 0
      // Otherwise mills about, which is what keeps them spread out.
      if (!close) {
        i.left = jitter(slot, frame, 120)
        i.down = jitter(slot, frame + 30, 160)
      }
      break
    }
    case 'saucer': {
      const s = game.saucer
      const off = Math.hypot(s.x - LENS.x, s.y - LENS.y)
      i.press = off < 8 + (1 - skill) * 46 && !game.shots.has(slot)
      break
    }
    case 'chipper': {
      const charge = game.charge.get(slot)
      // Winds up, then lets go somewhere near the mark - the weaker ones
      // release further off.
      const target = CHIP_TARGET + (((slot * 13) % 7) - 3) * 0.018 * (1 - skill + 0.4)
      i.press = charge === undefined ? !game.balls.has(slot) : charge < target
      break
    }
    case 'maze': {
      const at = game.pos.get(slot)
      if (!at) break
      // No pathfinding: shuffles toward the middle and bumps off hedges,
      // which is roughly what a person does for the first few seconds anyway.
      const gc = game.cellCentre(game.goal.cx, game.goal.cy)
      const wander = jitter(slot, frame, 70)
      i.left = wander ? jitter(slot, frame, 130) : gc.x < at.x - 3
      i.right = wander ? jitter(slot, frame + 20, 130) : gc.x > at.x + 3
      i.up = wander ? jitter(slot, frame + 40, 150) : gc.y < at.y - 3
      i.down = wander ? jitter(slot, frame + 60, 150) : gc.y > at.y + 3
      break
    }
  }

  // Nothing should ever walk off the field on purpose.
  const at = 'pos' in game ? (game.pos as Map<number, { x: number; y: number }>).get(slot) : undefined
  if (at) {
    if (at.x < FIELD.x0 + 14) i.left = false
    if (at.x > FIELD.x1 - 14) i.right = false
    if (at.y < FIELD.y0 + 14) i.up = false
    if (at.y > FIELD.y1 - 14) i.down = false
  }
  return i
}

/** Placeholder names for the stand-ins, so a scoreboard reads sensibly. */
export const BOT_NAMES = ['Pip', 'Nub', 'Doff', 'Gilly', 'Mo', 'Tuck', 'Bex', 'Rilla']

export { JUMBO_AIR }
