/** Stage geometry for LAKESIDE CAMP, the first Polyland arena. */

export const VIEW_W = 480
export const VIEW_H = 270

export interface Platform {
  x1: number
  x2: number
  top: number
  /** Height of the platform body below `top`. */
  depth: number
  /** Solid platforms block you from the sides; soft ones are drop-through. */
  solid: boolean
}

export interface Stage {
  id: string
  name: string
  platforms: Platform[]
  blast: { left: number; right: number; top: number; bottom: number }
  spawns: { x: number; y: number }[]
  respawn: { x: number; y: number }
}

export const LAKESIDE_CAMP: Stage = {
  id: 'lakeside-camp',
  name: 'Lakeside Camp',
  platforms: [
    { x1: 96, x2: 384, top: 202, depth: 32, solid: true },
    { x1: 138, x2: 214, top: 152, depth: 6, solid: false },
    { x1: 266, x2: 342, top: 152, depth: 6, solid: false },
    { x1: 202, x2: 278, top: 104, depth: 6, solid: false },
  ],
  blast: { left: -86, right: 566, top: -130, bottom: 372 },
  spawns: [
    { x: 176, y: 202 },
    { x: 304, y: 202 },
  ],
  respawn: { x: 240, y: 50 },
}

export const MAIN_PLATFORM = LAKESIDE_CAMP.platforms[0]

