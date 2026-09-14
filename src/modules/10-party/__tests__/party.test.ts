import { describe, expect, it } from 'vitest'
import { allReady, canStart, decodeParty, encodeParty, waitingFor } from '../internal/party'

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


describe('calling the whole party off', () => {
  it('goes over the wire, and comes back as itself', () => {
    expect(decodeParty(encodeParty({ disband: true }))).toEqual({ disband: true })
  })

  it('is not something a garbled packet can say by accident', () => {
    // Everybody leaves the lobby on this one, so a truthy string or a 1 must
    // not do it: present-but-wrong rejects the whole message.
    expect(decodeParty({ t: 'party', disband: 'yes' })).toBeNull()
    expect(decodeParty({ t: 'party', disband: 1 })).toBeNull()
    expect(decodeParty({ t: 'party', disband: null })).toBeNull()
  })

  it('is a different thing from a round ending', () => {
    // `phase: 'off'` ends a round and leaves everybody in the lobby. Disband
    // ends the lobby. Reading one as the other strands or scatters people.
    const ended = decodeParty(encodeParty({ phase: 'off' }))
    const disbanded = decodeParty(encodeParty({ disband: true }))
    expect(ended).toEqual({ phase: 'off' })
    expect(ended?.disband).toBeUndefined()
    expect(disbanded?.phase).toBeUndefined()
  })
})
