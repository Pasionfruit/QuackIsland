import { drawAvatar, type AvatarDef, type AvatarOpts } from '../../../art/avatar'
import {
  CONTRLZEE,
  DIVA,
  MRPASIONFRUIT,
  NINJAPENGUIN,
  TENINCHTOENAIL,
} from '../../../art/cast'
import type { CharDef, MoveArt, MoveDef, MoveId } from './types'

function move(
  id: MoveId,
  name: string,
  art: MoveArt,
  rest: Omit<MoveDef, 'id' | 'name' | 'art'>,
): MoveDef {
  return { id, name, art, ...rest }
}

/** Everything a fighter needs that is not a move, so the roster stays readable. */
interface Body {
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
}

/** Middleweight defaults; every fighter tweaks what makes them different. */
const BASE: Body = {
  weight: 1.0,
  walk: 1.6,
  groundAccel: 0.45,
  friction: 0.75,
  airAccel: 0.28,
  airMax: 1.45,
  gravity: 0.45,
  fallMax: 7.0,
  fastFallMax: 10.4,
  jump: -7.8,
  doubleJump: -7.0,
  jumps: 2,
  hurt: { w: 18, h: 32 },
}

// ---------------------------------------------------------------- the cast

const ZEE: CharDef = {
  id: 'contrlzee',
  name: 'ContrlZee',
  title: 'The Raccoon Programmer',
  blurb:
    'Fixes everything by turning it off and on again, including you. Sets up his advantage two moves early and then just runs it.',
  avatar: CONTRLZEE,
  height: 33,
  theme: { primary: '#9a978f', dark: '#5f5b53', soft: '#e8dfd0' },
  ...BASE,
  weight: 1.06,
  walk: 1.42,
  groundAccel: 0.4,
  airAccel: 0.26,
  airMax: 1.36,
  gravity: 0.44,
  jump: -7.7,
  doubleJump: -6.95,
  hurt: { w: 19, h: 33 },
  stats: { power: 4, speed: 2, weight: 3 },
  moves: {
    jab: move('jab', 'Null Check', 'jab', {
      startup: 4, active: 3, recovery: 9,
      damage: 4, baseKb: 11, kbScale: 0.31, angle: 42,
      hit: { x: 15, y: 20, w: 15, h: 11 },
    }),
    side: move('side', 'Hard Reset', 'swing', {
      startup: 12, active: 4, recovery: 18,
      damage: 14, baseKb: 27, kbScale: 0.72, angle: 38,
      hit: { x: 19, y: 19, w: 20, h: 16 },
      selfVel: { x: 1.4 }, shake: 5,
    }),
    up: move('up', 'Stack Push', 'rise', {
      startup: 8, active: 5, recovery: 15,
      damage: 11, baseKb: 24, kbScale: 0.66, angle: 88,
      hit: { x: 2, y: 37, w: 20, h: 20 },
      selfVel: { y: -2.5 }, shake: 4,
    }),
    down: move('down', 'Garbage Collect', 'quake', {
      startup: 10, active: 6, recovery: 17,
      damage: 11, baseKb: 21, kbScale: 0.52, angle: 62,
      hit: { x: 0, y: 7, w: 33, h: 13 },
      symmetric: true, killsMomentum: true, shake: 4,
    }),
    special: move('special', 'Ctrl+Z', 'burst', {
      startup: 6, active: 9, recovery: 16,
      damage: 7, baseKb: 17, kbScale: 0.4, angle: 82,
      hit: { x: 0, y: 28, w: 21, h: 26 },
      symmetric: true, selfVel: { x: 1.1, y: -8.0 },
      killsMomentum: true, helplessAfter: true, shake: 3,
    }),
  },
}

