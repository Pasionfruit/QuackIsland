/**
 * The music: a jaunty little loop, made in the browser as it plays.
 *
 * Musical chairs without music is just chairs, so this game plays its own tune
 * rather than borrowing the island's: square-wave melody over a triangle bass,
 * scheduled a beat or so ahead on the Web Audio clock. No files, nothing to
 * load. **It stops the instant the game says the music has stopped** - the
 * master volume is cut in a hundredth of a second and nothing more is scheduled
 * - because hearing it stop is the whole signal to scramble.
 *
 * The notes are pure data, tested; the player is a thin wrapper round an
 * AudioContext, made on first use, so a page that never plays never makes one.
 */

/** Beats a minute. */
export const TEMPO = 168

/**
 * One bar after another, an eighth note a step: the melody as MIDI note numbers,
 * 0 for a rest.
 */
export const MELODY: readonly number[] = [
  72, 0, 76, 79, 76, 0, 72, 74, 76, 0, 74, 72, 71, 72, 74, 0,
  72, 0, 76, 79, 81, 79, 76, 74, 72, 74, 76, 74, 72, 0, 67, 0,
  69, 0, 72, 76, 74, 0, 72, 69, 67, 0, 71, 74, 72, 71, 69, 0,
  72, 0, 76, 79, 76, 0, 72, 74, 79, 77, 76, 74, 72, 0, 0, 0,
]

/** The bass, a quarter note a step, a bar being four. */
export const BASS: readonly number[] = [48, 55, 48, 55, 45, 52, 43, 50, 41, 48, 43, 50, 48, 43, 48, 0]

/** A MIDI note's frequency, hertz. */
export function frequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12)
}

/** What plays on eighth-note step `step` of the loop: the melody note, and the bass note if a quarter starts there. */
export function stepNotes(step: number): { melody: number; bass: number } {
  const i = ((step % MELODY.length) + MELODY.length) % MELODY.length
  return { melody: MELODY[i], bass: i % 2 === 0 ? BASS[(i / 2) % BASS.length] : 0 }
}

export interface Tune {
  /** Starts from the top, if not already playing. */
  play(): void
  /** Stops at once. */
  stop(): void
  setMuted(muted: boolean): void
  dispose(): void
}

type AudioContextClass = typeof AudioContext

export function createTune(): Tune {
  let context: AudioContext | null = null
  let master: GainNode | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let step = 0
  let nextAt = 0
  let muted = false
  const eighth = 60 / TEMPO / 2

  const ensure = (): AudioContext | null => {
    if (context) return context
    const Ctor = (globalThis as unknown as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass }).AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext
    if (!Ctor) return null
    context = new Ctor()
    master = context.createGain()
    master.gain.value = 0
    master.connect(context.destination)
    return context
  }

  const note = (ctx: AudioContext, midi: number, at: number, length: number, type: OscillatorType, volume: number) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = frequency(midi)
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(volume, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
    osc.connect(gain).connect(master!)
    osc.start(at)
    osc.stop(at + length + 0.02)
  }

  const schedule = () => {
    const ctx = context
    if (!ctx) return
    while (nextAt < ctx.currentTime + 0.25) {
      const { melody, bass } = stepNotes(step)
      if (melody) note(ctx, melody, nextAt, eighth * 0.9, 'square', 0.07)
      if (bass) note(ctx, bass, nextAt, eighth * 1.8, 'triangle', 0.16)
      step += 1
      nextAt += eighth
    }
  }

  return {
    play() {
      if (timer) return
      const ctx = ensure()
      if (!ctx || !master) return
      void ctx.resume()
      step = 0
      nextAt = ctx.currentTime + 0.05
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.setValueAtTime(muted ? 0 : 0.6, ctx.currentTime)
      schedule()
      timer = setInterval(schedule, 60)
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
      if (context && master) {
        master.gain.cancelScheduledValues(context.currentTime)
        master.gain.setValueAtTime(master.gain.value, context.currentTime)
        master.gain.linearRampToValueAtTime(0, context.currentTime + 0.012)
      }
    },
    setMuted(value) {
      muted = value
      if (context && master && timer) master.gain.setValueAtTime(muted ? 0 : 0.6, context.currentTime)
    },
    dispose() {
      if (timer) clearInterval(timer)
      timer = null
      void context?.close()
      context = null
      master = null
    },
  }
}
