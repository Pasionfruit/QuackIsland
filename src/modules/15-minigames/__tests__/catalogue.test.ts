/**
 * The catalogue, and the seam a built game plugs into.
 *
 * Forty-one entries is enough that nobody is going to read the list and spot a
 * duplicated id or a number that went missing, so this is what checks instead.
 * These are the tests that have to keep working as the list fills up: every one
 * of them is written against the counts and the shape rather than against any
 * particular game, so naming a free slot or building a game does not send
 * anybody back here to update a fixture.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  BUILD_STEPS,
  MINIGAMES,
  MINIGAME_TARGET,
  isMinigameId,
  isPlayable,
  minigameById,
  minigamesOfKind,
  nextStep,
  progress,
  stepsDone,
  type MinigameKind,
} from '../internal/catalogue'
import {
  COUNT_FROM,
  beginRun,
  buildFor,
  builtMinigames,
  countShown,
  forgetBuilds,
  freshRun,
  isBuilt,
  registerMinigame,
  tickRun,
} from '../internal/registry'

const KINDS: readonly MinigameKind[] = ['free-for-all', 'one-vs-all']

describe('the catalogue', () => {
  it('holds every slot the plan calls for, of each kind', () => {
    for (const kind of KINDS) {
      expect(minigamesOfKind(kind)).toHaveLength(MINIGAME_TARGET[kind])
    }
    const total = KINDS.reduce((sum, kind) => sum + MINIGAME_TARGET[kind], 0)
    expect(MINIGAMES).toHaveLength(total)
  })

  it('gives every game its own id', () => {
    const ids = MINIGAMES.map((game) => game.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every game its own number, with no gaps', () => {
    const numbers = MINIGAMES.map((game) => game.number).sort((a, b) => a - b)
    expect(new Set(numbers).size).toBe(numbers.length)
    // 1..n with nothing missing: the numbers are how people refer to these, so
    // a hole in them is a game somebody cannot ask for.
    expect(numbers[0]).toBe(1)
    expect(numbers[numbers.length - 1]).toBe(numbers.length)
  })

  it('lists them in number order', () => {
    const numbers = MINIGAMES.map((game) => game.number)
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
  })

  it('gives every named game a title and a description, and every free slot neither', () => {
    for (const game of MINIGAMES) {
      expect(game.title.length).toBeGreaterThan(0)
      if (game.reserved) {
        expect(game.description).toHaveLength(0)
        expect(game.controls).toHaveLength(0)
      } else {
        expect(game.description.length).toBeGreaterThan(0)
        for (const para of game.description) expect(para.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('never gives a control an empty half', () => {
    for (const game of MINIGAMES) {
      for (const control of game.controls) {
        expect(control.input.length).toBeGreaterThan(0)
        expect(control.does.length).toBeGreaterThan(0)
      }
    }
  })

  it('never finishes a stage before the one it depends on', () => {
    // The stages are in dependency order, so a game with its controls done and
    // no environment is a game whose record is wrong. Nothing enforces the
    // order when the entry is written down, so this does.
    for (const game of MINIGAMES) {
      let owed = false
      for (const step of BUILD_STEPS) {
        if (!game.done[step]) owed = true
        else expect(owed, `${game.id} finished ${step} out of order`).toBe(false)
      }
    }
  })

  it('counts up to the catalogue and no further', () => {
    const far = progress()
    expect(far.named + far.reserved).toBe(MINIGAMES.length)
    for (const step of BUILD_STEPS) {
      expect(far.steps[step]).toBeLessThanOrEqual(far.named)
    }
    // Each stage can only be as far along as the one before it.
    expect(far.steps.controls).toBeLessThanOrEqual(far.steps.environment)
    expect(far.steps.assets).toBeLessThanOrEqual(far.steps.controls)
  })

  it('knows the built games are part built and nothing else has started', () => {
    // The honest statement of where the build has got to. Meant to be edited
    // the day the next game starts, which is the point of writing it down.
    for (const id of ['zombie-tag', 'messy-maze', 'probable-stop', 'duck-hunt', 'punch-buggy', 'let-him-cook', 'i-see-the-light'] as const) {
      const game = minigameById(id)
      expect(game.done).toEqual({ environment: true, controls: true, assets: false })
      expect(nextStep(game)).toBe('assets')
    }

    const started = MINIGAMES.filter((game) => stepsDone(game) > 0).map((game) => game.id)
    expect(started).toEqual(['zombie-tag', 'messy-maze', 'probable-stop', 'duck-hunt', 'punch-buggy', 'let-him-cook', 'i-see-the-light'])
    expect(progress().playable).toBe(0)
  })

  it('finds a game by its id, and knows an id it has never heard of', () => {
    expect(minigameById('zombie-tag').number).toBe(1)
    expect(isMinigameId('zombie-tag')).toBe(true)
    expect(isMinigameId('no-such-game')).toBe(false)
    expect(isMinigameId(7)).toBe(false)
    expect(isMinigameId(null)).toBe(false)
  })

  it('counts progress over whatever list it is given', () => {
    expect(progress([])).toEqual({
      slots: 0,
      named: 0,
      reserved: 0,
      playable: 0,
      steps: { environment: 0, controls: 0, assets: 0 },
    })
    const one = progress([minigameById('zombie-tag')])
    expect(one).toMatchObject({ slots: 1, named: 1, reserved: 0, playable: 0 })
  })
})

/**
 * The three stages every game gets built in.
 *
 * Exercised against made-up entries as well as the real ones, because the real
 * ones are all at zero today and a rule that is only ever tested against zero
 * is not tested.
 */
