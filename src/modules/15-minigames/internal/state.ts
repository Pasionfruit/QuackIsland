/**
 * What the minigame screen is showing: nothing, the dashboard, or one game.
 *
 * Deliberately **local to this browser**, and not a thing the lobby agrees on.
 * Browsing the catalogue is not playing anything, so one player opening the
 * dashboard has no business moving anybody else's screen. When a game is
 * actually built, *starting* it is the host's call and will ride on the same
 * `hostChoice` the game and the weather already do - this store is not in the
 * way of that, because it holds where you are looking rather than what the
 * party is doing.
 */
import { createStore, useStore } from '../../00-core'
import { freshRun, type MinigameRun } from './registry'
import type { MinigameId } from './catalogue'

export type MinigameScreenState =
  | { at: 'closed' }
  | { at: 'dashboard' }
  | { at: 'game'; run: MinigameRun }

const CLOSED: MinigameScreenState = { at: 'closed' }

const screen = createStore<MinigameScreenState>(CLOSED)

/** Where the screen is, for React. */
export function useMinigameScreen(): MinigameScreenState {
  return useStore(screen)
}

/** Where the screen is, for anything outside React. */
export function getMinigameScreen(): MinigameScreenState {
  return screen.get()
}

/** Opens the dashboard: every game there is, in a grid. */
export function openDashboard(): void {
  screen.set({ at: 'dashboard' })
}

/** Opens one game, at the beginning of a run of it. */
export function openMinigame(id: MinigameId): void {
  screen.set({ at: 'game', run: freshRun(id) })
}

/**
 * One step back: a game returns to the dashboard, the dashboard closes.
 *
 * One function rather than two, because it is one gesture - escape, or the
 * back button - and the screen is the only thing that knows which of the two
 * it currently means.
 */
export function backOut(): void {
  screen.set(screen.get().at === 'game' ? { at: 'dashboard' } : CLOSED)
}

/** Shuts the whole thing, wherever it was. For leaving a party. */
export function closeMinigames(): void {
  screen.set(CLOSED)
}
