// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetParty, hostGame, startGame } from '../../10-party'
import { chooseMode, resetMode } from '../../13-modes'
import { closeMinigames, getMinigameScreen } from '../../15-minigames'
import { setVolcanoPause } from '../internal/state'
import { VolcanoPause } from '../internal/VolcanoPauseView'

let root: Root | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
  resetParty()
  resetMode()
  closeMinigames()
  setVolcanoPause('running')
  chooseMode('island')
  hostGame()
  startGame()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<VolcanoPause />))
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  resetParty()
  resetMode()
  closeMinigames()
})

describe('Volcano pause view', () => {
  it('uses Escape for the pause card and leaves the minigame menu closed', () => {
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })))
    const pause = document.querySelector('[data-volcano-pause]')
    expect(pause?.textContent).toContain('Paused')
    expect(getMinigameScreen().at).toBe('closed')

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })))
    expect(pause?.textContent).toBe('')
  })
})
