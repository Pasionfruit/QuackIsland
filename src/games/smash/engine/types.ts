import type { AvatarDef } from '../../../art/avatar'
import type { CritterDef } from '../../../art/critter'
import { emptyInput, type GameInput } from '../../../lib/input'

export type MoveId = 'jab' | 'side' | 'up' | 'down' | 'special'

export type MoveArt = 'jab' | 'swing' | 'rise' | 'stomp' | 'burst' | 'quake' | 'spin'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface MoveDef {
  id: MoveId
  name: string
  /** Frames before the hitbox exists. */
  startup: number
  /** Frames the hitbox is live. */
  active: number
  /** Frames of end lag after the hitbox dies. */
  recovery: number
  damage: number
  /** Knockback at 0%. */
  baseKb: number
  /** Extra knockback per point of damage on the victim. */
  kbScale: number
  /** Launch angle in degrees: 0 forward, 90 straight up, negative spikes. */
  angle: number
  /** Hitbox relative to the fighter: +x is forward, y is measured up from the feet. */
  hit: Rect
  /** Hits on both sides and launches away from the attacker. */
  symmetric?: boolean
  /** Impulse applied to the attacker on the first active frame. */
  selfVel?: { x?: number; y?: number }
  /** Zeroes the attacker's velocity when the move starts. */
  killsMomentum?: boolean
  /** Cannot be used in the air. */
  groundOnly?: boolean
  /** Fighter falls helpless afterwards until they land (recovery moves). */
  helplessAfter?: boolean
  /** Screen shake on connect. */
  shake?: number
  art: MoveArt
}

/** A roster entry is either one of the campers or one of the animals. */
export type CharArt =
  | { kind: 'camper'; avatar: AvatarDef }
  | { kind: 'critter'; critter: CritterDef }

export interface CharDef {
  id: string
  name: string
  title: string
  blurb: string
  /** How this fighter is drawn, shared with every other game in the camp. */
  art: CharArt
  /** Drawn height in pixels. */
  height: number
  /** UI colours: menus, HUD plates, stock pips. */
  theme: { primary: string; dark: string; soft: string }
  /** Heavier fighters take less knockback. */
  weight: number
  walk: number
  groundAccel: number
  friction: number
  airAccel: number
  airMax: number
  gravity: number
  fallMax: number
  fastFallMax: number
  jump: number
  doubleJump: number
  jumps: number
  hurt: { w: number; h: number }
  moves: Record<MoveId, MoveDef>
  /** 1-5 bars for the select screen. */
  stats: { power: number; speed: number; weight: number }
}

/** The shared two-player keyboard input, re-exported for the engine. */
export type RawInput = GameInput
export { emptyInput }

export type FighterState =
  | 'idle'
  | 'walk'
  | 'air'
  | 'attack'
  | 'hitstun'
  | 'helpless'
  | 'landing'
  | 'dead'

export type Phase = 'intro' | 'fight' | 'ko' | 'over'
