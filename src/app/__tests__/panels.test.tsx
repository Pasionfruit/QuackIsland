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
  SEED,
  clearHands,
  getGoofs,
  setDone,
  tick,
  toggleAnimal,
} from '../../modules/14-garden'
import { endGame, hostGame, startGame } from '../../modules/10-party'
import { GOOFS, defenderById } from '../../modules/14-garden'

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

  it('puts the steps in the order you do them in', () => {
    // Name, then ready, then the code, then the game, then start. The order is
    // the workflow, so it is worth a test: a lobby that asks you to pick a
    // game before it has told you how to get into one reads backwards.
    const html = openLobby().innerHTML
    const at = (needle: string) => {
      const i = html.indexOf(needle)
      expect(i, `${needle} is missing`).toBeGreaterThan(-1)
      return i
    }
    expect(at('you are')).toBeLessThan(at('start your own'))
    expect(at('start your own')).toBeLessThan(at('or join someone'))
    expect(at('or join someone')).toBeLessThan(at('GAME'))
    expect(at('GAME')).toBeLessThan(at('start the party'))
  })

  it('hides the ready button until you are actually in a party', () => {
    // On your own there is nobody to be ready for, and a button that means
    // nothing is worse than no button at all.
    const labels = [...openLobby().querySelectorAll('button')].map((b) => b.textContent)
    expect(labels).not.toContain('ready up')
    expect(labels).not.toContain('ready')
    // The host's start button is there either way: alone, you are the host.
    expect(labels).toContain('start the party')
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
    expect(html).toContain('shared by everybody in the party')
    // One loadout for the party, not one each.
    expect(html).toContain('between you')
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
    expect(host.innerHTML).toContain('between you')

    act(() => {
      toggleAnimal('pea-shooter')
      setDone(true)
    })

    // The lawn, and no shelf over the top of it.
    expect(host.innerHTML).not.toContain('between you')
    expect(host.querySelectorAll('[data-cell]')).toHaveLength(96)
  })
})


/**
 * The game, as far as it goes: a loadout chosen together, seeds landing on the
 * lawn to be clicked, and animals dragged into squares out of a shared pot.
 *
 * Driven by clicking rather than by dragging, because the screen deliberately
 * accepts both and a synthetic HTML5 drag proves less than a real one does.
 */
describe('playing a round of Garden Goofs', () => {
  function lawn(): HTMLDivElement {
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
    act(() => {
      toggleAnimal('pea-shooter')
      setDone(true)
    })
    return host
  }

  afterEach(() => {
    endGame()
    clearHands()
    act(() => chooseMode('island'))
  })

  const click = (el: Element | null) =>
    act(() => el?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

  it('opens the lawn with a full pot once everybody is in', () => {
    const host = lawn()
    expect(host.querySelectorAll('[data-cell]')).toHaveLength(96)
    expect(getGoofs().round.seeds).toBe(GOOFS.startingSeeds)
  })

  it('plants an animal into the square you pick, and the pot pays for it', () => {
    const host = lawn()
    const before = getGoofs().round.seeds

    // Pick the duck up out of the tray, then put it in a square.
    const tray = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Pea Shooter'))
    click(tray ?? null)
    click(host.querySelector('[data-cell="3,5"]'))

    const planted = getGoofs().round.plants
    expect(planted).toHaveLength(1)
    expect(planted[0]).toEqual({ row: 3, col: 5, id: 'pea-shooter' })
    expect(getGoofs().round.seeds).toBe(before - defenderById('pea-shooter').cost)
  })

  it('refuses a square that is already taken, and charges nothing for trying', () => {
    const host = lawn()
    const tray = () => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Pea Shooter'))

    click(tray() ?? null)
    click(host.querySelector('[data-cell="1,1"]'))
    const after = getGoofs().round.seeds

    click(tray() ?? null)
    click(host.querySelector('[data-cell="1,1"]'))
    expect(getGoofs().round.plants).toHaveLength(1)
    expect(getGoofs().round.seeds).toBe(after)
    // And it says why rather than doing nothing.
    expect(host.textContent).toContain('square taken')
  })

  it('does nothing at all until something is picked up', () => {
    const host = lawn()
    click(host.querySelector('[data-cell="0,0"]'))
    expect(getGoofs().round.plants).toHaveLength(0)
    expect(getGoofs().round.seeds).toBe(GOOFS.startingSeeds)
  })

  it('drops seeds on the lawn, and pays the pot when one is clicked', () => {
    const host = lawn()
    const before = getGoofs().round.seeds

    // Push the round along until the host drops one. The clock is a frame
    // loop in the real thing; here the test is the clock.
    act(() => tick(SEED.every + SEED.jitter + 0.1))
    expect(getGoofs().round.loose.length).toBeGreaterThan(0)

    const seed = host.querySelector('[data-seed]')
    expect(seed).not.toBeNull()
    click(seed)

    expect(getGoofs().round.seeds).toBe(before + SEED.worth)
    expect(getGoofs().round.loose).toHaveLength(0)
  })

  it('takes a seed away again if nobody clicks it in time', () => {
    lawn()
    act(() => tick(SEED.every + SEED.jitter + 0.1))
    const first = getGoofs().round.loose[0]
    expect(first).toBeDefined()
    const pot = getGoofs().round.seeds

    // Long enough for it to run out, in steps a frame loop would take. More
    // seeds land while this happens, which is the round working - the one
    // being watched is the one that has to go.
    for (let i = 0; i < Math.ceil(SEED.life / 0.2) + 2; i++) act(() => tick(0.2))
    expect(getGoofs().round.loose.some((s) => s.id === first.id)).toBe(false)
    // Missing it costs you nothing but the seed.
    expect(getGoofs().round.seeds).toBe(pot)
  })

  it('will not let you plant what the pot cannot pay for', () => {
    const host = lawn()
    const staple = defenderById('pea-shooter')
    const affordable = Math.floor(GOOFS.startingSeeds / staple.cost)

    const tray = () => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Pea Shooter'))
    for (let i = 0; i < affordable; i++) {
      click(tray() ?? null)
      click(host.querySelector(`[data-cell="0,${i}"]`))
    }
    expect(getGoofs().round.plants).toHaveLength(affordable)
    expect(getGoofs().round.seeds).toBeLessThan(staple.cost)

    // The tray packet goes dead rather than letting you try.
    expect(tray()?.hasAttribute('disabled')).toBe(true)
  })

  it('chooses the loadout as a party, not one each', () => {
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

    act(() => toggleAnimal('turtle'))
    expect(getGoofs().hand).toEqual(['turtle'])
    // Anybody can take somebody else's pick back out again.
    act(() => toggleAnimal('turtle'))
    expect(getGoofs().hand).toEqual([])
    expect(host.textContent).toContain(`Pick ${GOOFS.handSize} animals, between you`)
  })

  it('lists the three ways to play, still', () => {
    expect(GARDEN_MODES).toHaveLength(3)
  })
})
