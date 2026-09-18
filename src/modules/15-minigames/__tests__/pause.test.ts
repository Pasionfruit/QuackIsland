/**
 * A pause that stops the round for everybody: who it belongs to, what it says
 * on the card, what it survives on the wire, and what restart does.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { NAME_MAX, decodePause, encodePause, mayControl, nameOfPauser, type Pauser } from '../internal/pause'
import { beginRun, countShown, forgetBuilds, freshRun, pauseRun, registerMinigame, restartRun, resumeRun, tickRun } from '../internal/registry'

const BEA: Pauser = { id: 'p2', name: 'bea' }
const CAL: Pauser = { id: 'p3', name: 'cal' }
const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

describe('who the card belongs to', () => {
  it('is nobody while the round is running', () => {
    expect(mayControl(null, 'p2', ['p2', 'p3'])).toBe(false)
  })

  it('is whoever stopped it, and nobody else', () => {
    const here = ['p1', 'p2', 'p3']
    expect(mayControl(BEA, 'p2', here)).toBe(true)
    expect(mayControl(BEA, 'p1', here)).toBe(false)
    expect(mayControl(BEA, 'p3', here)).toBe(false)
  })

  it('is everybody once whoever stopped it has left', () => {
    // Otherwise closing a browser strands the lobby in front of a card nobody
    // can dismiss, which is the one thing worse than somebody else holding it.
    const gone = ['p1', 'p3']
    expect(mayControl(BEA, 'p1', gone)).toBe(true)
    expect(mayControl(BEA, 'p3', gone)).toBe(true)
  })

  it('is yours when you are alone, because you are the only one here', () => {
    expect(mayControl(BEA, 'p2', ['p2'])).toBe(true)
    expect(mayControl(CAL, 'p2', ['p2'])).toBe(true)
  })
})

describe('what the card says', () => {
  it('names you as you, and everybody else by name', () => {
    expect(nameOfPauser(BEA, 'p2')).toBe('you')
    expect(nameOfPauser(BEA, 'p1')).toBe('bea')
  })

  it('has something to call somebody with no name at all', () => {
    expect(nameOfPauser({ id: 'p9', name: '' }, 'p1')).toBe('somebody')
    expect(nameOfPauser({ id: 'p9', name: '   ' }, 'p1')).toBe('somebody')
  })

  it('says nothing about a round that is not stopped', () => {
    expect(nameOfPauser(null, 'p1')).toBe('')
  })
})

describe('a pause on the wire', () => {
  it('carries which of the three it is and who pressed it', () => {
    for (const act of ['pause', 'resume', 'restart'] as const) {
      expect(decodePause(relay(encodePause({ act, by: BEA })))).toEqual({ act, by: BEA })
    }
  })

  it('does not carry a name longer than a name can be', () => {
    const long = { id: 'p2', name: 'x'.repeat(200) }
    const heard = decodePause(relay(encodePause({ act: 'pause', by: long })))!
    expect(heard.by.name).toHaveLength(NAME_MAX)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodePause({ act: 'pause', by: BEA }))
    expect(decodePause(good)).not.toBeNull()
    expect(decodePause({ ...good, t: 'mg' })).toBeNull()
    // An act from a build that knows something this one does not.
    expect(decodePause({ ...good, a: 'explode' })).toBeNull()
    expect(decodePause({ ...good, a: 3 })).toBeNull()
    expect(decodePause({ ...good, i: '' })).toBeNull()
    expect(decodePause({ ...good, i: 7 })).toBeNull()
    expect(decodePause({ ...good, n: 7 })).toBeNull()
    expect(decodePause({ ...good, n: 'x'.repeat(NAME_MAX + 1) })).toBeNull()
  })
})

describe('stopping and starting a round', () => {
  afterEach(forgetBuilds)

  it('remembers who stopped it, and forgets when it starts again', () => {
    const run = beginRun(freshRun('zombie-tag'))
    const stopped = pauseRun(run, BEA)
    expect(stopped).toMatchObject({ paused: true, pausedBy: BEA })
    expect(resumeRun(stopped)).toMatchObject({ paused: false, pausedBy: null })
  })

  it('keeps the two in step, whatever is done to it', () => {
    // `paused` is what every game reads and `pausedBy` is what the card reads;
    // a run where they disagreed would show a card nobody could dismiss.
    const runs = [
      freshRun('zombie-tag'),
      beginRun(freshRun('zombie-tag')),
      pauseRun(beginRun(freshRun('zombie-tag')), BEA),
      resumeRun(pauseRun(beginRun(freshRun('zombie-tag')), BEA)),
      restartRun(pauseRun(beginRun(freshRun('zombie-tag')), BEA)),
      tickRun(pauseRun(beginRun(freshRun('zombie-tag')), BEA), 9),
    ]
    for (const [i, run] of runs.entries()) expect(run.paused, `${i}`).toBe(run.pausedBy !== null)
  })

  it('does not let a second person take a pause off somebody else', () => {
    // The rule that stops it is `mayControl`; this is the arithmetic under it -
    // pausing an already paused run changes nothing, so a second press cannot
    // quietly move the card's owner.
    const stopped = pauseRun(beginRun(freshRun('zombie-tag')), BEA)
    expect(pauseRun(stopped, CAL)).toBe(stopped)
    expect(stopped.pausedBy).toEqual(BEA)
  })
})

describe('restart', () => {
  afterEach(forgetBuilds)

  it('takes a stopped round back to the three-two-one, running', () => {
    let run = tickRun(beginRun(freshRun('zombie-tag')), 1)
    expect(countShown(run)).toBe(2)
    run = pauseRun(run, BEA)

    const again = restartRun(run)
    expect(again.phase).toBe('counting')
    expect(countShown(again)).toBe(3)
    expect(again).toMatchObject({ paused: false, pausedBy: null })
  })

  it('throws the old game away and asks for a new one', () => {
    let dealt = 0
    registerMinigame('zombie-tag', { newGame: () => ({ n: ++dealt }), Panel: () => null })
    const run = pauseRun(beginRun(freshRun('zombie-tag')), BEA)
    const again = restartRun(run)
    expect(again.game).not.toBe(run.game)
    expect(again.game).toEqual({ n: dealt })
  })

  it('restarts the game that was open, not some other one', () => {
    const run = pauseRun(beginRun(freshRun('duck-hunt')), BEA)
    expect(restartRun(run).id).toBe('duck-hunt')
  })

  it('works from a round that was playing, not only from a countdown', () => {
    const playing = pauseRun(tickRun(beginRun(freshRun('zombie-tag')), 9), BEA)
    expect(playing.phase).toBe('playing')
    expect(restartRun(playing).phase).toBe('counting')
  })
})
