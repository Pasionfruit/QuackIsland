// @vitest-environment jsdom
/**
 * The keys, and the arrow on the screen with its preview.
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { arrowAt, createGame, nextArrowFor, press } from '../internal/rules'
import { ArrowTrack, GLYPHS, KEYCAPS, KEYS } from '../internal/TowerScreen'

let root: ReturnType<typeof createRoot> | null = null
afterEach(() => {
  if (root) {
    const current = root
    act(() => current.unmount())
  }
  root = null
  document.body.innerHTML = ''
})

function show(seed: number, at: number, wrong = false) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const created = root
  act(() => created.render(<ArrowTrack seed={seed} at={at} wrong={wrong} pressed={false} />))
  return { host, created }
}

describe('the keys', () => {
  it('are W A S D, one for each arrow, and no longer the arrow keys', () => {
    expect(KEYS).toEqual({ KeyW: 0, KeyS: 1, KeyA: 2, KeyD: 3 })
    expect(Object.keys(KEYS).some((code) => code.startsWith('Arrow'))).toBe(false)
    // Written on the arrows, in the order of the arrows: up, down, left, right.
    expect(GLYPHS).toEqual(['↑', '↓', '←', '→'])
    expect(KEYCAPS).toEqual(['W', 'S', 'A', 'D'])
  })
})

describe('the next arrow', () => {
  it('is the one after this, the same for everybody, and unmoved by a wrong key', () => {
    const g = createGame(4242, [{ id: 'a' }, { id: 'b' }], 1)
    g.elapsed = 1
    const a = g.players[0]
    expect(nextArrowFor(g, a)).toBe(arrowAt(4242, 1))
    const wrong = ((arrowAt(4242, 0) + 1) % 4) as 0 | 1 | 2 | 3
    press(g, 0, wrong)
    expect(a.typed).toBe(0)
    expect(nextArrowFor(g, a)).toBe(arrowAt(4242, 1))
    press(g, 0, arrowAt(4242, 0))
    // What the preview said it would be is what is now on.
    expect(a.typed).toBe(1)
    expect(arrowAt(4242, a.typed)).toBe(arrowAt(4242, 1))
    expect(nextArrowFor(g, a)).toBe(arrowAt(4242, 2))
    // Somebody who has not pressed anything is on the first and previewing the second, as everybody is.
    expect(nextArrowFor(g, g.players[1])).toBe(arrowAt(4242, 1))
  })
})

describe('the arrow on the screen', () => {
  it('shows this arrow big with its key, and the next small beside it, and nothing after that', () => {
    const { host } = show(4242, 0)
    const cards = [...host.querySelectorAll('[data-slot]')]
    expect(cards.map((c) => c.getAttribute('data-slot'))).toEqual(['0', '1'])
    expect(cards[0].textContent).toBe(`${GLYPHS[arrowAt(4242, 0)]}${KEYCAPS[arrowAt(4242, 0)]}`)
    expect(cards[1].textContent).toBe(`${GLYPHS[arrowAt(4242, 1)]}${KEYCAPS[arrowAt(4242, 1)]}`)
  })

  it('moves the same elements when you get one right, so it can slide rather than jump', () => {
    const { host, created } = show(4242, 0)
    const before = [...host.querySelectorAll('[data-slot]')]
    const preview = before[1]
    act(() => created.render(<ArrowTrack seed={4242} at={1} wrong={false} pressed={false} />))
    const after = [...host.querySelectorAll('[data-slot]')]
    // The old current is kept, sliding off; the old preview is now the current, and the same element;
    // and a new preview has come in behind it.
    expect(after.map((c) => c.getAttribute('data-slot'))).toEqual(['-1', '0', '1'])
    expect(after[0]).toBe(before[0])
    expect(after[1]).toBe(preview)
    expect(after[1].getAttribute('style')).toContain('scale(1)')
    expect(after[0].getAttribute('style')).toContain('opacity: 0')
    // Another right, and the one that slid off is gone for good.
    act(() => created.render(<ArrowTrack seed={4242} at={2} wrong={false} pressed={false} />))
    expect([...host.querySelectorAll('[data-slot]')].map((c) => c.getAttribute('data-slot'))).toEqual(['-1', '0', '1'])
    expect(host.querySelectorAll('[data-slot]').length).toBe(3)
    expect(before[0].isConnected).toBe(false)
  })

  it('turns the border red on a wrong key and leaves the arrows where they are', () => {
    const { host, created } = show(4242, 3)
    const cards = [...host.querySelectorAll('[data-slot]')]
    act(() => created.render(<ArrowTrack seed={4242} at={3} wrong pressed={false} />))
    const now = [...host.querySelectorAll('[data-slot]')]
    expect(now).toEqual(cards)
    expect(now.find((c) => c.getAttribute('data-slot') === '0')!.getAttribute('style')).toContain('rgb(217, 68, 58)')
  })
})
