/**
 * Whether the settings page is open.
 *
 * A store of its own rather than state in `Settings` because the world reads
 * it too - see `somethingOverTheWorld` in `scene.ts`: WASD typed while the page
 * is up must not walk the duck around behind it. Its own file so `scene.ts`
 * can read it without importing the page, which imports `scene.ts`.
 */
import { createStore } from '../modules/00-core'

export const settingsOpen = createStore(false)

export function isSettingsOpen(): boolean {
  return settingsOpen.get()
}
