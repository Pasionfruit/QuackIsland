/**
 * Playing short sounds, overlapping, without them cutting each other off.
 *
 * The Web Audio API rather than `<audio>` elements, which is the opposite of
 * the choice the music module made and for the opposite reason. An audio
 * element cannot play the same file twice at once - a second footstep
 * restarts the first - and it has latency you can hear on a sound that is
 * supposed to line up with a foot hitting sand. Web Audio decodes once and
 * then every play is a fresh, free source node.
 *
 * It also gets pitch variation, which is most of what stops four identical
 * footsteps in a row sounding like a machine.
 */
import { assetUrl } from '../../00-core'
import type { CueName } from './cues'

export interface CueSound {
  file: string
  /** Loudness relative to the master volume. */
  gain: number
  /** How far the pitch wanders either side of normal, as a fraction. */
  wobble: number
}

export const SOUNDS: Record<CueName, CueSound> = {
  step: { file: 'audio/step_on_sand.mp3', gain: 0.55, wobble: 0.14 },
  jump: { file: 'audio/jump_from_sand.mp3', gain: 0.7, wobble: 0.08 },
  land: { file: 'audio/land_on_sand.mp3', gain: 0.8, wobble: 0.07 },
  stroke: { file: 'audio/swim_stroke.mp3', gain: 0.5, wobble: 0.12 },
}

export const AUDIO = {
  /** Where the effects volume is remembered. */
  storageKey: 'localrot.audio.volume',
  /**
   * How far away another player can still be heard, in metres.
   *
   * Short on purpose. Footsteps carry a few metres in life, and a lobby where
   * everyone hears everyone is a lobby that sounds like a stampede.
   */
  hearing: 26,
  /** Inside this, another player is as loud as you are. */
  intimate: 3,
  defaultVolume: 0.7,
  /**
   * Never more than this many of the same cue at once. A frame that somehow
   * fired a hundred footsteps should be quiet, not a wall of noise.
   */
  maxVoices: 6,
} as const

/** Volume is 0 to 1, and anything else came from storage and cannot be trusted. */
export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return AUDIO.defaultVolume
  return Math.min(1, Math.max(0, volume))
}

/**
 * How loud and how far to one side another player's sound is.
 *
 * Pure, and worth being pure: "is the duck on my left actually on my left" is
 * a sign error away from being wrong, and a sign error in panning is very hard
 * to notice deliberately and very annoying once heard.
 *
 * `forward` is the way the listener is looking, flattened - height does not
 * change which ear a thing is in.
 */
export function spatialFor(
  listener: { x: number; z: number },
  forward: { x: number; z: number },
  source: { x: number; z: number },
): { gain: number; pan: number } {
  const dx = source.x - listener.x
  const dz = source.z - listener.z
  const distance = Math.hypot(dx, dz)
  if (distance > AUDIO.hearing) return { gain: 0, pan: 0 }

  // Flat inside the intimate radius, then falling to nothing at the edge of
  // hearing. Squared, so it fades the way distance actually sounds rather than
  // staying loud and then stopping.
  const reach = Math.max(1e-6, AUDIO.hearing - AUDIO.intimate)
  const out = Math.min(1, Math.max(0, (distance - AUDIO.intimate) / reach))
  const gain = (1 - out) * (1 - out)

  if (distance < 1e-4) return { gain, pan: 0 }

  // Screen-right is cross(forward, up), which for a +Y-up right-handed world
  // is (-forward.z, forward.x). The same derivation as the movement basis, and
  // it was wrong there once, so it is stated rather than re-derived.
  const length = Math.hypot(forward.x, forward.z) || 1
  const rightX = -forward.z / length
  const rightZ = forward.x / length
  const pan = (dx * rightX + dz * rightZ) / distance
  return { gain, pan: Math.min(1, Math.max(-1, pan)) }
}

/** A pitch near 1, so repeats of one sound do not sound identical. */
export function pitchFor(wobble: number, random: number): number {
  const spread = Math.min(0.5, Math.max(0, wobble))
  return 1 + (Math.min(1, Math.max(0, random)) * 2 - 1) * spread
}

