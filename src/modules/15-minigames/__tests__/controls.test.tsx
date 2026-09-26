// @vitest-environment jsdom
/**
 * Who works the screen, what a restart looks like, a game that counts for
 * itself, and a count's voice that must never come back on its own.
 *
 * Separate from `screen.test.tsx` because all of it needs a lobby to be a guest
 * in, and a stand-in for `Audio` to listen to.
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

import { MinigameScreen } from '../internal/MinigameScreen'
import { COUNT_FROM, FADE, forgetBuilds, registerMinigame, type MinigameRun } from '../internal/registry'
import { COUNTDOWN_SOUND, forgetScreenSounds } from '../internal/sound'
import { CountOver } from '../internal/Transitions'
import {
  backOut,
  closeMinigames,
  getMinigameScreen,
  openMinigame,
  playMinigame,
  replayMinigame,
  tickMinigame,
  useFinish,
} from '../internal/state'

/** Enough of an `<audio>` to tell playing from held from stopped. */
class FakeAudio {
  static made: FakeAudio[] = []
  currentTime = 0
  paused = true
  ended = false
  volume = 1
  preload = ''
  plays = 0
  constructor(public src: string) {
    FakeAudio.made.push(this)
  }
  play() {
    this.paused = false
    this.plays += 1
    return Promise.resolve()
  }
  pause() {
    this.paused = true
  }
}

const countVoice = () => FakeAudio.made.find((a) => a.src.endsWith(COUNTDOWN_SOUND))

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

const click = (el: Element | null) => act(() => el?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const escape = () => act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })))
const shown = (where: HTMLDivElement) => where.querySelector('[data-countdown]')?.textContent ?? null

function asGuest(): void {
  lobby.net = { status: 'joined', room: 'ABCDE', id: 'p3', peers: 1, host: false, why: null }
}

/** A game with one button that ends it, and its own "again" that is the replay. */
function Plain({ run }: { run: MinigameRun }) {
  const [over, setOver] = useState(false)
  const results = useFinish(over)
  return (
    <div data-game={run.phase}>
      <button type="button" data-end onClick={() => setOver(true)} />
      {results ? (
        <button type="button" data-again onClick={replayMinigame}>
          again
        </button>
      ) : null}
    </div>
  )
}

beforeEach(() => {
  lobby.net = { status: 'joined', room: 'ABCDE', id: 'p1', peers: 1, host: true, why: null }
  lobby.peers = [{ id: 'p2', name: 'bea', ping: null }]
  lobby.sent = []
  FakeAudio.made = []
  vi.stubGlobal('Audio', FakeAudio)
  registerMinigame('zombie-tag', { newGame: () => ({}), Panel: Plain })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  closeMinigames()
  forgetBuilds()
  forgetScreenSounds()
  vi.unstubAllGlobals()
})

describe('a guest', () => {
  it('has no control on the briefing, not even back - only the tabs for reading it', () => {
    asGuest()
    const where = mount()
    act(() => openMinigame('zombie-tag'))
    const buttons = [...where.querySelectorAll('button')]
    expect(buttons.every((b) => b.hasAttribute('data-leaf'))).toBe(true)
    expect(buttons.some((b) => b.textContent === 'back')).toBe(false)
    expect(where.querySelector('[data-play]')).toBeNull()
    expect(where.querySelector('[data-waiting]')).not.toBeNull()
  })

  it('cannot escape out of a briefing', () => {
    asGuest()
    mount()
    act(() => openMinigame('zombie-tag'))
    escape()
    expect(getMinigameScreen().at).toBe('game')
  })

  it('pauses a round with escape and tells everybody which guest did it', () => {
    asGuest()
    mount()
    act(() => {
      openMinigame('zombie-tag')
      playMinigame()
      tickMinigame(FADE.in + COUNT_FROM + 0.5)
    })
    escape()
    expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { phase: 'playing', paused: true, pausedBy: { id: 'p3', name: 'ali' } } })
  })
})

