/**
 * 05-music - the public contract.
 *
 * A background playlist with a small panel to drive it. Owns one audio
 * element and nothing in the world: no positional sound, no reaction to
 * anything on screen.
 */

export {
  MUSIC,
  clampVolume,
  formatTime,
  nextIndex,
  parseTracks,
  previousIndex,
  stepBack,
  trackLabel,
  type Track,
} from './internal/playlist'

export { MusicPlayer } from './internal/MusicPlayer'
