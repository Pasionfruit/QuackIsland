// @vitest-environment jsdom
/**
 * Who is the 1, in a one-vs-all game: the party on the game's own screen, the host clicking a
 * name or rolling the dice, and a guest only seeing it.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lobby = vi.hoisted(() => ({
  net: { status: 'joined', room: 'ABCDE', id: 'p1', peers: 2, host: true, why: null } as Record<string, unknown>,
  peers: [
    { id: 'p2', name: 'bea', ping: null },
    { id: 'p3', name: 'cy', ping: null },
  ],
  sent: [] as Record<string, unknown>[],
}))

vi.mock('../../09-net', () => ({
  isHost: (me: string, others: readonly string[]) => others.every((id) => me < id),
  getNet: () => lobby.net,
  getPeers: () => lobby.peers,
  getMyName: () => 'ali',
  useNet: () => lobby.net,
  usePeers: () => lobby.peers,
  sendToRoom: (m: Record<string, unknown>) => lobby.sent.push(m),
  subscribeRoom: () => () => {},
}))

import { MinigameScreen } from '../internal/MinigameScreen'
import { NO_ONE, chooseTheOne, getTheOne, isInParty, partyOf, randomOne, theOne } from '../internal/party'
import { forgetBuilds } from '../internal/registry'
import { closeMinigames, openMinigame } from '../internal/state'

let root: Root | null = null
let where: HTMLDivElement | null = null

function mount(): HTMLDivElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const created = createRoot(el)
  root = created
  where = el
  act(() => created.render(<MinigameScreen />))
  return el
}

beforeEach(() => {
  lobby.net.host = true
  lobby.net.id = 'p1'
  lobby.sent.length = 0
  theOne.reset()
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  where?.remove()
  where = null
  closeMinigames()
  forgetBuilds()
})

const click = (el: Element | null) => act(() => el?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

describe('the party', () => {
  it('is everybody in the lobby, the host first, you marked', () => {
    const party = partyOf({ id: 'p2', name: 'bea' }, [
      { id: 'p1', name: 'ali' },
      { id: 'p3', name: 'cy' },
    ])
    expect(party.map((m) => m.id)).toEqual(['p1', 'p2', 'p3'])
    expect(party.map((m) => m.host)).toEqual([true, false, false])
    expect(party.find((m) => m.id === 'p2')?.you).toBe(true)
    // Alone: just you, and the host.
    expect(partyOf({ id: 'me', name: 'ali' }, [])).toEqual([{ id: 'me', name: 'ali', you: true, host: true }])
  })

  it('picks somebody in it at random, whichever way the dice fall', () => {
    const party = partyOf({ id: 'p1', name: 'ali' }, [{ id: 'p2', name: 'bea' }, { id: 'p3', name: 'cy' }])
    expect(randomOne(party, () => 0)).toBe('p1')
    expect(randomOne(party, () => 0.5)).toBe('p2')
    expect(randomOne(party, () => 0.999999)).toBe('p3')
    for (let i = 0; i < 50; i++) expect(isInParty(party, randomOne(party))).toBe(true)
    expect(randomOne([], () => 0)).toBe(null)
  })

  it('knows somebody who has left is not in it', () => {
    const party = partyOf({ id: 'p1', name: 'ali' }, [{ id: 'p2', name: 'bea' }])
    expect(isInParty(party, 'p2')).toBe(true)
    expect(isInParty(party, 'p9')).toBe(false)
    expect(isInParty(party, null)).toBe(false)
  })
})

describe('on a one-vs-all game’s screen', () => {
  it('opens on the party, with a tab for it, and the host is the 1 until they say otherwise', () => {
    const screen = mount()
    act(() => openMinigame('reserved-42'))
    expect(screen.querySelector('[data-leaf="party"]')).not.toBeNull()
    expect([...screen.querySelectorAll('[data-member]')].map((b) => b.getAttribute('data-member'))).toEqual(['p1', 'p2', 'p3'])
    expect(getTheOne()).toBe('p1')
    expect(screen.querySelector('[data-member="p1"]')?.getAttribute('data-one')).toBe('yes')
    expect(screen.querySelector('[data-member="p2"]')?.getAttribute('data-one')).toBe('no')
  })

  it('lets the host click who the 1 is, and tells everybody', () => {
    const screen = mount()
    act(() => openMinigame('reserved-42'))
    lobby.sent.length = 0
    click(screen.querySelector('[data-member="p3"]'))
    expect(getTheOne()).toBe('p3')
    expect(screen.querySelector('[data-member="p3"]')?.getAttribute('data-one')).toBe('yes')
    expect(screen.querySelector('[data-member="p1"]')?.getAttribute('data-one')).toBe('no')
    expect(lobby.sent.some((m) => JSON.stringify(m).includes('minigame-one') && JSON.stringify(m).includes('p3'))).toBe(true)
  })

  it('has a dice that makes it somebody in the party, and can land on anybody', () => {
    const screen = mount()
    act(() => openMinigame('reserved-42'))
    const seen = new Set<string | null>()
    for (let i = 0; i < 80; i++) {
      click(screen.querySelector('[data-one-dice]'))
      seen.add(getTheOne())
    }
    expect([...seen].sort()).toEqual(['p1', 'p2', 'p3'])
  })

  it('shows a guest the party and who the 1 is, and changes nothing when they press', () => {
    lobby.net.host = false
    lobby.net.id = 'p2'
    chooseTheOne('p3')
    // A guest cannot set it, so put it where the host's word would have.
    theOne.reset()
    const screen = mount()
    act(() => openMinigame('reserved-42'))
    expect(screen.querySelector('[data-one-dice]')).toBeNull()
    const chip = screen.querySelector('[data-member="p3"]') as HTMLButtonElement
    expect(chip.disabled).toBe(true)
    click(chip)
    expect(getTheOne()).toBe(null)
    expect(theOne.get()).toBe(NO_ONE)
  })

  it('is not there for a free-for-all game', () => {
    const screen = mount()
    act(() => openMinigame('reserved-39'))
    expect(screen.querySelector('[data-leaf="party"]')).toBeNull()
    expect(screen.querySelector('[data-party]')).toBeNull()
  })
})
