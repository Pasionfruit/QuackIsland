// @vitest-environment jsdom
/**
 * The answer left up before Finish: how long, and what it says of your own time.
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { WATCH, createGame, type Game } from '../internal/rules'
import { Answer } from '../internal/TimeItScreen'

let root: ReturnType<typeof createRoot> | null = null
afterEach(() => {
  if (root) {
    const current = root
    act(() => current.unmount())
  }
  root = null
  document.body.innerHTML = ''
})

function show(game: Game, target: number): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const created = root
  act(() => created.render(<Answer game={game} target={target} />))
  return host
}

function over(stopped: number | null, left = false): Game {
  const g = createGame(1, [{ id: 'me', mine: true }, { id: 'other' }], 1)
  g.players[0].stopped = stopped
  g.players[0].left = left
  g.players[1].stopped = 3.21
  g.over = true
  return g
}

describe('the answer', () => {
  it('is left up for a little longer than the two and a half seconds the stopwatch was, before Finish', () => {
    expect(WATCH.reveal).toBeGreaterThanOrEqual(2)
    expect(WATCH.reveal).toBeLessThanOrEqual(4)
  })

  it('gives your own actual time, to the hundredth, and how far over the target it was', () => {
    const host = show(over(9.87), 9.75)
    expect(host.querySelector('[data-your-time]')!.textContent).toBe('9.87s')
    expect(host.querySelector('[data-your-time]')!.getAttribute('data-your-time')).toBe('9.87')
    expect(host.textContent).toContain('Your time')
    expect(host.textContent).toContain('0.12s over the 9.75s target')
  })

  it('says under when it was under, and right on when it was', () => {
    expect(show(over(9.4), 9.75).textContent).toContain('0.35s under the 9.75s target')
    document.body.innerHTML = ''
    expect(show(over(9.75), 9.75).textContent).toContain('Right on the target!')
  })

  it('is green within half a second and red beyond it', () => {
    const near = show(over(9.5), 9.75).querySelector<HTMLElement>('[data-your-time]')!
    expect(near.style.color).toBe('rgb(143, 240, 173)')
    document.body.innerHTML = ''
    const far = show(over(12.2), 9.75).querySelector<HTMLElement>('[data-your-time]')!
    expect(far.style.color).toBe('rgb(255, 177, 168)')
  })

  it('does not spell out anybody else’s time, and has something for a round you never stopped in', () => {
    const host = show(over(9.87), 9.75)
    expect(host.textContent).not.toContain('3.21')
    document.body.innerHTML = ''
    const none = show(over(null), 9.75)
    expect(none.querySelector('[data-your-time]')).toBeNull()
    expect(none.textContent).toContain('You never stopped')
    expect(none.textContent).toContain('The target was 9.75s')
    document.body.innerHTML = ''
    expect(show(over(null, true), 9.75).textContent).toContain('You left')
  })
})
