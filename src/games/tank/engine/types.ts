/**
 * Tank Trouble: up to eight tanks in a bouncing-shell maze, twenty levels
 * against the house. DOM-free so it can run headlessly in `npm run smoke`.
 */

export const VIEW_W = 480
export const VIEW_H = 270
export const ARENA = { x: 16, y: 16, w: 448, h: 238 }

export interface Wall {
  x: number
  y: number
  w: number
  h: number
}

export interface Tank {
  id: number
  /** Player slot for a human tank, -1 for an AI enemy. */
  slot: number
  name: string
  color: string
  x: number
  y: number
  vx: number
  vy: number
  /** Turret angle in radians; independent of movement direction. */
  angle: number
  alive: boolean
  radius: number
  speed: number
  /** AI-only: current wander target and fire timing. */
  wanderX: number
  wanderY: number
  fireCooldown: number
  accuracy: number
  /** Frames of hit-flash left, for the tint. */
  flash: number
}

export interface Bullet {
  id: number
  ownerId: number
  x: number
  y: number
  vx: number
  vy: number
  bounces: number
  life: number
  /** Own-fire is ignored for a few frames so you do not spawn-kill yourself. */
  armIn: number
}

export interface Mine {
  id: number
  ownerId: number
  x: number
  y: number
  /** Cannot detonate until armed; a fresh mine will not blow up its own layer. */
  armIn: number
  /** Detonates on its own once this runs out, armed or not. */
  fuse: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

export type Phase = 'lobby' | 'intro' | 'playing' | 'levelClear' | 'over' | 'victory'

export interface LevelConfig {
  level: number
  cols: number
  rows: number
  removeFrac: number
  enemyCount: number
  enemySpeed: number
  enemyFireEvery: number
  enemyAccuracy: number
}

export const MAX_LEVEL = 20
export const MAX_BULLETS_PER_TANK = 5
export const MAX_MINES_PER_TANK = 3
