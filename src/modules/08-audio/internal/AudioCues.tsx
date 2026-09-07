/**
 * Drives the cue engine from the player's state, once a frame.
 *
 * Renders nothing. It is a scene entry only so it can be switched off in the
 * panel like everything else, and so it lives and dies with the canvas.
 */
import { useEffect, useMemo } from 'react'
import { PRIORITY, useGameFrame } from '../../00-core'
import { getPlayerState } from '../../02-player'
import { createCueState, stepCues } from './cues'
import { AUDIO, CueEngine, clampVolume } from './engine'

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
    const player = getPlayerState()
    const fired = stepCues(cues, player, delta)
    if (fired.length === 0) return
    const cueEngine = getCueEngine()
    for (const name of fired) cueEngine.play(name)
  }, PRIORITY.simulation)

  return null
}
