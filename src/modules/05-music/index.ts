/**
 * 05-music - the public contract.
 *
 * A background playlist with a small panel to drive it. Owns one audio
 * element and nothing in the world: no positional sound, and no sense of
 * anything on screen beyond what it is told through `MusicPlayerProps` - see
 * `stopped`, for silencing it while a game is running.
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

export {
  MusicControls,
  MusicPlayer,
  type MusicPlayerProps,
  type MusicView,
} from './internal/MusicPlayer'
