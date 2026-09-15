import { afterEach, describe, expect, it } from 'vitest'
import { LOBBY_ISLAND, SCENE, setLobbyVisible, setModuleEnabled } from '../scene'

/**
 * The lobby - the spawn island and its trimmings - hides the moment a game
 * starts and comes back the moment it ends, whichever game it was. This is
 * the part of that a test can reach without a WebGL context: the toggle
 * itself, not the R3F components it is toggling.
 */
describe('showing and hiding the lobby', () => {
  afterEach(() => {
    // Leave every entry the way `World` would at rest: lobby visible.
    setLobbyVisible(true)
  })

  it('hides exactly the spawn island and what is tied to it', () => {
    setLobbyVisible(false)
    for (const id of LOBBY_ISLAND) {
      expect(SCENE.find((e) => e.id === id)?.enabled).toBe(false)
    }
  })

  it('leaves everything that is not the lobby alone', () => {
    const others = SCENE.filter((e) => !LOBBY_ISLAND.includes(e.id)).map((e) => e.id)
    // There has to be something to check, or this test proves nothing.
    expect(others.length).toBeGreaterThan(0)

    setLobbyVisible(false)
    for (const id of others) {
      expect(SCENE.find((e) => e.id === id)?.enabled).toBe(true)
    }
  })

  it('brings the lobby back', () => {
    setLobbyVisible(false)
    setLobbyVisible(true)
    for (const id of LOBBY_ISLAND) {
      expect(SCENE.find((e) => e.id === id)?.enabled).toBe(true)
    }
  })

  it('does not touch the party island either way', () => {
    // The volcano is a game's own venue, not the lobby - hiding the lobby
    // must never take it with it.
    expect(LOBBY_ISLAND).not.toContain('10-party')
    setLobbyVisible(false)
    expect(SCENE.find((e) => e.id === '10-party')?.enabled).toBe(true)
  })

  it('does nothing when asked for a state it is already in', () => {
    // `setModuleEnabled` is a no-op on an unchanged value - worth pinning,
    // since `setLobbyVisible` is called on every render whether or not the
    // phase actually changed anything.
    setLobbyVisible(true)
    const before = SCENE.map((e) => ({ id: e.id, enabled: e.enabled }))
    setLobbyVisible(true)
    expect(SCENE.map((e) => ({ id: e.id, enabled: e.enabled }))).toEqual(before)
  })
})

describe('the underlying toggle', () => {
  afterEach(() => setModuleEnabled('01-terrain', true))

  it('ignores an id nobody registered', () => {
    expect(() => setModuleEnabled('99-nothing', false)).not.toThrow()
  })
})
