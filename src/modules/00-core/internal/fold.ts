/**
 * Whether a panel is folded away, remembered between reloads.
 *
 * Here because there are now four panels wanting it - the perf HUD, the debug
 * panel's sections, the music player and the party dashboard - and three of
 * them had already written their own copy. Modules cannot import from
 * `src/app`, so a shared one has to live somewhere everything already depends
 * on.
 *
 * Every storage call is wrapped: a private window and blocked site data both
 * throw rather than returning null, and a panel that will not render because
 * it could not recall a boolean would be a silly way to lose the game.
 *
 * The key is versioned. Defaults here have changed once already, and without a
 * bump anyone who had opened a panel would keep it open forever and never see
 * the new one - a remembered choice made under a different default is not
 * really a choice.
 */
import { useState } from 'react'

const PREFIX = 'localrot.fold2.'

export function readFolded(key: string, initial = true): boolean {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    return raw === null ? initial : raw === '1'
  } catch {
    return initial
  }
}

export function writeFolded(key: string, folded: boolean): void {
  try {
    window.localStorage.setItem(PREFIX + key, folded ? '1' : '0')
  } catch {
    // Not worth caring about.
  }
}

/** `[folded, toggle]`, folded by default. */
export function useFolded(key: string, initial = true): [boolean, () => void] {
  const [folded, setFolded] = useState(() => readFolded(key, initial))
  const toggle = () => {
    setFolded((was) => {
      const next = !was
      writeFolded(key, next)
      return next
    })
  }
  return [folded, toggle]
}
