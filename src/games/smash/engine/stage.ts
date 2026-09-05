/**
 * The arena.
 *
 * A classic three-platform layout, seen from the side: one solid ground and
 * two smaller floating platforms above it, symmetric left and right. Gravity
 * pulls every fighter down onto whichever platform is beneath them; going
 * past any of the blast zone edges - off either side, off the top on a big
 * enough launch, or down through the gap under the stage - costs a stock.
 */

export const VIEW_W = 480
export const VIEW_H = 270

export interface Platform {
  x0: number
  x1: number
  /** Y of the walkable surface. */
  y: number
  /**
   * A solid platform (the ground) can't be dropped through. A soft one can be
   * jumped up through from below, landed on from above, and dropped through
   * with a tap of down - the two floating platforms are both soft.
   */
  solid: boolean
}

export interface Arena {
  id: string
  name: string
  platforms: Platform[]
  /** Anything past these edges is a KO. */
  blast: { left: number; right: number; top: number; bottom: number }
  spawns: { x: number; y: number }[]
}

export const LAKESIDE_BLUFF: Arena = {
  id: 'lakeside-bluff',
  name: 'Lakeside Bluff',
  platforms: [
    { x0: 70, x1: 410, y: 214, solid: true },
    { x0: 106, x1: 196, y: 146, solid: false },
    { x0: 284, x1: 374, y: 146, solid: false },
  ],
  blast: { left: -30, right: 510, top: -70, bottom: 300 },
  spawns: [
    { x: 190, y: 214 },
    { x: 290, y: 214 },
  ],
}

/** The ground everyone falls back onto - always platforms[0] by convention. */
export function mainPlatform(a: Arena): Platform {
  return a.platforms[0]
}

/** Past any blast zone edge is gone. */
export function outOfBounds(a: Arena, x: number, y: number): boolean {
  return x < a.blast.left || x > a.blast.right || y < a.blast.top || y > a.blast.bottom
}

/** Keeps a point over solid ground, used to keep spawns and respawns honest. */
export function clampToFloor(a: Arena, x: number, _y: number): { x: number; y: number } {
  const g = mainPlatform(a)
  return { x: Math.min(Math.max(x, g.x0 + 10), g.x1 - 10), y: g.y }
}
