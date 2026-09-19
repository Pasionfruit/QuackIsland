// @vitest-environment jsdom
/**
 * The game's sounds: its round music, its cues, and the last six seconds.
 *
 * All of it is `Audio` elements being started and stopped, so a stand-in that
 * remembers which is which is the whole of the setup.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MinigameRun, RunPhase } from '../internal/registry'
import {
  CUES,
  LAST_SECONDS_SOUND,
  ROUND_MUSIC,
  forgetScreenSounds,
  holdScreenSounds,
  loopCue,
  muteRoundMusic,
  playCue,
  stopScreenSounds,
  useCueOnChange,
} from '../internal/sound'
import { TopTimer } from '../internal/TopTimer'
import { RoundMusic } from '../internal/Transitions'

class FakeAudio {
  static made: FakeAudio[] = []
  currentTime = 0
  paused = true
  ended = false
  volume = 1
  loop = false
  preload = ''
  plays = 0
  constructor(public src = '') {
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

const find = (file: string) => FakeAudio.made.filter((a) => a.src.endsWith(file))

let root: Root | null = null

function render(node: React.ReactNode): void {
  if (!root) {
    const where = document.createElement('div')
    document.body.appendChild(where)
    root = createRoot(where)
  }
  const r = root
  act(() => r.render(node))
}

const run = (phase: RunPhase, paused = false, started = 1): MinigameRun => ({
  id: 'zombie-tag',
  phase,
  countdown: 0,
  started,
  paused,
  pausedBy: null,
  game: null,
  standings: null,
})

beforeEach(() => {
  FakeAudio.made = []
  vi.stubGlobal('Audio', FakeAudio)
  forgetScreenSounds()
})

afterEach(() => {
  if (root) {
    const r = root
    act(() => r.unmount())
  }
  root = null
  forgetScreenSounds()
  vi.unstubAllGlobals()
})

describe('round music', () => {
  const track = ROUND_MUSIC['zombie-tag'] ?? ''

  it('waits for the round, plays under it, holds on a pause, and stops on Finish', () => {
    render(<RoundMusic run={run('counting')} />)
    const music = () => find(track)[0]
    expect(music()?.paused ?? true).toBe(true)

    render(<RoundMusic run={run('playing')} />)
    expect(music().paused).toBe(false)
    expect(music().loop).toBe(true)

    music().currentTime = 12
    render(<RoundMusic run={run('playing', true)} />)
    expect(music().paused).toBe(true)
    expect(music().currentTime).toBe(12)

    render(<RoundMusic run={run('playing')} />)
    expect(music().paused).toBe(false)

    render(<RoundMusic run={run('finishing')} />)
    expect(music().paused).toBe(true)
    expect(music().currentTime).toBe(0)
  })

  it('starts again from the top on a restart', () => {
    render(<RoundMusic run={run('playing', false, 1)} />)
    find(track)[0].currentTime = 30
    render(<RoundMusic run={run('playing', false, 2)} />)
    expect(find(track)[0].currentTime).toBe(0)
    expect(find(track)[0].paused).toBe(false)
  })

  it('can be silenced by the game inside a round, and forgets it when the round stops', () => {
    render(<RoundMusic run={run('playing')} />)
    muteRoundMusic(true)
    expect(find(track)[0].paused).toBe(true)
    muteRoundMusic(false)
    expect(find(track)[0].paused).toBe(false)

    muteRoundMusic(true)
    render(<RoundMusic run={run('over')} />)
    render(<RoundMusic run={run('playing', false, 2)} />)
    expect(find(track)[0].paused).toBe(false)
  })

  it('is stopped with the rest of the screen', () => {
    render(<RoundMusic run={run('playing')} />)
    stopScreenSounds()
    expect(find(track)[0].paused).toBe(true)
  })
})

describe('cues', () => {
  it('overlap rather than cutting each other off', () => {
    playCue(CUES.balloonPop)
    playCue(CUES.balloonPop)
    const pops = find(CUES.balloonPop)
    expect(pops).toHaveLength(2)
    expect(pops.every((p) => !p.paused)).toBe(true)
  })

  it('reuse a voice that has finished', () => {
    playCue(CUES.bump)
    find(CUES.bump)[0].paused = true
    playCue(CUES.bump)
    expect(find(CUES.bump)).toHaveLength(1)
  })

  it('choose from a list by the number they are handed, the same on every screen', () => {
    playCue(CUES.dadYelling, undefined, 4)
    expect(find(CUES.dadYelling[1])).toHaveLength(1)
  })

  it('loop only while asked to, and act only on a change', () => {
    loopCue(CUES.drawing, true)
    loopCue(CUES.drawing, true)
    const pencil = find(CUES.drawing)
    expect(pencil).toHaveLength(1)
    expect(pencil[0].plays).toBe(1)
    expect(pencil[0].loop).toBe(true)
    loopCue(CUES.drawing, false)
    expect(pencil[0].paused).toBe(true)
  })

  it('play on a change of key, and not on the first render', () => {
    function Pops({ n }: { n: number }) {
      useCueOnChange(CUES.balloonPop, n)
      return null
    }
    render(<Pops n={0} />)
    expect(find(CUES.balloonPop)).toHaveLength(0)
    render(<Pops n={1} />)
    expect(find(CUES.balloonPop)).toHaveLength(1)
    render(<Pops n={1} />)
    expect(find(CUES.balloonPop)[0].plays).toBe(1)
  })
})

describe('the last six seconds', () => {
  it('tick once, on the way into them, and hold with the screen', () => {
    render(<TopTimer left={9}>9</TopTimer>)
    expect(find(LAST_SECONDS_SOUND)).toHaveLength(0)
    render(<TopTimer left={5.9}>6</TopTimer>)
    render(<TopTimer left={4}>4</TopTimer>)
    const tick = find(LAST_SECONDS_SOUND)
    expect(tick).toHaveLength(1)
    expect(tick[0].plays).toBe(1)

    holdScreenSounds(true)
    expect(tick[0].paused).toBe(true)
    holdScreenSounds(false)
    expect(tick[0].paused).toBe(false)
  })

  it('stay quiet for a clock that has no deadline', () => {
    render(<TopTimer>12.4s</TopTimer>)
    expect(find(LAST_SECONDS_SOUND)).toHaveLength(0)
  })
})