const PENGUIN: CharDef = {
  id: 'ninjapenguin',
  name: 'NinjaPenguin',
  title: 'The Silent Waddle',
  blurb:
    'Moves like a shadow, lands like a sack of gravel. Belly-slides in, flurries you down, and is gone before the dust settles.',
  avatar: NINJAPENGUIN,
  height: 31,
  theme: { primary: '#4a4744', dark: '#2a2826', soft: '#f2ece0' },
  ...BASE,
  weight: 0.95,
  walk: 1.92,
  groundAccel: 0.56,
  friction: 0.72,
  airAccel: 0.32,
  airMax: 1.68,
  gravity: 0.47,
  fallMax: 7.4,
  fastFallMax: 11.2,
  jump: -7.85,
  doubleJump: -7.15,
  hurt: { w: 19, h: 31 },
  stats: { power: 3, speed: 5, weight: 2 },
  moves: {
    jab: move('jab', 'Flipper Flurry', 'jab', {
      startup: 3, active: 3, recovery: 7,
      damage: 3, baseKb: 10, kbScale: 0.28, angle: 44,
      hit: { x: 14, y: 18, w: 14, h: 11 },
    }),
    side: move('side', 'Belly Slide', 'swing', {
      startup: 8, active: 5, recovery: 15,
      damage: 11, baseKb: 22, kbScale: 0.62, angle: 34,
      hit: { x: 17, y: 10, w: 20, h: 12 },
      selfVel: { x: 3.2 }, shake: 4,
    }),
    up: move('up', 'Rising Kick', 'rise', {
      startup: 5, active: 5, recovery: 12,
      damage: 9, baseKb: 21, kbScale: 0.6, angle: 84,
      hit: { x: 2, y: 35, w: 18, h: 20 },
      selfVel: { y: -2.9 }, shake: 3,
    }),
    down: move('down', 'Iceberg Drop', 'stomp', {
      startup: 8, active: 5, recovery: 16,
      damage: 10, baseKb: 15, kbScale: 0.44, angle: -74,
      hit: { x: 0, y: 4, w: 21, h: 13 },
      symmetric: true, selfVel: { y: 4.4 }, shake: 5,
    }),
    special: move('special', 'Smoke Bomb', 'burst', {
      startup: 5, active: 9, recovery: 15,
      damage: 6, baseKb: 16, kbScale: 0.38, angle: 80,
      hit: { x: 0, y: 26, w: 20, h: 25 },
      symmetric: true, selfVel: { x: 1.7, y: -8.3 },
      killsMomentum: true, helplessAfter: true, shake: 3,
    }),
  },
}

const LION: CharDef = {
  id: 'teninchtoenail',
  name: 'teninchtoenail',
  title: 'The Lion Salesman',
  blurb:
    'Has not taken no for an answer since he was a cub. Slow to get going, but the briefcase closes every conversation.',
  avatar: TENINCHTOENAIL,
  height: 36,
  theme: { primary: '#d9a05b', dark: '#a8672f', soft: '#f2dfba' },
  ...BASE,
  weight: 1.32,
  walk: 1.3,
  groundAccel: 0.32,
  friction: 0.78,
  airAccel: 0.22,
  airMax: 1.2,
  gravity: 0.47,
  fallMax: 7.5,
  fastFallMax: 11.0,
  jump: -7.4,
  doubleJump: -6.55,
  hurt: { w: 22, h: 36 },
  stats: { power: 5, speed: 1, weight: 5 },
  moves: {
    jab: move('jab', 'Firm Handshake', 'jab', {
      startup: 5, active: 4, recovery: 9,
      damage: 5, baseKb: 12, kbScale: 0.34, angle: 36,
      hit: { x: 18, y: 21, w: 17, h: 11 },
    }),
    side: move('side', 'Hard Sell', 'swing', {
      startup: 13, active: 5, recovery: 20,
      damage: 16, baseKb: 30, kbScale: 0.78, angle: 40,
      hit: { x: 21, y: 19, w: 23, h: 17 },
      selfVel: { x: 1.5 }, shake: 6,
    }),
    up: move('up', 'Upsell', 'rise', {
      startup: 8, active: 6, recovery: 17,
      damage: 12, baseKb: 26, kbScale: 0.7, angle: 88,
      hit: { x: 4, y: 40, w: 21, h: 22 },
      selfVel: { y: -2.9 }, shake: 4,
    }),
    down: move('down', 'Closing Slam', 'quake', {
      startup: 11, active: 5, recovery: 19,
      damage: 12, baseKb: 21, kbScale: 0.52, angle: 56,
      hit: { x: 0, y: 8, w: 33, h: 14 },
      symmetric: true, killsMomentum: true, shake: 6,
    }),
    special: move('special', 'Elevator Pitch', 'burst', {
      startup: 7, active: 10, recovery: 18,
      damage: 8, baseKb: 18, kbScale: 0.4, angle: 78,
      hit: { x: 0, y: 30, w: 23, h: 27 },
      symmetric: true, selfVel: { x: 0.8, y: -7.2 },
      killsMomentum: true, helplessAfter: true, shake: 3,
    }),
  },
}

