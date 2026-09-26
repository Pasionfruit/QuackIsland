// @vitest-environment jsdom
/**
 * The pause card, and the store behind it, with a lobby around them.
 *
 * The rules are pure and tested in `pause.test.ts`; what is worth pinning here
 * is the part that is only true once a store, a socket and three buttons are
 * involved - that pausing tells the lobby, that a pause somebody else pressed
 * takes your buttons away, and that it hands them back when they leave.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lobby = vi.hoisted(() => ({
  net: { status: 'joined', room: 'ABCDE', id: 'p1', peers: 1, host: true, why: null },
  peers: [{ id: 'p2', name: 'bea', ping: null }],
  sent: [] as Record<string, unknown>[],
  // Several things in here listen to the room at once; the real one fans out
  // to all of them, so the mock has to as well.
  heard: new Set<(from: string, raw: Record<string, unknown>) => void>(),
}))

const island = vi.hoisted(() => ({ phase: 'off', mode: 'island' }))

vi.mock('../../09-net', () => ({
  // The real rule: the lowest id in the room hosts.
  isHost: (me: string, others: readonly string[]) => others.every((id) => me < id),
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

vi.mock('../../10-party', () => ({ useParty: () => ({ phase: island.phase }) }))
vi.mock('../../13-modes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../13-modes')>()),
  useGameMode: () => island.mode,
}))

import { Paused } from '../internal/Paused'
import { PAUSE_TAG, encodePause, type Pauser } from '../internal/pause'
import { forgetBuilds, registerMinigame } from '../internal/registry'
import {
  closeMinigames,
  getMinigameScreen,
  iMayControl,
  openMinigame,
  pauseMinigame,
  playMinigame,
  restartMinigame,
  resumeMinigame,
  tickMinigame,
  usePauseSync,
} from '../internal/state'

const BEA: Pauser = { id: 'p2', name: 'bea' }

let root: Root | null = null
let host: HTMLDivElement | null = null

function mountCard(props: Parameters<typeof Paused>[0]): HTMLDivElement {
  const where = document.createElement('div')
  document.body.appendChild(where)
  const created = createRoot(where)
  root = created
  host = where
  act(() => created.render(<Paused {...props} />))
  return where
}

/** Something mounted that is listening to the room, the way the app is. */
function Listening() {
  usePauseSync()
  return null
}

/** Mounts the listener, so a message from another browser reaches the store. */
function mountListener(): void {
  const where = document.createElement('div')
  document.body.appendChild(where)
  const created = createRoot(where)
  root = created
  host = where
  act(() => created.render(<Listening />))
}

/** A round of something, played into, so there is something to stop. */
function intoARound() {
  act(() => {
    openMinigame('zombie-tag')
    playMinigame()
    tickMinigame(5)
  })
}

/** Only the pause traffic: opening and playing send the host's call as well. */
const pauses = () => lobby.sent.filter((m) => m.t === PAUSE_TAG)

/** What another browser saying something looks like from in here. */
const hear = (message: Record<string, unknown>, from = 'p2') =>
  act(() => {
    for (const fn of lobby.heard) fn(from, message)
  })

/** This browser as a guest: bea, `p2`, is the lowest id and hosts. */
function asGuest(): void {
  lobby.net = { status: 'joined', room: 'ABCDE', id: 'p3', peers: 1, host: false, why: null }
}

beforeEach(() => {
  lobby.net = { status: 'joined', room: 'ABCDE', id: 'p1', peers: 1, host: true, why: null }
  lobby.peers = [{ id: 'p2', name: 'bea', ping: null }]
  lobby.sent = []
  island.phase = 'off'
  island.mode = 'island'
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  closeMinigames()
  forgetBuilds()
})

describe('stopping the round', () => {
  it('tells the lobby who did it, and stops it here', () => {
    intoARound()
    act(() => pauseMinigame())

    const open = getMinigameScreen()
    expect(open.at === 'game' && open.run.paused).toBe(true)
    expect(open.at === 'game' && open.run.pausedBy).toEqual({ id: 'p1', name: 'ali' })
    expect(pauses()).toEqual([encodePause({ act: 'pause', by: { id: 'p1', name: 'ali' } })])
  })

  it('stops it here when the host does it, and says who', () => {
    asGuest()
    mountListener()
    intoARound()
    hear(encodePause({ act: 'pause', by: BEA }))

    const open = getMinigameScreen()
    expect(open.at === 'game' && open.run.paused).toBe(true)
    expect(open.at === 'game' && open.run.pausedBy).toEqual(BEA)
    // Heard, not sent: hearing it must not bounce it back round the lobby.
    expect(pauses()).toEqual([])
  })

  it('lets a guest pause the game and tells everybody who did it', () => {
    asGuest()
    intoARound()
    act(() => pauseMinigame())
    const open = getMinigameScreen()
    expect(open.at === 'game' && open.run.pausedBy).toEqual({ id: 'p3', name: 'ali' })
    expect(pauses()).toEqual([encodePause({ act: 'pause', by: { id: 'p3', name: 'ali' } })])
  })

  it('accepts a pause from another guest and keeps their name', () => {
    lobby.peers = [{ id: 'p2', name: 'bea', ping: null }, { id: 'p9', name: 'cy', ping: null }]
    mountListener()
    intoARound()
    hear(encodePause({ act: 'pause', by: { id: 'p9', name: 'cy' } }), 'p9')
    const open = getMinigameScreen()
    expect(open.at === 'game' && open.run.pausedBy).toEqual({ id: 'p9', name: 'cy' })
  })

  it('uses the relay sender id when a guest reconnects before their pause arrives', () => {
    lobby.peers = [{ id: 'p2', name: 'bea', ping: null }, { id: 'p9', name: 'cy', ping: null }]
    mountListener()
    intoARound()
    hear(encodePause({ act: 'pause', by: { id: 'previous-p9', name: 'cy' } }), 'p9')
    const open = getMinigameScreen()
    expect(open.at === 'game' && open.run.pausedBy).toEqual({ id: 'p9', name: 'cy' })
  })

  it('gives a guest no buttons on a pause the host put up', () => {
    asGuest()
    mountListener()
    intoARound()
    hear(encodePause({ act: 'pause', by: BEA }))
    expect(iMayControl()).toBe(false)

    act(() => resumeMinigame())
    act(() => restartMinigame())
    const open = getMinigameScreen()
    expect(open.at === 'game' && open.run.paused).toBe(true)
    expect(pauses()).toEqual([])
  })

  it('hands the buttons to whoever remains once the pauser has left', () => {
    asGuest()
    mountListener()
    intoARound()
    hear(encodePause({ act: 'pause', by: BEA }))
    expect(iMayControl()).toBe(false)

    // Bea goes; the room makes this browser the host.
    lobby.peers = []
    lobby.net = { ...lobby.net, host: true }
    expect(iMayControl()).toBe(true)
    act(() => resumeMinigame())
    const open = getMinigameScreen()
    expect(open.at === 'game' && open.run.paused).toBe(false)
  })
})