describe('the three build stages', () => {
  const fake = (done: Partial<Record<(typeof BUILD_STEPS)[number], boolean>>, reserved = false) => ({
    ...minigameById('zombie-tag'),
    reserved,
    done: { environment: false, controls: false, assets: false, ...done },
  })

  it('runs environment, then controls, then assets', () => {
    expect([...BUILD_STEPS]).toEqual(['environment', 'controls', 'assets'])
  })

  it('counts how many of the three are finished', () => {
    expect(stepsDone(fake({}))).toBe(0)
    expect(stepsDone(fake({ environment: true }))).toBe(1)
    expect(stepsDone(fake({ environment: true, controls: true, assets: true }))).toBe(3)
  })

  it('points at the first unfinished stage, not the furthest along', () => {
    // Controls wired to an environment that does not exist are controls that
    // cannot be tested, so a game that skipped ahead is still owed the first.
    expect(nextStep(fake({}))).toBe('environment')
    expect(nextStep(fake({ environment: true }))).toBe('controls')
    expect(nextStep(fake({ environment: true, controls: true }))).toBe('assets')
    expect(nextStep(fake({ assets: true }))).toBe('environment')
  })

  it('has nothing to do next once all three are done', () => {
    expect(nextStep(fake({ environment: true, controls: true, assets: true }))).toBeNull()
  })

  it('has nothing to do on a slot nobody has named', () => {
    expect(nextStep(fake({}, true))).toBeNull()
    expect(isPlayable(fake({ environment: true, controls: true, assets: true }, true))).toBe(false)
  })

  it('is playable only with all three finished', () => {
    expect(isPlayable(fake({ environment: true, controls: true }))).toBe(false)
    expect(isPlayable(fake({ environment: true, controls: true, assets: true }))).toBe(true)
  })

  it('counts a part-built catalogue stage by stage', () => {
    const far = progress([
      fake({ environment: true }),
      fake({ environment: true, controls: true }),
      fake({}, true),
    ])
    expect(far).toMatchObject({ slots: 3, named: 2, reserved: 1, playable: 0 })
    expect(far.steps).toEqual({ environment: 2, controls: 1, assets: 0 })
  })
})

/**
 * The part that has to hold up forty more times: registering a game.
 *
 * Driven with a made-up build rather than a real one, because there are no
 * real ones yet - and because the point being tested is that the registry does
 * not care which game it is.
 */
describe('registering a built game', () => {
  afterEach(forgetBuilds)

  it('starts with nothing built', () => {
    expect(builtMinigames()).toHaveLength(0)
    expect(isBuilt('zombie-tag')).toBe(false)
    expect(buildFor('zombie-tag')).toBeNull()
  })

  it('takes a build and hands it back', () => {
    const build = { newGame: () => ({ zombies: 6 }), Panel: () => null }
    registerMinigame('zombie-tag', build)

    expect(isBuilt('zombie-tag')).toBe(true)
    expect(buildFor('zombie-tag')).toBe(build)
    expect(builtMinigames()).toEqual(['zombie-tag'])
  })

  it('leaves every other game exactly as unbuilt as it was', () => {
    registerMinigame('zombie-tag', { newGame: () => null, Panel: () => null })
    expect(isBuilt('duck-hunt')).toBe(false)
    expect(buildFor('duck-hunt')).toBeNull()
  })

  it('lets each game keep a state of its own shape', () => {
    // The whole reason `newGame` returns `unknown`: these two have nothing in
    // common and the registry is not the place that pretends otherwise.
    registerMinigame('zombie-tag', {
      newGame: () => ({ zombies: 6, survivors: 2 }),
      Panel: () => null,
    })
    registerMinigame('perfect-game', {
      newGame: () => ({ crabs: 30, coconut: { angle: 0 } }),
      Panel: () => null,
    })

    expect(freshRun('zombie-tag').game).toEqual({ zombies: 6, survivors: 2 })
    expect(freshRun('perfect-game').game).toEqual({ crabs: 30, coconut: { angle: 0 } })
  })

  it('starts a fresh state per run, not one shared between them', () => {
    registerMinigame('zombie-tag', { newGame: () => ({ caught: [] }), Panel: () => null })
    const first = freshRun('zombie-tag')
    const second = freshRun('zombie-tag')
    expect(first.game).not.toBe(second.game)
  })

  it('replaces a build registered twice rather than keeping both', () => {
    registerMinigame('zombie-tag', { newGame: () => 'first', Panel: () => null })
    registerMinigame('zombie-tag', { newGame: () => 'second', Panel: () => null })
    expect(builtMinigames()).toHaveLength(1)
    expect(freshRun('zombie-tag').game).toBe('second')
  })
})

