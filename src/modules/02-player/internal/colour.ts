/**
 * The colour your duck is painted, chosen in settings and remembered.
 *
 * A small fixed palette rather than a free picker: every entry has been
 * checked against sand, sea and sky, and a lobby of eight ducks stays
 * tell-apart-able only while nobody can pick "slightly different beige".
 *
 * Kept here rather than in the app because the body is this module's, and
 * `09-net` - which already depends on it - reads the colour to put on the wire.
 */
import { createStore, useStore } from '../../00-core'
import { AVATAR } from './avatar'

export const PLAYER_COLOURS: readonly { id: string; label: string; hex: string }[] = [
  { id: 'red', label: 'Red', hex: AVATAR.bodyColour },
  { id: 'orange', label: 'Orange', hex: '#f08a2c' },
  { id: 'yellow', label: 'Yellow', hex: '#f2c230' },
  { id: 'green', label: 'Green', hex: '#4fae4c' },
  { id: 'teal', label: 'Teal', hex: '#2fa5a0' },
  { id: 'blue', label: 'Blue', hex: '#3f7fd6' },
  { id: 'purple', label: 'Purple', hex: '#8a5cd0' },
  { id: 'pink', label: 'Pink', hex: '#e46aa8' },
  { id: 'white', label: 'White', hex: '#f1ede4' },
  { id: 'black', label: 'Black', hex: '#3a3a40' },
]

const KEY = 'localrot.playerColour'

/** Whether a string is a colour this game will paint a duck with. */
export function isPlayerColour(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function readStored(): string {
  try {
    const raw = window.localStorage.getItem(KEY)
    return isPlayerColour(raw) ? raw : AVATAR.bodyColour
  } catch {
    return AVATAR.bodyColour
  }
}

const colour = createStore<string>(typeof window === 'undefined' ? AVATAR.bodyColour : readStored())

export function getPlayerColour(): string {
  return colour.get()
}

export function usePlayerColour(): string {
  return useStore(colour)
}

export function setPlayerColour(next: string): void {
  if (!isPlayerColour(next)) return
  colour.set(next)
  try {
    window.localStorage.setItem(KEY, next)
  } catch {
    // A colour that is forgotten on reload is not worth breaking anything for.
  }
}
