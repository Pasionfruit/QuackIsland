/**
 * Wire protocol for Polyland's host-and-join play.
 *
 * The relay server knows almost nothing about any game: it hands out room
 * codes and forwards `relay` payloads to everyone else in the room (or, with
 * a `to` list, to just the named slots - the one primitive every game needs
 * to keep something private between two specific peers). Games define their
 * own payloads on top of that, so a new game does not need a new server.
 *
 * Case Closed is the one exception: `deal` and `accuse` are handled by the
 * server itself rather than forwarded, because its host is also a player -
 * if the host's own browser shuffled the deck or graded an accusation, the
 * host would see the solution before anyone else got a single guess in.
 * `SERVER_SLOT` marks a relay reply that came from the server this way,
 * rather than from another player.
 */

export const DEFAULT_PORT = 8787

export type Slot = number

/** `from` on a relay message when the server answered directly, not a peer. */
export const SERVER_SLOT: Slot = -1

/** Anything the client can send. */
export type ClientMessage =
  | { t: 'host'; game: string; name: string; max?: number }
  | { t: 'join'; code: string; name: string }
  | { t: 'leave' }
  | { t: 'relay'; payload: unknown; to?: Slot[] }
  | { t: 'deal'; suspects: string[]; weapons: string[]; rooms: string[]; slots: Slot[] }
  | { t: 'accuse'; suspect: string; weapon: string; room: string }
  | { t: 'reveal' }
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

/**
 * Sketch rides the same relay, but strokes do not go through the host at all
 * - the relay already broadcasts to everyone else in the room, so whoever is
 * drawing sends a stroke straight to every viewer in one hop. Only the game
 * state (whose turn, the timer, the word, scores) stays host-authoritative,
 * the same as every other game here.
 */
export type SketchPayload =
  | { k: 'stroke'; id: number; color: string; width: number; pts: [number, number][]; done: boolean; kind?: 'line' | 'fill' }
  | { k: 'undo'; id: number }
  | { k: 'clear' }
  | { k: 'guess'; text: string }
  | { k: 'addWord'; word: string }
  | { k: 'start'; mode: 'phone' | 'scribble' | 'collab'; config: unknown }
  | { k: 'snap'; s: unknown }
  | { k: 'submit'; text: string; strokes?: unknown }
  | { k: 'pickWord'; word: string }
  | { k: 'save' }

/** Hide & Seek rides the same relay: host simulates, guests send input. */
export type HidePayload =
  | { k: 'input'; i: { turn: number; move: number } }
  | { k: 'snap'; s: unknown }
  | { k: 'start'; mapId: string; runnerSlot: number }
  | { k: 'pickMap'; mapId: string }
  | { k: 'pickRunner'; slot: number }

/** Tank Trouble rides the same relay: host simulates, guests send input. */
export type TankPayload =
  | { k: 'input'; i: { moveX: number; moveY: number; aimX: number; aimY: number; fire: boolean; mine: boolean } }
  | { k: 'snap'; s: unknown }
  | { k: 'start'; mode: 'coop' | 'pvp' }
  | { k: 'color'; color: string }
  | { k: 'team'; team: number }

/**
 * Case Closed. Turn order, positions and the public log are host-authoritative
 * like every other game; only a card handed to disprove a suggestion rides a
 * targeted `relay` `to` the suggester alone, never broadcast. The deck and
 * solution never touch `relay` at all - see the `deal`/`accuse` top-level
 * ClientMessage cases the server itself answers.
 */
export type CaseClosedPayload =
  | { k: 'start'; suspectOf: Record<Slot, string> }
  | { k: 'snap'; s: unknown }
  // Guest -> host actions; the host applies each to its authoritative engine
  // the same way every other game's guest input works.
  | { k: 'roll' }
  | { k: 'move'; to: string }
  | { k: 'secretPassage'; to: string }
  | { k: 'suggest'; suspect: string; weapon: string }
  | { k: 'endTurn' }
  // The accuser broadcasts this only after the server has privately graded the
  // guess (see 'accuseResult' below) - the content and the outcome arrive
  // together so the host never has to trust an ungraded claim.
  | { k: 'accuseOutcome'; suspect: string; weapon: string; room: string; correct: boolean }
  /** Every non-suggesting player broadcasts whether they *could* disprove, in clockwise order - never which card. */
  | { k: 'checkResult'; canDisprove: boolean }
  /** Sent privately (`to: [suggester]`) by whoever disproves - the only card content that ever crosses the wire. */
  | { k: 'showCard'; card: string }
  | { k: 'hand'; cards: string[] }
  | { k: 'accuseResult'; correct: boolean; solution?: { suspect: string; weapon: string; room: string } }
  | { k: 'solved'; by: Slot; solution: { suspect: string; weapon: string; room: string } }

/**
 * Build & Betray rides the same relay: host simulates the whole match -
 * building and running alike - and guests send placement/removal/ready/vote
 * requests during the build and preview phases and raw movement input during
 * the run, the same guest-sends-input shape as Hide & Seek and Tank Trouble.
 */
export type BuildBetrayPayload =
  | {
      k: 'start'
      config: { mode: 'classic' | 'quick' | 'chaos'; targetScore: number; totalRounds: number; buildSeconds: number; runSeconds: number }
    }
  | { k: 'snap'; s: unknown }
  | { k: 'place'; pieceId: string; gx: number; gy: number; dir: 1 | -1 }
  | { k: 'remove'; uid: number }
  | { k: 'ready'; on: boolean }
  | { k: 'vote'; category: 'difficulty' | 'creative' | 'devious'; choice: number }
  | { k: 'input'; i: { left: boolean; right: boolean; jump: boolean } }

/**
 * Party Parade rides the same relay: the host owns the die and the walk, and
 * a guest sends nothing but "I want to roll" and "I want to be that animal".
 * `start` carries the whole roster - names and chosen animals - so every peer
 * builds an identical board rather than inferring one from peer order.
 */
export type PartyParadePayload =
  | { k: 'start'; roster: { slot: Slot; name: string; castIndex: number }[] }
  | { k: 'snap'; s: unknown }
  | { k: 'roll' }
  /** A guest choosing an animal. Lobby only - you are stuck with it once the parade starts. */
  | { k: 'pick'; castIndex: number }
  /** The host echoing every lobby choice back out, so nobody picks a taken animal. */
  | { k: 'picks'; map: [Slot, number][] }
  /** Which way to go at the causeway fork. */
  | { k: 'route'; shortcut: boolean }
  /** A scribble on the map, in world units as flat x,y pairs. Peer to peer - the relay already fans it out. */
  | { k: 'ink'; color: string; pts: number[] }
  /** Rubs out everything the sender drew. */
  | { k: 'clearInk' }
  /** Drop the room into a minigame. The seed travels so every peer builds the same one. */
  | { k: 'mgStart'; id: string; seed: number; roster: { slot: Slot; name: string; color: string; castIndex: number }[] }
  | { k: 'mgInput'; i: { press: boolean; left: boolean; right: boolean } }
  | { k: 'mgSnap'; s: unknown }
  /** Back out of the minigame to wherever we came from. */
  | { k: 'mgLeave' }

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
  jumps: number,
  spin: number,
  squash: number,
  anim: number,
]

export const PHASES = ['intro', 'fight', 'ko', 'over'] as const
export const STATES = ['idle', 'walk', 'attack', 'hitstun', 'falling', 'dead', 'shield', 'dodge'] as const
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
