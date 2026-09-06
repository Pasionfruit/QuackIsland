/**
 * Per-game, per-action key rebinding, persisted to `localStorage`.
 *
 * Every game keeps defining its own default key codes wherever it already
 * did; this only layers an optional override on top, keyed by a short string
 * like `smash.p0.attack` or `hide.up`. A game that has never been remapped
 * reads back exactly its defaults - nothing here changes behaviour until a
 * player actually opens a controls panel and rebinds something.
 */

const STORAGE_KEY = 'polyland:controls'

function readAll(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* private browsing, storage full, or blocked - the remap just won't stick */
  }
}

/** The key code bound to one action - a saved override, or the default. */
export function codeFor(key: string, fallback: string): string {
  return readAll()[key] ?? fallback
}

/** The raw saved override for one action, or undefined if it has never been rebound. */
export function overrideFor(key: string): string | undefined {
  return readAll()[key]
}

/** Every code in a list of actions, falling back per-action where unset. */
export function codesFor(keys: Record<string, string>): Record<string, string> {
  const all = readAll()
  const out: Record<string, string> = {}
  for (const [key, fallback] of Object.entries(keys)) out[key] = all[key] ?? fallback
  return out
}

export function hasOverride(key: string): boolean {
  return key in readAll()
}

export function rebind(key: string, code: string): void {
  const all = readAll()
  all[key] = code
  writeAll(all)
}

export function resetAction(key: string): void {
  const all = readAll()
  delete all[key]
  writeAll(all)
}

/** Clears every remapped action for one game, e.g. everything under `smash.`. */
export function resetGame(prefix: string): void {
  const all = readAll()
  for (const key of Object.keys(all)) {
    if (key === prefix || key.startsWith(`${prefix}.`)) delete all[key]
  }
  writeAll(all)
}

/** A short, readable label for a `KeyboardEvent.code` value. */
export function codeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return `Num${code.slice(6)}`
  const named: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Space',
    Period: '.',
    Comma: ',',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt',
    AltRight: 'R-Alt',
    Tab: 'Tab',
    Enter: 'Enter',
    Backquote: '`',
  }
  return named[code] ?? code
}
