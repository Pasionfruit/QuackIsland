/**
 * Stopping a round, for everybody, and who is allowed to start it again.
 *
 * **A pause is shared, and it is the host's.** Only the host can stop the
 * round - guests in a party work no button on the minigame screen - and when
 * they do, every browser stops and says so. `state.ts` holds that rule; the
 * pure `mayControl` below is kept for whoever paused, and is no longer what the
 * screen asks.
 *
 * **Whoever stopped it is the one who starts it again.** Resume, restart and
 * leaving are theirs; everybody else is told to wait and told who for. Two
 * people reaching for the same round at once is how you get a round that
 * resumes half a second after somebody paused it to go and answer the door.
 *
 * **Unless they are gone.** If the person who paused has left the lobby, the
 * buttons belong to whoever is left - otherwise closing a browser strands
 * everybody in front of a card nobody can dismiss. That is the whole of the
 * exception, and it is the only reason `mayControl` needs to know who is here.
 *
 * This file is pure: a message, a reader for it, and the rule. The sending and
 * the store live in `state.ts`.
 */

/** The three things the pause card can ask of everybody. */
export type PauseAct = 'pause' | 'resume' | 'restart'

/** Who stopped the round. Carried with the message so a name is never looked up. */
export interface Pauser {
  id: string
  name: string
}

export interface PauseMessage {
  act: PauseAct
  by: Pauser
}

export const PAUSE_TAG = 'mg-pause'

/** How long a name may be on the wire. Long enough for any name `cleanName` makes. */
export const NAME_MAX = 24

const ACTS: readonly PauseAct[] = ['pause', 'resume', 'restart']

export function encodePause(message: PauseMessage): Record<string, unknown> {
  return { t: PAUSE_TAG, a: message.act, i: message.by.id, n: message.by.name.slice(0, NAME_MAX) }
}

/**
 * Reads a pause message back, or `null`.
 *
 * Total on anything, like every other decoder here: this is what arrives off a
 * socket, so a message from a build that has never heard of pausing and a
 * message with an act nobody recognises have to be the same kind of nothing.
 */
export function decodePause(message: Record<string, unknown>): PauseMessage | null {
  if (message.t !== PAUSE_TAG) return null
  const act = message.a
  if (typeof act !== 'string' || !ACTS.includes(act as PauseAct)) return null
  const id = message.i
  const name = message.n
  if (typeof id !== 'string' || id.length === 0 || id.length > NAME_MAX * 2) return null
  if (typeof name !== 'string' || name.length > NAME_MAX) return null
  return { act: act as PauseAct, by: { id, name } }
}

/**
 * Whether `me` may resume, restart or leave a round that is stopped.
 *
 * `here` is everybody in the lobby, your own id included. Alone it is just you,
 * and you paused it, so it is yours either way.
 *
 * Pure, and the whole rule:
 *
 * - **Nothing to control** while the round is not paused.
 * - **The one who paused it** controls it.
 * - **Anybody**, once the one who paused it is no longer here.
 */
export function mayControl(pausedBy: Pauser | null, me: string, here: readonly string[]): boolean {
  if (!pausedBy) return false
  if (pausedBy.id === me) return true
  return !here.includes(pausedBy.id)
}

/** What to call whoever paused it, on somebody else's screen. */
export function nameOfPauser(pausedBy: Pauser | null, me: string): string {
  if (!pausedBy) return ''
  if (pausedBy.id === me) return 'you'
  return pausedBy.name.trim().length > 0 ? pausedBy.name : 'somebody'
}
