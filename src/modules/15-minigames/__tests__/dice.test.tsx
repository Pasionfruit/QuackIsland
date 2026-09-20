// @vitest-environment jsdom
/**
 * The dice on the dashboard: a game picked at random, from the ones that can be played, for the party.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { randomPlayable } from '../internal/Dashboard'
import { MinigameScreen } from '../internal/MinigameScreen'
import { forgetBuilds, registerMinigame } from '../internal/registry'
import { closeMinigames, getMinigameScreen, openDashboard } from '../internal/state'

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

const click = (el: Element | null) => act(() => el?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

describe('picking a game at random', () => {
  it('takes only what has been built, whichever way the dice fall', () => {
    const built = ['zombie-tag', 'duck-hunt', 'time-it'] as const
    expect(randomPlayable(built, () => 0)).toBe('zombie-tag')
    expect(randomPlayable(built, () => 0.5)).toBe('duck-hunt')
    expect(randomPlayable(built, () => 0.999999)).toBe('time-it')
    for (let i = 0; i < 50; i++) expect(built).toContain(randomPlayable(built)!)
  })

  it('never lands on a free slot, and has nothing to pick when nothing is built', () => {
    expect(randomPlayable(['reserved-41', 'duck-hunt'], () => 0)).toBe('duck-hunt')
    expect(randomPlayable(['reserved-41'], () => 0)).toBe(null)
    expect(randomPlayable([], () => 0)).toBe(null)
  })

  it('is a dice on the dashboard, left of the first filter, that opens a built game', () => {
    registerMinigame('zombie-tag', { newGame: () => ({}), Panel: () => null })
    const where = mount()
    act(() => openDashboard())
    const dice = where.querySelector('[data-dice]')
    expect(dice).not.toBeNull()
    // Before the "all" filter.
    const buttons = [...where.querySelectorAll('button')]
    expect(buttons.indexOf(dice as HTMLButtonElement)).toBeLessThan(buttons.findIndex((b) => b.textContent?.startsWith('all ')))
    click(dice)
    expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { id: 'zombie-tag' } })
  })

  it('is out of use while nothing is built', () => {
    const where = mount()
    act(() => openDashboard())
    expect((where.querySelector('[data-dice]') as HTMLButtonElement).disabled).toBe(true)
    click(where.querySelector('[data-dice]'))
    expect(getMinigameScreen().at).toBe('dashboard')
  })
})
