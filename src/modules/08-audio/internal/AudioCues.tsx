/**
 * Drives the cue engine from the player's state, once a frame.
 *
 * Renders nothing. It is a scene entry only so it can be switched off in the
 * panel like everything else, and so it lives and dies with the canvas.
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Vector3 } from 'three'
import { PRIORITY, useGameFrame } from '../../00-core'
import { getPlayerState } from '../../02-player'
import { createCueState, stepCues, type CueState, type Walker } from './cues'
import { AUDIO, CueEngine, clampVolume, spatialFor } from './engine'

/**
 * Anybody else whose footsteps should be audible.
 *
 * A registry rather than this module reaching for the network: the cue machine
 * only needs `{ x, z, y, vy, grounded, swimming, speed }`, and it does not care
 * whether that is coming from a keyboard or off a socket. `09-net` registers
 * each peer as they join and drops them when they go.
 */
const sources = new Map<string, () => Walker | null>()
const remoteCues = new Map<string, CueState>()

export function addWalker(id: string, source: () => Walker | null): void {
  sources.set(id, source)
}

export function removeWalker(id: string): void {
  sources.delete(id)
  remoteCues.delete(id)
}

/** One engine for the page, so the volume slider has something to talk to. */
let engine: CueEngine | null = null

export function getCueEngine(): CueEngine {
  if (!engine) engine = new CueEngine()
  return engine
}

export function readStoredVolume(): number {
  try {
    const raw = window.localStorage.getItem(AUDIO.storageKey)
    return raw === null ? AUDIO.defaultVolume : clampVolume(Number.parseFloat(raw))
  } catch {
    return AUDIO.defaultVolume
  }
}

export function setEffectsVolume(volume: number): void {
  const level = clampVolume(volume)
  getCueEngine().setVolume(level)
  try {
    window.localStorage.setItem(AUDIO.storageKey, String(level))
  } catch {
    // Not remembering the volume is not worth breaking anything for.
  }
}

export function AudioCues() {
  const cues = useMemo(() => createCueState(), [])
  const camera = useThree((s) => s.camera)
  const forward = useMemo(() => new Vector3(), [])

  useEffect(() => {
    const cueEngine = getCueEngine()
    cueEngine.setVolume(readStoredVolume())

    // Browsers keep the context suspended until the page has been interacted
    // with, and refuse quietly. Try now, and again on the first gesture.
    void cueEngine.start()
    const onGesture = () => void cueEngine.start()
    window.addEventListener('pointerdown', onGesture)
    window.addEventListener('keydown', onGesture)
    return () => {
      window.removeEventListener('pointerdown', onGesture)
      window.removeEventListener('keydown', onGesture)
    }
  }, [])

  useGameFrame((_state, delta) => {
    const cueEngine = getCueEngine()

    // Yours, at full volume and dead centre - they are your own feet.
    const player = getPlayerState()
    for (const name of stepCues(cues, player, delta)) cueEngine.play(name)

    if (sources.size === 0) {
      if (remoteCues.size > 0) remoteCues.clear()
      return
    }

    // Where the ears are and which way they face. The camera rather than the
    // body: in first person they are the same thing, and in third person you
    // hear what you are looking at, which is what people expect.
    camera.getWorldDirection(forward)
    const listener = camera.position

    for (const [id, source] of sources) {
      const walker = source()
      let state = remoteCues.get(id)
      if (!state) {
        state = createCueState()
        remoteCues.set(id, state)
      }
      const fired = stepCues(state, walker, delta)
      if (fired.length === 0 || !walker) continue

      const { gain, pan } = spatialFor(listener, forward, walker)
      if (gain <= 0) continue
      for (const name of fired) cueEngine.playAt(name, gain, pan)
    }

    // Anyone who has gone stops being tracked.
    for (const id of remoteCues.keys()) {
      if (!sources.has(id)) remoteCues.delete(id)
    }
  }, PRIORITY.simulation)

  return null
}
