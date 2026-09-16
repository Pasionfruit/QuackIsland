// @vitest-environment jsdom
/**
 * The screen: the dashboard, the briefing behind every tile, the three-two-one
 * and the round it starts.
 *
 * What is worth pinning here is the part that stops being true by accident as
 * forty-one games get built one at a time - that every game has something to
 * draw at every phase, that a build takes over when one arrives, and that
 * nothing on the page has grown a scrollbar.
 */
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUILD_STEPS, MINIGAMES, minigameById } from '../internal/catalogue'
import { MinigameScreen } from '../internal/MinigameScreen'
import { forgetBuilds, registerMinigame } from '../internal/registry'
import {
  backOut,
  closeMinigames,
  getMinigameScreen,
  openDashboard,
  openMinigame,
  playMinigame,
  tickMinigame,
} from '../internal/state'

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

const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))

/** Presses play and runs the whole countdown out, without waiting for it. */
const playThrough = () =>
  act(() => {
    playMinigame()
    tickMinigame(5)
  })

describe('the dashboard', () => {
  it('draws nothing at all until somebody opens it', () => {
    const where = mount()
    expect(where.innerHTML).toBe('')
  })

  it('opens with a tile for every game there is', () => {
    const where = mount()
    act(() => openDashboard())
    expect(where.querySelectorAll('[data-minigame]')).toHaveLength(MINIGAMES.length)
  })

  it('gives every tile its number and its name', () => {
    const where = mount()
    act(() => openDashboard())
    for (const game of MINIGAMES) {
      const tile = where.querySelector(`[data-minigame="${game.id}"]`)
      expect(tile?.textContent).toContain(String(game.number))
      if (!game.reserved) expect(tile?.textContent).toContain(game.title)
    }
  })

  it('keeps the descriptions off the tiles', () => {
    // Forty-one paragraphs at once is a wall of text nobody reads. The grid is
    // for picking a game; reading about one happens a tab along.
    const where = mount()
    act(() => openDashboard())
    for (const game of MINIGAMES) {
      const tile = where.querySelector(`[data-minigame="${game.id}"]`)
      for (const para of game.description) {
        expect(tile?.textContent ?? '').not.toContain(para)
      }
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

describe('a game briefing', () => {
  it('opens when a tile is picked, showing the title', () => {
    const where = mount()
    act(() => openDashboard())
    click(where.querySelector('[data-minigame="zombie-tag"]'))

    expect(getMinigameScreen().at).toBe('game')
    expect(where.textContent).toContain('Zombie Tag')
  })

  it('exists for every game in the catalogue, built or not', () => {
    // The claim the whole pass rests on: forty-one briefings. None of them is
    // a file, so the thing to check is that none of them is missing either.
    const where = mount()
    for (const game of MINIGAMES) {
      act(() => openMinigame(game.id))
      expect(where.querySelector('[data-play]')).not.toBeNull()
      expect(where.querySelector('[data-leaf="how"]')).not.toBeNull()
      expect(where.querySelector('[data-leaf="controls"]')).not.toBeNull()
    }
  })

  it('shows how it plays first, and flips to the controls and back', () => {
    const where = mount()
    act(() => openMinigame('zombie-tag'))
    const game = minigameById('zombie-tag')

    // Checked by element rather than by substring: a game's description is
    // free to mention the word "Push" without that meaning the controls are
    // on screen, and Zombie Tag's does.
    expect(where.textContent).toContain(game.description[0])
    expect(where.querySelectorAll('[data-control]')).toHaveLength(0)

    click(where.querySelector('[data-leaf="controls"]'))
    expect(where.querySelectorAll('[data-control]')).toHaveLength(game.controls.length)
    for (const control of game.controls) {
      const row = where.querySelector(`[data-control="${control.input}"]`)
      expect(row?.textContent).toContain(control.does)
    }
    expect(where.textContent).not.toContain(game.description[0])

    click(where.querySelector('[data-leaf="how"]'))
    expect(where.textContent).toContain(game.description[0])
  })

  it('says so when a game has no controls written down', () => {
    const where = mount()
    act(() => openMinigame('make-the-cut'))
    click(where.querySelector('[data-leaf="controls"]'))
    expect(where.textContent).toContain('Not written down yet')
  })

  it('lists the three stages with the next one marked', () => {
    const where = mount()
    // A game nothing has been done to: the first stage is the one owed.
    act(() => openMinigame('pet-race'))

    for (const step of BUILD_STEPS) {
      expect(where.querySelector(`[data-step="${step}"]`)).not.toBeNull()
    }
    expect(where.querySelector('[data-step="environment"]')?.textContent).toContain('→')
    expect(where.querySelector('[data-step="controls"]')?.textContent).not.toContain('→')
  })

  it('ticks off the stages a part-built game has finished', () => {
    const where = mount()
    act(() => openMinigame('zombie-tag'))

    expect(where.querySelector('[data-step="environment"]')?.textContent).toContain('✓')
    expect(where.querySelector('[data-step="controls"]')?.textContent).toContain('✓')
    expect(where.querySelector('[data-step="assets"]')?.textContent).toContain('→')
  })

  it('opens a free slot like any other, and says a number is waiting', () => {
    const where = mount()
    act(() => openMinigame('reserved-23'))
    expect(where.textContent).toContain('23')
    expect(where.textContent).toContain('waiting for a game')
    expect(where.querySelector('[data-play]')).not.toBeNull()
  })
})

describe('pressing play', () => {
  it('counts three, two, one and then starts the round', () => {
    const where = mount()
    act(() => openMinigame('zombie-tag'))
    expect(where.querySelector('[data-countdown]')).toBeNull()

    click(where.querySelector('[data-play]'))
    expect(where.querySelector('[data-countdown]')?.textContent).toBe('3')

    act(() => tickMinigame(1))
    expect(where.querySelector('[data-countdown]')?.textContent).toBe('2')

    act(() => tickMinigame(1))
    expect(where.querySelector('[data-countdown]')?.textContent).toBe('1')

    act(() => tickMinigame(1))
    expect(where.querySelector('[data-countdown]')).toBeNull()
    expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { phase: 'playing' } })
  })

  it('leaves the briefing readable behind the numbers', () => {
    const where = mount()
    act(() => openMinigame('zombie-tag'))
    click(where.querySelector('[data-play]'))
    expect(where.textContent).toContain(minigameById('zombie-tag').description[0])
  })

  it('cannot be pressed twice to restart the count', () => {
    const where = mount()
    act(() => openMinigame('zombie-tag'))
    click(where.querySelector('[data-play]'))
    act(() => tickMinigame(1.5))

    click(where.querySelector('[data-play]'))
    // Still where the first press left it, not back at three.
    expect(where.querySelector('[data-countdown]')?.textContent).toBe('2')
  })

  it('gets to the round on its own, with nobody ticking it', () => {
    // Every other test here drives the countdown by hand, which proves the
    // arithmetic and nothing about the clock wired to it. This is the clock.
    vi.useFakeTimers()
    try {
      const where = mount()
      act(() => openMinigame('zombie-tag'))
      click(where.querySelector('[data-play]'))
      expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { phase: 'counting' } })

      act(() => {
        vi.advanceTimersByTime(3200)
      })
      expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { phase: 'playing' } })
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops the clock when the screen goes away', () => {
    vi.useFakeTimers()
    try {
      const where = mount()
      act(() => openMinigame('zombie-tag'))
      click(where.querySelector('[data-play]'))
      act(() => closeMinigames())

      // A timer still running against a closed screen would be a leak, and
      // would restart the round under whoever opened it next.
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('says the round is empty when the game has no build', () => {
    const where = mount()
    act(() => openMinigame('zombie-tag'))
    playThrough()
    expect(where.textContent).toContain('would run')
  })

  it('hands a built game its own panel once the count is done', () => {
    registerMinigame('zombie-tag', {
      newGame: () => ({ zombies: 6 }),
      Panel: () => <div>six zombies, chasing</div>,
    })

    const where = mount()
    act(() => openMinigame('zombie-tag'))
    // Not before: the briefing is the screen's, whoever built the game.
    expect(where.textContent).not.toContain('six zombies, chasing')

    playThrough()
    expect(where.textContent).toContain('six zombies, chasing')
  })

  it('builds the game its state at the start of the count, not at the end', () => {
    // A game that wants to draw its board behind the numbers needs a board.
    registerMinigame('zombie-tag', { newGame: () => ({ zombies: 6 }), Panel: () => null })
    mount()
    act(() => openMinigame('zombie-tag'))
    act(() => playMinigame())

    const open = getMinigameScreen()
    expect(open.at === 'game' && open.run.game).toEqual({ zombies: 6 })
  })

  it('gives a built panel a place of its own to keep state', () => {
    // A game's panel is a component, not a function called during this one's
    // render - so its hooks are its own, and opening a different game does not
    // hand the next one what the last one was holding.
    const Counting = () => {
      const [ticks, setTicks] = useState(0)
      return (
        <button type="button" data-ticks onClick={() => setTicks(ticks + 1)}>
          {ticks}
        </button>
      )
    }
    registerMinigame('zombie-tag', { newGame: () => null, Panel: Counting })
    registerMinigame('duck-hunt', { newGame: () => null, Panel: Counting })

    const where = mount()
    act(() => openMinigame('zombie-tag'))
    playThrough()
    click(where.querySelector('[data-ticks]'))
    click(where.querySelector('[data-ticks]'))
    expect(where.querySelector('[data-ticks]')?.textContent).toBe('2')

    act(() => openMinigame('duck-hunt'))
    playThrough()
    expect(where.querySelector('[data-ticks]')?.textContent).toBe('0')
  })
})

describe('getting back out', () => {
  it('steps out of a game to the dashboard, and out of the dashboard to nothing', () => {
    const where = mount()
    act(() => openMinigame('duck-hunt'))

    act(() => backOut())
    expect(getMinigameScreen().at).toBe('dashboard')
    expect(where.querySelectorAll('[data-minigame]').length).toBeGreaterThan(0)

    act(() => backOut())
    expect(getMinigameScreen().at).toBe('closed')
    expect(where.innerHTML).toBe('')
  })

  it('steps back on escape while nothing is running', () => {
    mount()
    act(() => openMinigame('duck-hunt'))

    act(() => escape())
    expect(getMinigameScreen().at).toBe('dashboard')

    act(() => escape())
    expect(getMinigameScreen().at).toBe('closed')
  })

  it('pauses on escape once a round is running, rather than leaving it', () => {
    // The round is the thing escape used to throw away. Now it stops it.
    const where = mount()
    act(() => openMinigame('duck-hunt'))
    playThrough()

    act(() => escape())
    expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { paused: true } })
    expect(where.querySelector('[data-resume]')).not.toBeNull()

    // And escape again puts it back, the same as pressing resume.
    act(() => escape())
    expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { paused: false } })
    expect(where.querySelector('[data-resume]')).toBeNull()
  })

  it('pauses a countdown too, and comes back on the same number', () => {
    const where = mount()
    act(() => openMinigame('duck-hunt'))
    click(where.querySelector('[data-play]'))
    act(() => tickMinigame(1))
    expect(where.querySelector('[data-countdown]')?.textContent).toBe('2')

    act(() => escape())
    act(() => tickMinigame(30))
    expect(where.querySelector('[data-countdown]')?.textContent).toBe('2')

    act(() => escape())
    act(() => tickMinigame(1))
    expect(where.querySelector('[data-countdown]')?.textContent).toBe('1')
  })

  it('resumes from the card, and leaves from the card', () => {
    const where = mount()
    act(() => openMinigame('duck-hunt'))
    playThrough()

    act(() => escape())
    click(where.querySelector('[data-resume]'))
    expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { paused: false } })

    act(() => escape())
    click(where.querySelector('[data-leave]'))
    expect(getMinigameScreen().at).toBe('dashboard')
  })

  it('leaves a started round behind rather than pausing it', () => {
    const where = mount()
    act(() => openMinigame('duck-hunt'))
    playThrough()

    act(() => backOut())
    expect(getMinigameScreen().at).toBe('dashboard')

    // Opening it again is a fresh briefing, not the round you walked out of.
    click(where.querySelector('[data-minigame="duck-hunt"]'))
    expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { phase: 'briefing' } })
  })
})
