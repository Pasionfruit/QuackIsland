// @vitest-environment jsdom
/**
 * The podium on the screen: that a game handing over its standings gets one
 * after its Finish, that everybody is on the right step pulling the right
 * face, and that the two corners do what they say - for the host and a guest.
 */
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lobby = vi.hoisted(() => ({
  net: { status: 'joined', room: 'ABCDE', id: 'p1', peers: 1, host: true, why: null },
  peers: [{ id: 'p2', name: 'bea', ping: null }],
  sent: [] as Record<string, unknown>[],
  heard: new Set<(from: string, raw: Record<string, unknown>) => void>(),
}))

vi.mock('../../09-net', () => ({
  getNet: () => lobby.net,
  getPeers: () => lobby.peers,
  getMyName: () => 'ali',
  useNet: () => lobby.net,
  usePeers: () => lobby.peers,
  sendToRoom: (m: Record<string, unknown>) => lobby.sent.push(m),
  subscribeRoom: (fn: (from: string, raw: Record<string, unknown>) => void) => {
    lobby.heard.add(fn)
    return () => lobby.heard.delete(fn)
  },
}))

import { MinigameScreen } from '../internal/MinigameScreen'
import { PAUSE_TAG } from '../internal/pause'
import type { Standing } from '../internal/podium'
import { FADE, forgetBuilds, registerMinigame, type MinigameRun } from '../internal/registry'
import { closeMinigames, getMinigameScreen, openMinigame, playMinigame, tickMinigame, useFinish } from '../internal/state'

let root: Root | null = null
let host: HTMLDivElement | null = null
/** What the fake game will say when its round ends. */
let result: Standing[] = []

/** A game with one button that ends it, and a card it draws only if it is told to. */
function Ranked({ run }: { run: MinigameRun }) {
  const [over, setOver] = useState(false)
  const card = useFinish(over, () => result)
  return (
    <div data-game={run.phase}>
      <button type="button" data-end onClick={() => setOver(true)} />
      {card ? <div data-own-results /> : null}
    </div>
  )
}

function mount(): HTMLDivElement {
  const where = document.createElement('div')
  document.body.appendChild(where)
  const created = createRoot(where)
  root = created
  host = where
  act(() => created.render(<MinigameScreen />))
  return where
}