describe('the host', () => {
  it('still pauses with escape, and takes the card down with it', () => {
    mount()
    act(() => {
      openMinigame('zombie-tag')
      playMinigame()
      tickMinigame(FADE.in + COUNT_FROM + 0.5)
    })
    escape()
    expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { paused: true } })
    escape()
    expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { paused: false } })
  })
})

describe('the count, on a restart', () => {
  it('goes straight to black and counts three, two, one again - never back to the briefing', () => {
    const where = mount()
    act(() => {
      openMinigame('zombie-tag')
      playMinigame()
      tickMinigame(FADE.in + 0.1)
    })
    act(() => tickMinigame(COUNT_FROM))
    click(where.querySelector('[data-end]'))
    act(() => tickMinigame(FADE.dim))
    const plays = countVoice()!.plays

    click(where.querySelector('[data-again]'))
    expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { phase: 'counting' } })
    expect(where.querySelector('[data-play]')).toBeNull()
    expect(shown(where)).toBe('3')
    expect(countVoice()!.plays).toBe(plays + 1)

    act(() => tickMinigame(1))
    expect(shown(where)).toBe('2')
    act(() => tickMinigame(2))
    expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { phase: 'playing' } })
    expect(shown(where)).toBe('Start!')
  })
})

describe("the count's voice", () => {
  it('starts with the count, holds with a pause, and carries on with a resume', () => {
    mount()
    act(() => {
      openMinigame('zombie-tag')
      playMinigame()
      tickMinigame(FADE.in + 0.5)
    })
    expect(countVoice()!.paused).toBe(false)
    escape()
    expect(countVoice()!.paused).toBe(true)
    escape()
    expect(countVoice()!.paused).toBe(false)
  })

  it('stops for good when the round is paused and left - and does not come back with the next game', () => {
    mount()
    act(() => {
      openMinigame('zombie-tag')
      playMinigame()
      tickMinigame(FADE.in + 0.5)
    })
    escape()
    act(() => backOut())
    const voice = countVoice()!
    expect(voice.paused).toBe(true)
    expect(voice.currentTime).toBe(0)
    const plays = voice.plays

    // A new game, briefed: nothing of the old count resumes.
    act(() => openMinigame('duck-hunt'))
    expect(voice.paused).toBe(true)
    expect(voice.plays).toBe(plays)
  })
})

describe('a game that counts for itself', () => {
  /** Stands in for Pet Race: its own count comes later, through `CountOver`. */
  function Later({ run }: { run: MinigameRun }) {
    const [left, setLeft] = useState<number | null>(null)
    return (
      <div data-game={run.phase}>
        <button type="button" data-count onClick={() => setLeft(3)} />
        <button type="button" data-tick onClick={() => setLeft((l) => (l === null ? null : l - 1 > 0 ? l - 1 : null))} />
        <CountOver left={left} />
      </div>
    )
  }

  beforeEach(() => {
    registerMinigame('pet-race', { newGame: () => ({}), Panel: Later, ownCountdown: true })
  })

  it('gets the black lifted and nothing else: no numbers, no voice, playing at once', () => {
    const where = mount()
    act(() => {
      openMinigame('pet-race')
      playMinigame()
      tickMinigame(FADE.in + 0.01)
    })
    expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { phase: 'counting' } })
    expect(shown(where)).toBeNull()
    act(() => tickMinigame(FADE.in))
    expect(getMinigameScreen()).toMatchObject({ at: 'game', run: { phase: 'playing' } })
    expect(shown(where)).toBeNull()
    expect(countVoice()?.plays ?? 0).toBe(0)
  })

  it('counts in its own moment with the same numbers, voice and Start!', () => {
    const where = mount()
    act(() => {
      openMinigame('pet-race')
      playMinigame()
      tickMinigame(FADE.in * 2 + 0.01)
    })
    click(where.querySelector('[data-count]'))
    expect(shown(where)).toBe('3')
    expect(countVoice()!.plays).toBe(1)
    click(where.querySelector('[data-tick]'))
    expect(shown(where)).toBe('2')
    click(where.querySelector('[data-tick]'))
    click(where.querySelector('[data-tick]'))
    expect(shown(where)).toBe('Start!')
  })
})
