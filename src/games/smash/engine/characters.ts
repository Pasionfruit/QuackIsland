import { drawAvatar, type AvatarOpts } from '../../../art/avatar'
import {
  BIKER,
  BLACK_CAT,
  CALICO_CAT,
  CHEF,
  CODER,
  EXPLORER,
  FISHER,
  HIKER,
  RUNNER,
  SEAGULL,
  SHIBA_DOG,
  SURFER,
} from '../../../art/cast'
import { drawCritter } from '../../../art/critter'
import type { CharArt, CharDef, MoveArt, MoveDef, MoveId } from './types'

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

function camper(avatar: typeof CHEF): CharArt {
  return { kind: 'camper', avatar }
}
function critter(def: typeof CALICO_CAT): CharArt {
  return { kind: 'critter', critter: def }
}

// ---------------------------------------------------------------- the cast

const BASIL: CharDef = {
  id: 'basil',
  name: 'Basil',
  title: 'The Camp Cook',
  blurb:
    'Runs the campsite kitchen and swings a cast-iron pan like he means it. Quick, balanced, happiest at close range.',
  art: camper(CHEF),
  height: 32,
  theme: { primary: '#e8b45f', dark: '#a97b32', soft: '#f8f5ed' },
  ...BASE,
  walk: 1.75,
  airAccel: 0.3,
  airMax: 1.55,
  gravity: 0.44,
  jump: -7.9,
  doubleJump: -7.05,
  stats: { power: 3, speed: 4, weight: 3 },
  moves: {
    jab: move('jab', 'Pan Tap', 'jab', {
      startup: 4, active: 3, recovery: 8,
      damage: 4, baseKb: 12, kbScale: 0.32, angle: 40,
      hit: { x: 14, y: 19, w: 14, h: 11 },
    }),
    side: move('side', 'Skillet Swing', 'swing', {
      startup: 10, active: 4, recovery: 16,
      damage: 13, baseKb: 26, kbScale: 0.7, angle: 36,
      hit: { x: 17, y: 19, w: 18, h: 16 },
      selfVel: { x: 1.8 }, shake: 5,
    }),
    up: move('up', 'Souffle', 'rise', {
      startup: 7, active: 5, recovery: 13,
      damage: 9, baseKb: 22, kbScale: 0.62, angle: 86,
      hit: { x: 2, y: 36, w: 19, h: 18 },
      selfVel: { y: -2.2 }, shake: 3,
    }),
    down: move('down', 'Sizzle', 'quake', {
      startup: 9, active: 5, recovery: 16,
      damage: 10, baseKb: 19, kbScale: 0.5, angle: 62,
      hit: { x: 0, y: 7, w: 30, h: 13 },
      symmetric: true, killsMomentum: true, shake: 4,
    }),
    special: move('special', 'Steam Lift', 'burst', {
      startup: 6, active: 9, recovery: 16,
      damage: 7, baseKb: 18, kbScale: 0.42, angle: 80,
      hit: { x: 0, y: 26, w: 20, h: 24 },
      symmetric: true, selfVel: { x: 1.2, y: -7.9 },
      killsMomentum: true, helplessAfter: true, shake: 3,
    }),
  },
}

const JUNIPER: CharDef = {
  id: 'juniper',
  name: 'Juniper',
  title: 'The Long-Hauler',
  blurb:
    'Twenty miles before lunch and still smiling. Slow off the mark, but the walking staff keeps everyone at arm’s length.',
  art: camper(HIKER),
  height: 36,
  theme: { primary: '#88a86f', dark: '#4f6a42', soft: '#e6e2d4' },
  ...BASE,
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
  hurt: { w: 21, h: 36 },
  stats: { power: 5, speed: 2, weight: 5 },
  moves: {
    jab: move('jab', 'Staff Poke', 'jab', {
      startup: 5, active: 4, recovery: 9,
      damage: 5, baseKb: 12, kbScale: 0.34, angle: 34,
      hit: { x: 19, y: 20, w: 18, h: 9 },
    }),
    side: move('side', 'Trail Sweep', 'swing', {
      startup: 12, active: 5, recovery: 20,
      damage: 15, baseKb: 29, kbScale: 0.76, angle: 40,
      hit: { x: 22, y: 18, w: 24, h: 15 },
      selfVel: { x: 1.3 }, shake: 6,
    }),
    up: move('up', 'Pole Vault', 'rise', {
      startup: 8, active: 6, recovery: 17,
      damage: 12, baseKb: 25, kbScale: 0.68, angle: 88,
      hit: { x: 4, y: 40, w: 20, h: 22 },
      selfVel: { y: -3.0 }, shake: 4,
    }),
    down: move('down', 'Boot Stomp', 'quake', {
      startup: 10, active: 5, recovery: 18,
      damage: 11, baseKb: 20, kbScale: 0.5, angle: 55,
      hit: { x: 0, y: 8, w: 32, h: 14 },
      symmetric: true, killsMomentum: true, shake: 5,
    }),
    special: move('special', 'Pack Boost', 'burst', {
      startup: 7, active: 10, recovery: 18,
      damage: 8, baseKb: 18, kbScale: 0.4, angle: 78,
      hit: { x: 0, y: 30, w: 22, h: 26 },
      symmetric: true, selfVel: { x: 0.8, y: -7.1 },
      killsMomentum: true, helplessAfter: true, shake: 3,
    }),
  },
}

