import type { RawInput } from './types'
import { emptyInput } from './types'

/** Keyboard codes are used (not `key`) so the layout does not matter. */
export const BINDINGS: Record<0 | 1, Record<keyof RawInput, string[]>> = {
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

  read(player: 0 | 1): RawInput {
    const map = BINDINGS[player]
    const out = emptyInput()
    for (const key of Object.keys(map) as (keyof RawInput)[]) {
      out[key] = map[key].some((code) => this.down.has(code))
    }
    return out
  }
}

export const CONTROL_HINTS: { player: string; rows: [string, string][] }[] = [
  {
    player: 'Player 1',
    rows: [
      ['Move', 'A / D'],
      ['Jump', 'W (x2)'],
      ['Drop / Fast fall', 'S'],
      ['Attack', 'F'],
      ['Recovery', 'G'],
    ],
  },
  {
    player: 'Player 2 / CPU',
    rows: [
      ['Move', '< / >'],
      ['Jump', 'Up (x2)'],
      ['Drop / Fast fall', 'Down'],
      ['Attack', '.'],
      ['Recovery', '/'],
    ],
  },
]
