/**
 * What the screen itself plays: the three-two-one, Finish, and the podium.
 *
 * **Not on the island's audio bus.** `08-audio` is the body's cues - footsteps,
 * a jump, a swim stroke - mixed in three dimensions and pitched by how fast you
 * are going. These two are neither: they are interface, flat, in your ears
 * rather than somewhere in the world, and they belong to a screen that is drawn
 * over the world rather than in it. Two `Audio` elements are the honest size of
 * the problem.
 *
 * **Each one is loaded once and rewound rather than re-made.** A new `Audio`
 * per round would fetch again on a cold cache and leave the old ones for the
 * collector; rewinding is what makes a restart able to play the countdown twice
 * in a row.
 *
 * Everything here no-ops rather than throwing when there is no `Audio` to be
 * had - a test environment, or a browser that has not been clicked in yet - so
 * a missing sound can never take a round down with it.
 */
import { assetUrl } from '../../00-core'

export const COUNTDOWN_SOUND = 'audio/Countdown.mp3'
export const FINISH_SOUND = 'audio/Finish.mp3'
/** Under the podium. Long enough to cover it, so it is played once rather than looped. */
export const PODIUM_MUSIC = 'Podium_Music.mp3'

/** How loud, against the file's own level. Interface, so under the game. */
export const SCREEN_VOLUME = 0.55

const players = new Map<string, HTMLAudioElement>()

function playerFor(id: string): HTMLAudioElement | null {
  const had = players.get(id)
  if (had) return had
  if (typeof Audio !== 'function') return null
  try {
    const made = new Audio(assetUrl(id))
    made.preload = 'auto'
    made.volume = SCREEN_VOLUME
    players.set(id, made)
    return made
  } catch {
    return null
  }
}

/**
 * Plays one from the top, whatever it was doing.
 *
 * Rewound rather than started, so pressing restart during the three-two-one
 * gets a countdown from the beginning rather than nothing at all.
 */
export function playOnce(id: string): void {
  const player = playerFor(id)
  if (!player) return
  try {
    player.currentTime = 0
    // A browser nobody has clicked in yet refuses, and that is not an error
    // worth having: the sound is missed and the round carries on.
    void player.play()?.catch(() => {})
  } catch {
    // Some environments have `Audio` and no media stack behind it.
  }
}

const held = new Set<HTMLAudioElement>()

/**
 * Pauses whichever of them is going, where it stands, or carries it on.
 *
 * For the pause card: the three-two-one is voiced, and a round stopped on "two"
 * that went on saying "one, start" behind the card would be a card that lied.
 * Only what was actually cut off is carried on - a sound that had already
 * finished is not played again on resume.
 */
export function holdScreenSounds(hold: boolean): void {
  if (hold) {
    for (const player of players.values()) {
      try {
        if (!player.paused && !player.ended) {
          player.pause()
          held.add(player)
        }
      } catch {
        // As below.
      }
    }
    return
  }
  for (const player of held) {
    try {
      void player.play()?.catch(() => {})
    } catch {
      // As below.
    }
  }
  held.clear()
}

/** Stops one of them, if it is going. For the podium music, when the podium goes. */
export function stopOne(id: string): void {
  const player = players.get(id)
  if (!player) return
  held.delete(player)
  try {
    player.pause()
    player.currentTime = 0
  } catch {
    // As below.
  }
}

/** Stops whichever of them is going. For leaving a round part way through one. */
export function stopScreenSounds(): void {
  held.clear()
  for (const player of players.values()) {
    try {
      player.pause()
      player.currentTime = 0
    } catch {
      // As above.
    }
  }
}

/** Throws the loaded sounds away. For tests, which must not leak one into the next. */
export function forgetScreenSounds(): void {
  stopScreenSounds()
  players.clear()
}