const KAI: CharDef = {
  id: 'kai',
  name: 'Kai',
  title: 'The Surfer',
  blurb:
    'Lives in the water and fights like it - floaty jumps, long board swings, and absolutely no hurry to come down.',
  art: camper(SURFER),
  height: 33,
  theme: { primary: '#7cc4d6', dark: '#2f6f86', soft: '#f0d9b8' },
  ...BASE,
  weight: 0.94,
  walk: 1.62,
  airAccel: 0.34,
  airMax: 1.7,
  gravity: 0.37,
  fallMax: 6.1,
  fastFallMax: 10.6,
  jump: -7.6,
  doubleJump: -7.2,
  hurt: { w: 19, h: 33 },
  stats: { power: 3, speed: 3, weight: 2 },
  moves: {
    jab: move('jab', 'Nose Jab', 'jab', {
      startup: 4, active: 3, recovery: 9,
      damage: 4, baseKb: 11, kbScale: 0.3, angle: 44,
      hit: { x: 16, y: 20, w: 16, h: 10 },
    }),
    side: move('side', 'Cutback', 'swing', {
      startup: 9, active: 5, recovery: 17,
      damage: 12, baseKb: 24, kbScale: 0.66, angle: 42,
      hit: { x: 19, y: 19, w: 22, h: 15 },
      selfVel: { x: 1.6 }, shake: 4,
    }),
    up: move('up', 'Aerial', 'rise', {
      startup: 6, active: 6, recovery: 14,
      damage: 9, baseKb: 21, kbScale: 0.6, angle: 82,
      hit: { x: 2, y: 37, w: 22, h: 20 },
      selfVel: { y: -2.6 }, shake: 3,
    }),
    down: move('down', 'Wipeout', 'stomp', {
      startup: 9, active: 5, recovery: 17,
      damage: 10, baseKb: 15, kbScale: 0.44, angle: -74,
      hit: { x: 0, y: 4, w: 22, h: 13 },
      symmetric: true, selfVel: { y: 4.2 }, shake: 5,
    }),
    special: move('special', 'Swell', 'burst', {
      startup: 5, active: 10, recovery: 15,
      damage: 7, baseKb: 17, kbScale: 0.4, angle: 82,
      hit: { x: 0, y: 28, w: 22, h: 26 },
      symmetric: true, selfVel: { x: 1.0, y: -8.2 },
      killsMomentum: true, helplessAfter: true, shake: 3,
    }),
  },
}

