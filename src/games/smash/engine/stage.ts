/** Stage geometry for PRISM POINT, the first Polyland arena. */

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

export const PRISM_POINT: Stage = {
  id: 'prism-point',
  name: 'Prism Point',
  platforms: [
    { x1: 100, x2: 380, top: 206, depth: 30, solid: true },
    { x1: 142, x2: 214, top: 156, depth: 7, solid: false },
    { x1: 266, x2: 338, top: 156, depth: 7, solid: false },
    { x1: 204, x2: 276, top: 108, depth: 7, solid: false },
  ],
  blast: { left: -86, right: 566, top: -130, bottom: 372 },
  spawns: [
    { x: 178, y: 206 },
    { x: 302, y: 206 },
  ],
  respawn: { x: 240, y: 54 },
}

export const MAIN_PLATFORM = PRISM_POINT.platforms[0]
