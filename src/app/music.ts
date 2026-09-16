/**
 * When the island's music should stop.
 *
 * Lives in the app because it reads across two modules - the party
 * (`10-party`) and the minigames (`15-minigames`) - and the composition root is
 * the one place allowed to know both. Pure, so the rule is a test rather than
 * something you find out by listening.
 */
import type { MinigameScreenState } from '../modules/15-minigames'

/**
 * - **A party game running** stops it, as it always has.
 * - **A minigame being played** stops it too: from the three-two-one, through
 *   the round, to its results. Browsing the dashboard or reading a briefing
 *   does not - nothing is being played yet.
 *
 * `stopped` only pauses; the player picks back up when this goes false, unless
 * somebody paused it themselves. See `MusicPlayer`.
 */
export function musicStopped(partyPhase: string, minigame: MinigameScreenState): boolean {
  if (partyPhase === 'playing') return true
  return minigame.at === 'game' && minigame.run.phase !== 'briefing'
}