const WREN: CharDef = {
  id: 'wren',
  name: 'Wren',
  title: 'The Angler',
  blurb:
    'Patient, precise and armed with the longest reach in camp. Weak up close, so she never lets you get there.',
  art: camper(FISHER),
  height: 32,
  theme: { primary: '#8fa86a', dark: '#5d6f4e', soft: '#cbb98f' },
  ...BASE,
  weight: 0.9,
  walk: 1.5,
  airAccel: 0.3,
  airMax: 1.4,
  gravity: 0.43,
  jump: -7.7,
  doubleJump: -6.9,
  hurt: { w: 18, h: 32 },
  stats: { power: 2, speed: 3, weight: 2 },
  moves: {
    jab: move('jab', 'Line Flick', 'jab', {
      startup: 4, active: 3, recovery: 10,
      damage: 3, baseKb: 10, kbScale: 0.3, angle: 46,
      hit: { x: 22, y: 20, w: 22, h: 8 },
    }),
    side: move('side', 'Cast', 'swing', {
      startup: 11, active: 6, recovery: 19,
      damage: 11, baseKb: 22, kbScale: 0.62, angle: 34,
      hit: { x: 28, y: 19, w: 30, h: 12 },
      shake: 4,
    }),
    up: move('up', 'Hook Set', 'rise', {
      startup: 7, active: 5, recovery: 15,
      damage: 9, baseKb: 21, kbScale: 0.62, angle: 85,
      hit: { x: 3, y: 38, w: 18, h: 22 },
      selfVel: { y: -2.4 }, shake: 3,
    }),
    down: move('down', 'Net Sweep', 'quake', {
      startup: 8, active: 5, recovery: 16,
      damage: 9, baseKb: 18, kbScale: 0.48, angle: 60,
      hit: { x: 0, y: 7, w: 30, h: 12 },
      symmetric: true, killsMomentum: true, shake: 3,
    }),
    special: move('special', 'Grapple Cast', 'burst', {
      startup: 6, active: 9, recovery: 16,
      damage: 6, baseKb: 16, kbScale: 0.38, angle: 84,
      hit: { x: 0, y: 30, w: 18, h: 30 },
      symmetric: true, selfVel: { x: 1.4, y: -8.6 },
      killsMomentum: true, helplessAfter: true, shake: 2,
    }),
  },
}

const DASH: CharDef = {
  id: 'dash',
  name: 'Dash',
  title: 'The Cyclist',
  blurb:
    'Fastest camper on two feet or two wheels. Gets in, gets the hit, gets out - and folds if you catch her.',
  art: camper(BIKER),
  height: 32,
  theme: { primary: '#57a7bd', dark: '#2f6f86', soft: '#f4f2ea' },
  ...BASE,
  weight: 0.84,
  walk: 2.2,
  groundAccel: 0.62,
  friction: 0.7,
  airAccel: 0.36,
  airMax: 1.85,
  gravity: 0.46,
  fallMax: 7.2,
  jump: -8.0,
  doubleJump: -7.2,
  hurt: { w: 18, h: 32 },
  stats: { power: 2, speed: 5, weight: 1 },
  moves: {
    jab: move('jab', 'Quick Elbow', 'jab', {
      startup: 3, active: 3, recovery: 7,
      damage: 3, baseKb: 10, kbScale: 0.28, angle: 44,
      hit: { x: 13, y: 19, w: 13, h: 11 },
    }),
    side: move('side', 'Sprint Charge', 'swing', {
      startup: 7, active: 4, recovery: 15,
      damage: 10, baseKb: 21, kbScale: 0.6, angle: 34,
      hit: { x: 16, y: 18, w: 18, h: 15 },
      selfVel: { x: 3.4 }, shake: 4,
    }),
    up: move('up', 'Bunny Hop', 'rise', {
      startup: 5, active: 5, recovery: 12,
      damage: 8, baseKb: 20, kbScale: 0.58, angle: 84,
      hit: { x: 2, y: 36, w: 18, h: 19 },
      selfVel: { y: -2.8 }, shake: 3,
    }),
    down: move('down', 'Skid', 'quake', {
      startup: 8, active: 5, recovery: 15,
      damage: 8, baseKb: 17, kbScale: 0.46, angle: 58,
      hit: { x: 0, y: 6, w: 28, h: 12 },
      symmetric: true, killsMomentum: true, shake: 3,
    }),
    special: move('special', 'Downhill', 'burst', {
      startup: 5, active: 9, recovery: 15,
      damage: 6, baseKb: 16, kbScale: 0.38, angle: 78,
      hit: { x: 0, y: 27, w: 20, h: 25 },
      symmetric: true, selfVel: { x: 2.0, y: -8.3 },
      killsMomentum: true, helplessAfter: true, shake: 3,
    }),
  },
}

