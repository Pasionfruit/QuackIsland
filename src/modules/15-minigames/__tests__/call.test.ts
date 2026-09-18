/**
 * Going where the host goes, and pausing rather than leaving.
 *
 * Both rules are pure and both are silent when wrong: a guest that ignores the
 * call sits in the world while everybody else plays, a guest that over-applies
 * it can never close the screen, and a pause that does not stop the clock is a
 * card with a game going on behind it.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { MINIGAMES } from '../internal/catalogue'
import {
  NO_CALL,
  encodeCall,
  followCall,
  isMinigameCall,
  parseCall,
  type MinigameCall,
} from '../internal/call'
import {
  beginRun,
  countShown,
  forgetBuilds,
  freshRun,
  isPausable,
  pauseRun,
  registerMinigame,
  resumeRun,
  tickRun,
} from '../internal/registry'

describe('the call the host broadcasts', () => {
  it('reads back whatever it wrote, for every game there is', () => {
    for (const game of MINIGAMES) {
      for (const kind of ['open', 'play'] as const) {
        expect(parseCall(encodeCall(game.id, kind))).toEqual({ id: game.id, kind })
      }
    }
  })

  it('treats nothing-on as nothing rather than as a game', () => {
    expect(parseCall(NO_CALL)).toBeNull()
    expect(isMinigameCall(NO_CALL)).toBe(true)
  })

  it('refuses anything it does not recognise, rather than half-reading it', () => {
    // Everything here arrives off a socket from another browser.
    for (const bad of [
      'zombie-tag',
      'zombie-tag:dance',
      'no-such-game:play',
      ':play',
      'zombie-tag:',
      '',
      'none:play',
    ]) {
      expect(parseCall(bad), bad).toBeNull()
      expect(isMinigameCall(bad), bad).toBe(false)
    }
    for (const bad of [7, null, undefined, {}, ['zombie-tag:play']]) {
      expect(isMinigameCall(bad)).toBe(false)
    }
  })

  it('survives an id with a colon in it by splitting at the last one', () => {
    // No id has one today, and this is what stops that being a trap later.
    expect(parseCall('a:b:play')).toBeNull()
    expect(parseCall(encodeCall('zombie-tag', 'play'))?.id).toBe('zombie-tag')
  })
})

describe('following the host', () => {
  const OPEN = encodeCall('zombie-tag', 'open')
  const PLAY = encodeCall('zombie-tag', 'play')

  it('takes a guest into a game the host opened', () => {
    expect(followCall(OPEN, NO_CALL, false)).toEqual({
      act: true,
      open: { id: 'zombie-tag', kind: 'open' },
    })
  })

  it('takes a guest into a round the host started', () => {
    expect(followCall(PLAY, OPEN, false)).toEqual({
      act: true,
      open: { id: 'zombie-tag', kind: 'play' },
    })
  })

  it('takes a guest out again when the host leaves', () => {
    expect(followCall(NO_CALL, PLAY, false)).toEqual({ act: true, open: null })
  })

  it('does nothing to the host - it is their own call coming back', () => {
    expect(followCall(PLAY, NO_CALL, true).act).toBe(false)
    expect(followCall(NO_CALL, PLAY, true).act).toBe(false)
  })

  it('does nothing at all when the call has not changed', () => {
    // The rule that lets a guest step out of a round and stay out: without it
    // they would be dragged back in on the very next render, for ever.
    for (const call of [NO_CALL, OPEN, PLAY] as MinigameCall[]) {
      expect(followCall(call, call, false).act).toBe(false)
    }
  })

  it('picks a guest back up when the host starts something else', () => {
    // Having sat one out, the next thing the host does still reaches them.
    const satOut = PLAY
    const next = encodeCall('duck-hunt', 'open')
    expect(followCall(next, satOut, false)).toEqual({
      act: true,
      open: { id: 'duck-hunt', kind: 'open' },
    })
  })
})

describe('pausing a round', () => {
  afterEach(forgetBuilds)

  /** Whoever pressed it. A pause now carries a person; see `pause.ts`. */
  const BEA = { id: 'p2', name: 'bea' }

  it('has nothing to pause on a briefing', () => {
    const run = freshRun('zombie-tag')
    expect(isPausable(run)).toBe(false)
    expect(pauseRun(run, BEA)).toBe(run)
  })

  it('pauses a countdown and a round alike', () => {
    const counting = beginRun(freshRun('zombie-tag'))
    expect(isPausable(counting)).toBe(true)
    expect(pauseRun(counting, BEA).paused).toBe(true)

    const playing = tickRun(counting, 9)
    expect(isPausable(playing)).toBe(true)
    expect(pauseRun(playing, BEA).paused).toBe(true)
  })

  it('stops the countdown where it stands', () => {
    let run = tickRun(beginRun(freshRun('zombie-tag')), 1)
    expect(countShown(run)).toBe(2)

    run = pauseRun(run, BEA)
    // However long the card is up for, it comes back on the same number.
    run = tickRun(run, 30)
    expect(countShown(run)).toBe(2)
    expect(run.phase).toBe('counting')

    run = resumeRun(run)
    expect(countShown(run)).toBe(2)
    run = tickRun(run, 1)
    expect(countShown(run)).toBe(1)
  })

  it('starts a round unpaused, however the last one ended', () => {
    const paused = pauseRun(beginRun(freshRun('zombie-tag')), BEA)
    expect(paused.paused).toBe(true)
    expect(freshRun('zombie-tag').paused).toBe(false)
    expect(beginRun(freshRun('zombie-tag')).paused).toBe(false)
  })

  it('does nothing when asked for a state it is already in', () => {
    const run = beginRun(freshRun('zombie-tag'))
    expect(resumeRun(run)).toBe(run)
    const stopped = pauseRun(run, BEA)
    expect(pauseRun(stopped, BEA)).toBe(stopped)
  })

  it('leaves the game its own state untouched either way', () => {
    registerMinigame('zombie-tag', { newGame: () => ({ zombies: 6 }), Panel: () => null })
    const run = beginRun(freshRun('zombie-tag'))
    expect(pauseRun(run, BEA).game).toBe(run.game)
    expect(resumeRun(pauseRun(run, BEA)).game).toBe(run.game)
  })
})
