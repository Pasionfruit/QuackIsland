/**
 * Wire protocol for Polyland's host-and-join play.
 *
 * The relay server knows nothing about any game: it hands out room codes and
 * forwards `relay` payloads to everyone else in the room. Games define their
 * own payloads on top, so a new game does not need a new server.
 */

export const DEFAULT_PORT = 8787

export type Slot = number

/** Anything the client can send. */
export type ClientMessage =
  | { t: 'host'; game: string; name: string; max?: number }
  | { t: 'join'; code: string; name: string }
  | { t: 'leave' }
  | { t: 'relay'; payload: unknown }
  | { t: 'ping' }

/** Anything the server can send. */
export type ServerMessage =
  | { t: 'hosted'; code: string; slot: Slot }
  | { t: 'joined'; code: string; slot: Slot }
  | { t: 'peers'; players: PeerInfo[] }
  | { t: 'relay'; from: Slot; payload: unknown }
  | { t: 'closed'; reason: string }
  | { t: 'error'; message: string }
  | { t: 'pong' }

export interface PeerInfo {
  slot: Slot
  name: string
}

// ------------------------------------------------------------- game payloads

/** Smash-specific payloads, carried inside `relay`. */
/**
 * Duck szn rides the same relay. The host runs the gallery and broadcasts
 * snapshots; everyone else sends where their reticle is and when they pulled
 * the trigger, and the host decides what was hit.
 */
export type DuckPayload =
  | { k: 'aim'; x: number; y: number }
  | { k: 'shoot'; x: number; y: number }
  | { k: 'snap'; s: unknown }
  | { k: 'start' }
  | { k: 'again' }

/** Tank Trouble rides the same relay: host simulates, guests send input. */
export type TankPayload =
  | { k: 'input'; i: { moveX: number; moveY: number; aimX: number; aimY: number; fire: boolean; mine: boolean } }
  | { k: 'snap'; s: unknown }
  | { k: 'start' }

export type SmashPayload =
  | { k: 'pick'; slot: Slot; charId: string }
  | { k: 'rules'; stocks: number }
  | { k: 'start'; chars: [string, string]; stocks: number }
  | { k: 'input'; frame: number; bits: number }
  | { k: 'snap'; s: Snapshot }
  | { k: 'rematch' }
  | { k: 'toLobby' }

/**
 * One frame of match state. Arrays rather than objects: this goes out 60 times
 * a second and the shape is fixed.
 */
export interface Snapshot {
  /** frame, phase index, phase timer, banner timer, winner (-1 for none) */
  m: [number, number, number, number, number]
  banner: string
  /** One packed fighter per slot. */
  a: FighterSnap[]
}

export type FighterSnap = [
  x: number,
  y: number,
  vx: number,
  vy: number,
  facing: number,
  state: number,
  move: number,
  moveFrame: number,
  percent: number,
  stocks: number,
  hitstun: number,
  hitlag: number,
  invuln: number,
  respawnTimer: number,
  fallTimer: number,
  spin: number,
  squash: number,
  anim: number,
]

export const PHASES = ['intro', 'fight', 'ko', 'over'] as const
export const STATES = ['idle', 'walk', 'attack', 'hitstun', 'falling', 'dead'] as const
export const FACINGS = ['up', 'down', 'left', 'right'] as const
export const MOVES = [
  'attack',
  'attackSide',
  'attackUp',
  'attackDown',
  'special',
  'specialSide',
  'specialUp',
  'specialDown',
] as const

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Room codes skip characters that look alike when read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function makeRoomCode(len = 4): string {
  let out = ''
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

/** Keeps only characters the generator can actually produce. */
export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((c) => CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, 6)
}