const BYTE: CharDef = {
  id: 'byte',
  name: 'Byte',
  title: 'The Night Owl',
  blurb:
    'Fights the way he codes: set something up, wait, let it do the work. Slow on his feet, nasty from a distance.',
  art: camper(CODER),
  height: 32,
  theme: { primary: '#6f92c9', dark: '#3f5f95', soft: '#b9bec4' },
  ...BASE,
  weight: 1.05,
  walk: 1.35,
  groundAccel: 0.38,
  airAccel: 0.24,
  airMax: 1.3,
  gravity: 0.44,
  jump: -7.5,
  doubleJump: -6.9,
  hurt: { w: 19, h: 32 },
  stats: { power: 4, speed: 2, weight: 3 },
  moves: {
    jab: move('jab', 'Ping', 'jab', {
      startup: 4, active: 3, recovery: 9,
      damage: 4, baseKb: 11, kbScale: 0.3, angle: 42,
      hit: { x: 15, y: 20, w: 15, h: 11 },
    }),
    side: move('side', 'Hard Reset', 'swing', {
      startup: 13, active: 4, recovery: 19,
      damage: 15, baseKb: 28, kbScale: 0.74, angle: 38,
      hit: { x: 18, y: 19, w: 19, h: 17 },
      selfVel: { x: 1.2 }, shake: 6,
    }),
    up: move('up', 'Stack Push', 'rise', {
      startup: 8, active: 5, recovery: 15,
      damage: 11, baseKb: 24, kbScale: 0.66, angle: 88,
      hit: { x: 2, y: 37, w: 20, h: 20 },
      selfVel: { y: -2.4 }, shake: 4,
    }),
    down: move('down', 'Fan Blast', 'quake', {
      startup: 10, active: 6, recovery: 17,
      damage: 11, baseKb: 21, kbScale: 0.52, angle: 62,
      hit: { x: 0, y: 7, w: 34, h: 13 },
      symmetric: true, killsMomentum: true, shake: 4,
    }),
    special: move('special', 'Reboot', 'burst', {
      startup: 7, active: 9, recovery: 18,
      damage: 7, baseKb: 17, kbScale: 0.4, angle: 82,
      hit: { x: 0, y: 28, w: 20, h: 26 },
      symmetric: true, selfVel: { x: 0.9, y: -7.6 },
      killsMomentum: true, helplessAfter: true, shake: 3,
    }),
  },
}

const ROWAN: CharDef = {
  id: 'rowan',
  name: 'Rowan',
  title: 'The Explorer',
  blurb:
    'Been everywhere, packed for all of it. No glaring weakness and a grappling recovery that reaches the ledge from anywhere.',
  art: camper(EXPLORER),
  height: 34,
  theme: { primary: '#c9a86a', dark: '#8d6b45', soft: '#d8c79b' },
  ...BASE,
  weight: 1.08,
  walk: 1.62,
  airAccel: 0.29,
  airMax: 1.5,
  gravity: 0.45,
  jump: -7.8,
  doubleJump: -7.0,
  hurt: { w: 20, h: 34 },
  stats: { power: 3, speed: 3, weight: 3 },
  moves: {
    jab: move('jab', 'Machete Cut', 'jab', {
      startup: 4, active: 3, recovery: 9,
      damage: 4, baseKb: 12, kbScale: 0.32, angle: 40,
      hit: { x: 16, y: 20, w: 16, h: 11 },
    }),
    side: move('side', 'Trailblaze', 'swing', {
      startup: 10, active: 4, recovery: 16,
      damage: 12, baseKb: 25, kbScale: 0.68, angle: 38,
      hit: { x: 18, y: 20, w: 19, h: 16 },
      selfVel: { x: 2.0 }, shake: 5,
    }),
    up: move('up', 'Summit Push', 'rise', {
      startup: 7, active: 5, recovery: 14,
      damage: 10, baseKb: 23, kbScale: 0.64, angle: 86,
      hit: { x: 3, y: 38, w: 19, h: 20 },
      selfVel: { y: -2.6 }, shake: 4,
    }),
    down: move('down', 'Pack Drop', 'quake', {
      startup: 9, active: 5, recovery: 17,
      damage: 10, baseKb: 20, kbScale: 0.5, angle: 60,
      hit: { x: 0, y: 7, w: 30, h: 13 },
      symmetric: true, killsMomentum: true, shake: 4,
    }),
    special: move('special', 'Grapple Line', 'burst', {
      startup: 6, active: 9, recovery: 16,
      damage: 7, baseKb: 17, kbScale: 0.4, angle: 84,
      hit: { x: 0, y: 30, w: 20, h: 30 },
      symmetric: true, selfVel: { x: 1.3, y: -8.8 },
      killsMomentum: true, helplessAfter: true, shake: 3,
    }),
  },
}