describe('the catalogue and the code agreeing', () => {
  afterEach(forgetBuilds)

  it('has no game claiming to be playable without a build behind it', () => {
    // `done` is a hand-kept record of the plan and the registry is the code;
    // the two can drift, and this is the direction of drift that matters - a
    // dashboard saying a game is ready when there is nothing to play.
    for (const game of MINIGAMES) {
      if (isPlayable(game)) expect(isBuilt(game.id)).toBe(true)
    }
  })

  it('catches that drift when it happens', () => {
    // The rule above is true of an empty catalogue for the wrong reason, so
    // here it is against a game that does claim to be finished.
    const finished = {
      ...minigameById('zombie-tag'),
      done: { environment: true, controls: true, assets: true },
    }
    expect(isPlayable(finished)).toBe(true)
    expect(isBuilt(finished.id)).toBe(false)
  })
})

describe('a run of a game', () => {
  afterEach(forgetBuilds)

  it('begins at the briefing, whichever game it is', () => {
    for (const game of MINIGAMES) {
      expect(freshRun(game.id).phase).toBe('briefing')
    }
  })

  it('has no state at all when there is no build to ask', () => {
    expect(freshRun('zombie-tag').game).toBeNull()
  })
})

/**
 * Three, two, one.
 *
 * The same countdown for all forty-one games, which is why it is here and not
 * in any of them. Pure, so the whole of it can be checked by passing numbers
 * in rather than by waiting three real seconds.
 */
describe('the countdown', () => {
  afterEach(forgetBuilds)

  it('does not run until play is pressed', () => {
    const run = freshRun('zombie-tag')
    expect(countShown(run)).toBeNull()
    expect(tickRun(run, 1)).toBe(run)
  })

  it('starts at three and counts down to go', () => {
    let run = beginRun(freshRun('zombie-tag'))
    expect(run.phase).toBe('counting')
    expect(countShown(run)).toBe(3)

    run = tickRun(run, 1)
    expect(countShown(run)).toBe(2)

    run = tickRun(run, 1)
    expect(countShown(run)).toBe(1)

    run = tickRun(run, 1)
    expect(run.phase).toBe('playing')
    expect(countShown(run)).toBeNull()
  })

  it('holds each number for a whole second, not an instant', () => {
    // Rounded up: a three that is only up for one frame is a three nobody saw.
    let run = beginRun(freshRun('zombie-tag'))
    expect(countShown(run)).toBe(3)
    run = tickRun(run, 0.9)
    expect(countShown(run)).toBe(3)
    run = tickRun(run, 0.2)
    expect(countShown(run)).toBe(2)
  })

  it('gets there in small steps as surely as in big ones', () => {
    let run = beginRun(freshRun('zombie-tag'))
    for (let i = 0; i < 40; i++) run = tickRun(run, 0.1)
    expect(run.phase).toBe('playing')
  })

  it('never overshoots into a negative count', () => {
    const run = tickRun(beginRun(freshRun('zombie-tag')), 99)
    expect(run.phase).toBe('playing')
    expect(run.countdown).toBe(0)
  })

  it('ignores a tick that goes backwards', () => {
    const run = beginRun(freshRun('zombie-tag'))
    expect(tickRun(run, -5).countdown).toBe(run.countdown)
  })

  it('cannot be started twice, and is not a restart', () => {
    const counting = tickRun(beginRun(freshRun('zombie-tag')), 1.5)
    expect(beginRun(counting)).toBe(counting)

    const playing = tickRun(counting, 9)
    expect(beginRun(playing)).toBe(playing)
  })

  it('builds the game its state when the count starts, not when it ends', () => {
    // A game that wants to draw its board behind the numbers needs a board.
    registerMinigame('zombie-tag', { newGame: () => ({ zombies: 6 }), Panel: () => null })
    expect(beginRun(freshRun('zombie-tag')).game).toEqual({ zombies: 6 })
  })

  it('leaves the game state alone as it counts', () => {
    registerMinigame('zombie-tag', { newGame: () => ({ zombies: 6 }), Panel: () => null })
    const started = beginRun(freshRun('zombie-tag'))
    expect(tickRun(started, 1).game).toBe(started.game)
    expect(tickRun(started, 9).game).toBe(started.game)
  })

  it('runs for every game in the catalogue, the same way', () => {
    for (const game of MINIGAMES) {
      const run = tickRun(beginRun(freshRun(game.id)), COUNT_FROM)
      expect(run.phase).toBe('playing')
    }
  })
})
