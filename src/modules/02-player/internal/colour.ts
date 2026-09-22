/**
 * The colour your duck is painted, chosen in settings and remembered.
 *
 * A small fixed palette rather than a free picker: every entry has been
 * checked against sand, sea and sky, and a lobby of eight ducks stays
 * tell-apart-able only while nobody can pick "slightly different beige".
 * Eight entries, on purpose - the most players a lobby holds, so nobody
 * can be left without one; see `09-net`'s `rosterColour` for what happens
 * to a body that never got a colour of its own.
 *
 * Kept here rather than in the app because the body is this module's, and
 * `09-net` - which already depends on it - reads the colour to put on the wire,
 * and moves a newcomer off whatever colour a lobby they just joined already has.
 */
import { createStore, useStore } from '../../00-core'

export const PLAYER_COLOURS: readonly { id: string; label: string; hex: string }[] = [
  { id: 'robin-egg', label: 'Robin Egg', hex: '#8FDDE5' },
  { id: 'coral', label: 'Coral', hex: '#F28C82' },
  { id: 'mango', label: 'Mango', hex: '#F6C85F' },
  { id: 'palm', label: 'Palm', hex: '#86B95A' },
  { id: 'ocean', label: 'Ocean', hex: '#5DA9D6' },
  { id: 'lavender', label: 'Lavender', hex: '#A88BD4' },
  { id: 'peach', label: 'Peach', hex: '#F3A66B' },
  { id: 'pink', label: 'Pink', hex: '#E98FB3' },
]

/** What a player is painted before they have ever chosen for themselves. */
const DEFAULT_COLOUR = PLAYER_COLOURS[0].hex

const KEY = 'localrot.playerColour'

/** Whether a string is a colour this game will paint a duck with. */
export function isPlayerColour(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function readStored(): string {
  try {
    const raw = window.localStorage.getItem(KEY)
    return isPlayerColour(raw) ? raw : DEFAULT_COLOUR
  } catch {
    return DEFAULT_COLOUR
  }
}

const colour = createStore<string>(typeof window === 'undefined' ? DEFAULT_COLOUR : readStored())

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