const VALE: CharDef = {
  id: 'vale',
  name: 'Vale',
  title: 'The Runner',
  blurb:
    'Never stops moving. Individually the hits are nothing; the problem is that there are always three more coming.',
  art: camper(RUNNER),
  height: 32,
  theme: { primary: '#e0794f', dark: '#a84f2c', soft: '#f2f0e4' },
  ...BASE,
  weight: 0.86,
  walk: 2.1,
  groundAccel: 0.6,
  friction: 0.72,
  airAccel: 0.34,
  airMax: 1.8,
  gravity: 0.43,
  jump: -8.1,
  doubleJump: -7.4,
  hurt: { w: 17, h: 32 },
  stats: { power: 1, speed: 5, weight: 2 },
  moves: {
    jab: move('jab', 'One-Two', 'jab', {
      startup: 3, active: 2, recovery: 6,
      damage: 3, baseKb: 9, kbScale: 0.26, angle: 46,
      hit: { x: 13, y: 20, w: 13, h: 10 },
    }),
    side: move('side', 'Flying Knee', 'swing', {
      startup: 8, active: 4, recovery: 14,
      damage: 10, baseKb: 22, kbScale: 0.6, angle: 40,
      hit: { x: 16, y: 20, w: 17, h: 15 },
      selfVel: { x: 2.8 }, shake: 4,
    }),
    up: move('up', 'High Knee', 'rise', {
      startup: 5, active: 5, recovery: 11,
      damage: 8, baseKb: 20, kbScale: 0.58, angle: 84,
      hit: { x: 2, y: 35, w: 17, h: 19 },
      selfVel: { y: -2.9 }, shake: 3,
    }),
    down: move('down', 'Slide', 'quake', {
      startup: 7, active: 5, recovery: 14,
      damage: 7, baseKb: 16, kbScale: 0.44, angle: 56,
      hit: { x: 0, y: 5, w: 30, h: 11 },
      symmetric: true, selfVel: { x: 1.6 }, shake: 3,
    }),
    special: move('special', 'Second Wind', 'burst', {
      startup: 5, active: 9, recovery: 14,
      damage: 6, baseKb: 15, kbScale: 0.36, angle: 80,
      hit: { x: 0, y: 27, w: 19, h: 26 },
      symmetric: true, selfVel: { x: 1.5, y: -8.5 },
      killsMomentum: true, helplessAfter: true, shake: 2,
    }),
  },
}

// ------------------------------------------------------------------ animals

const MOCHI: CharDef = {
  id: 'mochi',
  name: 'Mochi',
  title: 'The Calico',
  blurb:
    'Small, light and three jumps deep. Hard to pin down, hard to kill off the top, dies instantly to anything solid.',
  art: critter(CALICO_CAT),
  height: 24,
  theme: { primary: '#e8c9a8', dark: '#a8866a', soft: '#fbf7ef' },
  ...BASE,
  weight: 0.7,
  walk: 1.95,
  groundAccel: 0.58,
  airAccel: 0.34,
  airMax: 1.75,
  gravity: 0.4,
  fallMax: 6.4,
  jump: -7.4,
  doubleJump: -6.6,
  jumps: 3,
  hurt: { w: 24, h: 24 },
  stats: { power: 1, speed: 5, weight: 1 },
  moves: {
    jab: move('jab', 'Paw Swipe', 'jab', {
      startup: 3, active: 3, recovery: 7,
      damage: 3, baseKb: 10, kbScale: 0.28, angle: 44,
      hit: { x: 15, y: 12, w: 14, h: 10 },
    }),
    side: move('side', 'Pounce', 'swing', {
      startup: 8, active: 4, recovery: 15,
      damage: 10, baseKb: 22, kbScale: 0.62, angle: 38,
      hit: { x: 17, y: 12, w: 18, h: 13 },
      selfVel: { x: 2.9 }, shake: 4,
    }),
    up: move('up', 'Tail Whip', 'rise', {
      startup: 5, active: 5, recovery: 12,
      damage: 8, baseKb: 20, kbScale: 0.58, angle: 86,
      hit: { x: 0, y: 26, w: 20, h: 18 },
      symmetric: true, selfVel: { y: -2.7 }, shake: 3,
    }),
    down: move('down', 'Kneading', 'quake', {
      startup: 8, active: 5, recovery: 15,
      damage: 8, baseKb: 16, kbScale: 0.44, angle: 58,
      hit: { x: 0, y: 5, w: 26, h: 11 },
      symmetric: true, killsMomentum: true, shake: 3,
    }),
    special: move('special', 'Cat Leap', 'burst', {
      startup: 4, active: 9, recovery: 14,
      damage: 5, baseKb: 15, kbScale: 0.36, angle: 82,
      hit: { x: 0, y: 20, w: 18, h: 24 },
      symmetric: true, selfVel: { x: 1.4, y: -8.4 },
      killsMomentum: true, helplessAfter: true, shake: 2,
    }),
  },
}

