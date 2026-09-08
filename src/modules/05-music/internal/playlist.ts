/**
 * The playlist: what plays next, what the back button does, and how loud.
 *
 * All of it is arithmetic on a list and an index, with no audio element in
 * sight, so it can be tested in Node. The part that genuinely cannot be tested
 * without a browser - whether the thing actually makes a noise - is kept as
 * small as possible in `MusicPlayer.tsx`.
 */

export interface Track {
  /** Relative to the asset base. Resolved with `assetUrl`. */
  src: string
  title: string
  artist: string
}

export const MUSIC = {
  /** Fetched at runtime, so adding a song never edits module source. */
  manifest: 'music/tracks.json',
  /** Where the volume starts, before anything has been remembered. */
  defaultVolume: 0.45,
  /**
   * Seconds into a track after which the back button restarts it rather than
   * going to the previous one.
   *
   * This is what every music player does and what everyone's hands expect:
   * back once to get to the top of the song, twice to get to the one before.
   */
  restartWindow: 3,
  /** Where the volume is remembered between sessions. */
  storageKey: 'localrot.music.volume',
  /** And whether the panel was folded away. */
  foldKey: 'localrot.music.folded2',
} as const

/** The next track, wrapping at the end so the playlist runs forever. */
export function nextIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return (Math.max(0, index) + 1) % count
}

/** The previous track, wrapping backwards off the front. */
export function previousIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return (Math.max(0, index) - 1 + count) % count
}

/**
 * Which track the back button should land on, given how far into the current
 * one you are.
 *
 * Past the restart window it returns the track you are already on, which the
 * caller reads as "start this again"; before it, the previous one. Either way
 * the track starts from the beginning, so there is nothing else to report.
 */
export function stepBack(
  index: number,
  count: number,
  position: number,
  window: number = MUSIC.restartWindow,
): number {
  if (position >= window) return Math.max(0, index)
  return previousIndex(index, count)
}

/** Volume is 0 to 1, and anything else is a bug somewhere upstream. */
export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return MUSIC.defaultVolume
  return Math.min(1, Math.max(0, volume))
}

/** `m:ss`, for a readout. Anything not yet known reads as `-:--`. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '-:--'
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`
}

/** What to show for a track. Falls back to the title when there is no artist. */
export function trackLabel(track: Track | null): string {
  if (!track) return 'no music'
  return track.artist ? `${track.artist} - ${track.title}` : track.title
}

/**
 * Reads a fetched manifest into a track list.
 *
 * Deliberately strict and deliberately quiet: a manifest that is malformed, or
 * has entries missing a source, gives an empty or shorter playlist rather than
 * throwing. Music failing to load should never be what stops the game running.
 */
export function parseTracks(raw: unknown): Track[] {
  if (!raw || typeof raw !== 'object') return []
  const list = (raw as { tracks?: unknown }).tracks
  if (!Array.isArray(list)) return []

  const tracks: Track[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const { src, title, artist } = entry as Record<string, unknown>
    if (typeof src !== 'string' || src.length === 0) continue
    tracks.push({
      src,
      title: typeof title === 'string' && title.length > 0 ? title : src,
      artist: typeof artist === 'string' ? artist : '',
    })
  }
  return tracks
}
