/**
 * Duck szn: a fixed-perspective shooting gallery.
 *
 * Five stages, one shared scoreboard, and a combo that everybody feeds. The
 * simulation is DOM-free so it can be driven headlessly by `npm run smoke`.
 */

export const VIEW_W = 480
export const VIEW_H = 270
/** Where the backdrop stops and the ground begins. */
export const HORIZON = 168
/** The floor characters and cans land on. */
export const GROUND = 236

export type StageId = 'balloons' | 'targets' | 'clays' | 'cans' | 'ufos'

export const STAGE_ORDER: StageId[] = ['balloons', 'targets', 'clays', 'cans', 'ufos']

export interface StageDef {
  id: StageId
  name: string
  /** One line under the stage name on the round card. */
  brief: string
  /** How long the round runs, in frames. */
  duration: number
  /** Frames between spawns at the start of the round. */
  spawnEvery: number
  /** How much faster spawns get by the end of the round. */
  rampTo: number
}

export type TargetKind =
  | 'balloon'
  | 'bull'
  | 'gold'
  | 'mii'
  | 'clay'
  | 'can'
  | 'ufo'
  | 'walker'
  | 'duck'

export interface Target {
  id: number
  kind: TargetKind
  x: number
  y: number
  vx: number
  vy: number
  /**
   * Distance from the camera: 1 is right at the glass, 0 is the horizon.
   * Scales both the drawn size and the hit radius, so a clay pigeon sailing
   * away really is harder to hit.
   */
  z: number
  vz: number
  /** Hit radius in view units at z = 1. */
  r: number
  /** Frames left before it leaves on its own; 0 means it stays. */
  life: number
  /** Cans crinkle; this counts how many times one has been hit. */
  hits: number
  color: string
  /** Frames since spawn, for wobble and pop-up animation. */
  age: number
  /** Set when the target has been dealt with and is on its way out. */
  dying: number
  /** A UFO's captive, or a walker's captor. */
  linked: number | null
  /** The height a saucer patrols at before it dives for somebody. */
  alt: number
  /** A walker being carried is not shootable and does not walk. */
  captured: boolean
  dead: boolean
}

export interface Shooter {
  slot: number
  name: string
  color: string
  x: number
  y: number
  score: number
  hits: number
  shots: number
  /** Frames left of the trigger-pull animation. */
  recoil: number
}

export interface Splash {
  x: number
  y: number
  life: number
  maxLife: number
  text: string
  color: string
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
  gravity: number
}

/** What the renderer and the HUD need to know about a shot that just landed. */
export interface HitEvent {
  slot: number
  x: number
  y: number
  points: number
  kind: TargetKind | 'miss'
}

export type Phase = 'ready' | 'playing' | 'stageEnd' | 'over'
