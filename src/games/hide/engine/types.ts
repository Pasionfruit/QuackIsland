/**
 * Hide & Seek: Mario Chase in first person.
 *
 * One runner, up to seven chasers, one fixed map, 3:30 on the clock. The
 * runner wins by surviving; the chasers win by touching the runner. A star
 * spawns partway through for the runner alone - forty seconds of shrugging
 * off chasers instead of running from them.
 *
 * Positions are in *grid cells*, not pixels or world units: a player at
 * (8.5, 8.5) is standing in the middle of cell (8, 8). That one choice is what
 * keeps collision, raycasting and the "how many feet away" readout all using
 * the same number with no unit conversion between them.
 */

export const VIEW_W = 480
export const VIEW_H = 270

/** How many feet one grid cell represents, purely for the chaser's readout. */
export const FEET_PER_CELL = 12

export type Role = 'runner' | 'chaser'
export type Phase = 'lobby' | 'intro' | 'playing' | 'over'
export type Winner = 'runner' | 'chasers' | null

/** What a map cell can be, beyond a plain wall or a plain floor. */
export type CellKind = 'floor' | 'wall' | 'boost' | 'teleportA' | 'teleportB' | 'star'

export interface Section {
  name: string
  /** Cell-grid bounding box, inclusive. */
  x0: number
  y0: number
  x1: number
  y1: number
  wall: string
  wallDark: string
  floor: string
  ceiling: string
}

export interface HideMap {
  id: string
  name: string
  theme: string
  /** ASCII rows, one character per cell - see maps.ts for the alphabet. */
  rows: string[]
  /** Always four: the map is built from four thematically distinct zones. */
  sections: [Section, Section, Section, Section]
  /** What a boost pad or a teleporter is called on *this* map, for the HUD. */
  interactiveName: string
}

export interface HidePlayer {
  slot: number
  name: string
  role: Role
  x: number
  y: number
  angle: number
  /** Decaying knockback from a bump or a boost pad. */
  vx: number
  vy: number
  boostFrames: number
  teleportCooldown: number
  /** Runner only: frames left of star invincibility. */
  invincibleFrames: number
}

export interface Star {
  x: number
  y: number
  active: boolean
  /** True once picked up, so it never respawns the same round. */
  spent: boolean
}
