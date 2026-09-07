/**
 * 08-audio - the public contract.
 *
 * The sounds the body makes: footsteps, a jump, a landing, a swim stroke.
 * Reads the player's state and plays; it changes nothing about the world and
 * knows nothing about the music.
 */

export {
  CUES,
  createCueState,
  stepCues,
  strideFor,
  type CueName,
  type CueState,
  type Walker,
} from './internal/cues'

export {
  AUDIO,
  CueEngine,
  SOUNDS,
  clampVolume,
  pitchFor,
  type CueSound,
} from './internal/engine'

export { AudioCues, getCueEngine, readStoredVolume, setEffectsVolume } from './internal/AudioCues'
