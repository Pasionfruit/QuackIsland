// @vitest-environment jsdom
/**
 * The popup a missed click on an ad opens: what is on it, and what a click on
 * each part of the ad does.
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { popupAt } from '../internal/reels'
import { AdCover } from '../internal/RpmScreen'

let root: ReturnType<typeof createRoot> | null = null

afterEach(() => {
  if (root) {
    const current = root
    act(() => current.unmount())
  }
  root = null
  document.body.innerHTML = ''
})

function press(el: Element | null, button = 0): void {
  if (!el) throw new Error('nothing there to press')
  // jsdom has no PointerEvent; React listens for the event by name.
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button }))
  })
}

function mount(popup: ReturnType<typeof popupAt> | null) {
  const calls = { skip: 0, miss: 0, close: 0 }
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const created = root
  act(() =>
    created.render(
      <AdCover
        seed={11}
        index={2}
        x={0.5}
        y={0.5}
        size={1}
        count={12}
        popup={popup}
        onSkip={() => (calls.skip += 1)}
        onMiss={() => (calls.miss += 1)}
        onClose={() => (calls.close += 1)}
      />,
    ),
  )
  return { host, calls }
}

describe('a missed click on an ad', () => {
  it('is a click anywhere on it but the skip button - the big button too - and the skip button is not a miss', () => {
    const { host, calls } = mount(null)
    press(host.querySelector('[data-skip]'))
    expect(calls).toEqual({ skip: 1, miss: 0, close: 0 })
    press(host.querySelector('[data-ad]'))
    press(host.querySelector('[data-ad] div div:last-child'))
    expect(calls.miss).toBe(2)
    expect(calls.skip).toBe(1)
    // Only the left button counts, the same as the skip button.
    press(host.querySelector('[data-ad]'), 2)
    expect(calls.miss).toBe(2)
  })

  it('opens a popup that has to be closed with its own button: nothing else on it does', () => {
    const popup = popupAt(11, 2, 0)
    const { host, calls } = mount(popup)
    const box = host.querySelector('[data-popup]')
    expect(box).not.toBeNull()
    expect(box!.textContent).toContain(popup.title)
    // Clicking about on the popup is not a fresh miss, and not a close.
    press(box)
    press(host.querySelector('[data-popup] div'))
    expect(calls).toEqual({ skip: 0, miss: 0, close: 0 })
    press(host.querySelector('[data-popup-close]'))
    expect(calls).toEqual({ skip: 0, miss: 0, close: 1 })
  })

  it('has no popup until there is one, and the skip button is under it while there is', () => {
    expect(mount(null).host.querySelector('[data-popup]')).toBeNull()
    document.body.innerHTML = ''
    const { host } = mount(popupAt(11, 2, 0))
    const ad = host.querySelector('[data-ad]')!
    const kids = [...ad.children]
    // The popup comes after the skip button in the ad, and so is drawn over it.
    expect(kids.indexOf(host.querySelector('[data-popup]')!)).toBeGreaterThan(kids.indexOf(host.querySelector('[data-skip]')!))
  })
})

describe('the popups', () => {
  it('are the same on every screen for a seed, ad and miss, and are not all the same one', () => {
    expect(popupAt(5, 1, 0)).toEqual(popupAt(5, 1, 0))
    const seen = new Set<string>()
    const corners = new Set<number>()
    for (let miss = 0; miss < 40; miss++) {
      const p = popupAt(5, 1, miss)
      seen.add(p.title)
      corners.add(p.corner)
      expect(p.corner).toBeGreaterThanOrEqual(0)
      expect(p.corner).toBeLessThanOrEqual(3)
    }
    expect(seen.size).toBeGreaterThan(3)
    // The close button is not always where it was.
    expect(corners.size).toBe(4)
  })
})
