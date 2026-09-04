/**
 * Polyland's cozy palette. Warm neutrals, soft greens, muted teal - the
 * low-poly camping look rather than neon.
 */
export const PAL = {
  // Sky and light
  skyHigh: '#8fb8c9',
  skyMid: '#b9d2d6',
  skyLow: '#e8dcc4',
  skyGlow: '#f6d9ab',
  sun: '#fff0cd',
  cloud: '#f4f1e6',
  cloudShade: '#dcd8c8',

  // Land
  grass: '#8bab63',
  grassLit: '#a7c47a',
  grassShade: '#6b8a4c',
  dirt: '#9c7d5b',
  dirtShade: '#7a5f43',
  rock: '#a8a396',
  rockShade: '#837e73',
  wood: '#a97e52',
  woodShade: '#7d5a3a',

  // Trees
  pine: '#5c7f57',
  pineShade: '#43613f',
  pineLit: '#749a68',
  trunk: '#6b4f3a',

  // Water
  water: '#7fa8b5',
  waterLit: '#9dc0c8',
  waterShade: '#5d8593',

  // Fire
  fire: '#ffb04a',
  fireHot: '#ffe08a',
  fireDeep: '#e8703a',

  // Ink
  ink: '#33302c',
  inkSoft: '#4d4842',
  shadow: 'rgba(60, 52, 44, 0.28)',
  white: '#fbf8f0',
  cream: '#f2e9d8',
} as const

/** Warm greys used for character shadows on the ground. */
export const GROUND_SHADOW = '#8d8578'
