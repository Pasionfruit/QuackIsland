/**
 * Which games there are, and how the choice travels between browsers.
 *
 * All pure. The catalogue is data rather than a switch statement on purpose:
 * the lobby draws whatever is in it, so adding a third game is one entry here
 * and a module that mounts itself when it is chosen - not a new branch in the
 * interface.
 *
 * A mode is **not** a module. `island` is played by `10-party`, and whatever
 * plays `garden` does not exist yet. This file knows the names of the games
 * and nothing whatever about how any of them work.
 */

export type ModeId = 'island' | 'garden'

export interface GameMode {
  id: ModeId
  /** What the lobby calls it. */
  title: string
  /** One line under the title. */
  blurb: string
  /**
   * Whether the game behind it exists.
   *
   * A mode is listed from the moment it is decided on and long before it can
   * be played, because the whole point of the lobby is to say what is coming.
   * The interface reads this to stop a host starting a game that is not there
   * yet - which would otherwise drop everybody onto an empty island wondering
   * what they were meant to do.
   */
  built: boolean
}

/**
 * Every game the party can be pointed at, in the order the lobby lists them.
 *
 * Frozen, because this is read by the interface every render and a catalogue
 * that anything could push onto is a catalogue that will be pushed onto.
 */
export const MODES: readonly GameMode[] = Object.freeze([
  Object.freeze({
    id: 'island',
    title: 'Volcano Island',
    blurb: 'A spiral race up the volcano. Everyone is moved to the party island.',
    built: true,
  }),
  Object.freeze({
    id: 'garden',
    title: 'Garden Defence',
    blurb: 'Flat 2D lanes: plant along a grid and hold back what walks in.',
    built: false,
  }),
]) as readonly GameMode[]

/**
 * What a lobby is playing until somebody says otherwise.
 *
 * The one that is built, so a party that never opens the popup still has a
 * game it can start.
 */
export const DEFAULT_MODE: ModeId = 'island'

export function isModeId(value: unknown): value is ModeId {
  return MODES.some((mode) => mode.id === value)
}

/**
 * The entry for an id.
 *
 * Total on `ModeId`, so callers do not each carry their own "or else". An id
 * off the wire has already been through `isModeId` by the time it gets here;
 * a defaulted entry is the belt and braces for the day the two disagree.
 */
export function modeById(id: ModeId): GameMode {
  return MODES.find((mode) => mode.id === id) ?? MODES[0]
}

/** Whether the host may actually start this one, or it is still a promise. */
export function isPlayable(id: ModeId): boolean {
  return modeById(id).built
}

/**
 * The next mode along, wrapping.
 *
 * So the lobby can be walked with a key as well as clicked, and so the
 * wrapping is written once and tested rather than open-coded in the panel.
 */
export function nextMode(id: ModeId, step = 1): ModeId {
  const at = MODES.findIndex((mode) => mode.id === id)
  const from = at < 0 ? 0 : at
  const to = (((from + step) % MODES.length) + MODES.length) % MODES.length
  return MODES[to].id
}

/** A mode message, as it goes over the room channel. */
export interface ModeMessage {
  /** What the host has chosen. Only the host's copy counts. */
  mode?: ModeId
  /** A guest, newly arrived, asking what everybody is playing. */
  ask?: boolean
}

/**
 * Reads a mode message off the wire.
 *
 * As untrusted as everything else another browser sends. A mode nobody has
 * heard of is the dangerous one: taken on trust it would leave the lobby
 * pointing at a game that does not exist, with no way to select back out of
 * it, so present-but-wrong rejects the whole message rather than being
 * quietly dropped.
 */
export function decodeMode(message: Record<string, unknown>): ModeMessage | null {
  if (message.t !== 'mode') return null
  const out: ModeMessage = {}
  if (message.mode !== undefined) {
    if (!isModeId(message.mode)) return null
    out.mode = message.mode
  }
  if (message.ask !== undefined) {
    if (typeof message.ask !== 'boolean') return null
    out.ask = message.ask
  }
  return out
}

export function encodeMode(message: ModeMessage): Record<string, unknown> {
  return { t: 'mode', ...message }
}
