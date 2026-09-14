import { describe, expect, it } from 'vitest'
import {
  allReady,
  canStart,
  decodeParty,
  encodeParty,
  lobbyAction,
  waitingFor,
  type LobbyView,
} from '../internal/party'

const readySet = (...ids: string[]) => new Set(ids)

describe('everybody being ready', () => {
  it('needs every single person', () => {
    expect(allReady(['a', 'b', 'c'], readySet('a', 'b', 'c'))).toBe(true)
    expect(allReady(['a', 'b', 'c'], readySet('a', 'b'))).toBe(false)
  })

  it('counts the host too', () => {
    // A host who could start without readying up would be starting a game
    // they were not in.
    expect(allReady(['host', 'guest'], readySet('guest'))).toBe(false)
  })

  it('is not satisfied by an empty lobby', () => {
    // "Nobody is unready" is true of nothing at all, and starting a game with
    // no players is not a thing anybody meant to ask for.
    expect(allReady([], readySet())).toBe(false)
  })

  it('ignores people who have readied up and left', () => {
    // The ready set is only ever consulted against who is actually here.
    expect(allReady(['a'], readySet('a', 'ghost'))).toBe(true)
  })

  it('counts who is still being waited on', () => {
    expect(waitingFor(['a', 'b', 'c'], readySet('a'))).toBe(2)
    expect(waitingFor(['a'], readySet('a'))).toBe(0)
    expect(waitingFor([], readySet())).toBe(0)
  })
})

describe('whether start can be pressed', () => {
  const everyone = ['host', 'guest']
  const all = readySet('host', 'guest')

  it('needs to be the host, in the gathering, with everybody ready', () => {
    expect(canStart('gathering', true, everyone, all)).toBe(true)
  })

  it('is never a guest’s to press', () => {
    // A guest pressing start would move nobody but themselves.
    expect(canStart('gathering', false, everyone, all)).toBe(false)
  })

  it('is not offered before a game has been opened', () => {
    expect(canStart('off', true, everyone, all)).toBe(false)
  })

  it('is not offered again once it is running', () => {
    expect(canStart('playing', true, everyone, all)).toBe(false)
  })

  it('waits for the last person', () => {
    expect(canStart('gathering', true, everyone, readySet('host'))).toBe(false)
  })

  it('still needs the host to be ready when alone', () => {
    expect(canStart('gathering', true, ['host'], readySet())).toBe(false)
    expect(canStart('gathering', true, ['host'], readySet('host'))).toBe(true)
  })
})

describe('party messages', () => {
  it('survive a round trip', () => {
    expect(decodeParty(encodeParty({ phase: 'gathering' }))).toEqual({ phase: 'gathering' })
    expect(decodeParty(encodeParty({ ready: true }))).toEqual({ ready: true })
    expect(decodeParty(encodeParty({ phase: 'playing', ready: false }))).toEqual({
      phase: 'playing',
      ready: false,
    })
  })

  it('ignore anything that is not a party message', () => {
    expect(decodeParty({ t: 'duck' })).toBeNull()
    expect(decodeParty({})).toBeNull()
  })

  it('refuse a phase nobody has heard of, whatever shape it is', () => {
    // A phase with no case in the dashboard leaves it in a state with no way
    // out, and this arrives from somebody else's browser. A phase of 7 and a
    // phase of "chaos" are the same kind of wrong.
    expect(decodeParty({ t: 'party', phase: 'chaos' })).toBeNull()
    expect(decodeParty({ t: 'party', phase: 7 })).toBeNull()
    expect(decodeParty({ t: 'party', phase: null })).toBeNull()
  })

  it('refuse a ready flag that is not a flag', () => {
    expect(decodeParty({ t: 'party', ready: 'yes' })).toBeNull()
    expect(decodeParty({ t: 'party', ready: 1 })).toBeNull()
  })

  it('do not half-trust a message with one good field and one bad', () => {
    expect(decodeParty({ t: 'party', ready: true, phase: 'chaos' })).toBeNull()
  })

  it('carry only what was set', () => {
    // A message saying nothing about the phase must not be read as saying the
    // phase is off, or a guest's ready packet would end everyone's game.
    expect(decodeParty(encodeParty({ ready: true }))?.phase).toBeUndefined()
  })
})


describe('the one lobby button', () => {
  const view = (over: Partial<LobbyView> = {}): LobbyView => ({
    phase: 'gathering',
    isHost: true,
    ids: ['self'],
    ready: new Set<string>(),
    amReady: false,
    playable: true,
    ...over,
  })

  it('offers to ready you up first, host or not', () => {
    expect(lobbyAction(view())).toBe('ready')
    expect(lobbyAction(view({ isHost: false }))).toBe('ready')
  })

  it('lets you take it back', () => {
    expect(lobbyAction(view({ amReady: true, isHost: false, ready: new Set(['self']) }))).toBe(
      'unready',
    )
  })

  it('becomes start for the host, once everybody has said it', () => {
    const ids = ['self', 'a', 'b']
    expect(lobbyAction(view({ ids, amReady: true, ready: new Set(ids) }))).toBe('start')
  })

  it('does not become start while anybody is still waiting', () => {
    const ids = ['self', 'a', 'b']
    expect(lobbyAction(view({ ids, amReady: true, ready: new Set(['self', 'a']) }))).toBe('unready')
  })

  it('never becomes start for a guest, however ready everyone is', () => {
    const ids = ['self', 'a']
    expect(
      lobbyAction(view({ ids, isHost: false, amReady: true, ready: new Set(ids) })),
    ).toBe('unready')
  })

  it('has nothing to do once the game is running', () => {
    expect(lobbyAction(view({ phase: 'playing', amReady: true }))).toBe('none')
  })

  it('has nothing to do when the chosen game cannot be started', () => {
    // A game that is not built, or one that needs more people than are here.
    // Without this the host readies up, presses start, and everybody is moved
    // somewhere there is nothing to do.
    expect(lobbyAction(view({ playable: false }))).toBe('none')
    expect(lobbyAction(view({ playable: false, amReady: true }))).toBe('none')
  })
})