const FROG: CharDef = {
  id: 'diva',
  name: 'diva',
  title: 'The Frog Fashionista',
  blurb:
    'Floats above it all, literally. The longest reach on the roster and a recovery nobody can edgeguard, if she can be bothered.',
  avatar: DIVA,
  height: 32,
  theme: { primary: '#c85f96', dark: '#8f3d6a', soft: '#e8e4c6' },
  ...BASE,
  weight: 0.86,
  walk: 1.44,
  groundAccel: 0.4,
  airAccel: 0.34,
  airMax: 1.62,
  gravity: 0.35,
  fallMax: 5.9,
  fastFallMax: 10.2,
  jump: -7.5,
  doubleJump: -7.1,
  jumps: 3,
  hurt: { w: 20, h: 32 },
  stats: { power: 2, speed: 3, weight: 1 },
  moves: {
    jab: move('jab', 'Tongue Lash', 'jab', {
      startup: 4, active: 3, recovery: 10,
      damage: 3, baseKb: 10, kbScale: 0.3, angle: 46,
      hit: { x: 23, y: 20, w: 24, h: 8 },
    }),
    side: move('side', 'Clutch Swing', 'swing', {
      startup: 10, active: 5, recovery: 17,
      damage: 12, baseKb: 24, kbScale: 0.66, angle: 42,
      hit: { x: 19, y: 19, w: 21, h: 15 },
      selfVel: { x: 1.5 }, shake: 4,
    }),
    up: move('up', 'Hop Kick', 'rise', {
      startup: 6, active: 6, recovery: 13,
      damage: 9, baseKb: 22, kbScale: 0.62, angle: 86,
      hit: { x: 2, y: 37, w: 20, h: 21 },
      selfVel: { y: -3.1 }, shake: 3,
    }),
    down: move('down', 'Runway Stomp', 'quake', {
      startup: 9, active: 5, recovery: 16,
      damage: 9, baseKb: 19, kbScale: 0.48, angle: 60,
      hit: { x: 0, y: 6, w: 30, h: 12 },
      symmetric: true, killsMomentum: true, shake: 4,
    }),
    special: move('special', 'Grand Entrance', 'burst', {
      startup: 5, active: 10, recovery: 15,
      damage: 6, baseKb: 16, kbScale: 0.38, angle: 84,
      hit: { x: 0, y: 29, w: 21, h: 28 },
      symmetric: true, selfVel: { x: 1.5, y: -8.8 },
      killsMomentum: true, helplessAfter: true, shake: 2,
    }),
  },
}

const CAT: CharDef = {
  id: 'mrpasionfruit',
  name: 'MrPasionfruit',
  title: 'The Athlete',
  blurb:
    'Fastest thing in Polyland and never stops moving. Individually the hits are nothing; the problem is there are always four more coming.',
  avatar: MRPASIONFRUIT,
  height: 32,
  theme: { primary: '#7a4f8c', dark: '#4f3060', soft: '#e8c05f' },
  ...BASE,
  weight: 0.88,
  walk: 2.15,
  groundAccel: 0.62,
  friction: 0.71,
  airAccel: 0.36,
  airMax: 1.86,
  gravity: 0.44,
  fallMax: 7.2,
  jump: -8.05,
  doubleJump: -7.35,
  hurt: { w: 18, h: 32 },
  stats: { power: 2, speed: 5, weight: 2 },
  moves: {
    jab: move('jab', 'Quick Paw', 'jab', {
      startup: 3, active: 2, recovery: 6,
      damage: 3, baseKb: 9, kbScale: 0.26, angle: 46,
      hit: { x: 13, y: 20, w: 13, h: 10 },
    }),
    side: move('side', 'Sprint Claw', 'swing', {
      startup: 8, active: 4, recovery: 14,
      damage: 10, baseKb: 22, kbScale: 0.6, angle: 40,
      hit: { x: 17, y: 20, w: 18, h: 15 },
      selfVel: { x: 3.0 }, shake: 4,
    }),
    up: move('up', 'Vault Kick', 'rise', {
      startup: 5, active: 5, recovery: 11,
      damage: 8, baseKb: 20, kbScale: 0.58, angle: 84,
      hit: { x: 2, y: 36, w: 18, h: 20 },
      selfVel: { y: -3.0 }, shake: 3,
    }),
    down: move('down', 'Slide Tackle', 'quake', {
      startup: 7, active: 5, recovery: 14,
      damage: 7, baseKb: 16, kbScale: 0.44, angle: 56,
      hit: { x: 0, y: 5, w: 31, h: 11 },
      symmetric: true, selfVel: { x: 1.7 }, shake: 3,
    }),
    special: move('special', 'Second Wind', 'burst', {
      startup: 5, active: 9, recovery: 14,
      damage: 6, baseKb: 15, kbScale: 0.36, angle: 80,
      hit: { x: 0, y: 27, w: 20, h: 26 },
      symmetric: true, selfVel: { x: 1.6, y: -8.5 },
      killsMomentum: true, helplessAfter: true, shake: 2,
    }),
  },
}

export const ROSTER: CharDef[] = [ZEE, PENGUIN, LION, FROG, CAT]

export function charById(id: string): CharDef {
  return ROSTER.find((c) => c.id === id) ?? ROSTER[0]
}

/** Draws a roster fighter at their canonical size. */
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

export type { AvatarDef }