const PEPPER: CharDef = {
  id: 'pepper',
  name: 'Pepper',
  title: 'The Shadow',
  blurb:
    'The other cat, and the mean one. Slower than Mochi but every swipe actually hurts. Still made of paper.',
  art: critter(BLACK_CAT),
  height: 25,
  theme: { primary: '#6b6259', dark: '#3b3630', soft: '#c9c2b8' },
  ...BASE,
  weight: 0.78,
  walk: 1.72,
  groundAccel: 0.52,
  airAccel: 0.3,
  airMax: 1.55,
  gravity: 0.43,
  jump: -7.5,
  doubleJump: -6.8,
  jumps: 3,
  hurt: { w: 25, h: 25 },
  stats: { power: 3, speed: 4, weight: 1 },
  moves: {
    jab: move('jab', 'Claw', 'jab', {
      startup: 4, active: 3, recovery: 8,
      damage: 4, baseKb: 11, kbScale: 0.32, angle: 42,
      hit: { x: 15, y: 13, w: 15, h: 10 },
    }),
    side: move('side', 'Ambush', 'swing', {
      startup: 10, active: 4, recovery: 17,
      damage: 13, baseKb: 26, kbScale: 0.7, angle: 36,
      hit: { x: 18, y: 13, w: 19, h: 14 },
      selfVel: { x: 2.4 }, shake: 5,
    }),
    up: move('up', 'Backflip', 'rise', {
      startup: 6, active: 5, recovery: 13,
      damage: 9, baseKb: 22, kbScale: 0.62, angle: 86,
      hit: { x: 0, y: 27, w: 20, h: 19 },
      symmetric: true, selfVel: { y: -2.8 }, shake: 3,
    }),
    down: move('down', 'Hiss', 'quake', {
      startup: 9, active: 5, recovery: 16,
      damage: 9, baseKb: 18, kbScale: 0.48, angle: 60,
      hit: { x: 0, y: 6, w: 28, h: 12 },
      symmetric: true, killsMomentum: true, shake: 4,
    }),
    special: move('special', 'Night Leap', 'burst', {
      startup: 5, active: 9, recovery: 15,
      damage: 6, baseKb: 16, kbScale: 0.38, angle: 82,
      hit: { x: 0, y: 21, w: 18, h: 24 },
      symmetric: true, selfVel: { x: 1.2, y: -8.1 },
      killsMomentum: true, helplessAfter: true, shake: 2,
    }),
  },
}

const BISCUIT: CharDef = {
  id: 'biscuit',
  name: 'Biscuit',
  title: 'The Good Dog',
  blurb:
    'Enthusiasm as a fighting style. Barrels in, knocks people over, and is genuinely delighted about all of it.',
  art: critter(SHIBA_DOG),
  height: 27,
  theme: { primary: '#e0a668', dark: '#a8703a', soft: '#fbf3e4' },
  ...BASE,
  weight: 1.12,
  walk: 1.78,
  groundAccel: 0.5,
  airAccel: 0.26,
  airMax: 1.4,
  gravity: 0.47,
  fallMax: 7.3,
  jump: -7.6,
  doubleJump: -6.8,
  hurt: { w: 28, h: 27 },
  stats: { power: 4, speed: 4, weight: 4 },
  moves: {
    jab: move('jab', 'Nip', 'jab', {
      startup: 4, active: 3, recovery: 8,
      damage: 4, baseKb: 12, kbScale: 0.32, angle: 40,
      hit: { x: 16, y: 14, w: 15, h: 10 },
    }),
    side: move('side', 'Tackle', 'swing', {
      startup: 10, active: 5, recovery: 17,
      damage: 13, baseKb: 27, kbScale: 0.7, angle: 36,
      hit: { x: 18, y: 13, w: 20, h: 15 },
      selfVel: { x: 3.0 }, shake: 5,
    }),
    up: move('up', 'Headbutt', 'rise', {
      startup: 7, active: 5, recovery: 14,
      damage: 11, baseKb: 24, kbScale: 0.66, angle: 86,
      hit: { x: 4, y: 28, w: 20, h: 19 },
      selfVel: { y: -2.7 }, shake: 4,
    }),
    down: move('down', 'Zoomies', 'quake', {
      startup: 9, active: 6, recovery: 16,
      damage: 10, baseKb: 20, kbScale: 0.5, angle: 58,
      hit: { x: 0, y: 6, w: 32, h: 12 },
      symmetric: true, selfVel: { x: 1.2 }, shake: 4,
    }),
    special: move('special', 'Big Jump', 'burst', {
      startup: 6, active: 9, recovery: 16,
      damage: 7, baseKb: 17, kbScale: 0.4, angle: 80,
      hit: { x: 0, y: 22, w: 20, h: 25 },
      symmetric: true, selfVel: { x: 1.3, y: -7.9 },
      killsMomentum: true, helplessAfter: true, shake: 3,
    }),
  },
}

