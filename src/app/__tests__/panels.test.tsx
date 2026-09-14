// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { PerfHUD } from '../../modules/00-core'
import { MusicPlayer } from '../../modules/05-music'
import { DebugPanel } from '../DebugPanel'
import { LobbyPopup } from '../LobbyPopup'
import { PartyPanel } from '../PartyPanel'
import { Scoreboard } from '../Scoreboard'
import { MODES, chooseMode } from '../../modules/13-modes'
import {
  DEFENDERS,
  GARDEN_MODES,
  GardenScreen,
  clearHands,
  pickHand,
} from '../../modules/14-garden'
import { endGame, hostGame, startGame } from '../../modules/10-party'

/**
 * Does the interface actually mount.
 *
 * The gate typechecks, builds, and runs a great deal of pure logic, and none
 * of that notices a component that throws the moment React renders it. That is
 * a blank page, and it is exactly what shipped: everything was green.
 *
 * These are the panels that live outside the canvas, so they mount without
 * WebGL. What is inside the canvas still cannot be tested this way, and is
 * still a thing to check by looking.
 */
let root: ReturnType<typeof createRoot> | null = null

afterEach(() => {
  if (root) {
    const current = root
    act(() => current.unmount())
  }
  root = null
  document.body.innerHTML = ''
})

function mount(node: React.ReactNode): string {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const created = createRoot(host)
  root = created
  act(() => created.render(node))
  return host.innerHTML
}

/** Mounts the lobby and presses its button, which is where everything is. */
function openLobby(): HTMLDivElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const created = createRoot(host)
  root = created
  act(() => created.render(<LobbyPopup />))
  const open = host.querySelector('button')
  expect(open).not.toBeNull()
  act(() => open?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  return host
}

describe('the panels mount', () => {
  it('renders the perf HUD', () => {
    expect(mount(<PerfHUD />)).toContain('PERF')
  })

  it('renders the party dashboard', () => {
    expect(mount(<PartyPanel />)).toContain('PARTY')
  })

  it('renders the music player', () => {
    expect(mount(<MusicPlayer />)).toContain('MUSIC')
  })

  it('renders the debug panel', () => {
    expect(mount(<DebugPanel />)).toContain('TIME OF DAY')
  })

  it('renders the scoreboard, which starts hidden', () => {
    expect(mount(<Scoreboard />)).toBe('')
  })

  it('renders the lobby button, with the popup closed', () => {
    const html = mount(<LobbyPopup />)
    expect(html).toContain('LOBBY')
    // Closed: the games are behind the button, not on the screen.
    expect(html).not.toContain(MODES[0].title)
  })

  it('opens the popup, and lists every game in it', () => {
    const host = openLobby()

    // Every game is offered, whether or not it has been built yet - listing
    // one is how the lobby says what is coming.
    for (const game of MODES) expect(host.innerHTML).toContain(game.title)
  })

  it('has one spot for your own code and another for somebody else’s', () => {
    // The joining bug: one field that was both meant the person typing a
    // friend's code had to clear their own out of it first.
    const host = openLobby()
    const codes = [...host.querySelectorAll('input')].filter(
      (i) => (i as HTMLInputElement).style.letterSpacing !== '',
    ) as HTMLInputElement[]

    expect(codes).toHaveLength(2)
    // Yours is made for you; theirs starts empty and waiting.
    expect(codes[0].value).toHaveLength(5)
    expect(codes[1].value).toBe('')

    const labels = [...host.querySelectorAll('button')].map((b) => b.textContent)
    expect(labels).toContain('create')
    expect(labels).toContain('join')
  })

  it('shows the three ways to play once Garden Goofs is chosen', () => {
    const host = openLobby()
    // Not in a lobby, you are your own host, so the choice is yours to make.
    for (const way of GARDEN_MODES) expect(host.innerHTML).not.toContain(way.blurb)
    act(() => chooseMode('garden'))
    for (const way of GARDEN_MODES) expect(host.innerHTML).toContain(way.title)
    act(() => chooseMode('island'))
  })

  it('offers one button for readying up', () => {
    const host = openLobby()
    const labels = [...host.querySelectorAll('button')].map((b) => b.textContent)
    // One, not a ready button and a start button and a host button.
    expect(labels.filter((l) => l === 'ready' || l === 'not ready' || l === 'start')).toHaveLength(1)
  })

  it('renders all of them at once, which is what the page does', () => {
    const html = mount(
      <>
        <PerfHUD />
        <PartyPanel />
        <MusicPlayer />
        <DebugPanel />
        <Scoreboard />
        <LobbyPopup />
      </>,
    )
    expect(html).toContain('PERF')
    expect(html).toContain('PARTY')
    expect(html).toContain('MUSIC')
    expect(html).toContain('TIME OF DAY')
    expect(html).toContain('LOBBY')
  })
})


/**
 * The whole point of the lobby: both players ready, the host starts, and a
 * menu opens to choose animals with.
 *
 * Out of a lobby you are your own host, so the entire flow runs in one browser
 * - which is what makes it testable here at all.
 */
describe('starting a round of Garden Goofs', () => {
  afterEach(() => {
    endGame()
    clearHands()
    act(() => chooseMode('island'))
  })

  it('shows nothing at all until a round is started', () => {
    expect(mount(<GardenScreen />)).toBe('')
  })

  it('opens the picking menu when the host starts, and lists every animal', () => {
    act(() => chooseMode('garden'))
    act(() => {
      hostGame()
      startGame()
    })
    const html = mount(<GardenScreen />)
    expect(html).toContain('GARDEN GOOFS')
    for (const animal of DEFENDERS) expect(html).toContain(animal.name)
    // The pot is shared, and it says so.
    expect(html).toContain('shared seeds')
  })

  it('gives you the lawn once everybody has picked', () => {
    act(() => chooseMode('garden'))
    act(() => {
      hostGame()
      startGame()
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const created = createRoot(host)
    root = created
    act(() => created.render(<GardenScreen />))
    expect(host.innerHTML).toContain('animals to take in')

    act(() => pickHand(['duck']))

    // Six rows of nine, and no menu over the top of them.
    expect(host.innerHTML).not.toContain('animals to take in')
    expect(host.querySelectorAll('[style*="aspect-ratio"]')).toHaveLength(54)
  })
})
