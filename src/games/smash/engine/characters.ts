import { drawAvatar, type AvatarOpts } from '../../../art/avatar'
import { CHEF, HIKER } from '../../../art/cast'
import type { CharDef, MoveArt, MoveDef, MoveId } from './types'

function move(
  id: MoveId,
  name: string,
  art: MoveArt,
  rest: Omit<MoveDef, 'id' | 'name' | 'art'>,
): MoveDef {
  return { id, name, art, ...rest }
}

/**
 * BASIL - the camp cook. Middleweight, quick on his feet, and the cast-iron
 * pan turns any exchange in his favour if he lands it.
 */
const BASIL: CharDef = {
  id: 'basil',
  name: 'Basil',
  title: 'The Camp Cook',
  blurb:
    'Runs the campsite kitchen and swings a cast-iron pan like he means it. Quick, balanced, happiest at close range.',
  avatar: CHEF,
  height: 32,
  theme: { primary: '#e8b45f', dark: '#a97b32', soft: '#f8f5ed' },
  weight: 1.0,
  walk: 1.75,
  groundAccel: 0.48,
  friction: 0.74,
  airAccel: 0.3,
  airMax: 1.55,
  gravity: 0.44,
  fallMax: 6.9,
  fastFallMax: 10.4,
  jump: -7.9,
  doubleJump: -7.05,
  jumps: 2,
  hurt: { w: 18, h: 32 },
  stats: { power: 3, speed: 4, weight: 3 },
  moves: {
    jab: move('jab', 'Pan Tap', 'jab', {
      startup: 4,
      active: 3,
      recovery: 8,
      damage: 4,
      baseKb: 12,
      kbScale: 0.32,
      angle: 40,
      hit: { x: 14, y: 19, w: 14, h: 11 },
    }),
    side: move('side', 'Skillet Swing', 'swing', {
      startup: 10,
      active: 4,
      recovery: 16,
      damage: 13,
      baseKb: 26,
      kbScale: 0.7,
      angle: 36,
      hit: { x: 17, y: 19, w: 18, h: 16 },
      selfVel: { x: 1.8 },
      shake: 5,
    }),
    up: move('up', 'Souffle', 'rise', {
      startup: 7,
      active: 5,
      recovery: 13,
      damage: 9,
      baseKb: 22,
      kbScale: 0.62,
      angle: 86,
      hit: { x: 2, y: 36, w: 19, h: 18 },
      selfVel: { y: -2.2 },
      shake: 3,
    }),
    down: move('down', 'Sizzle', 'quake', {
      startup: 9,
      active: 5,
      recovery: 16,
      damage: 10,
      baseKb: 19,
      kbScale: 0.5,
      angle: 62,
      hit: { x: 0, y: 7, w: 30, h: 13 },
      symmetric: true,
      killsMomentum: true,
      shake: 4,
    }),
    special: move('special', 'Steam Lift', 'burst', {
      startup: 6,
      active: 9,
      recovery: 16,
      damage: 7,
      baseKb: 18,
      kbScale: 0.42,
      angle: 80,
      hit: { x: 0, y: 26, w: 20, h: 24 },
      symmetric: true,
      selfVel: { x: 1.2, y: -7.9 },
      killsMomentum: true,
      helplessAfter: true,
      shake: 3,
    }),
  },
}

/**
 * JUNIPER - the long-haul hiker. Heavy and slow, but the walking staff
 * out-ranges everyone on the map.
 */
const JUNIPER: CharDef = {
  id: 'juniper',
  name: 'Juniper',
  title: 'The Long-Hauler',
  blurb:
    'Twenty miles before lunch and still smiling. Slow off the mark, but the walking staff keeps everyone at arm’s length.',
  avatar: HIKER,
  height: 36,
  theme: { primary: '#88a86f', dark: '#4f6a42', soft: '#e6e2d4' },
  weight: 1.3,
  walk: 1.32,
  groundAccel: 0.33,
  friction: 0.78,
  airAccel: 0.22,
  airMax: 1.22,
  gravity: 0.47,
  fallMax: 7.4,
  fastFallMax: 11.0,
  jump: -7.45,
  doubleJump: -6.6,
  jumps: 2,
  hurt: { w: 21, h: 36 },
  stats: { power: 5, speed: 2, weight: 5 },
  moves: {
    jab: move('jab', 'Staff Poke', 'jab', {
      startup: 5,
      active: 4,
      recovery: 9,
      damage: 5,
      baseKb: 12,
      kbScale: 0.34,
      angle: 34,
      hit: { x: 19, y: 20, w: 18, h: 9 },
    }),
    side: move('side', 'Trail Sweep', 'swing', {
      startup: 12,
      active: 5,
      recovery: 20,
      damage: 15,
      baseKb: 29,
      kbScale: 0.76,
      angle: 40,
      hit: { x: 22, y: 18, w: 24, h: 15 },
      selfVel: { x: 1.3 },
      shake: 6,
    }),
    up: move('up', 'Pole Vault', 'rise', {
      startup: 8,
      active: 6,
      recovery: 17,
      damage: 12,
      baseKb: 25,
      kbScale: 0.68,
      angle: 88,
      hit: { x: 4, y: 40, w: 20, h: 22 },
      selfVel: { y: -3.0 },
      shake: 4,
    }),
    down: move('down', 'Boot Stomp', 'quake', {
      startup: 10,
      active: 5,
      recovery: 18,
      damage: 11,
      baseKb: 20,
      kbScale: 0.5,
      angle: 55,
      hit: { x: 0, y: 8, w: 32, h: 14 },
      symmetric: true,
      killsMomentum: true,
      shake: 5,
    }),
    special: move('special', 'Pack Boost', 'burst', {
      startup: 7,
      active: 10,
      recovery: 18,
      damage: 8,
      baseKb: 18,
      kbScale: 0.4,
      angle: 78,
      hit: { x: 0, y: 30, w: 22, h: 26 },
      symmetric: true,
      selfVel: { x: 0.8, y: -7.1 },
      killsMomentum: true,
      helplessAfter: true,
      shake: 3,
    }),
  },
}

export const ROSTER: CharDef[] = [BASIL, JUNIPER]

export function charById(id: string): CharDef {
  return ROSTER.find((c) => c.id === id) ?? ROSTER[0]
}

/** Draws a roster character at their canonical size. */
export function drawChar(
  ctx: CanvasRenderingContext2D,
  def: CharDef,
  x: number,
  y: number,
  opts: Omit<AvatarOpts, 'height'> & { scale?: number } = {},
): void {
  const { scale = 1, ...rest } = opts
  drawAvatar(ctx, def.avatar, x, y, { ...rest, height: def.height * scale })
}
