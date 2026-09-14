/**
 * Which game this lobby is playing.
 *
 * All of the mechanism is `hostChoice` - the host owns it, guests are told,
 * joiners ask, leaving forgets. This file is the one line that says *which*
 * setting it is, and the names it re-exports so callers say `useGameMode()`
 * rather than `mode.use()`.
 */
import { hostChoice } from './choice'
import { DEFAULT_MODE, isModeId, type ModeId } from './modes'

const mode = hostChoice<ModeId>('mode', isModeId, DEFAULT_MODE)

/** The chosen game, for React. */
export function useGameMode(): ModeId {
  return mode.use()
}

/** The chosen game, for anything outside React - the scene, every frame. */
export function getGameMode(): ModeId {
  return mode.get()
}

/**
 * Points the party at a game. Host only.
 *
 * A guest pressing this would change the game for nobody but themselves and
 * then be dragged back the next time the host said anything, which is worse
 * than a button that plainly does not move.
 */
export function chooseMode(id: ModeId): void {
  mode.set(id)
}

/** Tells everyone what is selected. The host's answer to a new arrival. */
export function announceMode(): void {
  mode.announce()
}

/** Asks the host what everybody is playing. */
export function askForMode(): void {
  mode.ask()
}

/** Back to the default, for leaving a lobby. */
export function resetMode(): void {
  mode.reset()
}

/** Starts listening. Returns the unsubscribe. */
export function listenForModes(): () => void {
  return mode.listen()
}

/**
 * Keeps the choice in step with the lobby, for as long as the interface is up.
 *
 * Call it once, from something that is always mounted.
 */
export function useModeSync(): void {
  mode.useSync()
}