type Buffers = Partial<Record<CueName, AudioBuffer>>

/**
 * Owns the audio context and the decoded sounds.
 *
 * Deliberately tolerant: a browser with no Web Audio, a file that will not
 * decode, or a context the user has never unlocked all end with silence and a
 * console line. Sound is not worth breaking the game for.
 */
export class CueEngine {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private buffers: Buffers = {}
  private playing: Partial<Record<CueName, number>> = {}
  private volume: number = AUDIO.defaultVolume
  private loading = false

  /** True once there is a context and at least one sound decoded. */
  get ready(): boolean {
    return this.context !== null && Object.keys(this.buffers).length > 0
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume)
    if (this.master) this.master.gain.value = this.volume
  }

  getVolume(): number {
    return this.volume
  }

  /**
   * Builds the context and loads every sound. Safe to call repeatedly; it only
   * ever does the work once.
   */
  async start(): Promise<void> {
    if (this.loading || this.context) {
      await this.resume()
      return
    }
    this.loading = true

    const Ctor: typeof AudioContext | undefined =
      typeof window === 'undefined'
        ? undefined
        : window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!Ctor) {
      console.error('[08-audio] no Web Audio in this browser; running silent')
      this.loading = false
      return
    }

    const context = new Ctor()
    const master = context.createGain()
    master.gain.value = this.volume
    master.connect(context.destination)
    this.context = context
    this.master = master

    await Promise.all(
      (Object.keys(SOUNDS) as CueName[]).map(async (name) => {
        try {
          const response = await fetch(assetUrl(SOUNDS[name].file))
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
          this.buffers[name] = await context.decodeAudioData(await response.arrayBuffer())
        } catch (error) {
          console.error(`[08-audio] could not load ${SOUNDS[name].file}`, error)
        }
      }),
    )

    this.loading = false
    await this.resume()
  }

  /** Browsers start the context suspended until a gesture. */
  async resume(): Promise<void> {
    if (this.context && this.context.state === 'suspended') {
      try {
        await this.context.resume()
      } catch {
        // Still waiting for a gesture. Nothing to do but stay quiet.
      }
    }
  }

  play(name: CueName, random = Math.random()): void {
    this.playAt(name, 1, 0, random)
  }

  /**
   * Plays a cue at a volume and a stereo position.
   *
   * A gain node and a stereo panner rather than a full `PannerNode`: a panner
   * wants the listener's orientation kept up to date every frame in the audio
   * graph, and for footsteps on a flat beach the extra realism is not
   * detectable. `spatialFor` works out both numbers.
   */
  playAt(name: CueName, volume: number, pan: number, random = Math.random()): void {
    const context = this.context
    const buffer = this.buffers[name]
    if (!context || !this.master || !buffer || context.state !== 'running') return
    if (!(volume > 0.001)) return

    const live = this.playing[name] ?? 0
    if (live >= AUDIO.maxVoices) return

    const sound = SOUNDS[name]
    const source = context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = pitchFor(sound.wobble, random)

    const gain = context.createGain()
    gain.gain.value = sound.gain * Math.min(1, Math.max(0, volume))
    source.connect(gain)

    // Not every browser has a stereo panner; going straight to the master
    // costs the panning and keeps the sound.
    let tail: AudioNode = gain
    if (typeof context.createStereoPanner === 'function' && Math.abs(pan) > 0.001) {
      const panner = context.createStereoPanner()
      panner.pan.value = Math.min(1, Math.max(-1, pan))
      gain.connect(panner)
      tail = panner
    }
    tail.connect(this.master)

    this.playing[name] = live + 1
    source.onended = () => {
      this.playing[name] = Math.max(0, (this.playing[name] ?? 1) - 1)
      source.disconnect()
      gain.disconnect()
      if (tail !== gain) tail.disconnect()
    }
    source.start()
  }

  dispose(): void {
    this.context?.close().catch(() => {
      // Closing a context that is already gone is not worth reporting.
    })
    this.context = null
    this.master = null
    this.buffers = {}
    this.playing = {}
  }
}
