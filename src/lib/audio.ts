/**
 * Polyland's noises, synthesised rather than shipped.
 *
 * There are no audio assets in this project and there is no reason for there
 * to be: everything here is built from oscillators and one little noise
 * buffer. They are deliberately short and dry - the point is to tell you what
 * just happened, not to be a soundtrack.
 *
 * This started as Duck szn's private sound bank and moved here when Party
 * Parade needed a starter pistol, the same way the HUD vocabulary moved out of
 * the game that first needed it.
 *
 * Everything is lazy. Browsers refuse to start an AudioContext until the page
 * has been clicked, so the context is created on the first sound and every
 * call is a no-op until then.
 */

export type Sound =
  // Duck szn
  | 'shot'
  | 'miss'
  | 'pop'
  | 'ding'
  | 'clank'
  | 'burst'
  | 'bark'
  | 'penalty'
  | 'rescue'
  // Party Parade
  | 'shotgun'
  | 'tick'
  | 'thud'
  | 'chop'
  | 'jump'
  | 'tag'
  | 'fanfare'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false
let noiseBuffer: AudioBuffer | null = null

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
  }
  // Autoplay policies suspend the context until a gesture; nudge it each time.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer
  const len = Math.floor(c.sampleRate * 0.4)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  noiseBuffer = buf
  return buf
}

/** A short tone with an exponential fall, which is most of these sounds. */
function tone(
  c: AudioContext,
  opts: {
    type?: OscillatorType
    from: number
    to?: number
    dur: number
    gain?: number
    delay?: number
  },
): void {
  const t0 = c.currentTime + (opts.delay ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = opts.type ?? 'square'
  osc.frequency.setValueAtTime(opts.from, t0)
  if (opts.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + opts.dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.25, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur)
  osc.connect(g)
  g.connect(master!)
  osc.start(t0)
  osc.stop(t0 + opts.dur + 0.02)
}

/** Filtered noise, for anything percussive. */
function hiss(
  c: AudioContext,
  opts: { dur: number; freq: number; q?: number; gain?: number; delay?: number },
): void {
  const t0 = c.currentTime + (opts.delay ?? 0)
  const src = c.createBufferSource()
  src.buffer = noise(c)
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(opts.freq, t0)
  filter.Q.value = opts.q ?? 1
  const g = c.createGain()
  g.gain.setValueAtTime(opts.gain ?? 0.3, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur)
  src.connect(filter)
  filter.connect(g)
  g.connect(master!)
  src.start(t0)
  src.stop(t0 + opts.dur + 0.02)
}

export function play(sound: Sound): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return

  switch (sound) {
    case 'shot':
      hiss(c, { dur: 0.07, freq: 1800, q: 0.7, gain: 0.28 })
      tone(c, { type: 'square', from: 320, to: 90, dur: 0.07, gain: 0.16 })
      break
    case 'miss':
      hiss(c, { dur: 0.05, freq: 900, q: 0.6, gain: 0.14 })
      break
    case 'pop':
      tone(c, { type: 'triangle', from: 720, to: 180, dur: 0.11, gain: 0.26 })
      hiss(c, { dur: 0.06, freq: 2400, gain: 0.16 })
      break
    case 'ding':
      tone(c, { type: 'sine', from: 1180, dur: 0.16, gain: 0.22 })
      tone(c, { type: 'sine', from: 1760, dur: 0.13, gain: 0.14, delay: 0.04 })
      break
    case 'clank':
      tone(c, { type: 'square', from: 540, to: 300, dur: 0.09, gain: 0.2 })
      hiss(c, { dur: 0.09, freq: 3200, q: 2, gain: 0.2 })
      break
    case 'burst':
      hiss(c, { dur: 0.26, freq: 700, q: 0.5, gain: 0.36 })
      tone(c, { type: 'sawtooth', from: 240, to: 60, dur: 0.24, gain: 0.2 })
      break
    case 'penalty':
      tone(c, { type: 'sawtooth', from: 300, to: 110, dur: 0.28, gain: 0.24 })
      break
    case 'rescue':
      // A little rising three-note flourish, so a save feels like one.
      tone(c, { type: 'triangle', from: 660, dur: 0.12, gain: 0.22 })
      tone(c, { type: 'triangle', from: 880, dur: 0.12, gain: 0.22, delay: 0.1 })
      tone(c, { type: 'triangle', from: 1320, dur: 0.2, gain: 0.24, delay: 0.2 })
      break
    case 'shotgun':
      // The starter pistol: a hard crack with a low thump under it, and a
      // little tail so it reads as a shot rather than a click.
      hiss(c, { dur: 0.05, freq: 2600, q: 0.5, gain: 0.5 })
      hiss(c, { dur: 0.22, freq: 700, q: 0.4, gain: 0.3 })
      tone(c, { type: 'square', from: 180, to: 45, dur: 0.16, gain: 0.3 })
      break
    case 'tick':
      tone(c, { type: 'square', from: 900, dur: 0.05, gain: 0.14 })
      break
    case 'thud':
      tone(c, { type: 'sine', from: 190, to: 70, dur: 0.14, gain: 0.3 })
      hiss(c, { dur: 0.07, freq: 400, q: 1.2, gain: 0.18 })
      break
    case 'chop':
      hiss(c, { dur: 0.09, freq: 1500, q: 1.4, gain: 0.3 })
      tone(c, { type: 'square', from: 420, to: 150, dur: 0.08, gain: 0.18 })
      break
    case 'jump':
      tone(c, { type: 'triangle', from: 380, to: 760, dur: 0.11, gain: 0.18 })
      break
    case 'tag':
      tone(c, { type: 'sawtooth', from: 520, to: 160, dur: 0.18, gain: 0.26 })
      hiss(c, { dur: 0.1, freq: 900, q: 1.1, gain: 0.2 })
      break
    case 'fanfare':
      tone(c, { type: 'triangle', from: 660, dur: 0.13, gain: 0.24 })
      tone(c, { type: 'triangle', from: 880, dur: 0.13, gain: 0.24, delay: 0.12 })
      tone(c, { type: 'triangle', from: 1100, dur: 0.13, gain: 0.24, delay: 0.24 })
      tone(c, { type: 'triangle', from: 1320, dur: 0.26, gain: 0.26, delay: 0.36 })
      break
    case 'bark':
      // Two rough yips: a noise burst shaped by a falling band-pass.
      hiss(c, { dur: 0.12, freq: 620, q: 1.6, gain: 0.4 })
      tone(c, { type: 'sawtooth', from: 420, to: 200, dur: 0.12, gain: 0.24 })
      hiss(c, { dur: 0.1, freq: 520, q: 1.6, gain: 0.34, delay: 0.17 })
      tone(c, { type: 'sawtooth', from: 380, to: 180, dur: 0.1, gain: 0.2, delay: 0.17 })
      break
  }
}

export function setMuted(next: boolean): void {
  muted = next
  if (master) master.gain.value = next ? 0 : 0.5
}

export function isMuted(): boolean {
  return muted
}