const GULLY: CharDef = {
  id: 'gully',
  name: 'Gully',
  title: 'The Gull',
  blurb:
    'Three jumps, feather-light, and effectively impossible to knock off the map. Landing a kill is another matter.',
  art: critter(SEAGULL),
  height: 26,
  theme: { primary: '#dfe3e6', dark: '#8f979e', soft: '#ffffff' },
  ...BASE,
  weight: 0.66,
  walk: 1.5,
  groundAccel: 0.44,
  airAccel: 0.4,
  airMax: 1.9,
  gravity: 0.31,
  fallMax: 5.2,
  fastFallMax: 9.6,
  jump: -6.9,
  doubleJump: -6.4,
  jumps: 3,
  hurt: { w: 24, h: 26 },
  stats: { power: 1, speed: 4, weight: 1 },
  moves: {
    jab: move('jab', 'Peck', 'jab', {
      startup: 3, active: 3, recovery: 8,
      damage: 3, baseKb: 10, kbScale: 0.28, angle: 44,
      hit: { x: 16, y: 16, w: 15, h: 9 },
    }),
    side: move('side', 'Wing Slap', 'swing', {
      startup: 8, active: 5, recovery: 15,
      damage: 9, baseKb: 21, kbScale: 0.58, angle: 42,
      hit: { x: 18, y: 15, w: 20, h: 14 },
      selfVel: { x: 1.6 }, shake: 3,
    }),
    up: move('up', 'Updraft', 'rise', {
      startup: 5, active: 6, recovery: 12,
      damage: 7, baseKb: 19, kbScale: 0.56, angle: 88,
      hit: { x: 0, y: 28, w: 22, h: 20 },
      symmetric: true, selfVel: { y: -2.6 }, shake: 3,
    }),
    down: move('down', 'Dive Bomb', 'stomp', {
      startup: 8, active: 5, recovery: 16,
      damage: 9, baseKb: 14, kbScale: 0.42, angle: -76,
      hit: { x: 0, y: 3, w: 20, h: 12 },
      symmetric: true, selfVel: { y: 4.6 }, shake: 4,
    }),
    special: move('special', 'Take Flight', 'burst', {
      startup: 4, active: 10, recovery: 14,
      damage: 5, baseKb: 14, kbScale: 0.34, angle: 84,
      hit: { x: 0, y: 22, w: 20, h: 26 },
      symmetric: true, selfVel: { x: 1.6, y: -8.9 },
      killsMomentum: true, helplessAfter: true, shake: 2,
    }),
  },
}

export const ROSTER: CharDef[] = [
  BASIL,
  JUNIPER,
  KAI,
  WREN,
  DASH,
  BYTE,
  ROWAN,
  VALE,
  MOCHI,
  PEPPER,
  BISCUIT,
  GULLY,
]

export function charById(id: string): CharDef {
  return ROSTER.find((c) => c.id === id) ?? ROSTER[0]
}

/** Draws a roster fighter, camper or animal, at their canonical size. */
export function drawChar(
  ctx: CanvasRenderingContext2D,
  def: CharDef,
  x: number,
  y: number,
  opts: Omit<AvatarOpts, 'height'> & { scale?: number } = {},
): void {
  const { scale = 1, ...rest } = opts
  const o = { ...rest, height: def.height * scale }
  if (def.art.kind === 'critter') drawCritter(ctx, def.art.critter, x, y, o)
  else drawAvatar(ctx, def.art.avatar, x, y, o)
}
