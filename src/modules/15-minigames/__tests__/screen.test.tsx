// @vitest-environment jsdom
/**
 * The screen: the dashboard, the template behind every tile, and the way back.
 *
 * What is worth pinning here is the part that stops being true by accident as
 * forty-one games get built one at a time - that every game has *something* to
 * draw, that a build takes over from the template when one arrives, and that
 * nothing on the page has grown a scrollbar.
 */
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { BUILD_STEPS, MINIGAMES, minigameById } from '../internal/catalogue'
import { MinigameScreen } from '../internal/MinigameScreen'
import { forgetBuilds, registerMinigame } from '../internal/registry'
import { backOut, closeMinigames, getMinigameScreen, openDashboard, openMinigame } from '../internal/state'

let root: Root | null = null
let host: HTMLDivElement | null = null

function mount(): HTMLDivElement {
  const where = document.createElement('div')
  document.body.appendChild(where)
  const created = createRoot(where)
  root = created
  host = where
  act(() => created.render(<MinigameScreen />))
  return where
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  closeMinigames()
  forgetBuilds()
})

const click = (el: Element | null) =>
  act(() => el?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

describe('the minigame screen', () => {
  it('draws nothing at all until somebody opens it', () => {
    const where = mount()
    expect(where.innerHTML).toBe('')
  })

  it('opens the dashboard with a tile for every game there is', () => {
    const where = mount()
    act(() => openDashboard())
    expect(where.querySelectorAll('[data-minigame]')).toHaveLength(MINIGAMES.length)
  })

  it('gives every tile its number and its name', () => {
    const where = mount()
    act(() => openDashboard())
    for (const game of MINIGAMES) {
      const tile = where.querySelector(`[data-minigame="${game.id}"]`)
      expect(tile?.textContent).toContain(game.title)
      expect(tile?.textContent).toContain(String(game.number))
    }
  })

  it('never scrolls, whatever is open', () => {
    const where = mount()
    act(() => openDashboard())
    const page = where.firstElementChild as HTMLElement
    expect(page.style.position).toBe('fixed')
    expect(page.style.inset).toBe('0px')
    expect(page.style.overflow).toBe('hidden')
    for (const box of [...where.querySelectorAll('div')] as HTMLElement[]) {
      expect(box.style.overflowY).not.toBe('auto')
      expect(box.style.overflowY).not.toBe('scroll')
    }
  })

  it('opens a template when a tile is picked', () => {
    const where = mount()
    act(() => openDashboard())
    click(where.querySelector('[data-minigame="zombie-tag"]'))

    expect(getMinigameScreen().at).toBe('game')
    expect(where.textContent).toContain('Zombie Tag')
    expect(where.textContent).toContain('This is a template')
  })

  it('draws a template for every single game, built or not', () => {
    // The claim the whole pass rests on: forty-one panels exist. None of them
    // is a file, so the thing to check is that none of them is missing either.
    const where = mount()
    for (const game of MINIGAMES) {
      act(() => openMinigame(game.id))
      expect(where.textContent).toContain(game.title)
      expect(where.textContent).toContain('This is a template')
    }
  })

  it('lists the three stages on every game, with the next one marked', () => {
    const where = mount()
    act(() => openMinigame('zombie-tag'))

    for (const step of BUILD_STEPS) {
      expect(where.querySelector(`[data-step="${step}"]`)).not.toBeNull()
    }
    // Nothing is built, so the first stage is the one owed.
    expect(where.querySelector('[data-step="environment"]')?.textContent).toContain('→')
    expect(where.querySelector('[data-step="controls"]')?.textContent).not.toContain('→')
  })

  it('shows the controls a game already has, and says so when it has none', () => {
    const where = mount()

    act(() => openMinigame('zombie-tag'))
    for (const control of minigameById('zombie-tag').controls) {
      expect(where.textContent).toContain(control.input)
      expect(where.textContent).toContain(control.does)
    }

    act(() => openMinigame('make-the-cut'))
    expect(where.textContent).toContain('Not written down yet')
  })

  it('hands a built game its own panel instead of the template', () => {
    registerMinigame('zombie-tag', {
      newGame: () => ({ zombies: 6 }),
      Panel: () => <div>six zombies, chasing</div>,
    })

    const where = mount()
    act(() => openMinigame('zombie-tag'))

    expect(where.textContent).toContain('six zombies, chasing')
    expect(where.textContent).not.toContain('This is a template')

    // And nothing else has been taken over by it.
    act(() => openMinigame('duck-hunt'))
    expect(where.textContent).toContain('This is a template')
  })

  it('gives a built panel a place of its own to keep state', () => {
    // A game's panel is a component, not a function that gets called during
    // this one's render - so its hooks are its own, and opening a different
    // game does not hand the next one what the last one was holding.
    const Counting = () => {
      const [ticks, setTicks] = useState(0)
      return (
        <button type="button" data-count onClick={() => setTicks(ticks + 1)}>
          {ticks}
        </button>
      )
    }
    registerMinigame('zombie-tag', { newGame: () => null, Panel: Counting })
    registerMinigame('duck-hunt', { newGame: () => null, Panel: Counting })

    const where = mount()
    act(() => openMinigame('zombie-tag'))
    click(where.querySelector('[data-count]'))
    click(where.querySelector('[data-count]'))
    expect(where.querySelector('[data-count]')?.textContent).toBe('2')

    act(() => openMinigame('duck-hunt'))
    expect(where.querySelector('[data-count]')?.textContent).toBe('0')
  })

  it('steps back out of a game to the dashboard, and out of the dashboard to nothing', () => {
    const where = mount()
    act(() => openMinigame('duck-hunt'))

    act(() => backOut())
    expect(getMinigameScreen().at).toBe('dashboard')
    expect(where.querySelectorAll('[data-minigame]').length).toBeGreaterThan(0)

    act(() => backOut())
    expect(getMinigameScreen().at).toBe('closed')
    expect(where.innerHTML).toBe('')
  })

  it('steps back on escape, the same way the button does', () => {
    mount()
    act(() => openMinigame('duck-hunt'))

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
    })
    expect(getMinigameScreen().at).toBe('dashboard')

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
    })
    expect(getMinigameScreen().at).toBe('closed')
  })

  it('filters down to one kind, and back', () => {
    const where = mount()
    act(() => openDashboard())

    const tab = [...where.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith('one vs all'),
    )
    click(tab ?? null)
    expect(where.querySelectorAll('[data-minigame]')).toHaveLength(11)

    const all = [...where.querySelectorAll('button')].find((b) => b.textContent?.startsWith('all '))
    click(all ?? null)
    expect(where.querySelectorAll('[data-minigame]')).toHaveLength(MINIGAMES.length)
  })
})
