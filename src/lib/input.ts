/**
 * Shared keyboard input for every Polyland game.
 *
 * Two players on one keyboard is the house standard, so the bindings live here
 * rather than inside any one game. Key *codes* are used, not `key`, so the
 * layout does not matter.
 */

export interface GameInput {
  left: boolean
  right: boolean
  up: boolean
  down: boolean
  attack: boolean
  special: boolean
}

export function emptyInput(): GameInput {
  return { left: false, right: false, up: false, down: false, attack: false, special: false }
}

export type PlayerIndex = 0 | 1

export const BINDINGS: Record<PlayerIndex, Record<keyof GameInput, string[]>> = {
  0: {
    left: ['KeyA'],
    right: ['KeyD'],
    up: ['KeyW'],
    down: ['KeyS'],
    attack: ['KeyF'],
    special: ['KeyG'],
  },
  1: {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    attack: ['Period', 'Numpad1'],
    special: ['Slash', 'Numpad2'],
  },
}

const SWALLOW = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
  'Slash',
  'Period',
  'Tab',
])

export class Keyboard {
  readonly down = new Set<string>()
  private onAction?: (code: string) => void

  attach(onAction?: (code: string) => void): () => void {
    this.onAction = onAction
    const keydown = (e: KeyboardEvent) => {
      if (SWALLOW.has(e.code)) e.preventDefault()
      if (!e.repeat) this.onAction?.(e.code)
      this.down.add(e.code)
    }
    const keyup = (e: KeyboardEvent) => this.down.delete(e.code)
    const blur = () => this.down.clear()
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', blur)
      this.down.clear()
    }
  }

  read(player: PlayerIndex): GameInput {
    const map = BINDINGS[player]
    const out = emptyInput()
    for (const key of Object.keys(map) as (keyof GameInput)[]) {
      out[key] = map[key].some((code) => this.down.has(code))
    }
    return out
  }
}

/** Packs an input into one byte, for sending over the wire. */
export function packInput(i: GameInput): number {
  return (
    (i.left ? 1 : 0) |
    (i.right ? 2 : 0) |
    (i.up ? 4 : 0) |
    (i.down ? 8 : 0) |
    (i.attack ? 16 : 0) |
    (i.special ? 32 : 0)
  )
}

export function unpackInput(b: number): GameInput {
  return {
    left: (b & 1) !== 0,
    right: (b & 2) !== 0,
    up: (b & 4) !== 0,
    down: (b & 8) !== 0,
    attack: (b & 16) !== 0,
    special: (b & 32) !== 0,
  }
}

export const CONTROL_HINTS: { player: string; rows: [string, string][] }[] = [
  {
    player: 'Player 1',
    rows: [
      ['Move', 'W A S D'],
      ['Attack', 'F'],
      ['Special', 'G'],
      ['Aimed move', 'Direction + F / G'],
    ],
  },
  {
    player: 'Player 2',
    rows: [
      ['Move', 'Arrow keys'],
      ['Attack', '.'],
      ['Special', '/'],
      ['Aimed move', 'Direction + . or /'],
    ],
  },
]