describe('starting it again', () => {
  it('resumes for everybody', () => {
    intoARound()
    act(() => pauseMinigame())
    lobby.sent = []
    act(() => resumeMinigame())

    const open = getMinigameScreen()
    expect(open.at === 'game' && open.run.paused).toBe(false)
    expect(pauses()).toEqual([encodePause({ act: 'resume', by: { id: 'p1', name: 'ali' } })])
  })

  it('restarts the round for everybody, back at the countdown with a new game', () => {
    let dealt = 0
    registerMinigame('zombie-tag', { newGame: () => ({ n: ++dealt }), Panel: () => null })
    intoARound()
    const was = getMinigameScreen()
    act(() => pauseMinigame())
    lobby.sent = []
    act(() => restartMinigame())

    // Straight to black and the count, on a new game.
    const open = getMinigameScreen()
    expect(open.at === 'game' && open.run.phase).toBe('counting')
    expect(open.at === 'game' && open.run.paused).toBe(false)
    expect(open.at === 'game' && open.run.game).not.toBe(was.at === 'game' ? was.run.game : null)
    expect(pauses()).toEqual([encodePause({ act: 'restart', by: { id: 'p1', name: 'ali' } })])
  })

  it('happens here too when the host presses it over there', () => {
    asGuest()
    mountListener()
    intoARound()
    hear(encodePause({ act: 'pause', by: BEA }))
    hear(encodePause({ act: 'restart', by: BEA }))

    const open = getMinigameScreen()
    expect(open.at === 'game' && open.run.phase).toBe('counting')
    expect(open.at === 'game' && open.run.paused).toBe(false)
  })
})

describe('the card', () => {
  it('offers three buttons to whoever stopped it', () => {
    const where = mountCard({ isHost: true, pausedBy: { id: 'p1', name: 'ali' }, me: 'p1', mayControl: true })
    expect(where.querySelector('[data-resume]')).not.toBeNull()
    expect(where.querySelector('[data-restart]')).not.toBeNull()
    expect(where.querySelector('[data-leave]')).not.toBeNull()
    expect(where.querySelector('[data-waiting]')).toBeNull()
    expect(where.textContent).toContain('You paused the game')
  })

  it('keeps a Volcano Island party in its paused round', () => {
    island.phase = 'playing'
    island.mode = 'island'
    const where = mountCard({ isHost: true, pausedBy: { id: 'p1', name: 'ali' }, me: 'p1', mayControl: true })
    expect(where.querySelector('[data-resume]')).not.toBeNull()
    expect(where.querySelector('[data-restart]')).toBeNull()
    expect(where.querySelector('[data-leave]')).toBeNull()
    expect(where.textContent).toContain('paused the Volcano Island round')
  })

  it('offers nobody else anything, and says who they are waiting for', () => {
    const where = mountCard({ isHost: false, pausedBy: BEA, me: 'p1', mayControl: false })
    expect(where.querySelector('[data-resume]')).toBeNull()
    expect(where.querySelector('[data-restart]')).toBeNull()
    expect(where.querySelector('[data-leave]')).toBeNull()
    expect(where.querySelector('[data-waiting]')?.textContent).toContain('waiting for bea')
    expect(where.textContent).toContain('bea paused the game')
  })

  it('says so when the buttons have come back because somebody left', () => {
    const where = mountCard({ isHost: true, pausedBy: BEA, me: 'p1', mayControl: true })
    expect(where.textContent).toContain('has since left')
    expect(where.querySelector('[data-restart]')).not.toBeNull()
  })

  it('tells the host and a guest different things about leaving', () => {
    const mine = { id: 'p1', name: 'ali' }
    const asHost = mountCard({ isHost: true, pausedBy: mine, me: 'p1', mayControl: true })
    expect(asHost.querySelector('[data-leave]')?.textContent).toContain('back to the games')
    expect(asHost.textContent).toContain('takes them all back with you')
    act(() => root?.unmount())
    host?.remove()

    const asGuest = mountCard({ isHost: false, pausedBy: mine, me: 'p1', mayControl: true })
    expect(asGuest.querySelector('[data-leave]')?.textContent).toContain('leave this round')
    expect(asGuest.textContent).toContain('carry on without you')
  })
})
