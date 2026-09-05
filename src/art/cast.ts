import type { AvatarDef } from './avatar'
import type { CritterDef } from './critter'

/**
 * The Polyland cast.
 *
 * Five animals with jobs and opinions. Games reference these by name, so a
 * character added here shows up anywhere the cast is drawn.
 */

/** ContrlZee - raccoon, programmer, permanently mid-refactor. */
export const CONTRLZEE: AvatarDef = {
  species: 'raccoon',
  fur: '#9a978f',
  belly: '#e8dfd0',
  markings: '#38352f',
  nose: '#2a2622',
  earInner: '#6f6a62',
  tail: 'ringed',
  top: '#2f2d2a',
  sleeves: 'long',
  legs: '#3a3733',
  feet: '#2a2724',
  hat: 'hood',
  hatColor: '#2f2d2a',
  accessory: 'laptop',
  accessoryColor: '#8f959b',
  accessoryAccent: '#5c6167',
  print: 'code',
  printColor: '#d9d3c4',
}

/** NinjaPenguin - penguin, ninja, absolutely committed to the bit. */
export const NINJAPENGUIN: AvatarDef = {
  species: 'penguin',
  fur: '#2e2c2b',
  belly: '#f2ece0',
  nose: '#2a2622',
  beak: '#e8a33c',
  tail: 'stub',
  legs: '#2e2c2b',
  feet: '#e8a33c',
  hat: 'headband',
  hatColor: '#2a2826',
  hatAccent: '#c8483c',
  accessory: 'none',
  pack: '#7d5a3a',
  satchel: '#8d6b45',
}

/** teninchtoenail - lion, salesman, has a deal for you. */
export const TENINCHTOENAIL: AvatarDef = {
  species: 'lion',
  fur: '#d9a05b',
  belly: '#f2dfba',
  markings: '#a8672f',
  nose: '#8a5a3a',
  tail: 'tufted',
  top: '#3d4a5c',
  topAccent: '#f4f1e8',
  sleeves: 'long',
  legs: '#333d4c',
  feet: '#2b3038',
  hat: 'none',
  accessory: 'briefcase',
  accessoryColor: '#7d5a3a',
  accessoryAccent: '#4f3a26',
  print: 'tie',
  printColor: '#c8483c',
}

/** diva - frog, fashionista, dressed for a better party than this one. */
export const DIVA: AvatarDef = {
  species: 'frog',
  fur: '#8fa86a',
  belly: '#e8e4c6',
  nose: '#5f7a52',
  tail: 'none',
  top: '#c85f96',
  topAccent: '#f0d4e2',
  sleeves: 'short',
  legs: '#a8527c',
  feet: '#7f9c62',
  hat: 'bow',
  hatColor: '#e8c05f',
  eyewear: 'shades',
  eyewearColor: '#2b2622',
  accessory: 'handbag',
  accessoryColor: '#d94f7f',
  accessoryAccent: '#e8c05f',
  print: 'star',
  printColor: '#f0d4e2',
}

/** MrPasionfruit - black cat, athlete, already three reps ahead of you. */
export const MRPASIONFRUIT: AvatarDef = {
  species: 'cat',
  fur: '#35322f',
  belly: '#57524c',
  nose: '#c98d92',
  earInner: '#8a6a6c',
  tail: 'long',
  top: '#7a4f8c',
  topAccent: '#e8c05f',
  sleeves: 'tank',
  legs: '#2b2926',
  feet: '#f2f0e4',
  hat: 'visor',
  hatColor: '#f2f0e4',
  hatAccent: '#e8c05f',
  accessory: 'bottle',
  accessoryColor: '#e8c05f',
  accessoryAccent: '#7a4f8c',
}

/** NightShift - leopard, night-shift security, has not blinked since Tuesday. */
export const NIGHTSHIFT: AvatarDef = {
  species: 'leopard',
  fur: '#d8b25c',
  belly: '#f2e3c0',
  markings: '#3a2f22',
  spots: '#4a3a26',
  nose: '#6b4a3a',
  earInner: '#a8845a',
  tail: 'long',
  top: '#2f3a44',
  topAccent: '#c8a24a',
  sleeves: 'short',
  legs: '#2a333c',
  feet: '#1f262c',
  hat: 'visor',
  hatColor: '#2f3a44',
  hatAccent: '#c8a24a',
  accessory: 'mug',
  accessoryColor: '#3f4a54',
  accessoryAccent: '#c8a24a',
}

export const CAST: AvatarDef[] = [
  CONTRLZEE,
  NINJAPENGUIN,
  TENINCHTOENAIL,
  DIVA,
  MRPASIONFRUIT,
  NIGHTSHIFT,
]

// ------------------------------------------------------------------ critters

/** Background animals. These stay on four legs (or wings). */

export const CALICO_CAT: CritterDef = {
  kind: 'cat',
  body: '#f0e7db',
  belly: '#fbf7ef',
  patch: '#7d6a5c',
  ear: '#e2b9a8',
  nose: '#d78f92',
  tail: 'long',
  feet: '#fbf7ef',
}

export const BLACK_CAT: CritterDef = {
  kind: 'cat',
  body: '#3b3630',
  belly: '#4a443c',
  ear: '#5a4f47',
  nose: '#c98d92',
  tail: 'long',
  feet: '#4a443c',
}

export const SHIBA_DOG: CritterDef = {
  kind: 'dog',
  body: '#e0a668',
  belly: '#fbf3e4',
  patch: '#f6e9d4',
  ear: '#c98a4d',
  nose: '#3a322c',
  tail: 'curl',
  feet: '#fbf3e4',
  collar: '#d0664f',
}

export const SEAGULL: CritterDef = {
  kind: 'bird',
  body: '#f4f2ea',
  belly: '#ffffff',
  ear: '#c9cdd2',
  nose: '#e8a33c',
  beak: '#e8a33c',
  feet: '#e8a33c',
  tail: 'fan',
}

export const DUCK: CritterDef = {
  kind: 'bird',
  body: '#5f7a52',
  belly: '#c9b98f',
  ear: '#4a5f42',
  nose: '#e8a33c',
  beak: '#e0a63c',
  feet: '#e0a63c',
  tail: 'fan',
}

export const CRITTERS: CritterDef[] = [CALICO_CAT, BLACK_CAT, SHIBA_DOG, SEAGULL, DUCK]
