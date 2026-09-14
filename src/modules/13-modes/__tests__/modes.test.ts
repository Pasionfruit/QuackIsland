import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODE,
  MODES,
  decodeMode,
  encodeMode,
  isModeId,
  isPlayable,
  modeById,
  nextMode,
  type ModeId,
} from '../internal/modes'

describe('the catalogue', () => {
  it('lists every game once', () => {
    const ids = MODES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThan(1)
  })

  it('gives every game something to read in the lobby', () => {
    for (const game of MODES) {
      expect(game.title.length).toBeGreaterThan(0)
      expect(game.blurb.length).toBeGreaterThan(0)
    }
  })

  it('starts on a game that exists', () => {
    // A lobby that opens pointing at a game nobody has built is broken before
    // anybody touches it: the host presses start and goes nowhere.
    expect(isModeId(DEFAULT_MODE)).toBe(true)
    expect(modeById(DEFAULT_MODE).built).toBe(true)
  })

  it('has at least one game that can actually be played', () => {
    expect(MODES.some((game) => game.built)).toBe(true)
  })

  it('cannot be added to at runtime', () => {
    // Read every render by the lobby. A catalogue anything could push onto is
    // one that will be pushed onto.
    expect(Object.isFrozen(MODES)).toBe(true)
    expect(Object.isFrozen(MODES[0])).toBe(true)
  })
})

describe('looking a game up', () => {
  it('finds each one by its id', () => {
    for (const game of MODES) expect(modeById(game.id)).toBe(game)
  })

  it('agrees with itself about what is playable', () => {
    for (const game of MODES) expect(isPlayable(game.id)).toBe(game.built)
  })

  it('knows an id when it sees one', () => {
    for (const game of MODES) expect(isModeId(game.id)).toBe(true)
    for (const junk of ['', 'ISLAND', 'chess', 7, null, undefined, {}, ['island']]) {
      expect(isModeId(junk)).toBe(false)
    }
  })
})

describe('stepping through the list', () => {
  it('visits every game and comes back', () => {
    let at: ModeId = MODES[0].id
    const seen = [at]
    for (let i = 1; i < MODES.length; i++) {
      at = nextMode(at)
      seen.push(at)
    }
    expect(new Set(seen).size).toBe(MODES.length)
    expect(nextMode(at)).toBe(MODES[0].id)
  })

  it('goes backwards too, without falling off the front', () => {
    expect(nextMode(MODES[0].id, -1)).toBe(MODES[MODES.length - 1].id)
    expect(nextMode(MODES[0].id, -MODES.length)).toBe(MODES[0].id)
  })
})

describe('the choice on the wire', () => {
  it('round-trips through the transport, which is JSON', () => {
    for (const game of MODES) {
      const sent = JSON.parse(JSON.stringify(encodeMode({ mode: game.id })))
      expect(decodeMode(sent)).toEqual({ mode: game.id })
    }
  })

  it('carries a question with no answer in it', () => {
    expect(decodeMode(encodeMode({ ask: true }))).toEqual({ ask: true })
  })

  it('leaves everybody else’s messages alone', () => {
    // The room channel is shared: the party's own messages come through here
    // and must not be read as a change of game.
    expect(decodeMode({ t: 'party', phase: 'playing' })).toBeNull()
    expect(decodeMode({})).toBeNull()
    expect(decodeMode({ t: 'mode ' })).toBeNull()
  })

  it('refuses a game it has never heard of', () => {
    // The dangerous one. Taken on trust it would point the lobby at a game
    // that does not exist, with nothing in the interface to select back out
    // of it, so the whole message is rejected rather than half-read.
    expect(decodeMode({ t: 'mode', mode: 'chess' })).toBeNull()
    expect(decodeMode({ t: 'mode', mode: 7 })).toBeNull()
    expect(decodeMode({ t: 'mode', mode: null })).toBeNull()
    expect(decodeMode({ t: 'mode', mode: 'island', ask: 'yes' })).toBeNull()
  })

  it('accepts a message that says nothing, because saying nothing is legal', () => {
    expect(decodeMode({ t: 'mode' })).toEqual({})
  })
})
