/**
 * What the host has the party doing: nothing, reading about a game, or playing
 * one.
 *
 * Browsing the catalogue stays local - the host flicking through forty-one
 * tiles has no business dragging anybody's screen about - but the moment they
 * *open* one, everybody goes with them, and when they press play everybody
 * plays. That is the whole of this file.
 *
 * It rides on `hostChoice` from `13-modes`, the same machinery that carries
 * which game the lobby is playing and what the weather is: the host owns it,
 * guests are told, a joiner asks, leaving forgets. Written as a string because
 * that is what a choice carries, and because two fields packed into one value
 * cannot arrive half-applied.
 *
 * **Guests follow a change, not the value.** A guest who steps out of a round
 * would otherwise be dragged straight back in on the next frame and could
 * never leave at all. So the call is applied when it *becomes* something new,
 * and sitting one out lasts until the host starts something else.
 */
import { isMinigameId, type MinigameId } from './catalogue'

/** Reading about a game, or playing it. The two things a guest is taken into. */
export type CallKind = 'open' | 'play'

/** Nothing on. What a lobby is doing when the host is out in the world. */
export const NO_CALL = 'none'

export type MinigameCall = typeof NO_CALL | `${string}:${CallKind}`

export interface ParsedCall {
  id: MinigameId
  kind: CallKind
}

export function encodeCall(id: MinigameId, kind: CallKind): MinigameCall {
  return `${id}:${kind}`
}

/**
 * Reads a call back, or `null` for "nothing on".
 *
 * Total on anything: this is what a value off the wire goes through, so a game
 * this build has never heard of and a string with no colon in it have to be
 * the same kind of nothing rather than an exception in a socket callback.
 */
export function parseCall(call: string): ParsedCall | null {
  if (call === NO_CALL) return null
  const cut = call.lastIndexOf(':')
  if (cut <= 0) return null
  const id = call.slice(0, cut)
  const kind = call.slice(cut + 1)
  if (!isMinigameId(id)) return null
  if (kind !== 'open' && kind !== 'play') return null
  return { id, kind }
}

/** Whether a value off the wire is a call this build can act on. */
export function isMinigameCall(value: unknown): value is MinigameCall {
  if (typeof value !== 'string') return false
  return value === NO_CALL || parseCall(value) !== null
}

/**
 * What a browser should do about a call it has just been handed.
 *
 * Pure, and the whole rule, because getting it wrong is silent in both
 * directions: a guest that ignores the call sits in the world while everybody
 * else plays, and a guest that over-applies it can never close the screen.
 *
 * - **Nothing happens unless the call changed.** See the note at the top.
 * - **The host acts on nothing.** It is their own call coming back to them;
 *   they are already where it says they are.
 * - **`none` closes whatever was open**, which is how the host leaving a game
 *   takes everybody out of it.
 */
export function followCall(
  call: MinigameCall,
  last: MinigameCall,
  isHost: boolean,
): { act: boolean; open: ParsedCall | null } {
  if (isHost || call === last) return { act: false, open: null }
  return { act: true, open: parseCall(call) }
}
