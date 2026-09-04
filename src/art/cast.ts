import type { AvatarDef } from './avatar'
import type { CritterDef } from './critter'

/**
 * Everyone who lives in Polyland. Games reference these by name, so a camper
 * added here shows up anywhere the cast is drawn.
 */

// ------------------------------------------------------------------ campers

export const CHEF: AvatarDef = {
  skin: '#f7ddc0',
  hair: '#5c3f2c',
  hairStyle: 'bob',
  top: '#f8f5ed',
  legs: '#3b3730',
  shoes: '#2a2722',
  hat: 'toque',
  hatColor: '#fcfaf4',
  accessory: 'pan',
  accessoryColor: '#4b4740',
  accent: '#efe9db',
}

export const HIKER: AvatarDef = {
  skin: '#f3d4b6',
  hair: '#2f2823',
  hairStyle: 'short',
  top: '#41504e',
  legs: '#38342f',
  shoes: '#2b2723',
  hat: 'none',
  accessory: 'staff',
  accessoryColor: '#a07a4d',
  pack: '#33566b',
}

export const SURFER: AvatarDef = {
  skin: '#e8bd92',
  hair: '#8a6a3f',
  hairStyle: 'curly',
  top: '#f0d9b8',
  sleeves: 'tank',
  legs: '#2f6f86',
  shoes: '#e7ded0',
  hat: 'none',
  eyewear: 'goggles',
  eyewearColor: '#2f6f86',
  accessory: 'board',
  accessoryColor: '#7cc4d6',
  accessoryAccent: '#f2f0e4',
}

export const FISHER: AvatarDef = {
  skin: '#f5d8ba',
  hair: '#6b4a33',
  hairStyle: 'long',
  top: '#5d6f4e',
  legs: '#3a3630',
  shoes: '#4a4038',
  hat: 'bucket',
  hatColor: '#cbb98f',
  accessory: 'rod',
  accessoryColor: '#8a8378',
  accessoryAccent: '#d0664f',
  satchel: '#8d6b45',
}

export const BIKER: AvatarDef = {
  skin: '#e9c39c',
  hair: '#3a2f28',
  hairStyle: 'ponytail',
  top: '#3f8ea3',
  sleeves: 'short',
  legs: '#2c2a28',
  shoes: '#1f1d1b',
  hat: 'helmet',
  hatColor: '#f4f2ea',
  hatAccent: '#3b4650',
  eyewear: 'shades',
  eyewearColor: '#2b3238',
  accessory: 'bottle',
  accessoryColor: '#d0664f',
  accent: '#2f6f86',
}

export const CODER: AvatarDef = {
  skin: '#f2d2b2',
  hair: '#4a3527',
  hairStyle: 'short',
  top: '#4a6fa8',
  legs: '#33302b',
  shoes: '#26241f',
  hat: 'none',
  headphones: '#3b3f45',
  accessory: 'laptop',
  accessoryColor: '#b9bec4',
  accessoryAccent: '#6f757c',
}

export const EXPLORER: AvatarDef = {
  skin: '#e5b98d',
  hair: '#2e2622',
  hairStyle: 'bun',
  top: '#c9b48a',
  sleeves: 'short',
  legs: '#6d7a53',
  shoes: '#5a4632',
  hat: 'safari',
  hatColor: '#d8c79b',
  hatAccent: '#8d6b45',
  accessory: 'none',
  satchel: '#8d6b45',
  pack: '#7d6a4a',
}

export const RUNNER: AvatarDef = {
  skin: '#c98d5f',
  hair: '#1f1a17',
  hairStyle: 'buzz',
  top: '#e0794f',
  sleeves: 'tank',
  legs: '#3a3630',
  shoes: '#f2f0e4',
  hat: 'visor',
  hatColor: '#f2f0e4',
  hatAccent: '#e0794f',
  accessory: 'none',
  accent: '#f2f0e4',
}

export const HOODIE: AvatarDef = {
  skin: '#f7ddc0',
  hair: '#33291f',
  hairStyle: 'curly',
  top: '#3f7d8c',
  legs: '#33302b',
  shoes: '#26241f',
  hat: 'hood',
  hatColor: '#3f7d8c',
  accessory: 'none',
}

export const CAMPERS: AvatarDef[] = [
  CHEF,
  HIKER,
  SURFER,
  FISHER,
  BIKER,
  CODER,
  EXPLORER,
  RUNNER,
  HOODIE,
]

// ------------------------------------------------------------------ critters

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

export const CRITTERS: CritterDef[] = [CALICO_CAT, BLACK_CAT, SHIBA_DOG, SEAGULL]
