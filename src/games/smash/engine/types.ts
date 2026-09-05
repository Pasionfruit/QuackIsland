import type { AvatarDef } from '../../../art/avatar'
import { emptyInput, type GameInput } from '../../../lib/input'

/**
 * Eight moves: a quick poke, a committed lunge, a launcher and a ground slam,
 * each in an attack and a special flavour. Left and right are the same move
 * mirrored - the sheet draws both, but they only differ in which way the
 * fighter is pointed.
 */
export type MoveId =
  | 'attack'
  | 'attackSide'
  | 'attackUp'
  | 'attackDown'
  | 'special'
  | 'specialSide'
  | 'specialUp'
  | 'specialDown'

export type MoveArt = 'slash' | 'lunge' | 'launch' | 'slam' | 'burst' | 'bolt' | 'ring'

/** Which way a fighter is pointed. Movement is free; facing snaps to four. */
export type Facing = 'up' | 'down' | 'left' | 'right'

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
  /**
   * Hitbox, in facing space: `reach` out along the way the fighter is
   * pointed, `depth` deep along the same axis, `width` across it.
   */
  hit: { reach: number; depth: number; width: number }
  /** Hits all round the fighter, and launches away from them. */
  radial?: boolean
  /** Push along the facing direction on the first active frame. */
  drive?: number
  /** Zeroes the fighter's momentum when the move starts. */
  killsMomentum?: boolean
  /** Screen shake on connect. */
  shake?: number
  art: MoveArt
}

export interface CharDef {
  id: string
  name: string
  title: string
  blurb: string
  /** How this fighter is drawn when they have no sprite sheet yet. */
  avatar: AvatarDef
  /** Drawn height in view units. */
  height: number
  /** UI colours: menus, HUD plates, stock pips. */
  theme: { primary: string; dark: string; soft: string }
  /** Heavier fighters slide less far when hit. */
  weight: number
  /** Top speed across the floor. */
  speed: number
  /** How fast they reach it. */
  accel: number
  /** How fast they stop. Lower is slidier. */
  friction: number
  /** How quickly knockback bleeds off. Lower means they travel further. */
  slide: number
  /** Radius of the body on the floor, for hit detection and shoving. */
  radius: number
  moves: Record<MoveId, MoveDef>
  /** 1-5 bars for the select screen. */
  stats: { power: number; speed: number; weight: number }
  /** Shown on the select screen but not pickable yet. */
  locked?: boolean
  /** What the select screen says about how to unlock them. */
  unlockHint?: string
}

/** The shared two-player keyboard input, re-exported for the engine. */
export type RawInput = GameInput
export { emptyInput }

export type FighterState = 'idle' | 'walk' | 'attack' | 'hitstun' | 'falling' | 'dead'

export type Phase = 'intro' | 'fight' | 'ko' | 'over'
