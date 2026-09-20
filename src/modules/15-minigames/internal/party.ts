/**
 * Who is the 1, in a one-vs-all game.
 *
 * A one-vs-all game is one player against everybody else, and **the host says who
 * the one is**: on the game's own screen, before it starts, the party is laid out and
 * the host clicks a name - or rolls the dice and lets it be somebody at random. It
 * rides on `hostChoice`, the same machinery as which game the lobby has open: the
 * host owns it, everybody is told, a joiner asks. Everybody reads the same name on
 * their own screen, and a game that needs to know asks `getTheOne` or `useTheOne`.
 *
 * Nothing here plays anything. If the person who was the one leaves the lobby, they
 * are no longer in the party, so nobody is the one until the host picks again -
 * and the screen picks the host in the meantime rather than leave it empty.
 */
import { isHost } from '../../09-net'
import { hostChoice } from '../../13-modes'

/** Nobody chosen yet. */
export const NO_ONE = 'none'

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 64

/** Who the host has said is the 1. Its tag is unique across the build. */
export const theOne = hostChoice<string>('minigame-one', isId, NO_ONE)

export interface Member {
  id: string
  name: string
  /** This browser. */
  you: boolean
  host: boolean
}

/**
 * Everybody in the party, the host first and then the rest as the lobby has them.
 * Alone, just you - and you are the host.
 */
export function partyOf(me: { id: string; name: string }, peers: readonly { id: string; name: string }[]): Member[] {
  const everybody = [{ id: me.id, name: me.name }, ...peers.filter((p) => p.id !== me.id)]
  const ids = everybody.map((p) => p.id)
  const hostId = ids.find((id) => isHost(id, ids.filter((other) => other !== id))) ?? me.id
  const members = everybody.map((p) => ({ id: p.id, name: p.name, you: p.id === me.id, host: p.id === hostId }))
  return [...members.filter((m) => m.host), ...members.filter((m) => !m.host)]
}

/** Whether a chosen id is somebody in the party. */
export function isInParty(party: readonly Member[], id: string | null): id is string {
  return id !== null && party.some((m) => m.id === id)
}

/**
 * A member of the party at random, for the dice - or `null` for an empty one.
 * `random` is a number in [0, 1).
 */
export function randomOne(party: readonly Member[], random: () => number = Math.random): string | null {
  if (party.length === 0) return null
  return party[Math.min(party.length - 1, Math.floor(random() * party.length))].id
}

/** Who the host has said is the 1, or null when nobody has been. */
export function getTheOne(): string | null {
  const now = theOne.get()
  return now === NO_ONE ? null : now
}

/** Who is the 1, for React. */
export function useTheOne(): string | null {
  const now = theOne.use()
  return now === NO_ONE ? null : now
}

/** The host says who the 1 is. A guest calling it changes nothing. */
export function chooseTheOne(id: string): void {
  theOne.set(id)
}