const click = (el: Element | null) => act(() => el?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

/** Plays into a round, ends it, and waits out the Finish. */
function toThePodium(where: HTMLDivElement, standings: Standing[]) {
  result = standings
  registerMinigame('zombie-tag', { newGame: () => ({}), Panel: Ranked })
  // Through the store rather than the play button, which a guest does not have.
  act(() => {
    openMinigame('zombie-tag')
    playMinigame()
    tickMinigame(FADE.in + 3.5)
  })
  click(where.querySelector('[data-end]'))
  act(() => tickMinigame(FADE.dim))
}

const on = (where: HTMLDivElement, step: string) =>
  [...where.querySelectorAll(`[data-step="${step}"] [data-player]`)].map((el) => `${el.getAttribute('data-player')}:${el.getAttribute('data-pose')}`)

beforeEach(() => {
  lobby.net = { status: 'joined', room: 'ABCDE', id: 'p1', peers: 1, host: true, why: null }
  lobby.sent = []
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  closeMinigames()
  forgetBuilds()
})

describe('the podium screen', () => {
  it('comes up after the Finish, in place of the game and its own results', () => {
    const where = mount()
    toThePodium(where, [
      { id: 'a', place: 1 },
      { id: 'b', place: 2 },
    ])
    expect(where.querySelector('[data-podium]')).not.toBeNull()
    expect(where.querySelector('[data-game]')).toBeNull()
    expect(where.querySelector('[data-own-results]')).toBeNull()
  })

  it('is not up while the Finish is', () => {
    const where = mount()
    result = [{ id: 'a', place: 1 }]
    registerMinigame('zombie-tag', { newGame: () => ({}), Panel: Ranked })
    act(() => openMinigame('zombie-tag'))
    click(where.querySelector('[data-play]'))
    act(() => tickMinigame(FADE.in + 3.5))
    click(where.querySelector('[data-end]'))
    expect(where.querySelector('[data-podium]')).toBeNull()
    expect(where.querySelector('[data-own-results]')).toBeNull()
  })

  it('puts everybody on their step with the face that goes with it', () => {
    const where = mount()
    toThePodium(where, [
      { id: 'a', place: 1 },
      { id: 'b', place: 2 },
      { id: 'c', place: 3 },
      { id: 'd', place: 4 },
      { id: 'e', place: 5 },
    ])
    expect(on(where, '1')).toEqual(['a:joy'])
    expect(on(where, '2')).toEqual(['b:happy'])
    expect(on(where, '3')).toEqual(['c:straight'])
    expect(on(where, 'ground')).toEqual(['d:flop', 'e:flop'])
  })

  it('puts two tied for first on the top step together, and the next on third', () => {
    const where = mount()
    toThePodium(where, [
      { id: 'a', place: 1 },
      { id: 'b', place: 1 },
      { id: 'c', place: 2 },
    ])
    expect(on(where, '1')).toEqual(['a:joy', 'b:joy'])
    expect(on(where, '2')).toEqual([])
    expect(on(where, '3')).toEqual(['c:straight'])
  })

  it('leaves the steps empty when everybody ties, and says everybody lost', () => {
    const where = mount()
    toThePodium(where, [
      { id: 'a', place: 1 },
      { id: 'b', place: 1 },
      { id: 'c', place: 1 },
    ])
    expect(on(where, '1')).toEqual([])
    expect(on(where, 'ground')).toEqual(['a:flop', 'b:flop', 'c:flop'])
    expect(where.querySelector('[data-headline]')?.textContent).toMatch(/everybody loses/i)
  })

  it('has the dashboard bottom left and replay bottom right', () => {
    const where = mount()
    toThePodium(where, [{ id: 'a', place: 1 }])
    const corners = [...where.querySelectorAll('[data-dashboard], [data-replay]')]
    expect(corners.map((el) => (el.hasAttribute('data-dashboard') ? 'dashboard' : 'replay'))).toEqual(['dashboard', 'replay'])
  })

  it('replays the same game from the top, for everybody', () => {
    const where = mount()
    toThePodium(where, [{ id: 'a', place: 1 }])
    click(where.querySelector('[data-replay]'))
    expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { id: 'zombie-tag', phase: 'fading', standings: null } })
    expect(where.querySelector('[data-podium]')).toBeNull()
    expect(lobby.sent.filter((m) => m.t === PAUSE_TAG)).toHaveLength(1)
  })

  it('goes back to the minigame dashboard', () => {
    const where = mount()
    toThePodium(where, [{ id: 'a', place: 1 }])
    click(where.querySelector('[data-dashboard]'))
    expect(getMinigameScreen().at).toBe('dashboard')
  })

  it('gives a guest a line to wait on where the host has replay', () => {
    lobby.net = { ...lobby.net, id: 'p2', host: false }
    const where = mount()
    toThePodium(where, [{ id: 'a', place: 1 }])
    expect(where.querySelector('[data-replay]')).toBeNull()
    expect(where.querySelector('[data-waiting]')?.textContent).toMatch(/waiting for the host/)
    expect(where.querySelector('[data-dashboard]')).not.toBeNull()
    expect(where.querySelector('[data-podium]')).not.toBeNull()
  })

  it('calls you you', () => {
    const where = mount()
    toThePodium(where, [
      { id: 'a', place: 1, name: 'bea' },
      { id: 'p1', place: 2, name: 'ali', mine: true },
    ])
    expect(where.querySelector('[data-headline]')?.textContent).toBe('bea wins!')
    expect(where.querySelector('[data-step="2"]')?.textContent).toContain('you')
  })
})
